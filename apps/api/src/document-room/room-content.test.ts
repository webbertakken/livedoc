import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDocumentRoom } from '../test-document-room';
import { sqliteD1 } from '../test-sqlite-d1';
import type { DocumentSeed } from './document-create';
import {
  FLUSH_IDLE_MS,
  FLUSH_MIN_GAP_MS,
  FLUSH_RETRY_MS,
  inProcessRoom,
  nextFlushAt,
} from './room-content';

// The drain's pace (docs/specs/006-document/document-storage.md "The outbox"): on idle after a write, at
// most once a minute, a minute after a failure, straight after a drain that left keys.

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
  const { room, sql, alarms } = testDocumentRoom(d1.env);
  const owed = () => sql.prepare('SELECT COUNT(*) AS n FROM outbox').get()!.n as number;
  return { d1, room, alarms, owed };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('nextFlushAt', () => {
  it('waits for the room to go quiet, and at most once a minute', () => {
    expect(nextFlushAt(T0, 0)).toBe(T0 + FLUSH_IDLE_MS);
    expect(nextFlushAt(T0, T0 - 1_000)).toBe(T0 - 1_000 + FLUSH_MIN_GAP_MS);
  });
});

describe("the room's drain", () => {
  it('arms on idle after the first write and drains when the alarm fires', async () => {
    const { room, alarms, owed, d1 } = setup();
    await room.create(D, seed('a'));
    expect(alarms()).toBe(T0 + FLUSH_IDLE_MS);
    expect(owed()).toBeGreaterThan(0);
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    expect(owed()).toBe(0);
    const row = d1.sql.prepare('SELECT content_summary FROM documents WHERE id = ?').get(D)!;
    expect(JSON.parse(row.content_summary as string)).toMatchObject({ tabs: 1 });
    expect(alarms()).toBeNull();
  });

  it('drains at most once a minute', async () => {
    const { room, alarms } = setup();
    await room.create(D, seed('a'));
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    vi.setSystemTime(T0 + 3_000);
    await room.create(D, seed('b'));
    expect(alarms()).toBe(T0 + FLUSH_IDLE_MS + FLUSH_MIN_GAP_MS);
  });

  it('does nothing when the alarm fires early', async () => {
    const { room, alarms, owed } = setup();
    await room.create(D, seed('a'));
    const before = owed();
    await room.alarm();
    expect(owed()).toBe(before);
    expect(alarms()).toBe(T0 + FLUSH_IDLE_MS);
  });

  it('retries a minute after a failed unit', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, alarms, owed, d1 } = setup();
    await room.create(D, seed('a'));
    const batch = d1.env.DB.batch.bind(d1.env.DB);
    let fail = true;
    d1.env.DB.batch = async <T>(statements: D1PreparedStatement[]) => {
      if (fail) throw new Error('D1 down');
      return batch<T>(statements);
    };
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    expect(owed()).toBeGreaterThan(0);
    expect(alarms()).toBe(T0 + FLUSH_IDLE_MS + FLUSH_RETRY_MS);
    expect(warn).toHaveBeenCalled();
    fail = false;
    vi.setSystemTime(T0 + FLUSH_IDLE_MS + FLUSH_RETRY_MS);
    await room.alarm();
    expect(owed()).toBe(0);
  });
});

describe('a purged room', () => {
  it('forgets its document, so a create of the same id starts from an empty room', async () => {
    const { room, alarms } = setup();
    await room.create(D, seed('a'));
    const purge = await room.fetch(
      new Request('https://room.invalid/purge', {
        method: 'POST',
        headers: { 'X-Document-Id': D },
      }),
    );
    expect(purge.ok).toBe(true);
    expect(alarms()).toBeNull();
    const again = await room.create(D, seed('b'));
    expect(again).toMatchObject({ ok: true });
    expect((await room.outline(D)).tabs.map((t) => t.id)).toEqual(['b']);
  });
});

describe('inProcessRoom', () => {
  it("hands the room's own fetch one Request, keeping method, headers and body", async () => {
    const seen: Request[] = [];
    const room = {
      tag: 'r',
      async fetch(request: Request) {
        seen.push(request);
        return new Response(this.tag);
      },
    };
    const self = inProcessRoom(room);
    const res = await self.fetch(
      // A stub's two-argument call, as documentRoom().fetch makes it.
      ...([
        'https://room/mutation',
        { method: 'POST', headers: { 'X-Document-Id': 'd' }, body: '{"op":1}' },
      ] as unknown as [Request]),
    );
    expect(await res.text()).toBe('r');
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.headers.get('X-Document-Id')).toBe('d');
    expect(await seen[0]!.text()).toBe('{"op":1}');
  });
});
