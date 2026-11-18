// A spreadsheet's limits (docs/specs/029-sheets/spreadsheet.md "Limits"; sheet-store.md "In a spreadsheet"). Plan
// Sheets keep theirs (../limits.ts) until they retire. Each value's provenance and safe range beside it.
import type { SheetLayout } from '../sheet';

// S7 (ruled 2026-11-18): Google's own figure. Counted as Google counts: the grid's rows times columns over every sheet,
// filled or not (default). Fixed.
export const WORKBOOK_GRID_CELLS_MAX = 20_000_000;
// Column ZZZ, Google's widest. Fixed.
export const WORKBOOK_COLS_MAX = 18_278;
// One column at the grid's limit: rows are bounded by it.
export const WORKBOOK_ROWS_MAX = WORKBOOK_GRID_CELLS_MAX;
// The sheets a workbook holds (spec). Safe range 1 to 200.
export const WORKBOOK_SHEETS_MAX = 200;
// A cell's input (spec, `input_too_long`); a formula keeps FORMULA_MAX until the formula phase measures it.
export const WORKBOOK_INPUT_MAX = 50_000;
// Stored cells' bytes a workbook (default): the room holds 10 GB; this leaves room for history and the other tables.
// Safe range 256 MiB to 4 GiB.
export const WORKBOOK_STORED_BYTES_MAX = 1024 * 1024 * 1024;
// Rows or columns with their own size a sheet (default): the layout's sizes stay well inside one 8 MB row.
// Safe range 5,000 to 200,000.
export const WORKBOOK_SIZED_AXES_MAX = 100_000;

export type WorkbookLimitRefusal = 'workbook_full' | 'sheet_too_large' | 'sheets_full';

/** The grid cells of sheets, as Google counts them: rows times columns, summed. */
export function gridCells(layouts: readonly Pick<SheetLayout, 'rows' | 'cols'>[]): number {
  let total = 0;
  for (const l of layouts) total += l.rows.length * l.cols.length;
  return total;
}

/** Why a workbook of these sheets' grids is past its limits, or null. */
export function workbookGridRefusal(
  layouts: readonly Pick<SheetLayout, 'rows' | 'cols'>[],
): WorkbookLimitRefusal | null {
  if (layouts.length > WORKBOOK_SHEETS_MAX) return 'sheets_full';
  if (layouts.some((l) => l.cols.length > WORKBOOK_COLS_MAX)) return 'sheet_too_large';
  return gridCells(layouts) > WORKBOOK_GRID_CELLS_MAX ? 'workbook_full' : null;
}
