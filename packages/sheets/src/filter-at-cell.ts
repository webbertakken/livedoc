// The filter over a cell (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D504): the open
// filter view's while one is open, else a table's own, else the sheet's. Filter by Cell Value sets its column to the
// cell's shown value; Ctrl+Alt+R opens its column's filter menu.
import type { CellPos, GridRange } from './address';
import { filterRangeFor } from './commands-axis';
import type { DrawnFilter } from './filter';
import { idRangeOf, posRangeOf } from './layout';
import { displayValue } from './number-format';
import type { Grid } from './selection';
import { cellKey, type FilterCondition, type SheetLayout } from './sheet';
import type { SheetWrite } from './store';
import type { SheetTable } from './tables/table';
import { tableFilterBox, tableHolding } from './tables/table-filter';
import type { Workbook } from './engine/workbook';

/** Filter by Cell Value on a cell outside the sheet's filter or the open view: nothing changes (D504). */
export const FILTER_CELL_OUTSIDE = 'This cell is outside the filter';

/** Which filter's menu Ctrl+Alt+R opens for a cell: the open view's, a table's while on, or the sheet's. */
export type FilterAtCell =
  | { kind: 'view'; colId: string }
  | { kind: 'sheet'; colId: string }
  | { kind: 'table'; tableId: string; colId: string };

/** What Filter by Cell Value does: a write, a change to the open view (its maker's), or a refusal said. */
export type CellValueFilter =
  { write: SheetWrite } | { view: { colId: string; cond: FilterCondition } } | { refused: string };

const holds = (box: GridRange | null, at: CellPos): box is GridRange =>
  !!box && at.r >= box.r1 && at.r <= box.r2 && at.c >= box.c1 && at.c <= box.c2;

const single = (at: CellPos): GridRange => ({ r1: at.r, c1: at.c, r2: at.r, c2: at.c });

/**
 * The filter whose range holds `at`, its header row included (D504): the open view alone while one is open (a
 * table's filter is paused under it, D482), else a table's whose filter is on (its total row apart), else the
 * sheet's; null when none does.
 */
export function filterAtCell(
  layout: SheetLayout,
  at: CellPos,
  view: DrawnFilter | null,
): FilterAtCell | null {
  const colId = layout.cols[at.c];
  if (!colId) return null;
  if (view) return holds(posRangeOf(layout, view), at) ? { kind: 'view', colId } : null;
  const table = tableHolding(layout, single(at));
  if (table?.filter && holds(tableFilterBox(layout, table), at))
    return { kind: 'table', tableId: table.id, colId };
  if (layout.filter && holds(posRangeOf(layout, layout.filter), at))
    return { kind: 'sheet', colId };
  return null;
}

/**
 * Filter by Cell Value (D504): the column of `at` keeping only the rows that show what `at` shows, on the filter over
 * it, made or turned on first (one write). `sel` is the selection Create a Filter would take when the sheet has no
 * filter. A cell in the header (or a table's total row) only turns the filter on; null when nothing changes.
 */
export function filterByCellValue(
  wb: Workbook,
  sheetId: string,
  sel: GridRange,
  at: CellPos,
  grid: Grid,
  view: DrawnFilter | null,
): CellValueFilter | null {
  const sheet = wb.sheet(sheetId);
  const layout = sheet?.layout;
  const colId = layout?.cols[at.c];
  const rowId = layout?.rows[at.r];
  if (!sheet || !layout || !colId || !rowId) return null;
  const shown = displayValue(
    wb.value(sheetId, at.r, at.c),
    sheet.cells.get(cellKey(rowId, colId))?.format,
    wb.locale,
  ).text;
  // The column's whole condition: the one value kept, its condition and colour gone; none from the header row.
  const condUnder = (box: GridRange): FilterCondition | null =>
    at.r > box.r1 && holds(box, at) ? { values: [shown] } : null;
  const layoutWrite = (changes: Extract<SheetWrite, { kind: 'layout' }>['changes']) => ({
    write: { kind: 'layout' as const, changes },
  });

  if (view) {
    const box = posRangeOf(layout, view);
    if (!holds(box, at)) return { refused: FILTER_CELL_OUTSIDE };
    const cond = condUnder(box);
    return cond ? { view: { colId, cond } } : null;
  }

  const table = tableHolding(layout, single(at));
  if (table) return tableByValue(table, condUnder, layout, colId, layoutWrite);

  if (layout.filter) {
    const box = posRangeOf(layout, layout.filter);
    if (!holds(box, at)) return { refused: FILTER_CELL_OUTSIDE };
    const cond = condUnder(box);
    return cond ? layoutWrite([{ k: 'filterCond', col: colId, cond }]) : null;
  }

  const range = filterRangeFor(layout, sel, grid);
  if ('refused' in range) return { refused: range.refused };
  if (!('box' in range) || !holds(range.box, at)) return null;
  const { box } = range;
  const ids = idRangeOf(layout, box.r1, box.c1, box.r2, box.c2);
  if (!ids) return null;
  const cond = condUnder(box);
  return layoutWrite([{ k: 'filter', filter: { ...ids, conds: cond ? { [colId]: cond } : {} } }]);
}

// A table's own filter: turned on with the column's condition when off, else that column's condition set alone.
function tableByValue(
  table: SheetTable,
  condUnder: (box: GridRange) => FilterCondition | null,
  layout: SheetLayout,
  colId: string,
  layoutWrite: (changes: Extract<SheetWrite, { kind: 'layout' }>['changes']) => CellValueFilter,
): CellValueFilter | null {
  const box = tableFilterBox(layout, table);
  const cond = box ? condUnder(box) : null;
  if (table.filter === undefined)
    return layoutWrite([
      { k: 'table', id: table.id, table: { ...table, filter: cond ? { [colId]: cond } : {} } },
    ]);
  return cond ? layoutWrite([{ k: 'tfilterCond', id: table.id, col: colId, cond }]) : null;
}
