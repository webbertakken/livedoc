import { describe, expect, it } from 'vitest';
import { Workbook } from './engine/workbook';
import { makeSheets } from './testing/book';
import { cellKey } from './sheet';
import { sheetFromJson } from './sheet-json';
import { LINK_COLS_MAX, LINK_ROWS_MAX, linkedSheet } from './linked-sheet';
import { sheetFigure, cellRefFromA1, sheetColumn } from './sheet-metrics';

// docs/specs/029-sheets/plan-links.md "Reading a sheet from another document", D505.
function book(rows = 30, cols = 12) {
  const sheets = makeSheets(
    {
      Budget: {
        A1: 'Item',
        B1: 'Spent',
        A2: 'Rent',
        B2: '1200',
        A3: 'Food',
        B3: '=1/0',
        A4: 'Paid',
        B4: 'TRUE',
        A6: 'Total',
        B6: '=SUM(B2:B2)',
        D1: '=SEQUENCE(2)',
      },
    },
    { rows, cols },
  );
  const sheet = sheets[0]!;
  return { sheet, wb: new Workbook({ sheets, locale: 'en-GB' }) };
}

// The linked sheet as a reader's page holds it: worked out again by its own engine.
function reread(json: NonNullable<ReturnType<typeof linkedSheet>>) {
  const sheet = sheetFromJson(json);
  return { sheet, wb: new Workbook({ sheets: [sheet], locale: 'en-GB' }) };
}

describe('linkedSheet', () => {
  it('carries each cell as its value, so the reader works out what the source shows', () => {
    const { sheet, wb } = book();
    const json = linkedSheet(wb, sheet.id)!;
    const read = reread(json);
    expect(read.wb.value(sheet.id, 5, 1)).toBe(1200);
    expect(read.wb.value(sheet.id, 0, 0)).toBe('Item');
    expect(read.wb.value(sheet.id, 3, 1)).toBe(true);
    expect(read.wb.value(sheet.id, 2, 1)).toEqual({ e: '#DIV/0!' });
    // A spilled array's cells arrive too, though only the anchor holds a formula.
    expect(read.wb.value(sheet.id, 1, 3)).toBe(2);
    // Never a formula of the source's own: the one formula carried is the error's code.
    expect(json.cells.filter((c) => c.i && 'f' in c.i)).toHaveLength(1);
  });

  it('keeps the ids, title and tab, so a figure reads the same cell by its ids', () => {
    const { sheet, wb } = book();
    const json = linkedSheet(wb, sheet.id)!;
    expect(json).toMatchObject({ id: sheet.id, tabId: sheet.tabId, title: 'Budget', rev: 0 });
    const read = reread(json);
    const ref = cellRefFromA1(sheet, 'B6')!;
    expect(sheetFigure(read.wb, read.sheet, ref, 'en-GB')).toMatchObject({
      value: 1200,
      label: 'Total',
    });
  });

  it('keeps each cell’s shown format, which a column summary reads for its header', () => {
    const { sheet, wb } = book();
    const head = cellKey(sheet.layout.rows[0]!, sheet.layout.cols[1]!);
    sheet.cells.set(head, { ...sheet.cells.get(head), format: { b: true } });
    const blank = cellKey(sheet.layout.rows[8]!, sheet.layout.cols[1]!);
    sheet.cells.set(blank, { format: { b: true, bt: { w: 1, s: 'solid', c: '#000000' } } });
    wb.updateSheet(sheet);
    const json = linkedSheet(wb, sheet.id)!;
    expect(
      json.cells.find((c) => c.r === sheet.layout.rows[0] && c.c === sheet.layout.cols[1]),
    ).toMatchObject({ i: { s: 'Spent' }, f: { b: true } });
    // A formatted empty cell keeps its format and has no input.
    expect(json.cells.find((c) => c.r === sheet.layout.rows[8])).toEqual({
      r: sheet.layout.rows[8],
      c: sheet.layout.cols[1],
      f: { b: true, bt: { w: 1, s: 'solid', c: '#000000' } },
    });
    const read = reread(json);
    expect(sheetColumn(read.wb, read.sheet, sheet.layout.cols[1]!)?.label).toBe('Spent');
  });

  it('keeps the rows it hides and its one-cell names, among the rows and columns it carries', () => {
    const { sheet, wb } = book();
    const [r1, r2, r3] = sheet.layout.rows;
    const [c0, c1] = sheet.layout.cols;
    sheet.layout = {
      ...sheet.layout,
      hiddenRows: [r2!],
      names: [
        { name: 'Rent', r1: r1!, c1: c1!, r2: r1!, c2: c1! },
        { name: 'Items', r1: r1!, c1: c0!, r2: r3!, c2: c0! },
      ],
      protections: [{ id: 'p1', r1: r1!, c1: c0!, r2: r1!, c2: c0!, editors: [] } as never],
    };
    wb.updateSheet(sheet);
    const json = linkedSheet(wb, sheet.id)!;
    expect(json.layout.hiddenRows).toEqual([r2]);
    expect(json.layout.names).toEqual([{ name: 'Rent', r1, c1, r2: r1, c2: c1 }]);
    // Nothing of the sheet's tools crosses.
    expect(json.layout.protections).toBeUndefined();
  });

  // docs/specs/029-sheets/plan-links.md "The Spreadsheet slot" and "Sheet Chart": what draws the sheet crosses too.
  it('keeps what draws the sheet among the rows and columns it carries: sizes, merges, hidden columns, charts', () => {
    const { sheet, wb } = book(LINK_ROWS_MAX + 5, 12);
    const rows = sheet.layout.rows;
    const [c0, c1, c2] = sheet.layout.cols;
    const far = rows[LINK_ROWS_MAX + 1]!;
    const chart = (id: string, r: string) => ({
      id,
      kind: 'chart' as const,
      type: 'column' as const,
      at: { r, c: c2!, dx: 0, dy: 0 },
      width: 300,
      height: 200,
      range: { r1: rows[0]!, c1: c0!, r2: rows[3]!, c2: c1! },
    });
    sheet.layout = {
      ...sheet.layout,
      colSize: { [c0!]: 180 },
      rowSize: { [rows[0]!]: 40, [far]: 50 },
      hiddenCols: [c2!],
      merges: [
        { r1: rows[0]!, c1: c0!, r2: rows[0]!, c2: c1! },
        { r1: far, c1: c0!, r2: far, c2: c1! },
      ],
      showGrid: false,
      objects: [
        chart('near', rows[1]!),
        chart('far', far),
        {
          id: 'img',
          kind: 'image',
          imageId: 'i1',
          at: { r: rows[0]!, c: c0!, dx: 0, dy: 0 },
          width: 10,
          height: 10,
        } as never,
      ],
    };
    wb.updateSheet(sheet);
    const json = linkedSheet(wb, sheet.id)!;
    expect(json.layout.colSize).toEqual({ [c0!]: 180 });
    expect(json.layout.rowSize).toEqual({ [rows[0]!]: 40 });
    expect(json.layout.hiddenCols).toEqual([c2]);
    expect(json.layout.merges).toEqual([{ r1: rows[0]!, c1: c0!, r2: rows[0]!, c2: c1! }]);
    expect(json.layout.showGrid).toBe(false);
    // Charts anchored among the carried rows and columns, reading only them; never an image.
    expect(json.layout.objects?.map((o) => o.id)).toEqual(['near']);
  });

  it('carries at most the first LINK_ROWS_MAX rows and LINK_COLS_MAX columns', () => {
    const { sheet, wb } = book(LINK_ROWS_MAX + 5, LINK_COLS_MAX + 5);
    const json = linkedSheet(wb, sheet.id)!;
    expect(json.layout.rows).toHaveLength(LINK_ROWS_MAX);
    expect(json.layout.cols).toHaveLength(LINK_COLS_MAX);
  });

  it('reads nothing of a sheet the workbook does not hold', () => {
    const { wb } = book();
    expect(linkedSheet(wb, 'nosuchsheet')).toBeNull();
  });
});
