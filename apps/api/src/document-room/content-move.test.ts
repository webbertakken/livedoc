import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDocumentRoom } from '../test-document-room';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { DocumentSeed } from './document-create';
import { planOf, type Query } from './content-move-plan';
import { CONTENT_MOVE_KEY } from './content-move';
import { DOCUMENT_ID_HEADER } from './document-client';

// The move (docs/specs/006-document/document-storage-move.md): M1 no content before moved, M2 one
// transaction that a difference undoes, M3 D1's content untouched, M4 created and copied documents born moved, G1 no
// move without a D1 row. D1 here keeps its content tables, as production does until the drop release; each room has
// a SQLite database of its own.

const D = 'doc-1';

const image = (id: string, imageId: string) => ({
  id,
  type: 'image',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  imageId,
});

function seedD1(d1: SqliteD1, id = D): void {
  d1.sql.exec(`
    INSERT INTO documents (id, owner_id, name, saved_at, created_at, presentation, items_rev, items_next_key)
      VALUES ('${id}', 'o', 'Doc', 50, 10, '{"slides":[]}', 3, 4);
    INSERT INTO tabs (id, name, data, updated_at, element_count, rev) VALUES
      ('${id}-t1', 'Board', '${JSON.stringify({ elements: [image('e1', 'img-1')] })}', 20, 1, 4),
      ('${id}-t2', 'Notes', '{"elements":[],"articles":[{"id":"a"}]}', 30, 0, 2);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at, folder) VALUES
      ('${id}', '${id}-t1', 0, 11, NULL), ('${id}', '${id}-t2', 1, 12, 'Q3');
    INSERT INTO items (document_id, id, type, item_key, rank, fields, rev, created_at, updated_at, created_by, updated_by)
      VALUES ('${id}', 'i1', 'task', 1, 'a', '{"title":"Fix it"}', 1, 1, 1, 'o', 'o');
    INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
      VALUES ('${id}', 's1', '${id}-t2', 'Budget', '{"rows":["r"],"cols":["c"]}', 1, 1, 1, '{}');
    INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input) VALUES ('${id}', 's1', 'r', 'c', '{"s":"Rent"}');
    INSERT INTO sheet_refs (tab_id, sheet_id) VALUES ('${id}-t2', 's1');
  `);
}

function setup() {
  const d1 = sqliteD1({}, { keepD1Content: true });
  const query: Query = async (statements) =>
    statements.map((s) => d1.sql.prepare(s).all() as never[]);
  const roomOf = () => testDocumentRoom(d1.env);
  return { d1, query, roomOf };
}

const count = (sql: DatabaseSync, table: string) =>
  Number((sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
const record = (d1: SqliteD1, id = D) =>
  d1.sql.prepare('SELECT * FROM content_moves WHERE document_id = ?').get(id) as
    Record<string, unknown> | undefined;
const hasTable = (sql: DatabaseSync, name: string) =>
  sql.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").all(name).length > 0;

// Every D1 content row, as text: what M3 compares before and after.
const d1Content = (d1: SqliteD1) =>
  JSON.stringify(
    [
      'documents',
      'tabs',
      'document_tabs',
      'items',
      'sheets',
      'sheet_cells',
      'sheet_refs',
      'agent_changesets',
    ].map((t) => d1.sql.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()),
  );

const identity = {
  sessionAccountId: null,
  verifiedAccountId: null,
  accountEmail: null,
  sessionAuthTime: null,
  owner: 'o',
  token: null,
  workbench: null,
};

function seed(recommit: boolean): DocumentSeed {
  return {
    identity,
    owner: 'o',
    recommit,
    savedAt: 99,
    createdAt: 99,
    presentation: null,
    itemTypes: null,
    tabs: [{ id: 'fresh', name: 'Fresh', elements: [] }],
    items: [],
    sheets: [],
  };
}

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('a move', () => {
  it('copies every row verbatim, recomputes the derived rows and records matching hashes', async () => {
    const { d1, query, roomOf } = setup();
    seedD1(d1);
    const [planned] = await planOf(query);
    const { room, sql } = roomOf();
    const outcome = await room.move(D);
    expect(outcome).toMatchObject({ status: 'moved', d1Tabs: 2, roomTabs: 2, born: false });
    expect(outcome!.d1Hash).toBe(planned!.hash);
    expect(outcome!.roomHash).toBe(planned!.hash);
    expect(
      sql.prepare('SELECT presentation, items_rev, items_next_key, saved_at FROM document').get(),
    ).toEqual({
      presentation: '{"slides":[]}',
      items_rev: 3,
      items_next_key: 4,
      saved_at: 50,
    });
    expect(sql.prepare("SELECT folder FROM document_tabs WHERE tab_id = 'doc-1-t2'").get()).toEqual(
      { folder: 'Q3' },
    );
    expect(count(sql, 'items')).toBe(1);
    expect(count(sql, 'sheet_cells')).toBe(1);
    expect(sql.prepare('SELECT tab_id, image_id FROM image_refs').all()).toEqual([
      { tab_id: 'doc-1-t1', image_id: 'img-1' },
    ]);
    expect(sql.prepare("SELECT written_at FROM tab_stats WHERE tab_id = 'doc-1-t2'").get()).toEqual(
      {
        written_at: 30,
      },
    );
    expect(record(d1)).toMatchObject({
      status: 'moved',
      born: 0,
      d1_tabs: 2,
      room_tabs: 2,
      d1_hash: planned!.hash,
      room_hash: planned!.hash,
      attempts: 1,
    });
    const keys = sql.prepare('SELECT kind, key FROM outbox ORDER BY kind, key').all();
    expect(keys).toEqual(
      expect.arrayContaining([
        { kind: 'summary', key: '' },
        { kind: 'images', key: '' },
        { kind: 'items', key: '' },
        { kind: 'tab', key: 'doc-1-t1' },
        { kind: 'tab', key: 'doc-1-t2' },
      ]),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^\\[content-move\\] moved id=${D} tabs=2 keys=\\d+ hash=${planned!.hash.slice(0, 8)}$`,
        ),
      ),
    );
  });

  it('leaves D1 content byte-identical (M3)', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    const before = d1Content(d1);
    await roomOf().room.move(D);
    expect(d1Content(d1)).toBe(before);
  });

  it('moves a document with no tabs as its document row alone', async () => {
    const { d1, roomOf } = setup();
    d1.sql.exec(
      "INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('doc-1', 'o', 'D', 1, 1)",
    );
    const { room, sql } = roomOf();
    expect(await room.move(D)).toMatchObject({ status: 'moved', d1Tabs: 0 });
    expect(count(sql, 'document')).toBe(1);
  });

  it('moves a tab two documents hold into both rooms, each listing the other as a holder', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    d1.sql
      .exec(`INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('doc-2', 'o', 'Two', 1, 1);
      INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('doc-2', 'doc-1-t1', 0, 1);`);
    const one = roomOf();
    const two = roomOf();
    expect(await one.room.move(D)).toMatchObject({ status: 'moved', d1Tabs: 2 });
    expect(await two.room.move('doc-2')).toMatchObject({ status: 'moved', d1Tabs: 1 });
    expect(two.sql.prepare('SELECT id, name FROM tabs').all()).toEqual([
      { id: 'doc-1-t1', name: 'Board' },
    ]);
    const holders = (sql: DatabaseSync) =>
      sql.prepare('SELECT tab_id, document_id FROM tab_shares').all();
    expect(holders(one.sql)).toEqual([{ tab_id: 'doc-1-t1', document_id: 'doc-2' }]);
    expect(holders(two.sql)).toEqual([{ tab_id: 'doc-1-t1', document_id: D }]);
  });

  it('answers a repeat from the stored move and heals a lost record', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    const { room } = roomOf();
    const first = await room.move(D);
    d1.sql.exec('DELETE FROM content_moves');
    const again = await room.move(D);
    expect(again).toEqual(first);
    expect(record(d1)).toMatchObject({ status: 'moved', attempts: 0 });
  });
});

describe('a move that cannot land (M2)', () => {
  it('undoes the whole write when the room reads back other than D1 holds', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    // A sheet marked unreferenced although a tab references it: the room's trigger clears the mark on the copy.
    d1.sql.exec("UPDATE sheets SET unreferenced_since = 5 WHERE id = 's1'");
    const { room, sql } = roomOf();
    const outcome = await room.move(D);
    expect(outcome).toMatchObject({ status: 'mismatch', d1Tabs: 2, roomTabs: 2 });
    expect(outcome!.roomHash).not.toBe(outcome!.d1Hash);
    expect(count(sql, 'document')).toBe(0);
    expect(count(sql, 'tabs')).toBe(0);
    expect(record(d1)).toMatchObject({
      status: 'mismatch',
      attempts: 1,
      error: 'MoveMismatchError',
    });
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[content-move\] mismatch id=doc-1 d1=\w{8} room=\w{8} d1Tabs=2 roomTabs=2$/,
      ),
    );
    const res = await room.route(D, new Request(`https://api/api/documents/${D}`), identity);
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(await res.json()).toEqual({ error: 'content_moving' });
    expect(record(d1)).toMatchObject({ attempts: 2 });
  });

  it('records a failed read, writes nothing, and moves on a later try', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    const batch = d1.env.DB.batch.bind(d1.env.DB);
    let fail = true;
    d1.env.DB.batch = async <T>(statements: D1PreparedStatement[]) => {
      if (fail) throw new Error('D1 down');
      return batch<T>(statements);
    };
    const { room, sql } = roomOf();
    expect(await room.move(D)).toMatchObject({ status: 'failed', error: 'Error' });
    expect(error).toHaveBeenCalledWith(
      '[content-move] failed id=doc-1 stage=read error=Error',
      expect.any(Error),
    );
    expect(hasTable(sql, 'document') ? count(sql, 'document') : 0).toBe(0);
    expect(record(d1)).toMatchObject({ status: 'failed', attempts: 1 });
    fail = false;
    expect(await room.move(D)).toMatchObject({ status: 'moved' });
    expect(record(d1)).toMatchObject({ status: 'moved', attempts: 2, error: null });
  });
});

describe('the move gate (M1)', () => {
  it('moves before the first RPC is answered, once for requests that arrive together', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    const { room } = roomOf();
    const [a, b] = await Promise.all([room.outline(D), room.outline(D)]);
    expect(a.tabs.map((t) => t.id)).toEqual(['doc-1-t1', 'doc-1-t2']);
    expect(b.tabs).toHaveLength(2);
    expect(record(d1)).toMatchObject({ status: 'moved', attempts: 1 });
  });

  it('holds a room fetch until the content is moved, and refuses it while a move fails', async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    d1.sql.exec("UPDATE sheets SET unreferenced_since = 5 WHERE id = 's1'");
    const { room } = roomOf();
    const res = await room.fetch(
      new Request('https://room/ledger?tab=t&epoch=e', { headers: { [DOCUMENT_ID_HEADER]: D } }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'content_moving' });
  });
});

describe('a document without a D1 row (G1)', () => {
  it('moves nothing, records nothing and stores nothing', async () => {
    const { d1, roomOf } = setup();
    const { room, sql } = roomOf();
    expect(await room.move(D)).toBeNull();
    expect((await room.outline(D)).tabs).toEqual([]);
    expect(hasTable(sql, 'document')).toBe(false);
    expect(record(d1)).toBeUndefined();
  });
});

describe('created and copied documents (M4)', () => {
  it('are born moved, never reading D1', async () => {
    const { d1, roomOf } = setup();
    const { room, sql } = roomOf();
    const created = await room.create(D, seed(false));
    expect(created.ok).toBe(true);
    const kv = (await (room as unknown as { ctx: DurableObjectState }).ctx.storage.kv.get(
      CONTENT_MOVE_KEY,
    )) as {
      born: boolean;
    };
    expect(kv).toMatchObject({ status: 'moved', born: true });
    d1.sql.exec(
      "INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('doc-1', 'o', 'D', 1, 1)",
    );
    expect(await room.move(D)).toMatchObject({ status: 'moved', born: true });
    expect(record(d1)).toMatchObject({ status: 'moved', born: 1 });
    expect(count(sql, 'tabs')).toBe(1);

    const copy = roomOf();
    const exported = await room.exportCopy(D, null, null);
    await copy.room.importCopy('doc-2', exported!);
    expect(await copy.room.move('doc-2')).toMatchObject({ born: true });
  });

  it("moves a re-committed document's D1 content before the create lands", async () => {
    const { d1, roomOf } = setup();
    seedD1(d1);
    const { room, sql } = roomOf();
    expect((await room.create(D, seed(true))).ok).toBe(true);
    expect(record(d1)).toMatchObject({ status: 'moved', born: 0 });
    expect(
      sql
        .prepare('SELECT id FROM tabs ORDER BY id')
        .all()
        .map((r) => r.id),
    ).toEqual(expect.arrayContaining(['doc-1-t1', 'doc-1-t2']));
  });
});

describe('a body that is not JSON', () => {
  it('moves verbatim, counted as an empty tab, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { d1, roomOf } = setup();
    d1.sql
      .exec(`INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES ('doc-1', 'o', 'D', 1, 1);
      INSERT INTO tabs (id, name, data, updated_at, rev) VALUES ('bad', 'Bad', 'not json', 5, 1);
      INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('doc-1', 'bad', 0, 1);`);
    const { room, sql } = roomOf();
    expect(await room.move(D)).toMatchObject({ status: 'moved', d1Tabs: 1 });
    expect(sql.prepare("SELECT data FROM tabs WHERE id = 'bad'").get()).toEqual({
      data: 'not json',
    });
    expect(warn).toHaveBeenCalledWith('[tab-stats] corrupt body id=doc-1 tab=bad counted as empty');
  });
});
