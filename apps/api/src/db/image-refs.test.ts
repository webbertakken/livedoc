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
