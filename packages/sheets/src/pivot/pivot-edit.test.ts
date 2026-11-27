// docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor" (D611, D614): what the editor's controls do to a pivot
// table, each a whole new pivot table.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import type { SheetPivot } from '../objects/sheet-pivot';
import type { Sheet } from '../sheet';
import {
  PIVOT_BLANK_ITEM,
  pivotAdd,
  pivotAddCalculated,
  pivotColumns,
  pivotFilterItems,
  pivotFilterStatus,
  pivotRemove,
  pivotSuggestions,
  pivotWithEntry,
  pivotWithSource,
} from './pivot-edit';

const DATA = {
  A1: 'Region',
  B1: '',
  C1: 'Units',
  D1: 'Rep',
  A2: 'East',
  B2: 'Pen',
  C2: '5',
  D2: 'Ann',
  A3: 'West',
  B3: '',
  C3: 'n/a',
  D3: 'Bo',
  A4: 'East',
  B4: 'Ink',
  C4: '2',
  D4: 'Ann',
};

function setup() {
  const b = book({ Data: DATA }, { rows: 6, cols: 5 });
  const data = b.sheets[0] as Sheet;
  const { rows, cols } = data.layout;
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[4]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[3]! },
  };
  const read = b.wb.pivotSourceOf(data.id, pivot);
  return { ...b, data, cols, pivot, read: read! };
}

describe('the source’s columns', () => {
  it('names each by its header, a blank one by its letter, and knows which hold numbers', () => {
    const { read, cols } = setup();
    expect(pivotColumns(read)).toEqual([
      { col: cols[0], name: 'Region', numbers: false },
      { col: cols[1], name: 'Column B', numbers: false },
      { col: cols[2], name: 'Units', numbers: true },
      { col: cols[3], name: 'Rep', numbers: false },
    ]);
  });

  it('is null for a pivot table whose source is gone', () => {
    const { wb, data, pivot } = setup();
    expect(wb.pivotSourceOf(data.id, { ...pivot, source: undefined })).toBeNull();
    expect(wb.pivotSourceOf('nosheet', pivot)).toBeNull();
  });

  it('lists a column’s items as the source shows them, in order, a blank as its own', () => {
    const { read, cols } = setup();
    expect(pivotFilterItems(read, cols[0]!)).toEqual(['East', 'West']);
    expect(pivotFilterItems(read, cols[1]!)).toEqual(['Ink', 'Pen', PIVOT_BLANK_ITEM]);
    expect(pivotFilterItems(read, cols[2]!)).toEqual(['2', '5', 'n/a']);
    expect(pivotFilterItems(read, 'gone')).toEqual([]);
  });
});

describe('adding and removing fields', () => {
  it('adds groups, values by SUM or COUNTA (D611), and filters showing everything', () => {
    const { read, pivot } = setup();
    const [region, , units, rep] = pivotColumns(read);
    let p = pivotAdd(pivot, 'rows', region!);
    p = pivotAdd(p, 'columns', rep!);
    p = pivotAdd(p, 'values', units!);
    p = pivotAdd(p, 'values', rep!);
    p = pivotAdd(p, 'filters', region!);
    expect(p.rows).toEqual([{ col: region!.col }]);
    expect(p.columns).toEqual([{ col: rep!.col }]);
    expect(p.values).toEqual([
      { col: units!.col, summary: 'SUM' },
      { col: rep!.col, summary: 'COUNTA' },
    ]);
    expect(p.filters).toEqual([{ col: region!.col, cond: {} }]);
  });

  it('removes an entry, its list dropped when empty, and remaps sorts by a value', () => {
    const { read, pivot } = setup();
    const [region, , units, rep] = pivotColumns(read);
    const p: SheetPivot = {
      ...pivot,
      rows: [{ col: region!.col, sortBy: { value: 1 } }],
      columns: [{ col: rep!.col, sortBy: { value: 0 } }],
      values: [
        { col: units!.col, summary: 'SUM' },
        { col: rep!.col, summary: 'COUNTA' },
      ],
      filters: [{ col: region!.col, cond: {} }],
    };
    const noFirst = pivotRemove(p, 'values', 0);
    expect(noFirst.values).toEqual([{ col: rep!.col, summary: 'COUNTA' }]);
    expect(noFirst.rows).toEqual([{ col: region!.col, sortBy: { value: 0 } }]);
    expect(noFirst.columns).toEqual([{ col: rep!.col }]);
    expect(pivotRemove(p, 'values', 1).rows).toEqual([{ col: region!.col }]);
    expect(pivotRemove(p, 'filters', 0)).not.toHaveProperty('filters');
    expect(pivotRemove(p, 'rows', 0)).not.toHaveProperty('rows');
    expect(pivotRemove(p, 'columns', 5)).toBe(p);
  });

  it('sets one entry whole, dropping what it leaves out', () => {
    const { read, pivot } = setup();
    const [region, , units] = pivotColumns(read);
    const p = pivotAdd(pivotAdd(pivot, 'rows', region!), 'values', units!);
    const next = pivotWithEntry(p, 'rows', 0, { col: region!.col, desc: true, totals: false });
    expect(next.rows).toEqual([{ col: region!.col, desc: true, totals: false }]);
    expect(
      pivotWithEntry(next, 'values', 0, { col: units!.col, summary: 'MAX', showAs: 'row' }).values,
    ).toEqual([{ col: units!.col, summary: 'MAX', showAs: 'row' }]);
    expect(pivotWithEntry(next, 'filters', 3, { col: region!.col, cond: {} })).toBe(next);
    const two = pivotAdd(next, 'values', region!);
    expect(
      pivotWithEntry(two, 'values', 1, { col: region!.col, summary: 'COUNTUNIQUE' }).values,
    ).toEqual([
      { col: units!.col, summary: 'SUM' },
      { col: region!.col, summary: 'COUNTUNIQUE' },
    ]);
  });
});

describe('a calculated field added', () => {
  it('starts as =0 summed, named Calculated Field N, the first number free (D622)', () => {
    const { pivot } = setup();
    const one = pivotAddCalculated(pivot, ['SUM of Units']);
    expect(one.values).toEqual([{ formula: '=0', summary: 'SUM', name: 'Calculated Field 1' }]);
    const two = pivotAddCalculated(one, ['Calculated Field 1', 'calculated field 2']);
    expect(two.values![1]).toMatchObject({ name: 'Calculated Field 3' });
  });
});

describe('a new range', () => {
  it('keeps the fields of its columns and drops the rest (D601)', () => {
    const { read, pivot, data } = setup();
    const [region, , units, rep] = pivotColumns(read);
    const p: SheetPivot = {
      ...pivot,
      rows: [{ col: rep!.col }],
      values: [{ col: units!.col, summary: 'SUM' }],
      filters: [{ col: region!.col, cond: {} }],
    };
    const { rows, cols } = data.layout;
    const source = { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[2]! };
    const next = pivotWithSource(p, source, cols.slice(0, 3));
    expect(next.source).toEqual(source);
    expect(next).not.toHaveProperty('rows');
    expect(next.values).toEqual(p.values);
    expect(next.filters).toEqual(p.filters);
  });
});

describe('a filter’s status', () => {
  it('reads all items, or how many show', () => {
    expect(pivotFilterStatus({ col: 'c', cond: {} })).toBe('Showing all items');
    expect(pivotFilterStatus({ col: 'c', cond: { values: ['a'] } })).toBe('Showing 1 item');
    expect(pivotFilterStatus({ col: 'c', cond: { values: ['a', 'b'] } })).toBe('Showing 2 items');
    expect(pivotFilterStatus({ col: 'c', cond: { op: 'gt', a: '1' } })).toBe(
      'Showing items by condition',
    );
    expect(pivotFilterStatus({ col: 'c', formula: '=Units>1' })).toBe('Showing items by formula');
  });
});

describe('suggested pivot tables (D614)', () => {
  it('sums the first number column for each of the first three text columns', () => {
    const { read } = setup();
    const columns = pivotColumns(read);
    const [region, blank, units, rep] = columns;
    expect(pivotSuggestions(columns)).toEqual([
      {
        label: 'SUM of Units for each Region',
        rows: [{ col: region!.col }],
        values: [{ col: units!.col, summary: 'SUM' }],
      },
      {
        label: 'SUM of Units for each Column B',
        rows: [{ col: blank!.col }],
        values: [{ col: units!.col, summary: 'SUM' }],
      },
      {
        label: 'SUM of Units for each Rep',
        rows: [{ col: rep!.col }],
        values: [{ col: units!.col, summary: 'SUM' }],
      },
    ]);
    expect(pivotSuggestions(columns.filter((x) => !x.numbers))).toEqual([]);
    expect(pivotSuggestions([units!])).toEqual([]);
  });
});
