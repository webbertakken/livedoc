// docs/specs/029-sheets/pivot-tables.md "The output": the rules past the evidence's cases (errors, booleans, empty
// summaries, the rest of the date rules, open intervals, missing cells and names, values as rows with no columns).
import { describe, expect, it } from 'vitest';
import { err, type Scalar } from '../formula/values';
import { serialFromParts } from '../dates';
import { compareItems, groupHeader, itemMaker } from './pivot-items';
import { pivotOutput } from './pivot-output';
import type { PivotCell, PivotSource, PivotSpec } from './pivot-spec';
import { summarise } from './pivot-summary';
import { PIVOT_DATE_RULES, PIVOT_SUMMARIES } from './pivot-spec';

const cell = (v: Scalar): PivotCell => ({
  v,
  shown: v === null ? '' : typeof v === 'object' ? v.e : String(v),
});
const source = (header: string[], rows: Scalar[][]): PivotSource => ({
  header,
  rows: rows.map((r) => r.map(cell)),
});
const values = (out: { rows: { v: Scalar }[][] }) => out.rows.map((r) => r.map((c) => c.v));

describe('summarise', () => {
  const NA = err('#N/A');
  it('answers each summary as its function does over no numbers, errors and text', () => {
    expect(summarise('SUM', [1, 'x', null, 2])).toBe(3);
    expect(summarise('SUM', [1, NA])).toEqual(NA);
    expect(summarise('COUNT', [1, NA, 'x'])).toBe(1);
    expect(summarise('COUNTA', [1, NA, '', null, false])).toBe(3);
    expect(summarise('COUNTUNIQUE', [1, '1', NA, NA, true, null])).toBe(4);
    expect(summarise('AVERAGE', ['x'])).toEqual(err('#DIV/0!'));
    expect(summarise('MEDIAN', [])).toEqual(err('#NUM!'));
    expect(summarise('MEDIAN', [3, 1, 2])).toBe(2);
    expect(summarise('MAX', [])).toBe(0);
    expect(summarise('MIN', [])).toBe(0);
    expect(summarise('MIN', [4, 2])).toBe(2);
    expect(summarise('PRODUCT', [])).toBe(0);
    expect(summarise('STDEV', [1])).toEqual(err('#DIV/0!'));
    expect(summarise('STDEVP', [])).toEqual(err('#DIV/0!'));
    expect(summarise('VARP', [1, 3])).toBe(1);
    for (const summary of PIVOT_SUMMARIES) expect(typeof summarise(summary, [1, 3])).toBe('number');
  });
});

describe('pivot items', () => {
  it('ranks numbers, text, booleans and errors, and names a plain group by its column', () => {
    const make = itemMaker({ col: 2 }, []);
    const items = [cell(err('#N/A')), cell(true), cell('b'), cell(null), cell(2)].map(make);
    expect(items.sort(compareItems).map((i) => i.label)).toEqual([2, '', 'b', true, err('#N/A')]);
    expect(make(cell(2)).fmt).toEqual({ col: 2 });
    expect(groupHeader({ col: 2 }, 'Units')).toBe('Units');
  });

  it('groups times by second, minute, hour and day of the year, and leaves text as it is', () => {
    const t = serialFromParts(2024, 3, 1, 19, 5, 9);
    const label = (rule: Parameters<typeof itemMaker>[0]['grouping'] & { k: 'date' }) =>
      itemMaker({ col: 0, grouping: rule }, [])(cell(t)).label;
    expect(label({ k: 'date', rule: 'second' })).toBe('9');
    expect(label({ k: 'date', rule: 'minute' })).toBe('5');
    expect(label({ k: 'date', rule: 'hour' })).toBe('19');
    expect(label({ k: 'date', rule: 'hourMinute' })).toBe('19:05');
    expect(label({ k: 'date', rule: 'hourMinuteAmPm' })).toBe('7:05 PM');
    expect(label({ k: 'date', rule: 'dayOfYear' })).toBe('61');
    for (const rule of PIVOT_DATE_RULES)
      expect(groupHeader({ col: 0, grouping: { k: 'date', rule } }, 'Date')).toMatch(/^Date - \w/);
    expect(itemMaker({ col: 0, grouping: { k: 'date', rule: 'year' } }, [])(cell('x')).label).toBe(
      'x',
    );
  });

  it('gathers numbers below an interval grouping’s start, and leaves an item in no custom group itself', () => {
    const make = itemMaker(
      { col: 0, grouping: { k: 'interval', size: 2, start: 10 } },
      [3, 10, 15],
    );
    expect([3, 10, 15].map((v) => make(cell(v)).label)).toEqual(['< 10', '10 - 11', '14 - 15']);
    expect(itemMaker({ col: 0, grouping: { k: 'custom', groups: [] } }, [])(cell('a')).label).toBe(
      'a',
    );
  });
});

describe('pivotOutput', () => {
  const data = source(
    ['Region', 'Units'],
    [['East', 2], ['West', 0], ['East', err('#N/A')], ['North']],
  );

  it('shows a percentage of a zero total as #DIV/0!, and an error summary as itself', () => {
    const spec: PivotSpec = {
      rows: [{ col: 0 }],
      columns: [],
      values: [{ col: 1, summary: 'SUM', showAs: 'row' }],
    };
    expect(values(pivotOutput(data, spec))).toEqual([
      ['Region', 'SUM of Units'],
      ['East', err('#N/A')],
      ['North', err('#DIV/0!')],
      ['West', err('#DIV/0!')],
      ['Grand Total', err('#N/A')],
    ]);
    const counted = pivotOutput(data, {
      ...spec,
      rows: [{ col: 0, totals: false }],
      values: [{ col: 1, summary: 'COUNTA', showAs: 'total' }],
    });
    expect(values(counted).slice(1)).toEqual([
      ['East', 2 / 3],
      ['North', 0],
      ['West', 1 / 3],
    ]);
    expect(counted.rows[1]![1]!.fmt).toBe('percent');
    // A percentage of an error total is that error.
    const ofError = pivotOutput(data, {
      ...spec,
      values: [{ col: 1, summary: 'SUM', showAs: 'column' }],
    });
    expect(values(ofError)[3]).toEqual(['West', err('#N/A')]);
  });

  it('sorts by a value that is not a number last, and by a column item that is not there by item', () => {
    const spec: PivotSpec = {
      rows: [{ col: 0, sortBy: { value: 0 } }],
      columns: [],
      values: [{ col: 1, summary: 'AVERAGE' }],
    };
    expect(values(pivotOutput(data, spec)).map((r) => r[0])).toEqual([
      'Region',
      'West',
      'East',
      'North',
      'Grand Total',
    ]);
    const missing = pivotOutput(data, {
      ...spec,
      rows: [{ col: 0, sortBy: { value: 0, item: ['Nowhere'] }, desc: true }],
    });
    expect(values(missing).map((r) => r[0])).toEqual([
      'Region',
      'West',
      'North',
      'East',
      'Grand Total',
    ]);
  });

  it('lays values out as rows with no columns, names a value its own name, and reads missing cells as blank', () => {
    const out = pivotOutput(source(['Region'], [['East', 1], ['West']]), {
      rows: [{ col: 0, repeat: true }],
      columns: [],
      values: [
        { col: 1, summary: 'SUM', name: 'Total' },
        { col: 1, summary: 'COUNT' },
      ],
      valuesAsRows: true,
    });
    expect(values(out)).toEqual([
      ['Region', 'Values', null],
      ['East', 'Total', 1],
      ['East', 'COUNT of ', 1],
      ['West', 'Total', 0],
      ['West', 'COUNT of ', 0],
      ['Grand Total', 'Total', 1],
      [null, 'COUNT of ', 1],
    ]);
    expect(out.rows[1]![2]!.fmt).toEqual({ col: 1 });
  });

  it('lays out two values across with no row groups, and filters in a locale', () => {
    const out = pivotOutput(
      data,
      {
        rows: [],
        columns: [{ col: 0, totals: false }],
        values: [
          { col: 1, summary: 'COUNT' },
          { col: 1, summary: 'MAX' },
        ],
        filters: [{ col: 1, cond: { op: 'lt', a: '1' } }],
      },
      'en-GB',
    );
    expect(values(out)).toEqual([
      [null, 'Region', 'Values'],
      [null, 'West', null],
      [null, 'COUNT of Units', 'MAX of Units'],
      [null, 1, 0],
    ]);
  });

  it('formats number items as their column, totals an error item, and sorts columns by a row item', () => {
    const nums = source(
      ['Year', 'Kind', 'Units'],
      [
        [2024, err('#N/A'), 1],
        [2025, err('#N/A'), 2],
        [2024, 'b', 3],
        [2026, 'b', 4],
        [2025, 'c', 5],
      ],
    );
    const out = pivotOutput(nums, {
      rows: [{ col: 1 }, { col: 0 }],
      columns: [{ col: 0, sortBy: { value: 0, item: ['b'] }, desc: true }],
      values: [{ col: 2, summary: 'SUM' }],
      valuesAsRows: true,
    });
    const v = values(out);
    // Values as rows: a total's second value line holds no label.
    const twoValues = pivotOutput(nums, {
      rows: [{ col: 1 }, { col: 0 }],
      columns: [],
      values: [
        { col: 2, summary: 'SUM' },
        { col: 2, summary: 'MAX' },
      ],
      valuesAsRows: true,
    });
    const bTotal = values(twoValues).findIndex((r) => r[0] === 'b Total');
    expect(values(twoValues)[bTotal + 1]!.slice(0, 3)).toEqual([null, null, 'MAX of Units']);
    expect(v[0]).toEqual([null, null, null, 'Year', null, null, null]);
    // Columns by Kind b's units, most first: 2026 (4), 2024 (3), then 2025 (none).
    expect(v[1]!.slice(3)).toEqual([2026, 2024, 2025, 'Grand Total']);
    expect(out.rows[1]![3]!.fmt).toEqual({ col: 0 });
    expect(v.map((r) => r[0])).toContain('#N/A Total');
    expect(out.rows.find((r) => r[1]!.v === 2024)![1]!.fmt).toEqual({ col: 0 });
    const twoLabels = pivotOutput(nums, {
      rows: [{ col: 0, sortBy: { value: 0, item: ['x', 'y'] } }],
      columns: [{ col: 1 }],
      values: [{ col: 2, summary: 'SUM' }],
    });
    expect(
      values(twoLabels)
        .map((r) => r[0])
        .slice(2, 5),
    ).toEqual([2024, 2025, 2026]);
  });
});
