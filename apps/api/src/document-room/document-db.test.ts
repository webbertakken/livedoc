import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import { DocumentDb } from './document-db';

function setup() {
  const raw = new DatabaseSync(':memory:');
  let made = false;
  const ensureSchema = vi.fn(() => {
    raw.exec('CREATE TABLE IF NOT EXISTS t (id TEXT PRIMARY KEY, n INTEGER NOT NULL)');
    made = true;
  });
  const onWrite = vi.fn();
  const db = new DocumentDb(nodeDocumentSql(raw), {
    transaction: nodeTransaction(raw),
    ensureSchema,
    hasSchema: () => made,
    onWrite,
  });
  return { raw, db, ensureSchema, onWrite };
}

describe('DocumentDb', () => {
  it('answers first, all, run and raw in D1 shape', async () => {
    const { db } = setup();
    const ins = await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 1).run();
    expect(ins.meta.changes).toBe(1);
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('b', 2).run();
    expect(await db.prepare('SELECT n FROM t WHERE id = ?').bind('b').first('n')).toBe(2);
    expect(await db.prepare('SELECT id FROM t WHERE id = ?').bind('z').first()).toBeNull();
    const all = await db.prepare('SELECT id FROM t ORDER BY id').all<{ id: string }>();
    expect(all.results.map((r) => r.id)).toEqual(['a', 'b']);
    expect(await db.prepare('SELECT id, n FROM t ORDER BY id').raw()).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('reports no changes for a read after a write', async () => {
    const { db } = setup();
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 1).run();
    expect((await db.prepare('SELECT * FROM t').run()).meta.changes).toBe(0);
  });

  it('binds booleans as 1 and 0, and refuses undefined', async () => {
    const { db } = setup();
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', true).run();
    expect(await db.prepare('SELECT n FROM t').first('n')).toBe(1);
    expect(() => db.prepare('SELECT ?').bind(undefined)).toThrow(/D1_TYPE_ERROR/);
  });

  it('rolls a whole batch back when one statement throws', async () => {
    const { db } = setup();
    await expect(
      db.batch([
        db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 1),
        db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 2),
      ]),
    ).rejects.toThrow();
    expect(await db.prepare('SELECT count(*) AS c FROM t').first('c')).toBe(0);
  });

  it('answers a read of a room with no schema as empty, making nothing (R1)', async () => {
    const { db, raw, ensureSchema } = setup();
    expect(await db.prepare('SELECT id FROM t').all()).toMatchObject({ results: [] });
    expect(await db.prepare('SELECT id FROM t').first()).toBeNull();
    const [read] = await db.batch([db.prepare('SELECT id FROM t')]);
    expect(read?.results).toEqual([]);
    expect(ensureSchema).not.toHaveBeenCalled();
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 't'").all()).toEqual([]);
  });

  it('makes the schema before the first write and tells the room about writes', async () => {
    const { db, ensureSchema, onWrite } = setup();
    await db.prepare('SELECT 1').first();
    expect(ensureSchema).not.toHaveBeenCalled();
    expect(onWrite).not.toHaveBeenCalled();
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 1).run();
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('tells the room of no write for a batch of reads', async () => {
    const { db, onWrite } = setup();
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 1).run();
    onWrite.mockClear();
    const [read] = await db.batch([db.prepare('SELECT id FROM t'), db.prepare('SELECT n FROM t')]);
    expect(read?.results).toEqual([{ id: 'a' }]);
    expect(onWrite).not.toHaveBeenCalled();
  });
});

// docs/specs/006-document/document-storage.md "Refreshing the summaries": a dry run's read of a room writes nothing.
describe('DocumentDb.readOnly', () => {
  function readOnly(made: boolean) {
    const raw = new DatabaseSync(':memory:');
    raw.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    raw.exec("INSERT INTO t (id) VALUES ('a')");
    const db = DocumentDb.readOnly(nodeDocumentSql(raw), () => made);
    const changes = () => Number(raw.prepare('SELECT total_changes() AS n').get()!.n);
    return { raw, db, changes };
  }

  it('reads, alone and in a batch, writing nothing', async () => {
    const { db, changes } = readOnly(true);
    const before = changes();
    expect(await db.prepare('SELECT id FROM t').all()).toMatchObject({ results: [{ id: 'a' }] });
    const [read] = await db.batch([db.prepare('SELECT id FROM t')]);
    expect(read?.results).toEqual([{ id: 'a' }]);
    expect(changes()).toBe(before);
  });

  it('refuses a write, by name', async () => {
    const { db, raw } = readOnly(true);
    await expect(db.prepare("INSERT INTO t (id) VALUES ('b')").run()).rejects.toThrow(
      'document_read_only',
    );
    await expect(db.batch([db.prepare('DELETE FROM t')])).rejects.toThrow('document_read_only');
    expect(raw.prepare('SELECT id FROM t').all()).toEqual([{ id: 'a' }]);
  });

  it('fails a read it cannot make by name, logging the tables it names and the error, alone and in a batch', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = readOnly(true);
    await expect(db.prepare('SELECT x FROM missing JOIN t ON 1').all()).rejects.toMatchObject({
      name: 'DocumentReadFailedError',
      message: 'document_read_failed',
    });
    await expect(
      db.batch([db.prepare('SELECT id FROM t'), db.prepare('SELECT x FROM missing')]),
    ).rejects.toMatchObject({
      name: 'DocumentReadFailedError',
    });
    expect(errors).toHaveBeenCalledWith(
      '[document-db] read-failed statement=missing+t error=no such table: missing',
    );
    errors.mockRestore();
  });

  it('reads a room with no schema as empty, saying so', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await readOnly(false).db.prepare('SELECT id FROM t').all()).toMatchObject({
      results: [],
    });
    expect(info).toHaveBeenCalledWith('[document-db] read-no-schema statements=1');
    info.mockRestore();
  });
});
