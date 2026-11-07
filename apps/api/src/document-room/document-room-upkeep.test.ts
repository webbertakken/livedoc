import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CHANGESET_RETENTION_MS } from '@livedoc/api-schema';
import { DAY_MS } from '@livedoc/items';
import { NETWORK_T0, roomNetwork, tabSeed } from '../test-room-network';
import { SHEET_UNREFERENCED_DAYS } from '../sheet-sweep';
import { FLUSH_IDLE_MS } from './room-content';
import { UPKEEP_AT_KEY, UPKEEP_DUE_KEY, UPKEEP_INTERVAL_MS, upkeepAfterWrite } from './room-upkeep';

// A room's upkeep (docs/specs/006-document/document-storage.md "Upkeep"): from its alarm, at most
// once a day, changesets past their retention and sheets unreferenced past 30 days go; an idle room is woken again
// only when something it holds will age out.

const T0 = NETWORK_T0;
const SHEET_MS = SHEET_UNREFERENCED_DAYS * DAY_MS;

let info: MockInstance<typeof console.info>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function setup() {
  const net = roomNetwork(['A']);
  const handle = net.room('A');
  await handle.room.create('A', tabSeed([{ id: 't' }]));
  return handle;
}

function changeset(
  sql: import('node:sqlite').DatabaseSync,
  id: string,
  createdAt: number,
  rev: number,
) {
  sql.exec(`INSERT INTO agent_changesets (id, document_id, tab_id, rev, author_id, author_name, author_color,
      fingerprints, added, changed, removed, created_at)
    VALUES ('${id}', 'A', 't', ${rev}, 'u', 'U', '#000', '[]', 0, 0, 0, ${createdAt});
    INSERT INTO agent_changeset_parts (changeset_id, part, data) VALUES ('${id}', 'ops', '[]');`);
}

function sheet(
  sql: import('node:sqlite').DatabaseSync,
  id: string,
  unreferencedSince: number | null,
) {
  sql.exec(`INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, unreferenced_since, created_at,
      updated_at, updated_by)
    VALUES ('A', '${id}', 't', 'S', '{}', 1, ${unreferencedSince ?? 'NULL'}, 1, 1, 'p')`);
}

const ids = (sql: import('node:sqlite').DatabaseSync, table: string) =>
  (sql.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as { id: string }[]).map((r) => r.id);

describe("a room's upkeep", () => {
  it('runs once the room is quiet after its first write', () => {
    expect(upkeepAfterWrite(T0, 0, FLUSH_IDLE_MS)).toBe(T0 + FLUSH_IDLE_MS);
    expect(upkeepAfterWrite(T0, T0 - 1_000, FLUSH_IDLE_MS)).toBe(T0 - 1_000 + UPKEEP_INTERVAL_MS);
  });

  it('deletes changesets past retention and sheets unreferenced past 30 days, keeping the rest', async () => {
    const { room, sql, kv } = await setup();
    changeset(sql, 'old', T0 - CHANGESET_RETENTION_MS - 1, 1);
    changeset(sql, 'new', T0 - DAY_MS, 2);
    sheet(sql, 'stale', T0 - SHEET_MS - 1);
    sheet(sql, 'recent', T0 - DAY_MS);
    sheet(sql, 'used', null);
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    expect(ids(sql, 'agent_changesets')).toEqual(['new']);
    expect(
      sql
        .prepare("SELECT COUNT(*) AS n FROM agent_changeset_parts WHERE changeset_id = 'old'")
        .get()!.n,
    ).toBe(0);
    expect(ids(sql, 'sheets')).toEqual(['recent', 'used']);
    expect(kv.get(UPKEEP_AT_KEY)).toBe(T0 + FLUSH_IDLE_MS);
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[room-upkeep\] id=A changesets=1 sheets=1 /),
    );
  });

  it('wakes an idle room again only when the oldest thing left ages out, and no sooner than a day', async () => {
    const { room, sql, alarms, kv } = await setup();
    changeset(sql, 'young', T0 - DAY_MS, 1);
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    const due = T0 - DAY_MS + CHANGESET_RETENTION_MS + 1;
    expect(kv.get(UPKEEP_DUE_KEY)).toBe(due);
    expect(alarms()).toBe(due);
    vi.setSystemTime(due);
    await room.alarm();
    expect(ids(sql, 'agent_changesets')).toEqual([]);
    expect(kv.has(UPKEEP_DUE_KEY)).toBe(false);
    expect(alarms()).toBeNull();
  });

  it('sets no wake-up for a room with nothing to age out', async () => {
    const { room, alarms, kv } = await setup();
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    expect(kv.has(UPKEEP_DUE_KEY)).toBe(false);
    expect(alarms()).toBeNull();
  });

  it('runs at most once a day, however often the room is written', async () => {
    const { room, kv } = await setup();
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    vi.setSystemTime(T0 + 10_000);
    const req = new Request('https://api.test/api/documents/A/tabs/t/name', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    await room.route('A', req, {
      sessionAccountId: null,
      verifiedAccountId: null,
      accountEmail: null,
      sessionAuthTime: null,
      owner: 'o',
      token: null,
      workbench: null,
    });
    vi.setSystemTime(T0 + 10_000 + FLUSH_IDLE_MS + FLUSH_IDLE_MS);
    info.mockClear();
    await room.alarm();
    expect(info).not.toHaveBeenCalledWith(expect.stringMatching(/^\[room-upkeep\]/));
    expect(kv.get(UPKEEP_DUE_KEY)).toBe(T0 + FLUSH_IDLE_MS + UPKEEP_INTERVAL_MS);
  });

  it('tries a failed run again a day later, and says so', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { room, sql, kv } = await setup();
    sql.exec('DROP TABLE sheet_cells; DROP TABLE sheets');
    vi.setSystemTime(T0 + FLUSH_IDLE_MS);
    await room.alarm();
    expect(error).toHaveBeenCalledWith('[room-upkeep] failed id=A', expect.any(Error));
    expect(kv.get(UPKEEP_DUE_KEY)).toBe(T0 + FLUSH_IDLE_MS + UPKEEP_INTERVAL_MS);
  });
});
