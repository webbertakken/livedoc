// docs/specs/029-sheets/pivot-tables.md "Grouping in the grid" (D621): which output cells are items, what each is, and
// what grouping them from the grid does to the pivot table.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import type { SheetPivot } from '../objects/sheet-pivot';
import type { Sheet } from '../sheet';
import {
  pivotCustomGroup,
  pivotRenameCustomGroup,
  pivotSetGrouping,
  pivotUngroupItem,
} from './pivot-grouping-edit';
import { pivotItemPlace, type PivotArray } from './pivot-resolve';

const DATA = {
  A1: 'Region',
  B1: 'Units',
  C1: 'Day',
  A2: 'East',
  B2: '5',
  C2: '15/01/2025',
  A3: 'West',
  B3: '12',
  C3: '20/03/2025',
  A4: 'North',
  B4: '2',
  C4: '15/01/2025',
};

// Data on its own sheet, the pivot table at F1 with `make`'s fields; its output's cells by row.
function setup(make: (cols: readonly string[]) => Partial<SheetPivot>) {
  const b = book({ Data: DATA }, { rows: 12, cols: 12 });
  const data = b.sheets[0] as Sheet;
  const { rows, cols } = data.layout;
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[5]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[2]! },
    ...make(cols),
  };
  const place = (p: SheetPivot) => {
    const sheet = b.wb.sheet(data.id)!;
    b.wb.updateSheet({ ...sheet, layout: { ...sheet.layout, objects: [p] } });
  };
  place(pivot);
  const at = (r: number, c: number) => b.wb.pivotItemAt(data.id, r, c);
  return { ...b, data, cols, pivot, place, at };
}

describe('an item cell of a pivot table’s output', () => {
  it('names its group, its value and how it shows, and the group’s numbers', () => {
    const { at, cols } = setup((cols) => ({
      rows: [{ col: cols[0]! }, { col: cols[1]! }],
      columns: [{ col: cols[2]! }],
      values: [{ col: cols[1]!, summary: 'SUM' }],
    }));
    // F1 SUM of Units, F2 Region | Units | 15/01/2025 | 20/03/2025 | Grand Total; F3 East, G3 5 ...
    expect(at(2, 5)).toEqual({
      pivotId: 'pivot01',
      axis: 'rows',
      depth: 0,
      label: 'East',
      shown: 'East',
      date: false,
      numbers: null,
    });
    expect(at(2, 6)).toMatchObject({
      axis: 'rows',
      depth: 1,
      label: 5,
      numbers: { min: 2, max: 12 },
    });
    expect(at(1, 7)).toMatchObject({ axis: 'columns', depth: 0, date: true, shown: '15/01/2025' });
    // The headers, a total, a value: no item.
    expect([at(1, 5), at(0, 5), at(2, 7), at(1, 9)]).toEqual([null, null, null, null]);
    expect(at(20, 20)).toBeNull();
    expect(cols).toHaveLength(12);
  });

  it('says what a grouping made', () => {
    const { at } = setup((cols) => ({
      rows: [
        {
          col: cols[0]!,
          grouping: { k: 'custom', groups: [{ name: 'Coasts', items: ['East', 'West'] }] },
        },
      ],
      columns: [{ col: cols[2]!, grouping: { k: 'date', rule: 'month' } }],
      values: [{ col: cols[1]!, summary: 'SUM' }],
    }));
    // F3 Coasts, F4 North; G2 Jan, H2 Mar.
    expect(at(2, 5)).toMatchObject({ label: 'Coasts', made: 'custom' });
    expect(at(3, 5)).toMatchObject({ label: 'North', shown: 'North' });
    expect(at(3, 5)).not.toHaveProperty('made');
    expect(at(1, 6)).toMatchObject({ label: 'Jan', made: 'rule', date: false });
  });

  it('answers nothing on a sheet without pivot tables, off the grid, or while blocked', () => {
    const { wb, data, at, set } = setup((cols) => ({
      rows: [{ col: cols[0]! }],
      values: [{ col: cols[1]!, summary: 'SUM' }],
    }));
    expect(wb.pivotItemAt('nosheet', 0, 0)).toBeNull();
    // A source cell beside the output.
    expect(at(0, 0)).toBeNull();
    set('G3', 'x');
    expect(at(1, 5)).toBeNull();
    const plain = book({ Data: DATA });
    expect(plain.wb.pivotItemAt(plain.sheets[0]!.id, 0, 0)).toBeNull();
    expect(data.id).toBeTruthy();
  });
});

describe('an item place', () => {
  it('reads a custom date or time code as a date, any other as a number', () => {
    const arr = (nf: object): PivotArray => ({
      rows: [[1]],
      fmts: [[nf]],
      index: { values: [], keys: [], cells: [] },
      head: { rows: 0, cols: 1 },
      items: [{ r: 0, c: 0, axis: 'rows', depth: 0, item: { label: 45000 } }],
    });
    const date = (nf: object) => pivotItemPlace(arr(nf), 0, 0)!.date;
    expect(date({ nf: 'custom', nc: 'dd mmm yyyy' })).toBe(true);
    expect(date({ nf: 'custom', nc: '0.00' })).toBe(false);
    expect(date({ nf: 'custom' })).toBe(false);
    expect(date({ nf: 'time' })).toBe(true);
    expect(date({ nf: 'datetime' })).toBe(true);
  });
});

describe('grouping from the grid', () => {
  const base = (): SheetPivot => ({
    id: 'p',
    kind: 'pivot',
    at: { r: 'r', c: 'c' },
    rows: [{ col: 'a' }],
    columns: [{ col: 'b', grouping: { k: 'date', rule: 'year' } }],
  });

  it('sets a group’s grouping in the place of any it had, or takes it off', () => {
    const month = pivotSetGrouping(base(), 'columns', 0, { k: 'date', rule: 'month' });
    expect(month.columns![0]).toEqual({ col: 'b', grouping: { k: 'date', rule: 'month' } });
    expect(pivotSetGrouping(base(), 'columns', 0, null).columns![0]).toEqual({ col: 'b' });
    expect(pivotSetGrouping(base(), 'rows', 0, { k: 'interval', size: 5 }).rows![0]).toEqual({
      col: 'a',
      grouping: { k: 'interval', size: 5 },
    });
    expect(pivotSetGrouping(base(), 'rows', 3, null)).toEqual(base());
    // Another group of the axis stays as it is; an axis with no groups changes nothing.
    const two = { ...base(), rows: [{ col: 'a' }, { col: 'z' }] };
    expect(pivotSetGrouping(two, 'rows', 1, { k: 'date', rule: 'year' }).rows![0]).toEqual({
      col: 'a',
    });
    const none = { ...base(), columns: undefined };
    expect(pivotSetGrouping(none, 'columns', 0, null)).toBe(none);
  });

  it('gathers picked items into the first free Group N, a picked group bringing its items', () => {
    const one = pivotCustomGroup(base(), 'rows', 0, [
      { label: 'East', shown: 'East' },
      { label: 5, shown: '5.00' },
    ]);
    expect(one.rows![0]!.grouping).toEqual({
      k: 'custom',
      groups: [{ name: 'Group 1', items: ['East', '5.00'] }],
    });
    const two = pivotCustomGroup(one, 'rows', 0, [
      { label: 'North', shown: 'North' },
      { label: 'South', shown: 'South' },
    ]);
    expect(two.rows![0]!.grouping).toEqual({
      k: 'custom',
      groups: [
        { name: 'Group 1', items: ['East', '5.00'] },
        { name: 'Group 2', items: ['North', 'South'] },
      ],
    });
    const merged = pivotCustomGroup(two, 'rows', 0, [
      { label: 'Group 2', made: 'custom' },
      { label: 'West', shown: 'West' },
    ]);
    expect(merged.rows![0]!.grouping).toEqual({
      k: 'custom',
      groups: [
        { name: 'Group 1', items: ['East', '5.00'] },
        { name: 'Group 3', items: ['North', 'South', 'West'] },
      ],
    });
    // A custom group it lacks brings nothing, nor an item without how it shows.
    expect(
      pivotCustomGroup(base(), 'rows', 0, [
        { label: 'Gone', made: 'custom' },
        { label: 'x' },
        { label: 'y', shown: 'y' },
      ]).rows![0]!.grouping,
    ).toEqual({ k: 'custom', groups: [{ name: 'Group 1', items: ['y'] }] });
    // A group grouped by a rule, or a group the pivot table lacks, is left as it is.
    expect(pivotCustomGroup(base(), 'columns', 0, [{ label: 'x', shown: 'x' }])).toEqual(base());
    expect(pivotCustomGroup(base(), 'rows', 4, [{ label: 'x', shown: 'x' }])).toEqual(base());
  });

  it('ungroups a custom group alone, the last one taking the grouping, a rule’s item the whole rule', () => {
    const two = pivotCustomGroup(
      pivotCustomGroup(base(), 'rows', 0, [
        { label: 'A', shown: 'A' },
        { label: 'B', shown: 'B' },
      ]),
      'rows',
      0,
      [
        { label: 'C', shown: 'C' },
        { label: 'D', shown: 'D' },
      ],
    );
    const one = pivotUngroupItem(two, 'rows', 0, { label: 'Group 1', made: 'custom' });
    expect(one.rows![0]!.grouping).toEqual({
      k: 'custom',
      groups: [{ name: 'Group 2', items: ['C', 'D'] }],
    });
    expect(pivotUngroupItem(one, 'rows', 0, { label: 'Group 2', made: 'custom' }).rows![0]).toEqual(
      {
        col: 'a',
      },
    );
    expect(
      pivotUngroupItem(base(), 'columns', 0, { label: '2025', made: 'rule' }).columns![0],
    ).toEqual({ col: 'b' });
    // An item no grouping made changes nothing.
    expect(pivotUngroupItem(base(), 'rows', 0, { label: 'East', shown: 'East' })).toEqual(base());
  });
});

describe('pivotRenameCustomGroup', () => {
  const C = (n: number) => `col${n}`;
  const pivot: SheetPivot = {
    id: 'p',
    kind: 'pivot',
    at: { r: 'r', c: 'c' },
    source: { r1: 'r', c1: 'c', r2: 'r', c2: 'c' },
    rows: [
      {
        col: C(0),
        grouping: {
          k: 'custom',
          groups: [
            { name: 'Group 1', items: ['East', 'West'] },
            { name: 'South', items: ['North'] },
          ],
        },
      },
    ],
  };

  it('renames the custom group, the text trimmed', () => {
    const next = pivotRenameCustomGroup(pivot, 'rows', 0, 'Group 1', '  Coast  ');
    expect(next).toEqual({
      ...pivot,
      rows: [
        {
          col: C(0),
          grouping: {
            k: 'custom',
            groups: [
              { name: 'Coast', items: ['East', 'West'] },
              { name: 'South', items: ['North'] },
            ],
          },
        },
      ],
    });
  });

  it('renames a group in another case of its own name', () => {
    const next = pivotRenameCustomGroup(pivot, 'rows', 0, 'Group 1', 'GROUP 1');
    expect(typeof next === 'string' ? next : next.rows![0]!.grouping).toMatchObject({
      groups: [{ name: 'GROUP 1' }, { name: 'South' }],
    });
  });

  it('refuses an empty name, one too long and one another group has', () => {
    expect(pivotRenameCustomGroup(pivot, 'rows', 0, 'Group 1', '   ')).toBe('empty');
    expect(pivotRenameCustomGroup(pivot, 'rows', 0, 'Group 1', 'x'.repeat(201))).toBe('too_long');
    expect(pivotRenameCustomGroup(pivot, 'rows', 0, 'Group 1', 'south')).toBe('taken');
  });

  it('writes nothing for the same name', () => {
    expect(pivotRenameCustomGroup(pivot, 'rows', 0, 'Group 1', 'Group 1 ')).toBe('same');
  });

  it('is no rename where the group is not custom-grouped or has no such group', () => {
    expect(pivotRenameCustomGroup(pivot, 'columns', 0, 'Group 1', 'X')).toBe('none');
    expect(pivotRenameCustomGroup(pivot, 'rows', 0, 'Nope', 'X')).toBe('none');
    const plain = { ...pivot, rows: [{ col: C(0) }] };
    expect(pivotRenameCustomGroup(plain, 'rows', 0, 'Group 1', 'X')).toBe('none');
  });
});
