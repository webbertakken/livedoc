// Grouping a pivot table from the grid (docs/specs/029-sheets/pivot-tables.md "Grouping in the grid", D621): what the
// context menu offers where, and the Pivot Group Rule dialog's fields, refusals word for word.
import { describe, expect, it } from 'vitest';
import {
  emptyLayout,
  sheetFromJson,
  Workbook,
  type CellInput,
  type GridRange,
  type SheetCellJson,
  type SheetPivot,
} from '@livedoc/sheets';
import {
  PIVOT_DATE_GROUP_IDS,
  PIVOT_GROUP_PICK_MAX,
  pivotGroupingMenu,
  pivotGroupRuleStart,
  readPivotGroupRule,
} from './pivot-grouping-menu';

let seq = 7;
const rand = () => ((seq = (seq * 16807) % 2147483647) - 1) / 2147483646;
const by = { id: 'me', name: 'Me', color: '#000000' };

// Region, Units, Day (a date) in A:C; the pivot table at E1 with `make`'s fields.
function setup(make: (cols: readonly string[]) => Partial<SheetPivot>) {
  const layout = emptyLayout(rand, 40, 12);
  const { rows, cols } = layout;
  const data: [string, CellInput, CellInput, CellInput][] = [
    ['1', { s: 'Region' }, { s: 'Units' }, { s: 'Day' }],
    ['2', { s: 'East' }, { n: 5 }, { n: 45672 }],
    ['3', { s: 'West' }, { n: 12 }, { n: 45736 }],
    ['4', { s: 'North' }, { n: 5 }, { n: 45672 }],
  ];
  const cells: SheetCellJson[] = data.flatMap(([row, ...vs]) =>
    vs.map((i, c) => ({
      r: rows[Number(row) - 1]!,
      c: cols[c]!,
      i,
      ...(c === 2 && row !== '1' ? { f: { nf: 'date' as const } } : {}),
    })),
  );
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[4]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[2]! },
    values: [{ col: cols[1]!, summary: 'SUM' }],
    ...make(cols),
  };
  const sheet = sheetFromJson({
    id: 'sheet1',
    tabId: 'tab1',
    title: 'Data',
    layout: { ...layout, objects: [pivot] },
    cells,
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  });
  const wb = new Workbook({ sheets: [sheet], locale: 'en-GB' });
  const menu = (r: number, c: number, ranges: GridRange[] = [{ r1: r, c1: c, r2: r, c2: c }]) =>
    pivotGroupingMenu(wb, sheet, { ranges, active: { r, c }, anchor: { r, c } });
  return { menu, wb, sheet };
}

describe('the grouping a pivot table’s item cell offers', () => {
  it('offers date groups on a date, a group rule on a number, neither on text', () => {
    const { menu } = setup((cols) => ({ rows: [{ col: cols[2]! }, { col: cols[1]! }] }));
    // E2 15/01/2025, F2 5; E5 17/03/2025 ...
    expect(menu(1, 4)).toMatchObject({ dateGroup: true, groupRule: false, ungroup: false });
    expect(menu(1, 5)).toMatchObject({
      dateGroup: false,
      groupRule: true,
      item: { numbers: { min: 5, max: 12 } },
    });
    expect(menu(0, 4)).toBeNull();
    expect(menu(1, 6)).toBeNull();
    const text = setup((cols) => ({ rows: [{ col: cols[0]! }] })).menu(1, 4);
    expect(text).toMatchObject({ dateGroup: false, groupRule: false, picked: null });
    expect(PIVOT_DATE_GROUP_IDS).toHaveLength(15);
  });

  it('picks two or more items of the active cell’s group from the selection, and nothing else', () => {
    const { menu } = setup((cols) => ({ rows: [{ col: cols[0]! }] }));
    // E2 East, E3 North, E4 West, E5 Grand Total.
    expect(menu(1, 4, [{ r1: 1, c1: 4, r2: 3, c2: 4 }])!.picked).toEqual([
      { label: 'East', shown: 'East' },
      { label: 'North', shown: 'North' },
      { label: 'West', shown: 'West' },
    ]);
    // A value, the Grand Total, or one item alone: none.
    expect(menu(1, 4, [{ r1: 1, c1: 4, r2: 1, c2: 5 }])!.picked).toBeNull();
    expect(menu(1, 4, [{ r1: 1, c1: 4, r2: 4, c2: 4 }])!.picked).toBeNull();
    expect(menu(1, 4)!.picked).toBeNull();
    expect(menu(1, 4, [{ r1: 0, c1: 0, r2: PIVOT_GROUP_PICK_MAX, c2: 1 }])!.picked).toBeNull();
    // The same item twice is one.
    expect(
      menu(1, 4, [
        { r1: 1, c1: 4, r2: 1, c2: 4 },
        { r1: 1, c1: 4, r2: 1, c2: 4 },
      ])!.picked,
    ).toBeNull();
  });

  it('offers no custom group on a group grouped by a rule, and Ungroup on what a grouping made', () => {
    const ruled = setup((cols) => ({
      rows: [{ col: cols[2]!, grouping: { k: 'date', rule: 'month' } }],
    })).menu(1, 4, [{ r1: 1, c1: 4, r2: 2, c2: 4 }]);
    expect(ruled).toMatchObject({
      picked: null,
      ungroup: true,
      dateGroup: false,
      groupRule: false,
    });
    const custom = setup((cols) => ({
      rows: [
        {
          col: cols[0]!,
          grouping: { k: 'custom', groups: [{ name: 'Coasts', items: ['East', 'West'] }] },
        },
      ],
    })).menu(1, 4, [{ r1: 1, c1: 4, r2: 2, c2: 4 }]);
    expect(custom).toMatchObject({
      ungroup: true,
      picked: [
        { label: 'Coasts', made: 'custom' },
        { label: 'North', shown: 'North' },
      ],
    });
  });

  it('answers none for a pivot table its sheet no longer holds', () => {
    const { wb, sheet } = setup((cols) => ({ rows: [{ col: cols[0]! }] }));
    const { objects: _all, ...bare } = sheet.layout;
    const gone = { ...sheet, layout: bare };
    const at = { r: 1, c: 4 };
    expect(
      pivotGroupingMenu(wb, gone, {
        ranges: [{ r1: 1, c1: 4, r2: 1, c2: 4 }],
        active: at,
        anchor: at,
      }),
    ).toBeNull();
  });
});

describe('the Pivot Group Rule dialog', () => {
  it('opens on the group’s lowest and highest numbers', () => {
    const item = { numbers: { min: 2, max: 9 } } as Parameters<typeof pivotGroupRuleStart>[0];
    expect(pivotGroupRuleStart(item)).toEqual({ min: '2', max: '9', size: '' });
    expect(pivotGroupRuleStart({ ...item, numbers: { min: 3, max: 3 } })).toEqual({
      min: '3',
      max: '',
      size: '',
    });
    expect(pivotGroupRuleStart({ ...item, numbers: null })).toEqual({ min: '', max: '', size: '' });
  });

  it('reads an interval grouping, either end open, and refuses what does not read', () => {
    expect(readPivotGroupRule({ min: '0', max: '20', size: '5' })).toEqual({
      ok: true,
      grouping: { k: 'interval', size: 5, start: 0, end: 20 },
    });
    expect(readPivotGroupRule({ min: ' ', max: '', size: '2.5' })).toEqual({
      ok: true,
      grouping: { k: 'interval', size: 2.5 },
    });
    expect(readPivotGroupRule({ min: 'x', max: '', size: '1' })).toEqual({
      ok: false,
      field: 'min',
      why: 'Enter a number',
    });
    expect(readPivotGroupRule({ min: '', max: 'y', size: '1' })).toMatchObject({ field: 'max' });
    expect(readPivotGroupRule({ min: '5', max: '5', size: '1' })).toEqual({
      ok: false,
      field: 'max',
      why: 'The minimum must be below the maximum',
    });
    for (const size of ['', '0', '-1', 'z'])
      expect(readPivotGroupRule({ min: '', max: '', size })).toEqual({
        ok: false,
        field: 'size',
        why: 'Enter a number above 0',
      });
  });
});
