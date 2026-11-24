import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nodeDocumentSql } from '../test-document-sql';
import { migrateDocumentSchema } from './document-schema';
import type { DocumentSql } from './document-db';
import { storedDrawingOf } from './room-drawing-of';

// docs/specs/013-workspace/tab-scoped-share-links.md "Drawing tabs": the room knows a drawing tab's text document tab
// from its own SQLite, read once per tab per frame; no store knows none, and a failed read admits nothing, logged.

afterEach(() => vi.restoreAllMocks());

function store(): { sql: DocumentSql; reads: () => number } {
  const sql = nodeDocumentSql(new DatabaseSync(':memory:'));
  migrateDocumentSchema((q) => sql.exec(q));
  sql.exec("INSERT INTO tabs (id, name, data, updated_at) VALUES ('w', 'Notes', '{}', 1)");
  sql.exec(
    "INSERT INTO tabs (id, name, data, updated_at, drawing_of) VALUES ('d1', 'Drawing 1', '{}', 1, 'w')",
  );
  let count = 0;
  return {
    sql: {
      exec: (query, ...bindings) => {
        count += 1;
        return sql.exec(query, ...bindings);
      },
    },
    reads: () => count,
  };
}

describe('storedDrawingOf', () => {
  it("answers a drawing tab's text document tab, and null for any other tab", () => {
    const drawingOf = storedDrawingOf(store().sql);
    expect(drawingOf('d1')).toBe('w');
    expect(drawingOf('w')).toBeNull();
    expect(drawingOf('gone')).toBeNull();
  });

  it('reads each tab once however often it is asked', () => {
    const { sql, reads } = store();
    const drawingOf = storedDrawingOf(sql);
    drawingOf('d1');
    drawingOf('d1');
    drawingOf('w');
    drawingOf('w');
    expect(reads()).toBe(2);
  });

  it('knows no drawing without a store', () => {
    expect(storedDrawingOf(null)('d1')).toBeNull();
  });

  it('admits nothing when the read fails, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const drawingOf = storedDrawingOf({
      exec: () => {
        throw new Error('SQLITE_BUSY');
      },
    });
    expect(drawingOf('d1')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[room-scope] drawing read failed', {
      tabId: 'd1',
      error: 'Error: SQLITE_BUSY',
    });
  });
});
