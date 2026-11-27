// docs/specs/029-sheets/pivot-tables.md "In the grid" (D382): the engine places a pivot table's output in its sheet as
// it places a spilled array, from its source as it reads now, with its numbers' formats.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { err } from '../formula/values';
import type { SheetPivot } from '../objects/sheet-pivot';
import type { Sheet } from '../sheet';
import { cellKey } from '../sheet';
import { readRange } from '../a1-io';
import { clipFromRange } from '../clipboard';
import { shownRows } from '../sheet-text';
import { renderWindow } from '../engine/render';
import {
  PIVOT_BLOCKED_BY,
  PIVOT_NO_SOURCE,
  PIVOT_PAST_EDGE,
  pivotAnchorsOf,
} from './pivot-resolve';

const DATA = {
  A1: 'Region',
  B1: 'Product',
  C1: 'Units',
  A2: 'East',
  B2: 'Pen',
  C2: '5',
  A3: 'West',
  B3: 'Pen',
  C3: '3',
  A4: 'East',
  B4: 'Ink',
  C4: '2',
};

// A workbook of Data and Report, the pivot table set on Report's layout.
function withPivot(make: (data: Sheet, report: Sheet) => Partial<SheetPivot>, report = {}) {
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
      c2: data.layout.cols[2]!,
      s: data.id,
    },
    rows: [{ col: data.layout.cols[0]! }],
    values: [{ col: data.layout.cols[2]!, summary: 'SUM' }],
    ...make(data, rep),
  };
  const next = { ...rep, layout: { ...rep.layout, objects: [pivot] } };
  b.sheets[1] = next;
  b.wb.updateSheet(next);
  const grid = (rows: number, cols: number) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => b.wb.value(next.id, r, c)),
    );
  return { ...b, data, report: next, pivot, grid };
}

describe('a pivot table in the grid', () => {
  it('lands its output from its anchor, read by formulas like any cell', () => {
    const { grid, v, set } = withPivot(() => ({}), { E1: '=B4*2', E2: '=SUM(B2:B3)' });
    expect(grid(4, 2)).toEqual([
      ['Region', 'SUM of Units'],
      ['East', 7],
      ['West', 3],
      ['Grand Total', 10],
    ]);
    expect(v('E1', 'Report')).toBe(20);
    expect(v('E2', 'Report')).toBe(10);
    // A source cell changes: the output and its readers with it.
    set('C2', '10', 'Data');
    expect(v('B2', 'Report')).toBe(12);
    expect(v('E1', 'Report')).toBe(30);
    // A new item grows the output.
    set('A3', 'North', 'Data');
    expect(grid(5, 2)).toEqual([
      ['Region', 'SUM of Units'],
      ['East', 12],
      ['North', 3],
      ['Grand Total', 15],
      [null, null],
    ]);
  });

  it('shows #REF! at its anchor while a filled cell blocks it, and lands when it is emptied', () => {
    const { v, set, wb, report } = withPivot(() => ({}), { B3: 'x' });
    expect(v('A1', 'Report')).toEqual(err('#REF!', PIVOT_BLOCKED_BY('B3')));
    expect(v('A2', 'Report')).toBeNull();
    expect(wb.spillOwnerAt(report.id, 1, 0)).toBeNull();
    set('B3', '', 'Report');
    expect(v('B3', 'Report')).toBe(3);
    expect(wb.spillOwnerAt(report.id, 3, 1)).toEqual({ r: 0, c: 0 });
  });

  it('shows #REF! when it would run past the edge of the sheet', () => {
    const { v } = withPivot((_, rep) => ({
      at: { r: rep.layout.rows[6]!, c: rep.layout.cols[0]! },
    }));
    expect(v('A7', 'Report')).toEqual(err('#REF!', PIVOT_PAST_EDGE));
  });

  it('reads a source by its sheet’s title or on its own sheet, and shows #REF! when its source is gone', () => {
    const titled = withPivot((data) => ({
      source: {
        r1: data.layout.rows[0]!,
        c1: data.layout.cols[0]!,
        r2: data.layout.rows[3]!,
        c2: data.layout.cols[2]!,
        st: 'data',
      },
    }));
    expect(titled.v('B4', 'Report')).toBe(10);
    const gone = withPivot((data) => ({
      source: {
        r1: data.layout.rows[0]!,
        c1: data.layout.cols[0]!,
        r2: data.layout.rows[3]!,
        c2: data.layout.cols[2]!,
        s: 'sheet9xx',
      },
    }));
    expect(gone.v('A1', 'Report')).toEqual(err('#REF!', PIVOT_NO_SOURCE));
    const corner = withPivot((data) => ({
      source: {
        r1: data.layout.rows[0]!,
        c1: data.layout.cols[0]!,
        r2: 'zz',
        c2: data.layout.cols[2]!,
        s: data.id,
      },
    }));
    expect(corner.v('A1', 'Report')).toEqual(err('#REF!', PIVOT_NO_SOURCE));
    expect(withPivot(() => ({ source: undefined })).v('A1', 'Report')).toEqual(
      err('#REF!', PIVOT_NO_SOURCE),
    );
    const own = withPivot(
      (_, rep) => ({
        source: {
          r1: rep.layout.rows[0]!,
          c1: rep.layout.cols[3]!,
          r2: rep.layout.rows[2]!,
          c2: rep.layout.cols[3]!,
        },
        rows: [{ col: rep.layout.cols[3]! }],
        values: [],
      }),
      { D1: 'Name', D2: 'b', D3: 'a' },
    );
    expect(own.grid(4, 1)).toEqual([['Name'], ['a'], ['b'], ['Grand Total']]);
  });

  it('leaves out a field on a column outside its source, and is blank with nothing to show', () => {
    const outside = withPivot((_, rep) => ({ rows: [{ col: rep.layout.cols[5]! }] }));
    expect(outside.grid(2, 2)).toEqual([
      [null, 'SUM of Units'],
      [null, 10],
    ]);
    const empty = withPivot(() => ({ rows: undefined, values: undefined }), { A2: 'kept' });
    expect(empty.grid(2, 1)).toEqual([[null], ['kept']]);
  });

  it('lets a value or formula in its anchor stand, and is drawn again once it is emptied', () => {
    const { v, set } = withPivot(() => ({}), { A1: '=1+1' });
    expect(v('A1', 'Report')).toBe(2);
    expect(v('B2', 'Report')).toBeNull();
    set('A1', '', 'Report');
    expect(v('A1', 'Report')).toBe('Region');
    expect(v('B2', 'Report')).toBe(7);
    set('A1', 'mine', 'Report');
    expect(v('A1', 'Report')).toBe('mine');
    expect(v('B2', 'Report')).toBeNull();
  });

  it('gives its numbers their source column’s format, Show As values percentages, and nothing else', () => {
    const b = withPivot((data) => ({
      values: [
        { col: data.layout.cols[2]!, summary: 'SUM' },
        { col: data.layout.cols[2]!, summary: 'SUM', showAs: 'total' },
        { col: data.layout.cols[2]!, summary: 'COUNT' },
      ],
    }));
    const { wb, report, data } = b;
    const at = (r: number, c: number) => wb.pivotFormatAt(report.id, r, c);
    expect(at(1, 1)).toBeUndefined();
    expect(at(1, 2)).toEqual({ nf: 'percent', dp: 2 });
    expect(at(0, 1)).toBeUndefined();
    expect(at(6, 5)).toBeUndefined();
    expect(wb.value(report.id, 1, 2)).toBeCloseTo(0.7);
    // A currency format on the column's first formatted cell.
    const key = cellKey(data.layout.rows[2]!, data.layout.cols[2]!);
    const cells = data.cells.copy();
    cells.set(key, { ...cells.get(key)!, format: { nf: 'currency', cur: '€', dp: 0, b: true } });
    const next = { ...data, cells };
    wb.updateSheet(next, [key]);
    expect(at(1, 1)).toEqual({ nf: 'currency', cur: '€', dp: 0 });
    expect(at(1, 3)).toBeUndefined();
    // A formula's spill has no pivot formats.
    expect(wb.pivotFormatAt(data.id, 0, 0)).toBeUndefined();
    const spill = withPivot(() => ({}), { F1: '=SEQUENCE(2)' });
    expect(spill.wb.pivotFormatAt(spill.report.id, 1, 5)).toBeUndefined();
  });

  it('keeps one cell of output, and a values-only output’s blank first column', () => {
    const one = withPivot((data) => ({
      source: {
        r1: data.layout.rows[0]!,
        c1: data.layout.cols[0]!,
        r2: data.layout.rows[0]!,
        c2: data.layout.cols[2]!,
        s: data.id,
      },
      rows: [{ col: data.layout.cols[0]!, totals: false }],
      values: undefined,
    }));
    expect(one.grid(2, 1)).toEqual([['Region'], [null]]);
    expect(one.wb.pivotFormatAt(one.report.id, 0, 0)).toBeUndefined();
    const total = withPivot((data) => ({
      rows: undefined,
      values: [{ col: data.layout.cols[2]!, summary: 'SUM', showAs: 'total' }],
    }));
    expect(total.grid(2, 2)).toEqual([
      [null, 'SUM of Units'],
      [null, 1],
    ]);
    expect(total.wb.pivotFormatAt(total.report.id, 1, 1)).toEqual({ nf: 'percent', dp: 2 });
  });

  it('reads a source that reads its own output as it stands, without hanging', () => {
    const { v } = withPivot(
      (_, rep) => ({
        source: {
          r1: rep.layout.rows[0]!,
          c1: rep.layout.cols[3]!,
          r2: rep.layout.rows[1]!,
          c2: rep.layout.cols[3]!,
        },
        rows: [{ col: rep.layout.cols[3]! }],
        values: [],
      }),
      { D1: 'Name', D2: '=A2' },
    );
    expect(['Name', null, 0]).toContain(v('D1', 'Report'));
    expect(v('A1', 'Report')).toBe('Name');
  });

  it('is found at its anchor, unless its anchor is off the grid', () => {
    const { report } = withPivot(() => ({}));
    expect(pivotAnchorsOf(report).map((x) => [x.r, x.c])).toEqual([[0, 0]]);
    const off = {
      ...report,
      layout: {
        ...report.layout,
        objects: [{ id: 'p', kind: 'pivot' as const, at: { r: 'zz', c: 'zz' } }],
      },
    };
    expect(pivotAnchorsOf(off)).toEqual([]);
  });

  it('shows its numbers in their formats in the cells view, images, copies and downloads, a cell’s own winning', () => {
    const b = withPivot(() => ({}));
    const { wb, data, report } = b;
    const key = cellKey(data.layout.rows[1]!, data.layout.cols[2]!);
    const cells = data.cells.copy();
    cells.set(key, { ...cells.get(key)!, format: { nf: 'currency', cur: '€' } });
    wb.updateSheet({ ...data, cells }, [key]);
    const read = readRange(wb, report.id, 'A1:B4');
    expect(read.ok && read.rows.map((row) => row[1]!.display)).toEqual([
      'SUM of Units',
      '€7.00',
      '€3.00',
      '€10.00',
    ]);
    expect(shownRows(wb, report)[1]).toEqual(['East', '€7.00']);
    expect(clipFromRange(wb, report.id, { r1: 1, c1: 1, r2: 1, c2: 1 })!.values).toEqual([
      ['€7.00'],
    ]);
    const image = renderWindow(wb, report.id, { width: 400, height: 200 }, 'en-GB')!;
    expect(image.cells.find((x) => x.r === 1 && x.c === 1)!.text).toBe('€7.00');
    // A cell's own number format wins; its other formats keep the pivot table's number format.
    expect(wb.shownFormat(report.id, 1, 1, { nf: 'number' })).toEqual({ nf: 'number' });
    expect(wb.shownFormat(report.id, 1, 1, { b: true })).toEqual({
      b: true,
      nf: 'currency',
      cur: '€',
    });
    expect(wb.shownFormat(report.id, 0, 0, { b: true })).toEqual({ b: true });
    // A workbook without pivot tables reads nothing more.
    const plain = book({ A1: '1' });
    expect(plain.wb.shownFormat(plain.sheets[0]!.id, 0, 0, undefined)).toBeUndefined();
  });
});

describe('a pivot table’s fields in the grid', () => {
  it('filters its source, lays values out as rows, and reads a spilled source by its cells', () => {
    const b = withPivot((data) => ({
      filters: [{ col: data.layout.cols[1]!, cond: { values: ['Pen'] } }],
      valuesAsRows: true,
    }));
    expect(b.grid(4, 3)).toEqual(
      [
        ['Region', 'Values', null],
        ['East', 'SUM of Units', 5],
        ['West', 'SUM of Units', 3],
        ['Grand Total', 'SUM of Units', 8],
      ].map((row) => row.slice(0, 3)),
    );
    const spilled = withPivot(
      (_, rep) => ({
        source: {
          r1: rep.layout.rows[0]!,
          c1: rep.layout.cols[4]!,
          r2: rep.layout.rows[3]!,
          c2: rep.layout.cols[4]!,
        },
        rows: [{ col: rep.layout.cols[4]! }],
        values: [],
      }),
      { E1: '=SEQUENCE(4)' },
    );
    expect(spilled.grid(5, 1)).toEqual([['1'], [2], [3], [4], ['Grand Total']]);
  });

  it('shows a column’s Custom code and a currency’s decimals as the source does', () => {
    const b = withPivot(() => ({}));
    const { wb, data, report } = b;
    const key = cellKey(data.layout.rows[1]!, data.layout.cols[2]!);
    const cells = data.cells.copy();
    cells.set(key, { ...cells.get(key)!, format: { nf: 'custom', nc: '0.0" u"' } });
    wb.updateSheet({ ...data, cells }, [key]);
    expect(wb.pivotFormatAt(report.id, 1, 1)).toEqual({ nf: 'custom', nc: '0.0" u"' });
  });
});

describe('a download’s extent', () => {
  it('reaches the last value a spill shows past its inputs', () => {
    const { wb, sheets } = book({ A1: '=SEQUENCE(3, 2)', D1: 'x' });
    expect(wb.shownExtent(sheets[0]!.id)).toEqual({ rows: 3, cols: 4 });
    expect(shownRows(wb, sheets[0]!)).toHaveLength(3);
    const blocked = book({ A1: '=SEQUENCE(3)', A2: 'x' });
    expect(blocked.wb.shownExtent(blocked.sheets[0]!.id)).toEqual({ rows: 2, cols: 1 });
  });
});
