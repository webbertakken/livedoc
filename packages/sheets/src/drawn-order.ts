// The drawn order (docs/specs/029-sheets/data-tools.md "The drawn order", D491-D495): a view's sort draws the sheet's
// rows in an order of its own for the person who opened it, through one mapping between stored rows and drawn rows.
// Every position the grid holds stays a stored one; only where a row is drawn changes, so cells never move and every
// command acts on the stored rows drawn.
import { layoutIndex, posRangeOf } from './layout';
import { MERGE_SORT_REFUSAL, sortSplitsMerge } from './merge-guards';
import { sortedOrder } from './sort';
import { scalarOf } from './formula/values';
import type { Workbook } from './engine/workbook';
import type { SheetFilterView } from './filter-views';
import type { SheetLayout } from './sheet';

/** Rows drawn in an order of their own: `storedAt[d]` is the stored row drawn d-th, `drawnOf[r]` where row r is drawn. */
export type DrawnOrder = { readonly storedAt: Int32Array; readonly drawnOf: Int32Array };

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
  /** Stored rows r1..r2 cut into pieces each drawn side by side, in the sheet's order: one box a piece. */
  pieces: (o: DrawnOrder, r1: number, r2: number): RowRun[] => {
    const out: RowRun[] = [];
    for (let r = r1; r <= r2; r++) {
      const last = out[out.length - 1];
      if (last && o.drawnOf[r] === o.drawnOf[last.r2]! + 1) last.r2 = r;
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

/**
 * The order an open view draws its sheet's rows in: the rows under its header and below the frozen rows by its sort,
 * as Sort Range orders them, every other row in place. Null when it draws the sheet's own order: no view or no sort,
 * a key's column gone, fewer than two rows, or a merge across those rows (D491).
 */
export function viewDrawnOrder(
  wb: Workbook,
  sheetId: string,
  view: SheetFilterView | null | undefined,
): DrawnOrder | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet || !view?.sort?.length) return null;
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
