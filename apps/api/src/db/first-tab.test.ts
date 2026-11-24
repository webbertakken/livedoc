import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import { firstTabElementCount, getTabBody } from './tabs';

// docs/specs/034-text-documents/objects.md "The document around it" (Exports): a document's picture is of its first
// listed tab, never of a drawing tab, wherever that sits; a named tab is read as it is.
function documentWithDrawingFirst() {
  const db = sqliteD1();
  db.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('D', 'o', 'Plan', 0, 1, 1);
    INSERT INTO tabs (id, name, data, updated_at, drawing_of, element_count)
      VALUES ('d1', 'Drawing 1', '{"elements":[{"id":"a"},{"id":"b"}]}', 1, 'w', 2);
    INSERT INTO tabs (id, name, data, updated_at, kind, element_count)
      VALUES ('w', 'Notes', '{"kind":"text-document","elements":[]}', 1, 'text-document', 0);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('D', 'd1', 0, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('D', 'w', 1, 1);
  `);
  return db;
}

describe("a document's first tab", () => {
  it('is its first listed tab, past a drawing tab ordered first', async () => {
    const { env } = documentWithDrawingFirst();
    expect((await getTabBody(env, 'D'))?.id).toBe('w');
    expect(await firstTabElementCount(env, 'D')).toBe(0);
  });

  it('reads a named drawing tab as it is', async () => {
    const { env } = documentWithDrawingFirst();
    expect((await getTabBody(env, 'D', 'd1'))?.id).toBe('d1');
  });
});
