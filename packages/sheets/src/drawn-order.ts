// The drawn order (docs/specs/029-sheets/data-tools.md "The drawn order", D491-D495): a view's sort draws the sheet's
// rows in an order of its own for the person who opened it, through one mapping between stored rows and drawn rows.
// Every position the grid holds stays a stored one; only where a row is drawn changes, so cells never move and every
// command acts on the stored rows drawn. A group by view's groups lie side by side in it; their header rows are no
// rows of it but gaps the geometry leaves before each group (DECISIONS.md "Group headers are gaps").
import { layoutIndex, posRangeOf } from './layout';
import { MERGE_SORT_REFUSAL, sortSplitsMerge } from './merge-guards';
import { sortKeyCompare, sortedOrder, type SortKey } from './sort';
import { scalarOf, type Scalar } from './formula/values';
import { groupKey, liveGroup } from './group-by-view';
import type { Workbook } from './engine/workbook';
import type { SheetFilterView } from './filter-views';
import type { SheetLayout } from './sheet';

/**
 * One group of a group by view (D496, D497): its rows drawn from `at` for `size` rows; `kept` those the view's
 * conditions keep (stored, in drawn order; `count` of them), the first of those `first` (whose cell names the group),
 * -1 with none; `key` its identity.
 */
export type DrawnGroup = {
  readonly at: number;
  readonly size: number;
  readonly kept: readonly number[];
  readonly count: number;
  readonly first: number;
  readonly key: string;
  readonly blank: boolean;
};

/**
 * Rows drawn in an order of their own: `storedAt[d]` is the stored row drawn d-th, `drawnOf[r]` where row r is drawn;
 * a group by view's groups in drawn order, `starts` their first drawn rows.
 */
export type DrawnOrder = {
  readonly storedAt: Int32Array;
  readonly drawnOf: Int32Array;
  readonly groups?: readonly DrawnGroup[];
  readonly starts?: ReadonlySet<number>;
};

/** A run of stored rows, first to last. */
export type RowRun = { r1: number; r2: number };

// Cut a sequence of row numbers into runs where each next one follows the last by one.
function runsOf(rows: Iterable<number>): RowRun[] {
  const out: RowRun[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && r === last.r2 + 1) last.r2 = r;
    else out.push({ r1: r, r2: r });
  }
  return out;
}

export const DrawnOrder = {
  /** `n` rows, those from `start` drawn as `sorted` lists them (stored positions), every other row in its place. */
  ofSort: (n: number, start: number, sorted: readonly number[]): DrawnOrder => {
    const storedAt = new Int32Array(n);
    for (let d = 0; d < n; d++) storedAt[d] = d;
    sorted.forEach((r, i) => (storedAt[start + i] = r));
    const drawnOf = new Int32Array(n);
    storedAt.forEach((r, d) => (drawnOf[r] = d));
    return { storedAt, drawnOf };
  },
  /** The stored rows drawn from d1 to d2 (either way round), as runs side by side in the sheet as well (D493). */
  runs: (o: DrawnOrder, d1: number, d2: number): RowRun[] => {
    const lo = Math.min(d1, d2);
    const hi = Math.max(d1, d2);
    return runsOf(o.storedAt.subarray(lo, hi + 1));
  },
  /** Stored rows r1..r2 cut into pieces each drawn side by side (no group header between), in the sheet's order. */
  pieces: (o: DrawnOrder, r1: number, r2: number): RowRun[] => {
    const out: RowRun[] = [];
    for (let r = r1; r <= r2; r++) {
      const last = out[out.length - 1];
      const d = o.drawnOf[r]!;
      if (last && d === o.drawnOf[last.r2]! + 1 && !o.starts?.has(d)) last.r2 = r;
      else out.push({ r1: r, r2: r });
    }
    return out;
  },
  /** The stored row drawn `by` rows from row r (1 below, -1 above); r itself past either end. */
  step: (o: DrawnOrder, r: number, by: number): number => {
    const d = o.drawnOf[r]! + by;
    return d < 0 || d >= o.storedAt.length ? r : o.storedAt[d]!;
  },
} as const;

/** The view with `colId` as its one sort key, the latest sort replacing the one before (D491). */
export function viewSortFor(
  view: SheetFilterView,
  colId: string,
  ascending: boolean,
): SheetFilterView {
  return { ...view, sort: [{ c: colId, ...(ascending ? {} : { desc: true as const }) }] };
}

// The rows a view's sort orders: under its header and below the frozen rows.
function sortedRows(
  layout: SheetLayout,
  view: SheetFilterView,
): { start: number; end: number } | null {
  const box = posRangeOf(layout, view);
  return box ? { start: Math.max(box.r1 + 1, layout.frozenRows ?? 0), end: box.r2 } : null;
}

/** Why a view may not sort its rows: a merge across them, in Sort Range's words (D491); null when it may. */
export function viewSortRefusal(layout: SheetLayout, view: SheetFilterView): string | null {
  const rows = sortedRows(layout, view);
  return rows && sortSplitsMerge(layout, rows.start, rows.end) ? MERGE_SORT_REFUSAL : null;
}

// The rows grouped under the column's values (D496): groups A to Z, blanks last (Z to A with the grouped column's
// sort, Z to A), rows inside by the view's other sort keys, else the sheet's order.
function groupedOrder(
  n: number,
  start: number,
  values: (i: number, c: number) => Scalar,
  col: number,
  inner: readonly SortKey[],
  desc: boolean,
  kept: (r: number) => boolean,
): DrawnOrder {
  const count = n - start;
  const order = sortedOrder(count, values, [{ col, ascending: !desc }, ...inner]);
  const groups: DrawnGroup[] = [];
  let from = 0;
  for (let i = 1; i <= order.length; i++) {
    const same =
      i < order.length && sortKeyCompare(values(order[i - 1]!, col), values(order[i]!, col)) === 0;
    if (same) continue;
    const rows = order.slice(from, i).map((x) => start + x);
    const shown = rows.filter(kept);
    const v = values(order[from]!, col);
    groups.push({
      at: start + from,
      size: i - from,
      kept: shown,
      count: shown.length,
      first: shown[0] ?? -1,
      key: groupKey(v),
      blank: v === null || v === '',
    });
    from = i;
  }
  return {
    ...DrawnOrder.ofSort(
      n,
      start,
      order.map((x) => start + x),
    ),
    groups,
    starts: new Set(groups.map((g) => g.at)),
  };
}

/**
 * The order an open view draws its sheet's rows in: the rows under its header and below the frozen rows by its sort,
 * as Sort Range orders them, every other row in place. Null when it draws the sheet's own order: no view or no sort,
 * a key's column gone, fewer than two rows, or a merge across those rows (D491).
 */
export function viewDrawnOrder(
  wb: Workbook,
  sheetId: string,
  view: SheetFilterView | null | undefined,
  // The rows the view's conditions hide, left out of each group's count.
  filtered: ReadonlySet<string> = new Set(),
): DrawnOrder | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet || !view) return null;
  const group = liveGroup(sheet.layout, view);
  if (group) return groupedViewOrder(wb, sheetId, view, group.col, filtered);
  if (!view.sort?.length) return null;
  const rows = sortedRows(sheet.layout, view);
  if (!rows) return null;
  const colPos = layoutIndex(sheet.layout).colPos;
  const keys = view.sort.map((k) => ({ col: colPos.get(k.c), ascending: !k.desc }));
  if (keys.some((k) => k.col === undefined)) return null;
  const { start, end } = rows;
  const count = end - start + 1;
  if (count < 2 || sortSplitsMerge(sheet.layout, start, end)) return null;
  const order = sortedOrder(
    count,
    (i, c) => scalarOf(wb.value(sheetId, start + i, c)),
    keys as { col: number; ascending: boolean }[],
  );
  return DrawnOrder.ofSort(
    sheet.layout.rows.length,
    start,
    order.map((i) => start + i),
  );
}

// A group by view's order over its rows (D496): null when it has none or a merge runs across them (D491).
function groupedViewOrder(
  wb: Workbook,
  sheetId: string,
  view: SheetFilterView,
  col: number,
  filtered: ReadonlySet<string>,
): DrawnOrder | null {
  const layout = wb.sheet(sheetId)!.layout;
  const rows = sortedRows(layout, view);
  if (!rows || rows.end < rows.start || sortSplitsMerge(layout, rows.start, rows.end)) return null;
  const ix = layoutIndex(layout);
  const sort = view.sort ?? [];
  const desc = sort[0]?.c === view.group!.c && !!sort[0].desc;
  const inner = sort.flatMap((k) => {
    const c = ix.colPos.get(k.c);
    return c === undefined || k.c === view.group!.c ? [] : [{ col: c, ascending: !k.desc }];
  });
  const { start, end } = rows;
  const order = groupedOrder(
    end + 1,
    start,
    (i, c) => scalarOf(wb.value(sheetId, start + i, c)),
    col,
    inner,
    desc,
    (r) => !filtered.has(layout.rows[r]!) && !ix.hiddenRows.has(layout.rows[r]!),
  );
  // Every row past the group's rows keeps its place.
  const n = layout.rows.length;
  if (n === end + 1) return order;
  const storedAt = new Int32Array(n);
  const drawnOf = new Int32Array(n);
  for (let d = 0; d < n; d++) storedAt[d] = d < order.storedAt.length ? order.storedAt[d]! : d;
  storedAt.forEach((r, d) => (drawnOf[r] = d));
  return { ...order, storedAt, drawnOf };
}

/**
 * The rows drawn at no height: `hidden` and every row of a group whose key is `collapsed` (D497); `hidden` itself
 * when no group is collapsed.
 */
export function withCollapsedRows(
  hidden: ReadonlySet<string>,
  order: DrawnOrder | null,
  collapsed: ReadonlySet<string>,
  rowIds: readonly string[],
): ReadonlySet<string> {
  const shut = (order?.groups ?? []).filter((g) => collapsed.has(g.key));
  if (!shut.length) return hidden;
  const out = new Set(hidden);
  for (const g of shut)
    for (let d = g.at; d < g.at + g.size; d++) out.add(rowIds[order!.storedAt[d]!]!);
  return out;
}
