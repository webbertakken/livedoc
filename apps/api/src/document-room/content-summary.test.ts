import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import type { DocumentEnv } from '../types';
import { contentSummaryOf } from './content-summary';
import { DocumentDb } from './document-db';
import { migrateDocumentSchema } from './document-schema';

// The content summary a room pushes to `documents.content_summary`
// (docs/specs/006-document/document-storage.md "The content summary"): the list's first-tab count, a count
// per tab, the document's stats
// and the empty clean-up's test, from the room's own tables.

const D = 'doc-1';
let room: DatabaseSync;
let env: DocumentEnv;

beforeEach(() => {
  room = new DatabaseSync(':memory:');
  const sql = nodeDocumentSql(room);
  migrateDocumentSchema((q) => sql.exec(q));
  const db = new DocumentDb(sql, {
    transaction: nodeTransaction(room),
    ensureSchema: () => {},
    hasSchema: () => true,
    onWrite: () => {},
  });
  env = { DOCUMENT_DB: db.asD1() } as unknown as DocumentEnv;
  room.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('${D}', 1, 1)`);
});

function tab(id: string, order: number, data: string, elementCount: number | null = null): void {
  room
    .prepare(
      'INSERT INTO tabs (id, name, data, updated_at, rev, element_count) VALUES (?, ?, ?, 1, 1, ?)',
    )
    .run(id, id, data, elementCount);
  room
    .prepare(
      'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, ?, 1)',
    )
    .run(D, id, order);
}

function stats(
  id: string,
  mode: string,
  elements: number,
  comments: number,
  bytes: number,
  at: number,
) {
  room
    .prepare(
      `INSERT INTO tab_stats (tab_id, mode, element_count, comment_count, data_bytes, written_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, mode, elements, comments, bytes, at);
}

describe('contentSummaryOf', () => {
  it('summarises a document with no tabs as empty', async () => {
    expect(await contentSummaryOf(env, D)).toEqual({
      v: 1,
      tabs: 0,
      firstTabCount: null,
      tabCounts: {},
      stats: null,
      hasContent: false,
    });
  });

  it('counts per tab in tab order, the first tab first, and -1 for a count never taken', async () => {
    tab('b', 1, '{"elements":[]}', 7);
    tab('a', 0, '{"elements":[]}', 3);
    tab('c', 2, '{"elements":[]}');
    const summary = await contentSummaryOf(env, D);
    expect(summary).toMatchObject({ tabs: 3, firstTabCount: 3, tabCounts: { a: 3, b: 7, c: -1 } });
    expect(summary.hasContent).toBe(false);
  });

  it.each([
    ['an element', '{"elements":[{"id":"e"}]}'],
    ['an article', '{"elements":[],"articles":[{"id":"x"}]}'],
    ['a form', '{"elements":[],"form":{"questions":[]}}'],
    ['a body that is not JSON', 'not json'],
  ])('holds content when a tab has %s', async (_, data) => {
    tab('a', 0, '{"elements":[]}');
    tab('b', 1, data);
    expect((await contentSummaryOf(env, D)).hasContent).toBe(true);
  });

  it("adds every tab's stats, the latest written tab's mode", async () => {
    tab('a', 0, '{}', 1);
    tab('b', 1, '{}', 2);
    stats('a', 'diagram', 4, 1, 100, 10);
    stats('b', 'draw', 6, 2, 50, 20);
    expect((await contentSummaryOf(env, D)).stats).toEqual({
      mode: 'draw',
      elements: 10,
      comments: 3,
      bytes: 150,
    });
  });

  it('leaves the stats out while any tab has none', async () => {
    tab('a', 0, '{}', 1);
    tab('b', 1, '{}', 2);
    stats('a', 'diagram', 4, 1, 100, 10);
    expect((await contentSummaryOf(env, D)).stats).toBeNull();
  });
});
