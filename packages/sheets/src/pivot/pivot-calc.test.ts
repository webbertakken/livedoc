// docs/specs/029-sheets/pivot-tables.md "The output" (D600): a pivot table's formulas over its source's column names,
// each name bound to what it reads, worked out by the engine.
import { describe, expect, it } from 'vitest';
import { err, type ColumnValues } from '../formula/values';
import { book } from '../testing/book';
import type { Sheet } from '../sheet';
import type { SheetPivot } from '../objects/sheet-pivot';
import { pivotCalc, pivotFormula } from './pivot-calc';
import { pivotOutput } from './pivot-output';
import { implicit } from '../engine/refs';
import type { Frame } from '../engine/frame';
import type { PivotSource } from './pivot-spec';

describe('pivotFormula', () => {
  const header = ['Units', 'Unit price', "Rep's", 'A1', 'TRUE', 'units'];

  it('names each quoted column and each column whose name reads as one, case aside', () => {
    const f = pivotFormula("='Units'*'unit price'+units", header);
    expect(f.text).toBe('=PIVOTCOLUMN_0*PIVOTCOLUMN_1+units');
    expect([...f.names]).toEqual([
      ['UNITS', 0],
      ['PIVOTCOLUMN_0', 0],
      ['PIVOTCOLUMN_1', 1],
    ]);
  });

  it('reads a doubled quote inside a name, and leaves strings, unknown names and open quotes as typed', () => {
    expect(pivotFormula("=COUNTA('Rep''s')", header).text).toBe('=COUNTA(PIVOTCOLUMN_2)');
    expect(pivotFormula(`="'Units'"&'Nope'`, header).text).toBe(`="'Units'"&'Nope'`);
    expect(pivotFormula(`="say ""hi"""&'Units'`, header).text).toBe(`="say ""hi"""&PIVOTCOLUMN_0`);
    expect(pivotFormula("='Units", header).text).toBe("='Units");
  });
});

describe('pivotCalc', () => {
  const source: PivotSource = {
    header: ['Units', 'Price'],
    rows: [
      [
        { v: 2, shown: '2' },
        { v: 3, shown: '3' },
      ],
      [
        { v: 4, shown: '4' },
        { v: null, shown: '' },
      ],
    ],
  };
  it('binds names to summaries, values as a range, or a row’s own value, and keeps a row only on TRUE or a number', () => {
    const seen: [string, unknown][] = [];
    const calc = pivotCalc(source, (text, scope) => {
      seen.push([text, Object.fromEntries(scope)]);
      return text === '=Price' ? 'yes' : 1;
    });
    calc.field("='Units'", 'SUM', [0, 1]);
    calc.field("='Units'", 'CUSTOM', [0, 1]);
    expect(calc.holds('=Price', 1)).toBe(false);
    expect(calc.holds('=Units', 0)).toBe(true);
    expect(seen).toEqual([
      ['=PIVOTCOLUMN_0', { UNITS: 6, PRICE: 3, PIVOTCOLUMN_0: 6 }],
      [
        '=PIVOTCOLUMN_0',
        {
          UNITS: { rows: [[2], [4]], readsAsRange: true },
          PRICE: { rows: [[3], [null]], readsAsRange: true },
          PIVOTCOLUMN_0: { rows: [[2], [4]], readsAsRange: true },
        },
      ],
      ['=Price', { UNITS: 4, PRICE: null }],
      ['=Units', { UNITS: 2, PRICE: 3 }],
    ]);
    // Rows past the source read blank.
    const blank = pivotCalc({ header: ['A'], rows: [] }, (_, scope) =>
      scope.get('A') === null ? 1 : 0,
    );
    expect(blank.holds('=A', 3)).toBe(true);
    expect(blank.field('=A', 'CUSTOM', [3])).toBe(0);
    expect(blank.field('=A', 'COUNTA', [3])).toBe(0);
  });

  it('works nothing out without an engine', () => {
    const out = pivotOutput(source, {
      rows: [],
      columns: [],
      values: [{ formula: '=1', summary: 'SUM' }],
      filters: [{ col: 0, formula: '=TRUE' }],
    });
    expect(out.rows.at(-1)).toEqual([{ v: null }, { v: null }]);
    const kept = pivotOutput(source, {
      rows: [],
      columns: [],
      values: [{ formula: '=1', summary: 'SUM' }],
    });
    expect(kept.rows).toEqual([
      [{ v: null }, { v: 'Calculated Field 1' }],
      [{ v: null }, { v: err('#ERROR!', 'Formulas are worked out by the engine') }],
    ]);
  });
});

describe('a pivot table’s formulas in the grid', () => {
  function report(make: (data: Sheet) => Partial<SheetPivot>) {
    const b = book(
      {
        Data: {
          A1: 'Region',
          B1: 'Units',
          A2: 'East',
          B2: '5',
          A3: 'West',
          B3: '3',
          A4: 'East',
          B4: 'n/a',
        },
        Report: {},
      },
      { rows: 8, cols: 6, arrays: 'google' },
    );
    const [data, rep] = b.sheets as [Sheet, Sheet];
    const pivot: SheetPivot = {
      id: 'pivot01',
      kind: 'pivot',
      at: { r: rep.layout.rows[0]!, c: rep.layout.cols[0]! },
      source: {
        r1: data.layout.rows[0]!,
        c1: data.layout.cols[0]!,
        r2: data.layout.rows[3]!,
        c2: data.layout.cols[1]!,
        s: data.id,
      },
      rows: [{ col: data.layout.cols[0]! }],
      ...make(data),
    };
    const next = { ...rep, layout: { ...rep.layout, objects: [pivot] } };
    b.wb.updateSheet(next);
    return (r: number, c: number) => b.wb.value(next.id, r, c);
  }

  it('names calculated fields, numbers those unnamed, and shows a formula it cannot read as #ERROR!', () => {
    const at = report(() => ({
      values: [
        { formula: "='Units'*2", summary: 'SUM', name: 'Double' },
        { formula: '=SUM(', summary: 'SUM', name: 'Broken' },
        { formula: "=COUNTA('Units')", summary: 'CUSTOM', name: 'Rows', showAs: 'total' },
      ],
    }));
    expect([at(0, 1), at(0, 2), at(0, 3)]).toEqual(['Double', 'Broken', 'Rows']);
    expect([at(1, 1), at(2, 1), at(3, 1)]).toEqual([10, 6, 16]);
    expect(at(1, 2)).toEqual(err('#ERROR!', 'Formula parse error.'));
    expect(at(1, 3)).toBeCloseTo(2 / 3);
  });

  it('keeps the rows a filter’s formula holds for, its errors keeping none', () => {
    const at = report((data) => ({
      values: [{ col: data.layout.cols[1]!, summary: 'COUNTA' }],
      filters: [{ col: data.layout.cols[1]!, formula: '=ISNUMBER(Units)' }],
    }));
    expect([at(1, 0), at(1, 1), at(2, 0), at(3, 0)]).toEqual(['East', 1, 'West', 'Grand Total']);
    const none = report((data) => ({
      values: [{ col: data.layout.cols[1]!, summary: 'COUNTA' }],
      filters: [{ col: data.layout.cols[1]!, formula: '=Units*1' }],
    }));
    expect([none(1, 0), none(2, 0)]).toEqual(['East', 'West']);
  });
});

describe('a column read as a range where one value goes', () => {
  it('is its first value, blank when it has none, and whole in an array context', () => {
    const f = { arrays: false } as Frame;
    const column = (rows: number[][]): ColumnValues => ({ rows, readsAsRange: true });
    expect(implicit(column([[4], [5]]), f)).toBe(4);
    expect(implicit(column([]), f)).toBeNull();
    const whole = { rows: [[4]], readsAsRange: true as const };
    expect(implicit(whole, { arrays: true } as Frame)).toBe(whole);
  });
});
