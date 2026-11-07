import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import type { DocumentEnv } from '../types';
import { DocumentDb } from './document-db';
import { DRAIN_TABS, drainOutbox, PUSH_CONCURRENCY } from './document-outbox';
import { migrateDocumentSchema } from './document-schema';

// The drain (docs/specs/006-document/document-storage.md "The outbox"): its bounds, its concurrency, its
// retry, a key written again during a drain, and G2 (nothing lands in D1 once the document's row is gone). The room's
// SQLite and D1 are separate databases here, as they are in production.

const D = 'doc-1';

const thread = (id: string) => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  label: id,
  commentThread: {
    comments: [{ id: 'c1', text: 'hi', createdAt: 1, authorName: 'A', authorColor: '#000' }],
    resolved: false,
  },
});

type Harness = {
  env: DocumentEnv;
  room: DatabaseSync;
  d1: DatabaseSync;
  // A batch's first statement's SQL and binds, for a test that fails or watches one unit.
  onBatch: (hook: (sql: string[], binds: unknown[][]) => Promise<void> | void) => void;
};

function harness(): Harness {
  const { env: d1Env, sql: d1 } = sqliteD1({}, { keepD1Content: true });
  d1.exec(
    `INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('${D}', 'o', 'Doc', 1, 1)`,
  );
  const room = new DatabaseSync(':memory:');
  room.exec('PRAGMA foreign_keys = ON');
  const roomSql = nodeDocumentSql(room);
  migrateDocumentSchema((q) => roomSql.exec(q));
  const documentDb = new DocumentDb(roomSql, {
    transaction: nodeTransaction(room),
    ensureSchema: () => {},
    hasSchema: () => true,
    onWrite: () => {},
  });
  room.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('${D}', 5, 1)`);
  let hook: (sql: string[], binds: unknown[][]) => Promise<void> | void = () => {};
  const realPrepare = d1Env.DB.prepare.bind(d1Env.DB);
  const realBatch = d1Env.DB.batch.bind(d1Env.DB);
  const seen = new WeakMap<object, { sql: string; binds: unknown[] }>();
  const DB = {
    ...d1Env.DB,
    prepare: (query: string) => {
      const wrap = (statement: D1PreparedStatement, binds: unknown[]): D1PreparedStatement => {
        const proxy = new Proxy(statement, {
          get: (target, prop) => {
            if (prop === 'bind') return (...next: unknown[]) => wrap(target.bind(...next), next);
            const value: unknown = Reflect.get(target, prop);
            return typeof value === 'function'
              ? (value as (...a: unknown[]) => unknown).bind(target)
              : value;
          },
        });
        seen.set(proxy, { sql: query, binds });
        return proxy;
      };
      return wrap(realPrepare(query), []);
    },
    batch: async (statements: D1PreparedStatement[]) => {
      const meta = statements.map((s) => seen.get(s) ?? { sql: '', binds: [] });
      await hook(
        meta.map((m) => m.sql),
        meta.map((m) => m.binds),
      );
      return realBatch(statements);
    },
  } as unknown as D1Database;
  const env = { ...d1Env, DB, DOCUMENT_DB: documentDb.asD1() } as unknown as DocumentEnv;
  return { env, room, d1, onBatch: (h) => (hook = h) };
}

function addTabs(room: DatabaseSync, count: number, from = 0): void {
  for (let i = from; i < from + count; i++) {
    room
      .prepare('INSERT INTO tabs (id, name, data, updated_at, rev) VALUES (?, ?, ?, 1, 1)')
      .run(`t${i}`, `Tab ${i}`, JSON.stringify({ elements: [thread(`e${i}`)] }));
    room
      .prepare(
        'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, ?, 1)',
      )
      .run(D, `t${i}`, i);
  }
}

const outboxKeys = (room: DatabaseSync) =>
  (
    room.prepare('SELECT kind, key FROM outbox ORDER BY id').all() as {
      kind: string;
      key: string;
    }[]
  ).map((r) => `${r.kind}:${r.key}`);

const threadTabs = (d1: DatabaseSync) =>
  (
    d1
      .prepare('SELECT tab_id FROM collab_threads WHERE document_id = ? ORDER BY tab_id')
      .all(D) as {
      tab_id: string;
    }[]
  ).map((r) => r.tab_id);

// The tab a batch's unit is for: a tab unit's first statement deletes that tab's collab_actions.
const tabOf = (sql: string[], binds: unknown[][]): string | null =>
  sql[0]?.includes('DELETE FROM collab_actions') ? (binds[0]?.[1] as string) : null;

const info = vi.spyOn(console, 'info').mockImplementation(() => {});
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
beforeEach(() => {
  info.mockClear();
  warn.mockClear();
});
afterAll(() => {
  info.mockRestore();
  warn.mockRestore();
});

describe('drainOutbox', () => {
  it('pushes at most DRAIN_TABS tab units a drain and says more are owed', async () => {
    const { env, room, d1 } = harness();
    addTabs(room, DRAIN_TABS + 20);
    const first = await drainOutbox(env, D);
    expect(first).toMatchObject({ units: DRAIN_TABS + 1, failed: 0, more: true });
    expect(outboxKeys(room)).toHaveLength(20);
    expect(threadTabs(d1)).toHaveLength(DRAIN_TABS);
    const second = await drainOutbox(env, D);
    expect(second).toMatchObject({ units: 20, failed: 0, more: false });
    expect(outboxKeys(room)).toEqual([]);
    expect(threadTabs(d1)).toHaveLength(DRAIN_TABS + 20);
    expect(info).toHaveBeenCalledWith(`[outbox] drained id=${D} units=20 keys=20 more=false`);
  });

  it('keeps at most PUSH_CONCURRENCY batches in flight', async () => {
    const { env, room, onBatch } = harness();
    addTabs(room, 20);
    let inFlight = 0;
    let most = 0;
    onBatch(async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    await drainOutbox(env, D);
    expect(most).toBe(PUSH_CONCURRENCY);
  });

  it("keeps a failed unit's keys for the retry, and drops the rest", async () => {
    const { env, room, d1, onBatch } = harness();
    addTabs(room, 3);
    let fail = true;
    onBatch((sql, binds) => {
      if (fail && tabOf(sql, binds) === 't1') throw new Error('D1 down');
    });
    const first = await drainOutbox(env, D);
    expect(first).toMatchObject({ units: 3, failed: 1, more: false });
    expect(outboxKeys(room)).toEqual(['tab:t1']);
    expect(warn).toHaveBeenCalledWith(
      `[outbox] unit failed id=${D} unit=tab:t1`,
      expect.any(Error),
    );
    expect(threadTabs(d1)).toEqual(['t0', 't2']);
    fail = false;
    expect(await drainOutbox(env, D)).toMatchObject({ units: 1, failed: 0 });
    expect(outboxKeys(room)).toEqual([]);
    expect(threadTabs(d1)).toEqual(['t0', 't1', 't2']);
  });

  it('keeps a key written again while its unit was pushed', async () => {
    const { env, room, onBatch } = harness();
    addTabs(room, 2);
    onBatch((sql, binds) => {
      if (tabOf(sql, binds) === 't0') room.exec("UPDATE tabs SET name = 'Renamed' WHERE id = 't0'");
    });
    await drainOutbox(env, D);
    expect(outboxKeys(room)).toContain('tab:t0');
    expect(outboxKeys(room)).not.toContain('tab:t1');
  });

  it("writes nothing once the document's D1 row is gone, and drops its keys (G2)", async () => {
    const { env, room, d1 } = harness();
    addTabs(room, 2);
    d1.exec(`DELETE FROM documents WHERE id = '${D}'`);
    const result = await drainOutbox(env, D);
    expect(result).toMatchObject({ failed: 0, more: false });
    expect(outboxKeys(room)).toEqual([]);
    expect(threadTabs(d1)).toEqual([]);
    expect(d1.prepare('SELECT * FROM document_images WHERE document_id = ?').all(D)).toEqual([]);
    expect(d1.prepare('SELECT * FROM inbox_cards WHERE document_id = ?').all(D)).toEqual([]);
  });

  it('pushes nothing with nothing owed', async () => {
    const { env, room, onBatch } = harness();
    room.exec('DELETE FROM outbox');
    const batches = vi.fn();
    onBatch(batches);
    expect(await drainOutbox(env, D)).toEqual({ keys: 0, units: 0, failed: 0, more: false });
    expect(batches).not.toHaveBeenCalled();
  });

  it('pushes the content summary and the saved time to the listing', async () => {
    const { env, room, d1 } = harness();
    addTabs(room, 2);
    await drainOutbox(env, D);
    const row = d1
      .prepare('SELECT content_summary, saved_at FROM documents WHERE id = ?')
      .get(D) as {
      content_summary: string;
      saved_at: number;
    };
    expect(JSON.parse(row.content_summary)).toMatchObject({ v: 1, tabs: 2, hasContent: true });
    expect(row.saved_at).toBe(5);
  });
});

describe('the content search rows the drain writes', () => {
  const searchRows = (d1: DatabaseSync) =>
    d1
      .prepare(
        'SELECT tab_id, tab_name, text FROM content_search WHERE document_id = ? ORDER BY tab_id',
      )
      .all(D)
      .map((r) => ({ ...r }));

  it("writes each tab's search text, its sheets' inputs included", async () => {
    const { env, room, d1 } = harness();
    addTabs(room, 1);
    room.exec(`INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
      VALUES ('${D}', 's1', 't0', 'Budget', '{"rows":["r1"],"cols":["c1","c2"]}', 1, 1, 1, '{}');
      INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input)
      VALUES ('${D}', 's1', 'r1', 'c1', '{"s":"Rent"}'), ('${D}', 's1', 'r1', 'c2', '{"f":{"src":"=1"}}');
      INSERT INTO sheet_refs (tab_id, sheet_id) VALUES ('t0', 's1');`);
    await drainOutbox(env, D);
    expect(searchRows(d1)).toEqual([
      { tab_id: 't0', tab_name: 'Tab 0', text: 'Tab 0\ne0\nhi\nRent' },
    ]);
  });

  it('re-indexes a tab when a cell of a sheet it references changes', async () => {
    const { env, room, d1 } = harness();
    addTabs(room, 1);
    room.exec(`INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
      VALUES ('${D}', 's1', 't0', 'Budget', '{"rows":["r1"],"cols":["c1"]}', 1, 1, 1, '{}');
      INSERT INTO sheet_refs (tab_id, sheet_id) VALUES ('t0', 's1');`);
    await drainOutbox(env, D);
    room.exec(
      `INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input) VALUES ('${D}', 's1', 'r1', 'c1', '{"s":"Groceries"}')`,
    );
    expect(outboxKeys(room)).toContain('tab:t0');
    await drainOutbox(env, D);
    expect(searchRows(d1)[0]?.text).toContain('Groceries');
  });

  it('deletes the row of a tab that has gone', async () => {
    const { env, room, d1 } = harness();
    addTabs(room, 2);
    await drainOutbox(env, D);
    room.exec("DELETE FROM document_tabs WHERE tab_id = 't1'");
    room.exec("DELETE FROM tabs WHERE id = 't1'");
    await drainOutbox(env, D);
    expect(searchRows(d1).map((r) => r.tab_id)).toEqual(['t0']);
  });

  it("writes the cards' text under ~items, and deletes it with the last card", async () => {
    const { env, room, d1 } = harness();
    room.exec(`INSERT INTO items (document_id, id, type, item_key, rank, fields, rev, created_at, updated_at, created_by, updated_by)
      VALUES ('${D}', 'i1', 'task', 1, 'a', '{"title":"Fix the boiler","status":"todo"}', 1, 1, 1, 'o', 'o')`);
    await drainOutbox(env, D);
    expect(searchRows(d1)).toEqual([{ tab_id: '~items', tab_name: '', text: 'Fix the boiler' }]);
    room.exec("DELETE FROM items WHERE id = 'i1'");
    await drainOutbox(env, D);
    expect(searchRows(d1)).toEqual([]);
  });
});
