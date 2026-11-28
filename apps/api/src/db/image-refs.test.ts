import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { sqliteD1 } from '../test-sqlite-d1';
import { documentImageIds, documentPlacesImage } from './image-refs';

// What a document's room answers of its images (docs/specs/009-elements/images.md "Reference index").

function documentRow(sql: DatabaseSync, id: string) {
  sql
    .prepare(
      "INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES (?, 'me', ?, 0, 0, 0)",
    )
    .run(id, id);
}

// A tab of document `documentId` (made on first use).
function tabRow(sql: DatabaseSync, id: string, data: string, documentId = 'D') {
  if (!sql.prepare('SELECT 1 FROM document WHERE id = ?').get(documentId))
    documentRow(sql, documentId);
  sql
    .prepare('INSERT INTO tabs (id, name, data, updated_at) VALUES (?, ?, ?, 0)')
    .run(id, id, data);
  sql
    .prepare(
      'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, 0, 0)',
    )
    .run(documentId, id);
}

describe('what the room answers of its images', () => {
  it('lists every image the document places, once, and says where', async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 't1', '{}');
    tabRow(sql, 't2', '{}');
    sql.exec(
      `INSERT INTO image_refs (tab_id, image_id) VALUES ('t1', 'a'), ('t1', 'b'), ('t2', 'a')`,
    );
    expect(await documentImageIds(env, 'D')).toEqual(['a', 'b']);
    expect(await documentPlacesImage(env, 'D', 'b', null)).toBe(true);
    expect(await documentPlacesImage(env, 'D', 'b', 't2')).toBe(false);
    expect(await documentPlacesImage(env, 'D', 'a', 't2')).toBe(true);
    expect(await documentPlacesImage(env, 'D', 'zz', null)).toBe(false);
    expect(await documentPlacesImage(env, 'other', 'a', null)).toBe(false);
  });
});

// docs/specs/013-workspace/tab-scoped-share-links.md "Drawing tabs": a link to a text document tab reaches the images
// its drawing tabs place.
describe('the images a one-tab link reaches', () => {
  it("counts its tab's drawing tabs as its tab, never another tab's", async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 'w', '{}');
    tabRow(sql, 'd1', '{}');
    tabRow(sql, 'other', '{}');
    tabRow(sql, 'd2', '{}');
    sql.exec(`UPDATE tabs SET drawing_of = 'w' WHERE id = 'd1'`);
    sql.exec(`UPDATE tabs SET drawing_of = 'other' WHERE id = 'd2'`);
    sql.exec(`INSERT INTO image_refs (tab_id, image_id) VALUES ('d1', 'a'), ('d2', 'b')`);
    expect(await documentPlacesImage(env, 'D', 'a', 'w')).toBe(true);
    expect(await documentPlacesImage(env, 'D', 'b', 'w')).toBe(false);
  });
});

// docs/specs/009-elements/images.md "A sheet's references" (D624): the images over cells a sheet's layout places,
// kept by the room's triggers on every write of the layout, read with the tabs' references.
describe('a sheet’s images', () => {
  const layout = (...ids: string[]) =>
    JSON.stringify({
      objects: [
        ...ids.map((imageId, i) => ({ id: `img${i}`, kind: 'image', imageId })),
        { id: 'chart1', kind: 'chart', imageId: 'not-an-image' },
      ],
    });
  function sheetRow(sql: DatabaseSync, id: string, tabId: string, data: string) {
    sql
      .prepare(
        `INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
         VALUES ('D', ?, ?, ?, ?, 0, 0, 0, '{}')`,
      )
      .run(id, tabId, id, data);
  }
  const outboxImages = (sql: DatabaseSync) =>
    sql.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE kind = 'images'`).get() as { n: number };

  it('places what a new sheet’s layout holds, gallery ids alone, and follows each write of it', async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 't1', '{}');
    tabRow(sql, 't2', '{}');
    sql.exec(`INSERT INTO image_refs (tab_id, image_id) VALUES ('t1', 'a')`);
    sql.exec(`DELETE FROM outbox`);
    sheetRow(sql, 's1', 't2', layout('b', 'c', 'b', 'data:image/png;base64,AA', 'x'.repeat(129)));
    expect(await documentImageIds(env, 'D')).toEqual(['a', 'b', 'c']);
    expect(outboxImages(sql).n).toBe(1);
    expect(await documentPlacesImage(env, 'D', 'b', 't2')).toBe(true);
    expect(await documentPlacesImage(env, 'D', 'b', 't1')).toBe(false);
    sql.prepare(`UPDATE sheets SET layout = ? WHERE id = 's1'`).run(layout('c', 'd'));
    expect(await documentImageIds(env, 'D')).toEqual(['a', 'c', 'd']);
    // A write of something else leaves them as they are.
    sql.exec(`UPDATE sheets SET title = 'T' WHERE id = 's1'`);
    expect(await documentImageIds(env, 'D')).toEqual(['a', 'c', 'd']);
    // A layout that is not JSON, or holds no objects, places none.
    sql.exec(`UPDATE sheets SET layout = 'not json' WHERE id = 's1'`);
    expect(await documentImageIds(env, 'D')).toEqual(['a']);
    sql.prepare(`UPDATE sheets SET layout = ? WHERE id = 's1'`).run(layout('e'));
    sql.exec(`UPDATE sheets SET layout = '{}' WHERE id = 's1'`);
    expect(await documentImageIds(env, 'D')).toEqual(['a']);
  });

  it('goes with its sheet', async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 't1', '{}');
    sheetRow(sql, 's1', 't1', layout('b'));
    sql.exec(`DELETE FROM outbox`);
    sql.exec(`DELETE FROM sheets WHERE id = 's1'`);
    expect(await documentImageIds(env, 'D')).toEqual([]);
    expect(outboxImages(sql).n).toBe(1);
  });
});

// images.md "A sheet's references" (D633): a cell holding a picture is a reference too, kept by the cells' triggers.
describe('a sheet’s cells’ pictures', () => {
  function sheetRow(sql: DatabaseSync, id: string, tabId: string) {
    sql
      .prepare(
        `INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
         VALUES ('D', ?, ?, ?, '{}', 0, 0, 0, '{}')`,
      )
      .run(id, tabId, id);
  }
  const cell = (sql: DatabaseSync, r: string, input: unknown) =>
    sql
      .prepare(
        `INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input) VALUES ('D', 's1', ?, 'c1', ?)
         ON CONFLICT (document_id, sheet_id, row_id, col_id) DO UPDATE SET input = excluded.input`,
      )
      .run(r, input === null ? null : JSON.stringify(input));
  const outboxImages = (sql: DatabaseSync) =>
    (sql.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE kind = 'images'`).get() as { n: number })
      .n;

  it('places each cell’s gallery picture, follows its writes and deletes, and goes with its sheet', async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 't1', '{}');
    sheetRow(sql, 's1', 't1');
    sql.exec(`DELETE FROM outbox`);
    cell(sql, 'r1', { img: { id: 'p1', alt: 'A cow' } });
    cell(sql, 'r2', { img: { id: 'p2' } });
    cell(sql, 'r3', { img: { id: 'p1' } });
    cell(sql, 'r4', { s: '{"img":{"id":"no"}}' });
    cell(sql, 'r5', { img: { id: 'data:image/png;base64,AA' } });
    cell(sql, 'r6', { img: { id: 'x'.repeat(129) } });
    expect(await documentImageIds(env, 'D')).toEqual(['p1', 'p2']);
    expect(outboxImages(sql)).toBe(1);
    expect(await documentPlacesImage(env, 'D', 'p2', 't1')).toBe(true);
    // Typed over, the picture goes; another picture takes its place.
    cell(sql, 'r2', { n: 1 });
    cell(sql, 'r1', { img: { id: 'p3' } });
    expect(await documentImageIds(env, 'D')).toEqual(['p1', 'p3']);
    // A format write leaves the picture as it is.
    sql.exec(`UPDATE sheet_cells SET format = '{"b":true}' WHERE row_id = 'r3'`);
    expect(await documentImageIds(env, 'D')).toEqual(['p1', 'p3']);
    sql.exec(`DELETE FROM sheet_cells WHERE row_id = 'r3'`);
    cell(sql, 'r1', null);
    expect(await documentImageIds(env, 'D')).toEqual([]);
    cell(sql, 'r1', { img: { id: 'p4' } });
    sql.exec(`DELETE FROM outbox`);
    sql.exec(`DELETE FROM sheets WHERE id = 's1'`);
    expect(await documentImageIds(env, 'D')).toEqual([]);
    expect(outboxImages(sql)).toBe(1);
  });
});
