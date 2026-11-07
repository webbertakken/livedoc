import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateDocumentSchema } from './document-schema';

// Invariant R3 (docs/specs/006-document/document-storage.md "The outbox"): every write of a room table
// keys the outbox from a trigger, in the write's own transaction. One case per table.

let db: DatabaseSync;

function keys(): string[] {
  return (
    db.prepare('SELECT document_id, kind, key FROM outbox ORDER BY id').all() as {
      document_id: string;
      kind: string;
      key: string;
    }[]
  ).map((r) => `${r.document_id}:${r.kind}:${r.key}`);
}

function clear(): void {
  db.exec('DELETE FROM outbox');
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrateDocumentSchema((q) => {
    db.exec(q);
    return { toArray: () => (/^\s*SELECT/i.test(q) ? db.prepare(q).all() : []) };
  });
  db.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('d', 1, 1);
    INSERT INTO tabs (id, name, data, updated_at, rev) VALUES ('t', 'T', '{}', 1, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d', 't', 0, 1);`);
});

describe('the outbox triggers', () => {
  it('key the summary when the document row is made or changed', () => {
    expect(keys()).toContain('d:summary:');
    clear();
    db.exec("UPDATE document SET presentation = 'x' WHERE id = 'd'");
    expect(keys()).toEqual(['d:summary:']);
  });

  it('key the tab, the summary and the images when a tab joins or leaves the document', () => {
    clear();
    db.exec(`INSERT INTO tabs (id, name, data, updated_at) VALUES ('u', 'U', '{}', 1);
      INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d', 'u', 1, 1);`);
    expect(keys()).toEqual(expect.arrayContaining(['d:tab:u', 'd:summary:', 'd:images:']));
    clear();
    db.exec("DELETE FROM tabs WHERE id = 'u'");
    expect(keys()).toEqual(expect.arrayContaining(['d:tab:u', 'd:summary:', 'd:images:']));
  });

  it('key the summary when the tab order or a folder changes', () => {
    clear();
    db.exec("UPDATE document_tabs SET order_index = 3 WHERE tab_id = 't'");
    expect(keys()).toEqual(['d:summary:']);
  });

  it('key the tab and the summary when a tab body or name changes', () => {
    clear();
    db.exec(`UPDATE tabs SET data = '{"elements":[]}', rev = 2 WHERE id = 't'`);
    expect(keys()).toEqual(expect.arrayContaining(['d:tab:t', 'd:summary:']));
    clear();
    db.exec("UPDATE tabs SET name = 'Renamed' WHERE id = 't'");
    expect(keys()).toEqual(expect.arrayContaining(['d:tab:t', 'd:summary:']));
  });

  it('key the summary when tab stats are written', () => {
    clear();
    db.exec(`INSERT INTO tab_stats (tab_id, mode, element_count, comment_count, data_bytes, written_at)
      VALUES ('t', 'diagram', 1, 0, 2, 1)`);
    expect(keys()).toEqual(['d:summary:']);
    clear();
    db.exec("UPDATE tab_stats SET element_count = 2 WHERE tab_id = 't'");
    expect(keys()).toEqual(['d:summary:']);
  });

  it('key the images when an image reference comes or goes', () => {
    clear();
    db.exec("INSERT INTO image_refs (tab_id, image_id) VALUES ('t', 'i')");
    expect(keys()).toEqual(['d:images:']);
    clear();
    db.exec("DELETE FROM image_refs WHERE tab_id = 't'");
    expect(keys()).toEqual(['d:images:']);
  });

  it('key the cards and the items when an item is written', () => {
    clear();
    db.exec(`INSERT INTO items (document_id, id, type, item_key, rank, fields, rev, created_at, updated_at,
      created_by, updated_by) VALUES ('d', 'i1', 'task', 1, 'a', '{}', 1, 1, 1, 'p', 'p')`);
    expect(keys()).toEqual(['d:cards:', 'd:items:']);
    clear();
    db.exec(`UPDATE items SET fields = '{"title":"x"}' WHERE id = 'i1'`);
    expect(keys()).toEqual(['d:cards:', 'd:items:']);
    clear();
    db.exec("DELETE FROM items WHERE id = 'i1'");
    expect(keys()).toEqual(['d:cards:', 'd:items:']);
  });

  it('key the cards when a board shows other statuses', () => {
    clear();
    db.exec(`INSERT INTO plan_board_statuses (tab_id, element_id, board_title, status, done, board_order,
      position) VALUES ('t', 'b', 'Board', 'todo', 0, 0, 0)`);
    expect(keys()).toEqual(['d:cards:']);
    clear();
    db.exec("DELETE FROM plan_board_statuses WHERE tab_id = 't'");
    expect(keys()).toEqual(['d:cards:']);
  });

  it("key a sheet's tab when one of its cells changes", () => {
    db.exec(`INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at,
      updated_by) VALUES ('d', 's', 't', 'S', '{}', 1, 1, 1, 'p')`);
    clear();
    db.exec(
      "INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input) VALUES ('d', 's', 'r', 'c', '1')",
    );
    expect(keys()).toEqual(['d:tab:t']);
    clear();
    db.exec("UPDATE sheet_cells SET input = '2' WHERE sheet_id = 's'");
    expect(keys()).toEqual(['d:tab:t']);
    clear();
    db.exec("DELETE FROM sheet_cells WHERE sheet_id = 's'");
    expect(keys()).toEqual(['d:tab:t']);
  });

  it('key every tab referencing a sheet when one of its cells changes', () => {
    db.exec(`INSERT INTO tabs (id, name, data, updated_at, rev) VALUES ('u', 'U', '{}', 1, 1);
      INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d', 'u', 1, 1);
      INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
      VALUES ('d', 's', 't', 'S', '{}', 1, 1, 1, 'p');
      INSERT INTO sheet_refs (tab_id, sheet_id) VALUES ('u', 's');`);
    clear();
    db.exec(
      "INSERT INTO sheet_cells (document_id, sheet_id, row_id, col_id, input) VALUES ('d', 's', 'r', 'c', '1')",
    );
    expect(keys().sort()).toEqual(['d:tab:t', 'd:tab:u']);
  });

  it('re-key a key written again, so a drain that read the old id leaves the new one', () => {
    const first = (
      db.prepare("SELECT id FROM outbox WHERE kind = 'tab' AND key = 't'").get() as {
        id: number;
      }
    ).id;
    db.exec("UPDATE tabs SET name = 'Again' WHERE id = 't'");
    const again = (
      db.prepare("SELECT id FROM outbox WHERE kind = 'tab' AND key = 't'").get() as {
        id: number;
      }
    ).id;
    expect(again).toBeGreaterThan(first);
    expect(keys().filter((k) => k === 'd:tab:t')).toHaveLength(1);
  });

  it('never hands a re-keyed key the id it had, even when it held the largest', () => {
    db.exec('DELETE FROM outbox');
    db.exec("UPDATE tabs SET name = 'Once' WHERE id = 't'");
    const ids = () =>
      (db.prepare('SELECT id FROM outbox ORDER BY id').all() as { id: number }[]).map((r) => r.id);
    const before = ids();
    db.exec("UPDATE tabs SET name = 'Twice' WHERE id = 't'");
    expect(Math.min(...ids())).toBeGreaterThan(Math.max(...before));
  });
});
