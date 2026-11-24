import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from './test-sqlite-d1';
import { isTabInScope, scopeAdmits } from './tab-scope';

// docs/specs/013-workspace/tab-scoped-share-links.md "Drawing tabs": a link to one tab reaches that tab and its drawing
// tabs, judged as each request arrives; a document-level door only for a link to every tab.

function tabRow(sql: DatabaseSync, id: string, drawingOf: string | null, documentId = 'D') {
  if (!sql.prepare('SELECT 1 FROM documents WHERE id = ?').get(documentId))
    sql
      .prepare(
        "INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES (?, 'me', ?, 0, 0, 0)",
      )
      .run(documentId, documentId);
  sql
    .prepare('INSERT INTO tabs (id, name, data, updated_at, drawing_of) VALUES (?, ?, ?, 0, ?)')
    .run(id, id, '{}', drawingOf);
  sql
    .prepare(
      'INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES (?, ?, 0, 0)',
    )
    .run(documentId, id);
}

describe('scopeAdmits', () => {
  it('admits everything unscoped, the scope tab and its drawings', () => {
    const drawingOf = (id: string) => (id === 'd1' ? 'w' : id === 'd2' ? 'v' : null);
    expect(scopeAdmits(null, 'x', drawingOf)).toBe(true);
    expect(scopeAdmits('w', 'w', drawingOf)).toBe(true);
    expect(scopeAdmits('w', 'd1', drawingOf)).toBe(true);
    expect(scopeAdmits('w', 'd2', drawingOf)).toBe(false);
    expect(scopeAdmits('w', 'x', drawingOf)).toBe(false);
  });
});

describe('isTabInScope', () => {
  it("admits the link's tab and its drawing tabs, never another tab or its drawings", async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 'w', null);
    tabRow(sql, 'd1', 'w');
    tabRow(sql, 'v', null);
    tabRow(sql, 'd2', 'v');
    expect(await isTabInScope(env, 'D', null, 'v')).toBe(true);
    expect(await isTabInScope(env, 'D', 'w', 'w')).toBe(true);
    expect(await isTabInScope(env, 'D', 'w', 'd1')).toBe(true);
    expect(await isTabInScope(env, 'D', 'w', 'd2')).toBe(false);
    expect(await isTabInScope(env, 'D', 'w', 'v')).toBe(false);
    expect(await isTabInScope(env, 'D', 'w', 'none')).toBe(false);
  });

  it('admits a document-level door only for a link to every tab', async () => {
    const { env } = sqliteD1();
    expect(await isTabInScope(env, 'D', null, undefined)).toBe(true);
    expect(await isTabInScope(env, 'D', 'w', undefined)).toBe(false);
  });

  it("admits no drawing tab of another document's tab", async () => {
    const { env, sql } = sqliteD1();
    tabRow(sql, 'w', null);
    tabRow(sql, 'd1', 'w', 'E');
    expect(await isTabInScope(env, 'D', 'w', 'd1')).toBe(false);
  });
});
