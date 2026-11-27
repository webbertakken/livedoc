import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomAgentPresence } from '../room-agent-presence';
import { testDocumentRoom } from '../test-document-room';
import { sqliteD1 } from '../test-sqlite-d1';
import type { DocumentSeed } from './document-create';
import { FLUSH_IDLE_MS, FLUSH_RETRY_MS } from './room-content';
import { OUTBOX_OVERDUE_MS } from './room-alarm';

// docs/specs/006-document/document-storage.md "The outbox", Never stranded (R4, issue #802): while a room's outbox owes
// D1 it holds an alarm, whatever part of an alarm failed, when the storage refused to set one, and across a wake;
// a drain of an outbox owed for over OUTBOX_OVERDUE_MS says so by name.

const T0 = 1_700_000_000_000;
const D = 'doc-1';

function seed(name: string): DocumentSeed {
  return {
    identity: {
      sessionAccountId: null,
      verifiedAccountId: null,
      accountEmail: null,
      sessionAuthTime: null,
      owner: 'o',
      token: null,
      workbench: null,
    },
    owner: 'o',
    recommit: false,
    savedAt: T0,
    createdAt: T0,
    presentation: null,
    itemTypes: null,
    tabs: [{ id: name, name, elements: [] }],
    items: [],
    sheets: [],
  };
}

function setup() {
  const d1 = sqliteD1({}, { keepD1Content: true });
  d1.sql.exec(
    `INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('${D}', 'o', 'Doc', 1, 1)`,
  );
  const made = testDocumentRoom(d1.env);
  const owed = () => made.sql.prepare('SELECT COUNT(*) AS n FROM outbox').get()!.n as number;
  // D1 refusing every write, until let go.
  const breakD1 = () => {
    const batch = d1.env.DB.batch.bind(d1.env.DB);
    let down = true;
    d1.env.DB.batch = async <T>(statements: D1PreparedStatement[]) => {
      if (down) throw new Error('D1 down');
      return batch<T>(statements);
    };
    return () => {
      down = false;
    };
  };
  return { ...made, d1, owed, breakD1 };
}

// Lets a woken room finish restoring: its constructor's blockConcurrencyWhile.
const restored = () => new Promise((resolve) => setTimeout(resolve, 0));

// A console spy as read here: what each call was given.
type Calls = { mock: { calls: unknown[][] } };
let error: Calls;
let warn: Calls;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const logged = (spy: Calls, text: string) =>
  spy.mock.calls.some((call) => String(call[0]).includes(text));

describe('a room owing D1 always holds an alarm', () => {
  it('runs the drain and sets the next alarm when another part of the alarm fails', async () => {
    const { room, alarms, owed, breakD1 } = setup();
    await room.create(D, seed('a'));
    vi.spyOn(RoomAgentPresence.prototype, 'sweep').mockRejectedValue(new TypeError('storage'));
    breakD1();
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await expect(room.alarm()).resolves.toBeUndefined();
    expect(owed()).toBeGreaterThan(0);
    // The drain ran (and failed), so its retry is the next alarm.
    expect(alarms()).toBe(T0 + FLUSH_IDLE_MS + FLUSH_RETRY_MS);
    expect(logged(error, `[room-alarm] failed id=${D} part=agents`)).toBe(true);
  });

  it('sets the alarm again at the next write when the storage refused it', async () => {
    const { room, alarms, storage } = setup();
    const setAlarm = storage.setAlarm.bind(storage);
    let refuse = true;
    storage.setAlarm = async (at: number | Date) => {
      if (refuse) throw new Error('storage overloaded');
      return setAlarm(at);
    };
    await room.create(D, seed('a'));
    await restored();
    expect(alarms()).toBeNull();
    expect(logged(error, `[room-alarm] arm failed id=${D}`)).toBe(true);
    refuse = false;
    vi.setSystemTime(T0 + 1_000);
    await room.create(D, seed('b'));
    expect(alarms()).toBe(T0 + FLUSH_IDLE_MS);
  });

  it('drains at once on a wake after the alarm was lost, naming the outbox overdue', async () => {
    const { room, alarms, owed, storage, wake, kv } = setup();
    await room.create(D, seed('a'));
    expect(owed()).toBeGreaterThan(0);
    // The alarm lost, as issue #802's room had lost it.
    await storage.deleteAlarm();
    const later = T0 + OUTBOX_OVERDUE_MS + 60_000;
    vi.setSystemTime(later);
    const woken = wake();
    await restored();
    // Set, and due now: the earliest of what it owes.
    expect(alarms()).not.toBeNull();
    expect(alarms()!).toBeLessThanOrEqual(later);
    await woken.alarm();
    expect(owed()).toBe(0);
    expect(logged(warn, `[outbox] overdue id=${D} keys=`)).toBe(true);
    // Drained, it owes nothing: no age is kept.
    expect([...kv.keys()].some((k) => k.startsWith('outbox'))).toBe(false);
  });

  it('names no drain on time overdue', async () => {
    const { room } = setup();
    await room.create(D, seed('a'));
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    expect(logged(warn, '[outbox] overdue')).toBe(false);
  });
});
