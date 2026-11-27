// docs/specs/029-sheets/pivot-tables.md "Details" (D616): the source rows a value of the output summarises.
import { describe, expect, it } from 'vitest';
import { pivotDetailRows, pivotOutput } from './pivot-output';
import type { PivotCalc, PivotSource, PivotSpec } from './pivot-spec';

const source = (rows: (string | number)[][]): PivotSource => ({
  header: ['Region', 'Product', 'Units'],
  rows: rows.map((r) => r.map((v) => ({ v, shown: String(v) }))),
});
const SALES = source([
  ['East', 'A', 1],
  ['West', 'A', 2],
  ['East', 'B', 3],
  ['West', 'B', 4],
  ['East', 'A', 5],
  ['North', 'A', 6],
]);
const BY_PRODUCT: PivotSpec = {
  rows: [{ col: 0 }],
  columns: [{ col: 1 }],
  values: [{ col: 2, summary: 'SUM' }],
};

describe('pivotDetailRows', () => {
  // Region by Product: header rows 0-1, East 2, North 3, West 4, Grand Total 5; A 1, B 2, Grand Total 3.
  it('gives the rows a value summarises, an item total and the Grand Total included', () => {
    expect(pivotOutput(SALES, BY_PRODUCT).rows[2]!.map((c) => c.v)).toEqual(['East', 6, 3, 9]);
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 2, c: 1 })).toEqual([0, 4]);
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 2, c: 3 })).toEqual([0, 2, 4]);
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 5, c: 2 })).toEqual([2, 3]);
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 5, c: 3 })).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives none for a header, a label, a value no row reaches or a place past the output', () => {
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 1, c: 1 })).toBeNull();
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 2, c: 0 })).toBeNull();
    // North sells no B.
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 3, c: 2 })).toBeNull();
    expect(pivotDetailRows(SALES, BY_PRODUCT, { r: 40, c: 1 })).toBeNull();
  });

  it('keeps only the rows every filter keeps, by values and by formula', () => {
    const spec: PivotSpec = {
      rows: [{ col: 1 }],
      columns: [],
      values: [{ col: 2, summary: 'SUM' }],
      filters: [{ col: 0, cond: { values: ['East', 'West'] } }],
    };
    // Product: A 1, B 2, Grand Total 3.
    expect(pivotDetailRows(SALES, spec, { r: 1, c: 1 })).toEqual([0, 1, 4]);
    const calc: PivotCalc = { field: () => 0, holds: (_, r) => r !== 4 };
    const byFormula: PivotSpec = { ...spec, filters: [{ col: 2, formula: '=Units<>5' }] };
    expect(pivotDetailRows(SALES, byFormula, { r: 1, c: 1 }, 'en-US', calc)).toEqual([0, 1, 5]);
  });

  it('reads values as rows, each value its own line', () => {
    const spec: PivotSpec = {
      rows: [{ col: 0 }],
      columns: [],
      values: [
        { col: 2, summary: 'SUM' },
        { col: 2, summary: 'COUNT' },
      ],
      valuesAsRows: true,
    };
    // Header 0, East SUM 1, East COUNT 2, North 3-4, West 5-6, Grand Total 7-8; the values in column 2.
    expect(pivotDetailRows(SALES, spec, { r: 2, c: 2 })).toEqual([0, 2, 4]);
    expect(pivotDetailRows(SALES, spec, { r: 8, c: 2 })).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
