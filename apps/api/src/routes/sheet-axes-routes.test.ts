import { beforeEach, describe, expect, it } from 'vitest';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Layout): every sheet's order in chunks of its own table,
// the layout JSON holding the rest; made, written, copied and read whole.

let kit: WorkbookKit;

const layoutJson = (sheetId: string) =>
  JSON.parse(
    (
      kit.sql.sql.prepare('SELECT layout FROM sheets WHERE id = ?').get(sheetId) as {
        layout: string;
      }
    ).layout,
  ) as Record<string, unknown>;

const chunks = (documentId: string) =>
  kit.sql.sql
    .prepare(
      'SELECT sheet_id AS sheet, axis, chunk, ids FROM sheet_axes WHERE document_id = ? ORDER BY sheet, axis',
    )
    .all(documentId)
    .map((row) => ({ ...row, ids: JSON.parse(String(row.ids)) as string[] }));

beforeEach(() => {
  kit = workbookKit();
});

describe("a sheet's order", () => {
  it.each([
    ['a spreadsheet', true],
    ['a Plan document', false],
  ])('is stored in chunks for %s, and read whole', async (_, spreadsheet) => {
    await kit.call({ path: '', body: kit.document('book', spreadsheet) });
    expect(layoutJson('bookSheet')).not.toHaveProperty('rows');
    expect(chunks('book')).toEqual([
      { sheet: 'bookSheet', axis: 'c', chunk: 0, ids: kit.layout.cols },
      { sheet: 'bookSheet', axis: 'r', chunk: 0, ids: kit.layout.rows },
    ]);
    const [sheet] = await kit.sheets('book');
    expect(sheet!.layout.rows).toEqual(kit.layout.rows);
    expect(sheet!.layout.cols).toEqual(kit.layout.cols);
  });

  it('follows a layout write, the rest of the layout kept in its JSON', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    const res = await kit.write('book', {
      kind: 'layout',
      changes: [
        { k: 'insertRows', after: kit.layout.rows[0]!, ids: ['newrow1'] },
        { k: 'deleteCols', ids: [kit.layout.cols[3]!] },
        { k: 'freeze', rows: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const rows = [kit.layout.rows[0]!, 'newrow1', ...kit.layout.rows.slice(1)];
    expect(chunks('book').map((c) => c.ids)).toEqual([kit.layout.cols.slice(0, 3), rows]);
    expect(layoutJson('bookSheet')).toEqual({ frozenRows: 1 });
    const [sheet] = await kit.sheets('book');
    expect(sheet!.layout).toMatchObject({ rows, cols: kit.layout.cols.slice(0, 3), frozenRows: 1 });
  });

  it('moves an order stored before the chunks on its next layout write', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    kit.sql.sql.exec("DELETE FROM sheet_axes WHERE sheet_id = 'bookSheet'");
    kit.sql.sql
      .prepare("UPDATE sheets SET layout = ? WHERE id = 'bookSheet'")
      .run(JSON.stringify(kit.layout));
    expect((await kit.sheets('book'))[0]!.layout.rows).toEqual(kit.layout.rows);
    await kit.write('book', { kind: 'layout', changes: [{ k: 'freeze', rows: 2 }] });
    expect(layoutJson('bookSheet')).toEqual({ frozenRows: 2 });
    expect(chunks('book').map((c) => c.ids)).toEqual([kit.layout.cols, kit.layout.rows]);
  });

  it('goes with a copy of the document', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    const res = await kit.call({ path: '/book/copy', body: {} });
    const { document: copied } = await res.json<{ document: { id: string } }>();
    expect(chunks(copied.id).map((c) => c.ids)).toEqual([kit.layout.cols, kit.layout.rows]);
    expect((await kit.sheets(copied.id))[0]!.layout.rows).toEqual(kit.layout.rows);
  });
});
