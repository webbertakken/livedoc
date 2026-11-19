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

function spreadsheet(): void {
  room
    .prepare(
      `INSERT INTO workbook (document_id, format, settings, created_at, updated_at) VALUES (?, 'ods', '{}', 1, 1)`,
    )
    .run(D);
}

function sheet(id: string, tabId: string, cells: number, bytes: number): void {
  room
    .prepare(
      `INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, cell_count, cell_bytes, created_at, updated_at,
                           updated_by)
       VALUES (?, ?, ?, ?, '{}', 1, ?, ?, 1, 1, '{}')`,
    )
    .run(D, id, tabId, id, cells, bytes);
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
    [
      'a filled dashboard slot',
      '{"elements":[],"dashboard":{"rows":[{"id":"r","slots":[{"id":"a"},{"id":"b","content":{"type":"note"}}]}]}}',
    ],
    ['a body that is not JSON', 'not json'],
  ])('holds content when a tab has %s', async (_, data) => {
    tab('a', 0, '{"elements":[]}');
    tab('b', 1, data);
    expect((await contentSummaryOf(env, D)).hasContent).toBe(true);
  });

  it('reads a dashboard whose slots are all empty as no content', async () => {
    tab('a', 0, '{"elements":[],"dashboard":{"rows":[{"id":"r","slots":[{"id":"s"}]}]}}');
    expect((await contentSummaryOf(env, D)).hasContent).toBe(false);
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

  // document-storage.md "The content summary": a spreadsheet's sheet tab counts its sheet's filled cells.
  // docs/specs/034-text-documents/live-editing-and-storage.md "The digest" and "Tab stats".
  describe('with a text document', () => {
    const textDocument = '{"kind":"text-document","format":"odf","elements":[]}';

    function digest(id: string, characters: number, stateBytes: number): void {
      room
        .prepare(
          `INSERT INTO text_document_digest (tab_id, characters, words, pages, has_content, state_bytes, written_at)
           VALUES (?, ?, 0, 1, ?, ?, 1)`,
        )
        .run(id, characters, characters > 0 ? 1 : 0, stateBytes);
    }

    it("counts the text document's characters as its count, and has content once it holds one", async () => {
      tab('a', 0, textDocument, 0);
      digest('a', 42, 900);
      expect(await contentSummaryOf(env, D)).toMatchObject({
        firstTabCount: 42,
        tabCounts: { a: 42 },
        hasContent: true,
      });
    });

    it('holds no content while its body is empty, or before its first digest', async () => {
      tab('a', 0, textDocument, 0);
      expect(await contentSummaryOf(env, D)).toMatchObject({ firstTabCount: 0, hasContent: false });
      digest('a', 0, 40);
      expect(await contentSummaryOf(env, D)).toMatchObject({ firstTabCount: 0, hasContent: false });
    });

    it("adds its characters to the elements and its state's bytes to the tabs'", async () => {
      tab('a', 0, textDocument, 0);
      tab('c', 1, '{"elements":[{}]}', 1);
      stats('a', 'diagram', 0, 0, 50, 10);
      stats('c', 'diagram', 1, 2, 30, 20);
      digest('a', 42, 900);
      expect((await contentSummaryOf(env, D)).stats).toEqual({
        mode: 'diagram',
        elements: 43,
        comments: 2,
        bytes: 980,
      });
    });
  });

  describe('in a spreadsheet', () => {
    it("counts each sheet tab's filled cells as its count", async () => {
      spreadsheet();
      tab('a', 0, '{"elements":[]}', 0);
      tab('b', 1, '{"elements":[]}', 0);
      sheet('sheet-a1', 'a', 12, 300);
      sheet('sheet-b1', 'b', 0, 0);
      const summary = await contentSummaryOf(env, D);
      expect(summary).toMatchObject({ tabs: 2, firstTabCount: 12, tabCounts: { a: 12, b: 0 } });
      expect(summary.hasContent).toBe(true);
    });

    it('holds no content while every sheet is empty', async () => {
      spreadsheet();
      tab('a', 0, '{"elements":[]}', 0);
      sheet('sheet-a1', 'a', 0, 0);
      expect(await contentSummaryOf(env, D)).toMatchObject({ firstTabCount: 0, hasContent: false });
    });

    it("adds the cells to the stats: filled cells as elements, their bytes to the tabs'", async () => {
      spreadsheet();
      tab('a', 0, '{}', 0);
      tab('b', 1, '{}', 0);
      stats('a', 'diagram', 0, 1, 10, 10);
      stats('b', 'diagram', 0, 0, 10, 20);
      sheet('sheet-a1', 'a', 5, 100);
      sheet('sheet-b1', 'b', 7, 200);
      expect((await contentSummaryOf(env, D)).stats).toEqual({
        mode: 'diagram',
        elements: 12,
        comments: 1,
        bytes: 320,
      });
    });

    it('leaves out a sheet whose tab the document no longer holds', async () => {
      spreadsheet();
      tab('a', 0, '{}', 0);
      sheet('sheet-a1', 'a', 0, 0);
      sheet('sheet-gone', 'gone', 40, 900);
      expect(await contentSummaryOf(env, D)).toMatchObject({
        tabCounts: { a: 0 },
        hasContent: false,
      });
    });
  });

  it("keeps a Plan Sheet tab's count its elements outside a spreadsheet", async () => {
    tab('a', 0, '{"elements":[]}', 0);
    sheet('sheet-a1', 'a', 9, 90);
    expect(await contentSummaryOf(env, D)).toMatchObject({ firstTabCount: 0, hasContent: false });
  });
});
