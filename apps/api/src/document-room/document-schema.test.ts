import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_SCHEMA_STEPS,
  DOCUMENT_SCHEMA_VERSION,
  hasDocumentSchema,
  migrateDocumentSchema,
} from './document-schema';

function room() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const exec = (q: string) => {
    db.exec(q);
    return { toArray: () => [] as Record<string, unknown>[] };
  };
  const read = (q: string) => ({ toArray: () => db.prepare(q).all() as Record<string, unknown>[] });
  const run = (q: string) => (/^\s*SELECT/i.test(q) ? read(q) : exec(q));
  return { db, run };
}

const tables = (db: DatabaseSync) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);

describe('the room schema', () => {
  it('starts with nothing, so a stray id stores nothing', () => {
    const { db, run } = room();
    expect(hasDocumentSchema(run)).toBe(false);
    expect(tables(db)).toEqual([]);
  });

  it('makes every content table and records its version', () => {
    const { db, run } = room();
    migrateDocumentSchema(run);
    expect(hasDocumentSchema(run)).toBe(true);
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'document',
        'tabs',
        'document_tabs',
        'tab_stats',
        'image_refs',
        'agent_changesets',
        'agent_changeset_parts',
        'items',
        'plan_board_statuses',
        'sheets',
        'sheet_cells',
        'sheet_refs',
      ]),
    );
    expect(db.prepare('SELECT version FROM _document_schema').get()).toEqual({
      version: DOCUMENT_SCHEMA_VERSION,
    });
    expect(DOCUMENT_SCHEMA_VERSION).toBe(DOCUMENT_SCHEMA_STEPS.length);
  });

  // docs/specs/029-sheets/sheet-store.md "In a spreadsheet": an upgraded room keeps its cells, each with no style yet.
  it('gives an upgraded room the styles table, its cells kept', () => {
    const { db, run } = room();
    for (const step of DOCUMENT_SCHEMA_STEPS.slice(0, 3)) db.exec(step);
    db.exec(
      'CREATE TABLE _document_schema (version INTEGER NOT NULL); INSERT INTO _document_schema VALUES (3)',
    );
    db.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('d', 0, 0);
      INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
        VALUES ('d', 's', 't', 'S', '{}', 0, 0, 0, '{}');
      INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input, format)
        VALUES ('d', 's', 'r', 'c', '{"n":1}', '{"b":true}');`);
    expect(migrateDocumentSchema(run)).toEqual({ from: 3, to: DOCUMENT_SCHEMA_VERSION });
    expect(tables(db)).toContain('sheet_styles');
    expect({ ...(db.prepare('SELECT format, style_id FROM sheet_cells').get() as object) }).toEqual(
      {
        format: '{"b":true}',
        style_id: null,
      },
    );
  });

  // sheet-store.md "In a spreadsheet" (Layout): an upgraded room's orders move out of their layouts into one chunk.
  it("moves an upgraded room's sheet orders into chunks", () => {
    const { db, run } = room();
    for (const step of DOCUMENT_SCHEMA_STEPS.slice(0, 4)) db.exec(step);
    db.exec(
      'CREATE TABLE _document_schema (version INTEGER NOT NULL); INSERT INTO _document_schema VALUES (4)',
    );
    db.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('d', 0, 0);
      INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
        VALUES ('d', 's', 't', 'S', '{"rows":["r1","r2"],"cols":["c1"],"frozenRows":1}', 0, 0, 0, '{}'),
               ('d', 'odd', 't', 'O', 'not json', 0, 0, 0, '{}');`);
    migrateDocumentSchema(run);
    const axes = db
      .prepare('SELECT sheet_id, axis, chunk, ids FROM sheet_axes ORDER BY axis')
      .all();
    expect(axes.map((row) => ({ ...row }))).toEqual([
      { sheet_id: 's', axis: 'c', chunk: 0, ids: '["c1"]' },
      { sheet_id: 's', axis: 'r', chunk: 0, ids: '["r1","r2"]' },
    ]);
    const layouts = db.prepare('SELECT layout FROM sheets ORDER BY id').all();
    expect(layouts.map((row) => row.layout)).toEqual(['not json', '{"frozenRows":1}']);
  });

  // docs/specs/006-document/kinds-outside-the-canvas.md "The surface": the row names its tab's kind, read once from the
  // bodies an upgraded room holds (db/tabs.test.ts proves each writer writes it).
  it('backfills each tab row’s kind from its body', () => {
    const { db, run } = room();
    const before = DOCUMENT_SCHEMA_STEPS.findIndex((step) => step.includes('ADD COLUMN kind'));
    for (const step of DOCUMENT_SCHEMA_STEPS.slice(0, before)) db.exec(step);
    db.exec(
      `CREATE TABLE _document_schema (version INTEGER NOT NULL); INSERT INTO _document_schema VALUES (${before})`,
    );
    db.exec(`INSERT INTO tabs (id, name, data, updated_at) VALUES ('a', 'A', '{"kind":"text-document"}', 0);
      INSERT INTO tabs (id, name, data, updated_at) VALUES ('b', 'B', '{"elements":[]}', 0);
      INSERT INTO tabs (id, name, data, updated_at) VALUES ('x', 'X', 'not json', 0);`);
    migrateDocumentSchema(run);
    const kinds = () =>
      (db.prepare('SELECT id, kind FROM tabs ORDER BY id').all() as object[]).map((r) => ({
        ...r,
      }));
    expect(kinds()).toEqual([
      { id: 'a', kind: 'text-document' },
      { id: 'b', kind: null },
      { id: 'x', kind: null },
    ]);
  });

  // docs/specs/034-text-documents/objects.md "A drawing tab": the row names its text document tab, so a document's
  // tab list leaves it out before any body is read; read once from the bodies an upgraded room holds.
  it('backfills each tab row’s text document tab from its body', () => {
    const { db, run } = room();
    const before = DOCUMENT_SCHEMA_STEPS.findIndex((step) =>
      step.includes('ADD COLUMN drawing_of'),
    );
    for (const step of DOCUMENT_SCHEMA_STEPS.slice(0, before)) db.exec(step);
    db.exec(
      `CREATE TABLE _document_schema (version INTEGER NOT NULL); INSERT INTO _document_schema VALUES (${before})`,
    );
    db.exec(`INSERT INTO tabs (id, name, data, updated_at) VALUES ('d', 'Drawing 1', '{"drawingOf":"t"}', 0);
      INSERT INTO tabs (id, name, data, updated_at) VALUES ('t', 'T', '{"kind":"text-document"}', 0);
      INSERT INTO tabs (id, name, data, updated_at) VALUES ('x', 'X', 'not json', 0);`);
    migrateDocumentSchema(run);
    const rows = (db.prepare('SELECT id, drawing_of FROM tabs ORDER BY id').all() as object[]).map(
      (r) => ({ ...r }),
    );
    expect(rows).toEqual([
      { id: 'd', drawing_of: 't' },
      { id: 't', drawing_of: null },
      { id: 'x', drawing_of: null },
    ]);
  });

  it('starts every spreadsheet stored before it with its imports not allowed', () => {
    const { db, run } = room();
    const before = DOCUMENT_SCHEMA_STEPS.findIndex((step) => step.includes('imports_allowed'));
    for (const step of DOCUMENT_SCHEMA_STEPS.slice(0, before)) db.exec(step);
    db.exec(
      `CREATE TABLE _document_schema (version INTEGER NOT NULL); INSERT INTO _document_schema VALUES (${before})`,
    );
    db.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('d', 0, 0);
      INSERT INTO workbook (document_id, format, settings, created_at, updated_at) VALUES ('d', 'ods', '{}', 0, 0);`);
    migrateDocumentSchema(run);
    expect({ ...(db.prepare('SELECT imports_allowed FROM workbook').get() as object) }).toEqual({
      imports_allowed: 0,
    });
  });

  it('is idempotent', () => {
    const { db, run } = room();
    migrateDocumentSchema(run);
    migrateDocumentSchema(run);
    expect(
      (db.prepare('SELECT count(*) AS n FROM _document_schema').get() as { n: number }).n,
    ).toBe(1);
  });

  it('refuses a body write that skips a revision', () => {
    const { db, run } = room();
    migrateDocumentSchema(run);
    db.exec("INSERT INTO tabs (id, name, data, updated_at, rev) VALUES ('t', 'T', '{}', 1, 1)");
    expect(() => db.exec("UPDATE tabs SET data = '{\"a\":1}', rev = 3 WHERE id = 't'")).toThrow(
      /tab_rev_stale/,
    );
  });

  it("cascades a tab's rows when the tab goes", () => {
    const { db, run } = room();
    migrateDocumentSchema(run);
    db.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('d', 1, 1);
      INSERT INTO tabs (id, name, data, updated_at) VALUES ('t', 'T', '{}', 1);
      INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d', 't', 0, 1);
      INSERT INTO image_refs (tab_id, image_id) VALUES ('t', 'i');
      INSERT INTO tab_stats (tab_id, mode, element_count, comment_count, data_bytes, written_at)
        VALUES ('t', 'diagram', 0, 0, 2, 1);`);
    db.exec("DELETE FROM tabs WHERE id = 't'");
    for (const t of ['document_tabs', 'image_refs', 'tab_stats']) {
      expect((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n).toBe(0);
    }
  });
});
