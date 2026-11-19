// A spreadsheet's limits (docs/specs/029-sheets/spreadsheet.md "Limits"; sheet-store.md "In a spreadsheet"). Plan
// Sheets keep theirs (../limits.ts) until they retire. Each value's provenance and safe range beside it.

// S7 (ruled 2026-11-18): Google's own figure. Counted as Google counts: the grid's rows times columns over every sheet,
// filled or not (default). Fixed.
export const WORKBOOK_GRID_CELLS_MAX = 20_000_000;
// Column ZZZ, Google's widest. Fixed.
export const WORKBOOK_COLS_MAX = 18_278;
// Rows over every sheet (Webber, 2026-11-18): rows are kept by id, about 62 MB of memory a million in a room of 128 MB
// (measured), so a workbook holds a million; one sheet may hold them all. Safe range 100,000 to 1,000,000.
export const WORKBOOK_ROWS_MAX = 1_000_000;
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
