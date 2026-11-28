import { describe, expect, it } from 'vitest';
import { makeSheets } from './testing/book';
import { Workbook } from './engine/workbook';
import { DrawnOrder, viewDrawnOrder, withCollapsedRows } from './drawn-order';
import {
  createGroupByView,
  filterViewAsDrawn,
  GROUP_VIEW_NEEDS_TABLE,
  groupKey,
  groupViewsGone,
  liveGroup,
} from './group-by-view';
import { filterViewsAfterDelete, isSheetFilterView, type SheetFilterView } from './filter-views';
import type { Sheet } from './sheet';
import type { SheetTable } from './tables/table';

// docs/specs/029-sheets/data-tools.md "Group by view" (D496-D500): a filter view of a table grouping its rows under a
// column's values; its header rows are gaps the geometry leaves, never rows of the drawn order.
const list = (a: Int32Array) => [...a];
const wbOf = (s: Sheet) => new Workbook({ sheets: [s], locale: 'en-GB' });

// Table1 over A1:B7, its last row a total row; row 8 (index 7) below it.
const TABLE: SheetTable = {
  id: 'tab1',
  name: 'Table1',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r6',
  c2: 's0c1',
  total: true,
};

function sheet(table: SheetTable = TABLE): Sheet {
  return makeSheets(
    {
      'Sheet 1': {
        A1: 'Fruit',
        B1: 'Qty',
        A2: 'pear',
        B2: '3',
        A3: 'Apple',
        B3: '5',
        A4: '',
        B4: '1',
        A5: 'apple',
        B5: '2',
        A6: 'Pear',
        B6: '9',
        A7: 'Total',
        A8: 'below',
      },
    },
    { rows: 9, cols: 3, tables: { 'Sheet 1': [table] } },
  )[0]!;
}

const opts = { rand: () => 0.5, prefix: 'Group', taken: ['Group 1'] };

function groupView(s: Sheet, sort?: SheetFilterView['sort']): SheetFilterView {
  const v = createGroupByView(s.layout, TABLE, 's0c0', opts)!;
  return sort ? { ...v, sort } : v;
}

describe('createGroupByView', () => {
  it('makes a view over the table header and data rows, grouped by the column, named the next free Group N', () => {
    const v = createGroupByView(sheet().layout, TABLE, 's0c0', opts)!;
    expect(v).toMatchObject({
      title: 'Group 2',
      r1: 's0r0',
      c1: 's0c0',
      r2: 's0r5',
      c2: 's0c1',
      conds: {},
      group: { t: 'tab1', c: 's0c0' },
    });
    expect(isSheetFilterView(v, v.id)).toBe(true);
  });

  it('refuses a column outside the table', () => {
    expect(createGroupByView(sheet().layout, TABLE, 's0c2', opts)).toBeNull();
  });

  it('names the note shown while the active cell is in no table', () => {
    expect(GROUP_VIEW_NEEDS_TABLE).toBe('Select a cell in a table');
  });
});

describe('liveGroup and filterViewAsDrawn', () => {
  it('follows the table as it grows', () => {
    const s = sheet();
    const v = groupView(s);
    const grown = { ...s.layout, tables: [{ ...TABLE, r2: 's0r7' }] };
    expect(filterViewAsDrawn(grown, v)).toMatchObject({ r2: 's0r6', group: { t: 'tab1' } });
  });

  it('draws a view whose table is gone as a filter view over its own range, ungrouped (D499)', () => {
    const s = sheet();
    const v = groupView(s);
    const gone = { ...s.layout, tables: [] };
    expect(liveGroup(gone, v)).toBeNull();
    const drawn = filterViewAsDrawn(gone, v);
    expect(drawn.group).toBeUndefined();
    expect(drawn.r2).toBe('s0r5');
  });

  it('leaves a filter view as it is', () => {
    const s = sheet();
    const { group: _g, ...plain } = groupView(s);
    expect(filterViewAsDrawn(s.layout, plain)).toBe(plain);
  });
});

describe('groupViewsGone', () => {
  it('removes the table views grouping by it, and no other view', () => {
    const s = sheet();
    const v = groupView(s);
    const other = { ...v, id: 'other', group: { t: 'x9', c: 's0c0' } };
    const layout = { ...s.layout, filterViews: [v, other] };
    expect(groupViewsGone(layout, 'tab1')).toEqual([{ k: 'fview', id: v.id, view: null }]);
  });
});

describe('filterViewsAfterDelete', () => {
  it('makes a group by view whose column went a filter view (D499)', () => {
    const v = groupView(sheet());
    const after = filterViewsAfterDelete([v], new Set(['s0c0']), (r) => r)!;
    expect(after[0]!.group).toBeUndefined();
  });
});

describe('isSheetFilterView', () => {
  it('refuses a malformed group', () => {
    const v = groupView(sheet());
    expect(isSheetFilterView({ ...v, group: { t: 'tab1' } }, v.id)).toBe(false);
    expect(isSheetFilterView({ ...v, group: { t: 'tab1', c: 's0c0', x: 1 } }, v.id)).toBe(false);
  });
});

describe('groupKey', () => {
  it('is one key for values Sort Range counts as one', () => {
    expect(groupKey('Apple')).toBe(groupKey('apple'));
    expect(groupKey('Café')).toBe(groupKey('cafe'));
    expect(groupKey('')).toBe(groupKey(null));
    expect(groupKey(2)).not.toBe(groupKey('2'));
  });
});

describe('viewDrawnOrder for a group by view', () => {
  it('groups the data rows A to Z, blanks last, rows inside in the sheet order, every other row in place', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, groupView(s))!;
    // Apple (rows 2, 4), pear (1, 5), blank (3); the total row 6 and row 7 below keep their places.
    expect(list(o.storedAt)).toEqual([0, 2, 4, 1, 5, 3, 6, 7, 8]);
    expect(o.groups).toEqual([
      { at: 1, size: 2, count: 2, first: 2, key: 't:apple', blank: false },
      { at: 3, size: 2, count: 2, first: 1, key: 't:pear', blank: false },
      { at: 5, size: 1, count: 1, first: 3, key: '', blank: true },
    ]);
  });

  it('orders the groups Z to A while the view sorts the grouped column Z to A', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, groupView(s, [{ c: 's0c0', desc: true }]))!;
    expect(list(o.storedAt).slice(0, 6)).toEqual([0, 1, 5, 2, 4, 3]);
  });

  it('orders the rows inside each group by the view sort on another column', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, groupView(s, [{ c: 's0c1', desc: true }]))!;
    // Apple: 5 (row 2) before 2 (row 4); pear: 9 (row 5) before 3 (row 1).
    expect(list(o.storedAt).slice(0, 6)).toEqual([0, 2, 4, 5, 1, 3]);
  });

  it('counts only the rows the view keeps, naming the group by the first kept', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, groupView(s), new Set(['s0r2', 's0r3']))!;
    expect(o.groups!.map((g) => [g.count, g.first])).toEqual([
      [1, 4],
      [2, 1],
      [0, -1],
    ]);
  });

  it('draws the sheet order once its table is gone', () => {
    const s = sheet();
    const v = groupView(s);
    const bare = { ...s, layout: { ...s.layout, tables: [] } };
    expect(viewDrawnOrder(wbOf(bare), s.id, filterViewAsDrawn(bare.layout, v))).toBeNull();
  });
});

describe('DrawnOrder.pieces under groups', () => {
  it('cuts pieces where a group starts, so no box covers a group header', () => {
    const o = { ...DrawnOrder.ofSort(4, 0, [0, 1, 2, 3]), starts: new Set([2]) };
    expect(DrawnOrder.pieces(o, 0, 3)).toEqual([
      { r1: 0, r2: 1 },
      { r1: 2, r2: 3 },
    ]);
  });

  it('keeps the rows drawn across a group header one selection, runs of stored rows', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, groupView(s))!;
    expect(DrawnOrder.runs(o, 2, 3)).toEqual([
      { r1: 4, r2: 4 },
      { r1: 1, r2: 1 },
    ]);
  });
});

describe('withCollapsedRows', () => {
  it('adds the rows of each collapsed group to the rows hidden, and nothing with none collapsed', () => {
    const s = sheet();
    const o = viewDrawnOrder(wbOf(s), s.id, groupView(s))!;
    const hidden = new Set(['s0r8']);
    expect(withCollapsedRows(hidden, o, new Set(), s.layout.rows)).toBe(hidden);
    expect([...withCollapsedRows(hidden, o, new Set(['t:pear']), s.layout.rows)]).toEqual([
      's0r8',
      's0r1',
      's0r5',
    ]);
  });
});
