// A slicer (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D475, D476, D483-D487): a
// control floating over the grid, one of its sheet's objects, that filters a range by one of its columns. Its
// `filter` is the default everyone opens with; one's own change is the editor's alone, never stored (D485). A row is
// drawn only when every filter and every slicer over it keep it; formulas never read a slicer.
import { isAxisId } from '../ids';
import type { DrawnFilter } from '../filter';
import { isFilterCondition } from '../filter';
import { idRangeOf, posRangeOf } from '../layout';
import { currentRegion, type Grid } from '../selection';
import type { GridRange } from '../address';
import type { FilterCondition, IdRange, SheetLayout } from '../sheet';
import { tableFilterBox, tableHolding } from '../tables/table-filter';
import type { SheetTable } from '../tables/table';
import type { CellAnchor } from './sheet-objects';
import { inRange, isAnchor, isIdRange, onlyKeys, textUpTo } from './object-checks';

export type SheetSlicer = {
  id: string;
  kind: 'slicer';
  at: CellAnchor;
  // Its box, px at 100%.
  width: number;
  height: number;
  // The data it filters, its first row the header; absent when every cell of it was deleted ("No data").
  range?: IdRange;
  // The column it filters by, by id; absent when that column was deleted ("Choose a column").
  col?: string;
  // Its default filter, everyone's; absent keeps every row.
  filter?: FilterCondition;
  // Empty shows the column's name.
  title?: string;
  // Apply to Pivot Tables unticked (ticked is Google's default).
  pivots?: false;
};

// A new slicer's size (D476) and its bounds (D483).
export const NEW_SLICER_SIZE = { width: 200, height: 40 } as const;
export const SLICER_SIZE_MIN = { width: 100, height: 30 } as const;
export const SLICER_SIZE_MAX = 2000;
export const SLICER_TITLE_MAX = 100;
// Up to 50 a sheet (D440), within the sheet's objects.
export const SLICERS_MAX = 50;

const SLICER_KEYS = [
  'id',
  'kind',
  'at',
  'width',
  'height',
  'range',
  'col',
  'filter',
  'title',
  'pivots',
] as const;

/** Whether a condition is one a slicer offers (D484): values and a condition, never a formula nor a colour. */
export const isSlicerCondition = (x: unknown): x is FilterCondition =>
  isFilterCondition(x) && x.op !== 'formula' && x.colour === undefined;

// Whether a record is a slicer, whole and within its bounds (its id and kind checked by the caller).
export function isSheetSlicer(x: Record<string, unknown>): boolean {
  return (
    onlyKeys(x, SLICER_KEYS) &&
    isAnchor(x.at) &&
    inRange(x.width, SLICER_SIZE_MIN.width, SLICER_SIZE_MAX) &&
    inRange(x.height, SLICER_SIZE_MIN.height, SLICER_SIZE_MAX) &&
    (x.range === undefined || isIdRange(x.range)) &&
    (x.col === undefined || isAxisId(x.col)) &&
    (x.filter === undefined || isSlicerCondition(x.filter)) &&
    textUpTo(x.title, SLICER_TITLE_MAX) &&
    (x.pivots === undefined || x.pivots === false)
  );
}

/** A sheet's slicers, in paint order. */
export const sheetSlicers = (layout: Pick<SheetLayout, 'objects'>): SheetSlicer[] =>
  (layout.objects ?? []).filter((x): x is SheetSlicer => x.kind === 'slicer');

/** One's own slicer filters by slicer id: a condition in place of the default, null for every row (D485). */
export type OwnSlicerFilters = Readonly<Record<string, FilterCondition | null>>;

/** The condition a slicer filters by for one person: their own, else its default; null when it keeps every row. */
export function slicerCondition(
  slicer: SheetSlicer,
  own: OwnSlicerFilters,
): FilterCondition | null {
  const mine = own[slicer.id];
  return mine === undefined ? (slicer.filter ?? null) : mine;
}

/**
 * The slicers as filters drawn for one person (filteredOutRows' `slicers`): each with a column, a range whose column
 * is still in it, and a condition. Pure.
 */
export function slicerDrawnFilters(layout: SheetLayout, own: OwnSlicerFilters): DrawnFilter[] {
  return sheetSlicers(layout).flatMap((x) => {
    const cond = slicerCondition(x, own);
    if (!cond || !x.range || !x.col || !slicerColumnIds(layout, x).includes(x.col)) return [];
    return [{ ...x.range, conds: { [x.col]: cond } }];
  });
}

/** The columns of a slicer's range, by id in order, as the panel's Column offers them; none once its range is gone. */
export function slicerColumnIds(layout: SheetLayout, slicer: Pick<SheetSlicer, 'range'>): string[] {
  const p = slicer.range ? posRangeOf(layout, slicer.range) : null;
  return p ? layout.cols.slice(p.c1, p.c2 + 1) : [];
}

const sameBox = (a: GridRange, b: GridRange) =>
  a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

/**
 * The table whose filter's rows a slicer's range is exactly (its whole range, or its header and data rows with a
 * total row): the slicer attaches to it (Director, 2026-11-27); null over any other range.
 */
export function slicerOverTable(
  layout: SheetLayout,
  slicer: Pick<SheetSlicer, 'range'>,
): SheetTable | null {
  const p = slicer.range ? posRangeOf(layout, slicer.range) : null;
  if (!p) return null;
  return (
    (layout.tables ?? []).find((t) => {
      const whole = posRangeOf(layout, t);
      const rows = tableFilterBox(layout, t);
      return (!!whole && sameBox(whole, p)) || (!!rows && sameBox(rows, p));
    }) ?? null
  );
}

/**
 * Data › Add a Slicer's range and column: a table's header and data rows when the selection is inside one, else the
 * sheet's filter's range, else the filled range around the selection (the selection itself when more than one cell);
 * on the active column when it is in the range, else the range's first. Null when the range holds no line.
 */
export function slicerPlacement(
  layout: SheetLayout,
  sel: GridRange,
  grid: Grid,
): { range: IdRange; col: string } | null {
  const table = tableHolding(layout, sel);
  const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
  const box =
    (table && tableFilterBox(layout, table)) ||
    (layout.filter && posRangeOf(layout, layout.filter)) ||
    (single ? currentRegion({ r: sel.r1, c: sel.c1 }, grid) : sel);
  const range = idRangeOf(layout, box.r1, box.c1, box.r2, box.c2);
  if (!range) return null;
  const c = sel.c1 >= box.c1 && sel.c1 <= box.c2 ? sel.c1 : box.c1;
  return { range, col: layout.cols[c]! };
}
