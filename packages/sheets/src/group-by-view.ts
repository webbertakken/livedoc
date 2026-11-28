// Group by views (docs/specs/029-sheets/data-tools.md "Group by view", D496-D500): a filter view of a table that
// groups its rows under a column's values. It is kept as a filter view is, with its table and column by ids (`group`);
// its range is its table's header and data rows, read from the table whenever it is drawn, so it follows the table.
import { idRangeOf, layoutIndex } from './layout';
import { isError, type Scalar } from './formula/values';
import { makeAxisIds, type Rand } from './ids';
import { nextFilterViewTitle, type GroupAggregate, type SheetFilterView } from './filter-views';
import { tableFilterBox } from './tables/table-filter';
import type { GridRange } from './address';
import type { SheetLayout } from './sheet';
import type { LayoutChange } from './store-layout';
import type { SheetTable } from './tables/table';

/** Data › Create Group by View's note while the active cell is in no table (D498). */
export const GROUP_VIEW_NEEDS_TABLE = 'Select a cell in a table';

/** A group by view's group as it can be drawn: its table, the table's header and data rows, the column's place. */
export type LiveGroup = { table: SheetTable; box: GridRange; col: number };

/** The group a view draws: null for a filter view, and for one whose table or column is gone (D499). */
export function liveGroup(layout: SheetLayout, view: SheetFilterView): LiveGroup | null {
  if (!view.group) return null;
  const table = (layout.tables ?? []).find((t) => t.id === view.group!.t);
  const box = table && tableFilterBox(layout, table);
  const col = layoutIndex(layout).colPos.get(view.group.c);
  if (!table || !box || col === undefined || col < box.c1 || col > box.c2) return null;
  return { table, box, col };
}

/**
 * The view as it is drawn: a group by view over its table's header and data rows as they are now; one whose group
 * cannot be drawn a filter view over its own range, ungrouped (D499). A filter view as it is.
 */
export function filterViewAsDrawn(layout: SheetLayout, view: SheetFilterView): SheetFilterView {
  if (!view.group) return view;
  const live = liveGroup(layout, view);
  if (!live) {
    const { group: _group, ...rest } = view;
    return rest;
  }
  const { r1, c1, r2, c2 } = live.box;
  return { ...view, ...idRangeOf(layout, r1, c1, r2, c2)! };
}

/**
 * A group by view of `table` by `colId` (D498): over the table's header and data rows, no condition, no sort, named
 * `<prefix> N`, the smallest free among `taken`. Null when the table's cells are gone or the column is not its.
 */
export function createGroupByView(
  layout: SheetLayout,
  table: SheetTable,
  colId: string,
  opts: { rand: Rand; prefix: string; taken: readonly string[] },
): SheetFilterView | null {
  const id = makeAxisIds(1, opts.rand, new Set((layout.filterViews ?? []).map((x) => x.id)))[0]!;
  const view: SheetFilterView = {
    id,
    title: nextFilterViewTitle(opts.taken, opts.prefix),
    r1: table.r1,
    c1: table.c1,
    r2: table.r2,
    c2: table.c2,
    conds: {},
    group: { t: table.id, c: colId },
  };
  const live = liveGroup(layout, view);
  if (!live) return null;
  const aggs = defaultAggregates(layout, table, live.box);
  return filterViewAsDrawn(layout, { ...view, group: { ...view.group!, aggs } });
}

// A new view's aggregations (D501): Count on its first column, Sum on each Number, Percent and Currency typed one.
function defaultAggregates(
  layout: SheetLayout,
  table: SheetTable,
  box: GridRange,
): Record<string, GroupAggregate> {
  const out: Record<string, GroupAggregate> = { [layout.cols[box.c1]!]: 'count' };
  for (let c = box.c1 + 1; c <= box.c2; c++) {
    const col = layout.cols[c]!;
    const type = table.types?.[col];
    if (type === 'number' || type === 'percent' || type === 'currency') out[col] = 'sum';
  }
  return out;
}

/** Each aggregation's name, as Google's list words it. */
export const GROUP_AGGREGATE_LABELS: Readonly<Record<GroupAggregate, string>> = {
  avg: 'Average',
  count: 'Count',
  empty: 'Empty',
  filled: 'Filled',
  max: 'Maximum',
  min: 'Minimum',
  pctEmpty: 'Percent Empty',
  pctFilled: 'Percent Filled',
  pctUnique: 'Percent Unique',
  sum: 'Sum',
  unique: 'Unique',
};

/**
 * A group's aggregation over its kept rows' values in one column (D501): Count the rows, Filled and Empty the cells
 * with and without a value, Unique the values told apart as groups are, each Percent of the rows; Sum, Average,
 * Maximum and Minimum over the numbers alone. Null with nothing to read (no numbers, no rows).
 */
export function groupAggregate(kind: GroupAggregate, values: readonly Scalar[]): number | null {
  const rows = values.length;
  const filled = values.filter((v) => v !== null && v !== '');
  const nums = values.filter((v): v is number => typeof v === 'number');
  const unique = () => new Set(filled.map(groupKey)).size;
  const share = (n: number) => (rows ? n / rows : null);
  switch (kind) {
    case 'count':
      return rows;
    case 'filled':
      return filled.length;
    case 'empty':
      return rows - filled.length;
    case 'unique':
      return unique();
    case 'pctFilled':
      return share(filled.length);
    case 'pctEmpty':
      return share(rows - filled.length);
    case 'pctUnique':
      return share(unique());
    case 'sum':
      return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
    case 'avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case 'max':
      return nums.length ? nums.reduce((a, b) => Math.max(a, b)) : null;
    case 'min':
      return nums.length ? nums.reduce((a, b) => Math.min(a, b)) : null;
  }
}

/** The changes removing a table's group by views, beside the table's own removal (Convert to Range, Delete Table). */
export function groupViewsGone(layout: SheetLayout, tableId: string): LayoutChange[] {
  return (layout.filterViews ?? [])
    .filter((v) => v.group?.t === tableId)
    .map((v) => ({ k: 'fview', id: v.id, view: null }));
}

/**
 * Which group a value falls in: values Sort Range counts as one share a key (numbers by value, text case and accents
 * aside, blanks one group), so a group's opener stays collapsed while its rows are sorted or edited (D496, D497).
 */
export function groupKey(v: Scalar): string {
  if (v === null || v === '') return '';
  if (typeof v === 'number') return `n:${v}`;
  if (typeof v === 'boolean') return `b:${v}`;
  if (isError(v)) return `e:${v.e}`;
  return `t:${v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}`;
}
