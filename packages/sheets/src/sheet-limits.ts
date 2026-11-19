// The limits a sheet is held to, by what holds it (docs/specs/029-sheets/spreadsheet.md "Limits", sheet-store.md
// "Limits"): a spreadsheet's sheets the workbook's, a Plan Sheet its own until it retires. Every check of a sheet's
// grid, cells, bytes and inputs reads one of these, never the constants beside them.
import {
  DOCUMENT_CELLS_MAX,
  DOCUMENT_SHEETS_MAX,
  INPUT_MAX,
  SHEET_BYTES_MAX,
  SHEET_CELLS_MAX,
  SHEET_COLS_MAX,
  SHEET_ROWS_MAX,
  SHEET_SIZED_AXES_MAX,
} from './limits';
import {
  WORKBOOK_COLS_MAX,
  WORKBOOK_GRID_CELLS_MAX,
  WORKBOOK_INPUT_MAX,
  WORKBOOK_ROWS_MAX,
  WORKBOOK_SHEETS_MAX,
  WORKBOOK_SIZED_AXES_MAX,
  WORKBOOK_STORED_BYTES_MAX,
  type WorkbookLimitRefusal,
} from './workbook/workbook-limits';

export type SheetLimits = {
  // One sheet's rows, columns, filled cells, stored bytes and rows or columns with a size of their own.
  readonly rows: number;
  readonly cols: number;
  readonly cells: number;
  readonly bytes: number;
  readonly sizedAxes: number;
  // A cell's input, in characters (a formula keeps FORMULA_MAX).
  readonly input: number;
  // Over every sheet of the document: filled cells, stored bytes, sheets, rows, and the grid's rows times columns.
  readonly documentCells: number;
  readonly documentBytes: number;
  readonly sheets: number;
  readonly workbookRows: number;
  readonly gridCells: number;
};

/** A sheet's grid, or the sizes of every sheet of a workbook summed. */
export type GridSize = { readonly rows: number; readonly cols: number };
export type WorkbookSize = { readonly rows: number; readonly gridCells: number };

const plan: SheetLimits = {
  rows: SHEET_ROWS_MAX,
  cols: SHEET_COLS_MAX,
  cells: SHEET_CELLS_MAX,
  bytes: SHEET_BYTES_MAX,
  sizedAxes: SHEET_SIZED_AXES_MAX,
  input: INPUT_MAX,
  documentCells: DOCUMENT_CELLS_MAX,
  documentBytes: Number.POSITIVE_INFINITY,
  sheets: DOCUMENT_SHEETS_MAX,
  workbookRows: Number.POSITIVE_INFINITY,
  gridCells: Number.POSITIVE_INFINITY,
};

// A filled cell sits on the grid, so the grid's cells bound the filled ones.
const spreadsheet: SheetLimits = {
  rows: WORKBOOK_ROWS_MAX,
  cols: WORKBOOK_COLS_MAX,
  cells: WORKBOOK_GRID_CELLS_MAX,
  bytes: WORKBOOK_STORED_BYTES_MAX,
  sizedAxes: WORKBOOK_SIZED_AXES_MAX,
  input: WORKBOOK_INPUT_MAX,
  documentCells: WORKBOOK_GRID_CELLS_MAX,
  documentBytes: WORKBOOK_STORED_BYTES_MAX,
  sheets: WORKBOOK_SHEETS_MAX,
  workbookRows: WORKBOOK_ROWS_MAX,
  gridCells: WORKBOOK_GRID_CELLS_MAX,
};

const atLeastNone = (n: number): number => Math.max(0, n);

/** The rows and grid cells of every sheet, summed: grid cells as Google counts them, rows times columns. */
function sizeOf(grids: readonly GridSize[]): WorkbookSize {
  let rows = 0;
  let gridCells = 0;
  for (const g of grids) {
    rows += g.rows;
    gridCells += g.rows * g.cols;
  }
  return { rows, gridCells };
}

export const SheetLimits = {
  plan,
  spreadsheet,
  of: (isSpreadsheet: boolean): SheetLimits => (isSpreadsheet ? spreadsheet : plan),

  /**
   * The rows and columns a sheet may still grow by: its own limits, and in a workbook the rows and grid cells every
   * sheet holds (`workbook`, this sheet included; the sheet alone when not given).
   */
  // A sheet always holds a row and a column (validate.ts), so it grows by whole rows of its columns.
  room: (
    limits: SheetLimits,
    sheet: GridSize,
    workbook: WorkbookSize = { rows: sheet.rows, gridCells: sheet.rows * sheet.cols },
  ): GridSize => {
    const cellsLeft = limits.gridCells - workbook.gridCells;
    const rows = Math.min(
      limits.rows - sheet.rows,
      limits.workbookRows - workbook.rows,
      Math.floor(cellsLeft / Math.max(1, sheet.cols)),
    );
    const cols = Math.min(
      limits.cols - sheet.cols,
      Math.floor(cellsLeft / Math.max(1, sheet.rows)),
    );
    return { rows: atLeastNone(rows), cols: atLeastNone(cols) };
  },

  /** Why a workbook of these sheets' grids is past its limits, or null. */
  workbookRefusal: (
    limits: SheetLimits,
    grids: readonly GridSize[],
  ): WorkbookLimitRefusal | null => {
    if (grids.length > limits.sheets) return 'sheets_full';
    if (grids.some((g) => g.cols > limits.cols)) return 'sheet_too_large';
    const size = sizeOf(grids);
    return size.rows > limits.workbookRows || size.gridCells > limits.gridCells
      ? 'workbook_full'
      : null;
  },

  sizeOf,
} as const;
