import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_T0, roomNetwork, tabSeed } from '../test-room-network';
import { LIVE_TAB_KINDS } from '../live-tabs/live-tab-kinds';
import { CONTENT_MOVE_KEY } from './content-move';
import { FLUSH_IDLE_MS } from './room-content';

// docs/specs/006-document/document-storage.md "Refreshing the summaries": the dry run reads a room's summary without
// writing to the room's own storage. A woken room that is quiet (nothing owed, its upkeep already armed) and then
// read writes no key, no alarm and no row, takes no schema step, moves nothing and notes no write.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NETWORK_T0);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Every table's rows and the schema itself, so a write or a schema step shows as a difference.
function dump(sql: DatabaseSync): string {
  const tables = sql
    .prepare("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string; sql: string | null }[];
  return JSON.stringify(
    tables.map((t) => [
      t.name,
      t.sql,
      t.sql?.startsWith('CREATE TABLE') ? sql.prepare(`SELECT * FROM "${t.name}"`).all() : null,
    ]),
  );
}

// A room holding a created document, its outbox drained and its upkeep run, as an idle document's room is.
async function quietRoom(label?: string) {
  const net = roomNetwork(['A']);
  const handle = net.room('A');
  await handle.room.create('A', tabSeed([{ id: 't', name: 'Board', label }]));
  vi.setSystemTime(NETWORK_T0 + FLUSH_IDLE_MS + 1);
  await handle.room.alarm();
  await handle.room.alarm();
  return handle;
}

// A wake's constructor restores its state behind blockConcurrencyWhile: let it finish.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a room read for the summaries’ refresh', () => {
  it('leaves a woken quiet room’s storage as it was, and answers its summary', async () => {
    const { sql, kv, wake, storageWrites, alarms } = await quietRoom();
    const before = { rows: dump(sql), kv: JSON.stringify([...kv]), alarm: alarms() };
    const writes = storageWrites();
    const room = wake();
    await settled();
    const summary = await room.contentSummary('A');
    await settled();
    expect(summary).toMatchObject({ v: 1, tabs: 1 });
    expect(storageWrites()).toBe(writes);
    expect({ rows: dump(sql), kv: JSON.stringify([...kv]), alarm: alarms() }).toEqual(before);
  });

  it('takes no schema step in a room whose schema is behind', async () => {
    const { sql, wake, storageWrites } = await quietRoom();
    sql.exec('UPDATE _document_schema SET version = version - 1');
    const rows = dump(sql);
    const writes = storageWrites();
    const room = wake();
    await settled();
    expect((await room.contentSummary('A')).tabs).toBe(1);
    expect(storageWrites()).toBe(writes);
    expect(dump(sql)).toBe(rows);
  });

  it('reads a room whose schema predates the live tabs’ digests truly: no live tab of those kinds', async () => {
    const { sql, wake, storageWrites } = await quietRoom('Hello');
    const fresh = await wake().contentSummary('A');
    for (const kind of LIVE_TAB_KINDS) sql.exec(`DROP TABLE ${kind.tables.digest}`);
    sql.exec('UPDATE _document_schema SET version = version - 1');
    const rows = dump(sql);
    const writes = storageWrites();
    const room = wake();
    await settled();
    const behind = await room.contentSummary('A');
    expect(behind).toMatchObject({ tabs: 1, hasContent: true });
    expect(behind).toEqual(fresh);
    expect(storageWrites()).toBe(writes);
    expect(dump(sql)).toBe(rows);
  });

  it('fails a read it cannot make by name and logs it, never answering empty', async () => {
    const { sql, wake } = await quietRoom('Hello');
    sql.exec('ALTER TABLE tabs RENAME COLUMN data TO body');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const room = wake();
    await settled();
    await expect(room.contentSummary('A')).rejects.toMatchObject({
      name: 'DocumentReadFailedError',
    });
    expect(errors).toHaveBeenCalledWith(
      expect.stringMatching(/^\[document-db\] read-failed statement=\S+ error=.*no such column/),
    );
  });

  it('refuses a room whose content has not moved, moving nothing', async () => {
    const { sql, kv, wake, storageWrites } = await quietRoom();
    kv.delete(CONTENT_MOVE_KEY);
    const rows = dump(sql);
    const writes = storageWrites();
    const room = wake();
    await settled();
    await expect(room.contentSummary('A')).rejects.toMatchObject({ name: 'RoomNotReadyError' });
    expect(storageWrites()).toBe(writes);
    expect(dump(sql)).toBe(rows);
  });
});
