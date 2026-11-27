// docs/specs/029-sheets/pivot-tables.md "Details" (D616): which cells of an output show details, the rows they show,
// and the sheet that holds them.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import type { SheetPivot } from '../objects/sheet-pivot';
import { cellKey, type Sheet } from '../sheet';
import { WORKBOOK_COLS_NEW, WORKBOOK_ROWS_NEW } from '../workbook-record';
import { pivotDetailsSheet } from './pivot-details';

const DATA = {
  A1: 'Region',
  B1: 'Units',
  C1: 'Double',
  D1: 'When',
  E1: 'Note',
  A2: 'East',
  B2: '5',
  C2: '=B2*2',
  D2: '2025-01-15',
  E2: '=1/0',
  A3: 'West',
  B3: '3',
  C3: '=B3*2',
  A4: 'East',
  B4: '2',
  C4: '=B4*2',
  E4: 'TRUE',
};

// Data's A1:E4 by Region, SUM of Units, at Report!A1: header 0, East 1, West 2, Grand Total 3.
function withPivot(
  report: Record<string, string> = {},
  more: (data: Sheet) => Partial<SheetPivot> = () => ({}),
) {
  const b = book({ Data: DATA, Report: report }, { rows: 8, cols: 6 });
  const [data, rep] = b.sheets as [Sheet, Sheet];
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rep.layout.rows[0]!, c: rep.layout.cols[0]! },
    source: {
      r1: data.layout.rows[0]!,
      c1: data.layout.cols[0]!,
      r2: data.layout.rows[3]!,
      c2: data.layout.cols[4]!,
      s: data.id,
    },
    rows: [{ col: data.layout.cols[0]! }],
    values: [{ col: data.layout.cols[1]!, summary: 'SUM' }],
    ...more(data),
  };
  const next = { ...rep, layout: { ...rep.layout, objects: [pivot] } };
  b.wb.updateSheet(next);
  return { ...b, data, report: next };
}

describe('the cells of an output that show details', () => {
  it('are its values, totals included, and none of its headers, labels or other cells', () => {
    const { wb, data, report } = withPivot();
    expect(wb.value(report.id, 1, 1)).toBe(7);
    expect(wb.pivotValueCellAt(report.id, 1, 1)).toBe(true);
    expect(wb.pivotValueCellAt(report.id, 3, 1)).toBe(true);
    expect(wb.pivotValueCellAt(report.id, 0, 1)).toBe(false);
    expect(wb.pivotValueCellAt(report.id, 1, 0)).toBe(false);
    expect(wb.pivotValueCellAt(report.id, 5, 5)).toBe(false);
    expect(wb.pivotValueCellAt(data.id, 1, 1)).toBe(false);
    expect(wb.pivotValueCellAt('nosheet', 1, 1)).toBe(false);
  });

  it('are none while the output is blocked', () => {
    const { wb, report } = withPivot({ B3: 'in the way' });
    expect(wb.pivotValueCellAt(report.id, 1, 1)).toBe(false);
    expect(wb.pivotDetailsAt(report.id, 1, 1)).toBeNull();
  });
});

describe("a value's details", () => {
  it('names the source rows it summarises, its header first, across the source columns', () => {
    const { wb, data, report } = withPivot();
    expect(wb.pivotDetailsAt(report.id, 1, 1)).toEqual({
      pivotId: 'pivot01',
      sheetId: data.id,
      rows: [0, 1, 3],
      c1: 0,
      c2: 4,
    });
    expect(wb.pivotDetailsAt(report.id, 3, 1)!.rows).toEqual([0, 1, 2, 3]);
    expect(wb.pivotDetailsAt(report.id, 0, 0)).toBeNull();
    expect(wb.pivotDetailsAt(data.id, 1, 1)).toBeNull();
    expect(wb.pivotDetailsAt('nosheet', 1, 1)).toBeNull();
  });

  it('is none for a value no row reaches, and keeps the rows a formula filter keeps', () => {
    // Units > 2 keeps East 5 and West 3; Region by Units: header 0-1, East 2, West 3, Grand Total 4; 3 in 1, 5 in 2.
    const { wb, report } = withPivot({}, (data) => ({
      columns: [{ col: data.layout.cols[1]! }],
      filters: [{ col: data.layout.cols[1]!, formula: '=Units>2' }],
    }));
    expect([1, 2, 3].map((c) => wb.value(report.id, 2, c))).toEqual([null, 5, 5]);
    expect(wb.pivotValueCellAt(report.id, 2, 1)).toBe(true);
    expect(wb.pivotDetailsAt(report.id, 2, 1)).toBeNull();
    expect(wb.pivotDetailsAt(report.id, 4, 3)!.rows).toEqual([0, 1, 2]);
  });

  it("carries a spilled source cell as its own value, and a blank cell's format", () => {
    const b = book({ Data: { A1: 'N', A2: '=SEQUENCE(2)' } }, { rows: 6, cols: 3 });
    const sheet = b.sheets[0]!;
    sheet.cells.set(cellKey(sheet.layout.rows[0]!, sheet.layout.cols[1]!), { format: { b: true } });
    b.wb.updateSheet(sheet);
    const formatted = pivotDetailsSheet(
      b.wb,
      { pivotId: 'p', sheetId: sheet.id, rows: [0], c1: 1, c2: 1 },
      { id: 'd', title: 'D' },
    );
    expect(formatted.cells).toEqual([
      { r: formatted.layout.rows[0], c: formatted.layout.cols[0], f: { b: true } },
    ]);
    const made = pivotDetailsSheet(
      b.wb,
      { pivotId: 'p', sheetId: sheet.id, rows: [0, 1, 2], c1: 0, c2: 0 },
      { id: 'd', title: 'D' },
    );
    expect(made.cells.map((x) => x.i)).toEqual([{ s: 'N' }, { n: 1 }, { n: 2 }]);
  });

  it('is gone with its source', () => {
    const { wb, data, report } = withPivot();
    wb.updateSheet({ ...report, layout: { ...report.layout, objects: [] } });
    expect(wb.pivotDetailsAt(report.id, 1, 1)).toBeNull();
    expect(wb.pivotDetailsAt(data.id, 0, 0)).toBeNull();
  });

  it("makes a sheet of values with the source cells' formats, as large as they need", () => {
    const { wb, data, report } = withPivot();
    const made = pivotDetailsSheet(wb, wb.pivotDetailsAt(report.id, 1, 1)!, {
      id: 'details1',
      title: 'Details1',
    });
    expect(made.id).toBe('details1');
    expect(made.title).toBe('Details1');
    expect(made.layout.rows).toHaveLength(WORKBOOK_ROWS_NEW);
    expect(made.layout.cols).toHaveLength(WORKBOOK_COLS_NEW);
    const at = (r: number, c: number) =>
      made.cells.find((x) => x.r === made.layout.rows[r] && x.c === made.layout.cols[c]);
    expect([0, 1, 2, 3, 4].map((c) => at(0, c)?.i)).toEqual([
      { s: 'Region' },
      { s: 'Units' },
      { s: 'Double' },
      { s: 'When' },
      { s: 'Note' },
    ]);
    // A formula's answer, never its formula; an error as its text; a blank left out.
    expect(at(1, 2)?.i).toEqual({ n: 10 });
    expect(at(1, 4)?.i).toEqual({ s: '#DIV/0!' });
    expect(at(2, 0)?.i).toEqual({ s: 'East' });
    expect(at(2, 3)).toBeUndefined();
    expect(at(2, 4)?.i).toEqual({ b: true });
    const dateFormat = data.cells.get(cellKey(data.layout.rows[1]!, data.layout.cols[3]!))?.format;
    expect(dateFormat?.nf).toBe('date');
    expect(at(1, 3)).toMatchObject({ i: { n: expect.any(Number) }, f: dateFormat });
    expect(made.cells).toHaveLength(14);
  });

  it("grows the sheet past a new sheet's size for a wide or long source", () => {
    const { wb, data, report } = withPivot();
    const made = pivotDetailsSheet(
      wb,
      { pivotId: 'p', sheetId: data.id, rows: [0, 1, 2], c1: 0, c2: 4 },
      { id: 'd', title: 'Details2' },
    );
    expect(made.layout.rows.length).toBeGreaterThanOrEqual(3);
    const wide = pivotDetailsSheet(
      wb,
      {
        pivotId: 'p',
        sheetId: data.id,
        rows: Array.from({ length: WORKBOOK_ROWS_NEW + 2 }, () => 1),
        c1: 0,
        c2: WORKBOOK_COLS_NEW + 1,
      },
      { id: 'd', title: 'Details3' },
    );
    expect(wide.layout.rows).toHaveLength(WORKBOOK_ROWS_NEW + 2);
    expect(wide.layout.cols).toHaveLength(WORKBOOK_COLS_NEW + 2);
    expect(
      pivotDetailsSheet(
        wb,
        { pivotId: 'p', sheetId: 'gone', rows: [0], c1: 0, c2: 0 },
        {
          id: 'd',
          title: 'D',
        },
      ).cells,
    ).toEqual([]);
    expect(report.id).not.toBe(data.id);
  });
});
