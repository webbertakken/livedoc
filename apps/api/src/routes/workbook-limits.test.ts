import { beforeEach, describe, expect, it } from 'vitest';
import type { SheetWrite } from '@livedoc/sheets';
import {
  WORKBOOK_GRID_CELLS_MAX,
  WORKBOOK_ROWS_MAX,
  WORKBOOK_STORED_BYTES_MAX,
} from '@livedoc/sheets';
import { workbookGrids } from '../db/sheet-grids';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/029-sheets/spreadsheet.md "Limits": a spreadsheet's sheets take the workbook's limits (a million rows
// and 20 million grid cells over every sheet, 18,278 columns, 50,000 characters an input, 1 GiB stored), a Plan
// Sheet keeps its own. The book's sheet is 10 rows by 4 columns.

let kit: WorkbookKit;

beforeEach(() => {
  kit = workbookKit();
});

const ids = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(6, '0')}`);
const insertRows = (n: number): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'insertRows', after: null, ids: ids(n, 'nr') }],
});
const insertCols = (n: number): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'insertCols', after: null, ids: ids(n, 'nc') }],
});
const errorOf = async (res: Response) => ({
  status: res.status,
  error: (await res.json<{ error?: string }>()).error,
});

// Another sheet of the book, `rows` by `cols`, its order stored in chunks as the room does. Only its counts matter
// here, so a chunk of ids is generated once and copied (ids repeat across chunks, which nothing here reads).
const CHUNK = 100_000;
function otherSheet(rows: number, cols: number, tabId = 'bookt2'): void {
  const { sql } = kit.sql;
  sql.exec(
    `INSERT INTO tabs (id, name, data, updated_at) VALUES ('${tabId}', 'Big', '{"elements":[]}', 1)`,
  );
  sql.exec(
    `INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('book', '${tabId}', 5, 1)`,
  );
  sql.exec(`INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
            VALUES ('book', 'bigSheet', '${tabId}', 'Big', '{}', 0, 1, 1, '{}')`);
  const generated = (n: number) =>
    `WITH RECURSIVE k(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM k WHERE i + 1 < ${n})
     SELECT json_group_array(printf('b%07d', i)) FROM k`;
  const full = (n: number) => (n >= CHUNK ? generated(CHUNK) : null);
  for (const [axis, n] of [
    ['r', rows],
    ['c', cols],
  ] as const) {
    const chunk = full(n);
    const whole = Math.floor(n / CHUNK);
    for (let k = 0; k < whole; k++)
      sql.exec(`INSERT INTO sheet_axes (document_id, sheet_id, axis, chunk, ids)
                SELECT 'book', 'bigSheet', '${axis}', ${k}, ${
                  k === 0
                    ? `(${chunk})`
                    : `(SELECT ids FROM sheet_axes WHERE sheet_id = 'bigSheet' AND axis = '${axis}' AND chunk = 0)`
                }`);
    if (n % CHUNK > 0)
      sql.exec(`INSERT INTO sheet_axes (document_id, sheet_id, axis, chunk, ids)
                SELECT 'book', 'bigSheet', '${axis}', ${whole}, (${generated(n % CHUNK)})`);
  }
}

describe("a spreadsheet's limits", () => {
  it("grows a sheet past a Plan Sheet's 10,000 rows and 200 columns", async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    expect((await kit.write('book', insertRows(12_000))).status).toBe(200);
    expect((await kit.write('book', insertCols(300))).status).toBe(200);
    const [sheet] = await kit.sheets('book');
    expect(sheet!.layout.rows).toHaveLength(12_010);
    expect(sheet!.layout.cols).toHaveLength(304);
  });

  it("keeps a Plan Sheet's 10,000 rows", async () => {
    await kit.call({ path: '', body: kit.document('plan', false) });
    expect(await errorOf(await kit.write('plan', insertRows(12_000)))).toEqual({
      status: 413,
      error: 'sheet_too_large',
    });
  });

  it('refuses a row past a million over every sheet, and takes the last one', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    otherSheet(WORKBOOK_ROWS_MAX - 15, 1);
    expect(await errorOf(await kit.write('book', insertRows(6)))).toEqual({
      status: 413,
      error: 'workbook_full',
    });
    expect((await kit.write('book', insertRows(5))).status).toBe(200);
  });

  it('refuses columns past 20 million grid cells over every sheet', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    // 19,994,000 grid cells there and 40 here: 5,960 left, so 596 more columns of 10 rows.
    otherSheet(769_000, 26);
    expect(WORKBOOK_GRID_CELLS_MAX - 769_000 * 26 - 40).toBe(5_960);
    expect(await errorOf(await kit.write('book', insertCols(597)))).toEqual({
      status: 413,
      error: 'workbook_full',
    });
    expect((await kit.write('book', insertCols(596))).status).toBe(200);
  });

  it("leaves out a deleted tab's sheet waiting to expire", async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    otherSheet(WORKBOOK_ROWS_MAX, 1);
    kit.sql.sql.exec("DELETE FROM document_tabs WHERE tab_id = 'bookt2'");
    expect((await kit.write('book', insertRows(10))).status).toBe(200);
  });

  it('never asks the workbook when a write adds no rows or columns', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    otherSheet(WORKBOOK_ROWS_MAX, 1);
    const cell: SheetWrite = {
      kind: 'cells',
      cells: [{ r: kit.layout.rows[0]!, c: kit.layout.cols[0]!, i: { n: 1 } }],
    };
    expect((await kit.write('book', cell)).status).toBe(200);
  });

  it('takes an input up to 50,000 characters', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    const text = (n: number): SheetWrite => ({
      kind: 'cells',
      cells: [{ r: kit.layout.rows[0]!, c: kit.layout.cols[0]!, i: { s: 'x'.repeat(n) } }],
    });
    expect((await kit.write('book', text(50_000))).status).toBe(200);
    expect(await errorOf(await kit.write('book', text(50_001)))).toEqual({
      status: 400,
      error: 'input_too_long',
    });
  });

  it('refuses a cell past 1 GiB stored over every sheet', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    otherSheet(1, 1);
    kit.sql.sql.exec(
      `UPDATE sheets SET cell_bytes = ${WORKBOOK_STORED_BYTES_MAX - 5} WHERE id = 'bigSheet'`,
    );
    const cell = (s: string): SheetWrite => ({
      kind: 'cells',
      cells: [{ r: kit.layout.rows[0]!, c: kit.layout.cols[0]!, i: { s } }],
    });
    expect(await errorOf(await kit.write('book', cell('a long text')))).toEqual({
      status: 413,
      error: 'workbook_full',
    });
  });

  it('refuses a new sheet past the grid, made or copied', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    otherSheet(WORKBOOK_ROWS_MAX - 10, 1);
    kit.sql.sql.exec(
      "INSERT INTO tabs (id, name, data, updated_at) VALUES ('bookt3', 'Three', '{\"elements\":[]}', 1)",
    );
    kit.sql.sql.exec(
      "INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('book', 'bookt3', 6, 1)",
    );
    const made = await kit.call({
      path: '/book/sheets',
      body: { tabId: 'bookt3', title: 'Three', layout: { rows: ids(1, 'tr'), cols: ids(1, 'tc') } },
    });
    expect(await errorOf(made)).toEqual({ status: 413, error: 'workbook_full' });
    const copied = await kit.call({
      path: '/book/sheets',
      body: { tabId: 'bookt3', title: 'Copy', copyOf: 'bookSheet' },
    });
    expect(await errorOf(copied)).toEqual({ status: 413, error: 'workbook_full' });
  });
});

describe('workbookGrids', () => {
  it('counts a sheet stored before the chunks from its layout', async () => {
    await kit.call({ path: '', body: kit.document('book', true) });
    kit.sql.sql.exec("DELETE FROM sheet_axes WHERE sheet_id = 'bookSheet'");
    kit.sql.sql.exec(
      `UPDATE sheets SET layout = '{"rows":["r1","r2","r3"],"cols":["c1","c2"]}' WHERE id = 'bookSheet'`,
    );
    expect(await workbookGrids(kit.sql.env, 'book')).toEqual([
      { id: 'bookSheet', rows: 3, cols: 2 },
    ]);
  });
});
