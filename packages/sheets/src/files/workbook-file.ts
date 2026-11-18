// A workbook as a file holds it (docs/specs/029-sheets/standard-mapping.md "One model, two mappings"): sheets by
// name, cells by position, each with its formula in Google's syntax and the value it last showed. The bridge between
// the model (cells by row and column id, formulas by id references) and each format's reader and writer, so neither
// format ever sees an id and the model never sees a format.
import { layoutIndex } from '../layout';
import { emptyLayout, splitCellKey, type CellInput, type Sheet, type SheetLayout } from '../sheet';
import { makeSheetId, type Rand } from '../ids';
import { compileFormula, renderFormula, type SheetHandle, type SheetsCtx } from '../formula/stored';
import { isArray, isError, scalarOf, type ErrorCode, type Scalar } from '../formula/values';
import type { Workbook } from '../engine/workbook';
import { SHEET_COLS_MAX, SHEET_ROWS_MAX, SHEET_TITLE_MAX } from '../limits';
import { uniqueSheetTitle } from '../sheet';
import { WORKBOOK_COLS_NEW, WORKBOOK_ROWS_NEW } from '../workbook-record';

export type FileValue =
  | { k: 'n'; v: number }
  | { k: 's'; v: string }
  | { k: 'b'; v: boolean }
  | { k: 'e'; v: ErrorCode };

/** One cell as a file holds it: zero-based position, its formula as typed (`=A1*2`), and its value. */
export type FileCell = { r: number; c: number; formula?: string; value?: FileValue };

export type FileSheet = { name: string; rows: number; cols: number; cells: FileCell[] };

export type WorkbookFile = { sheets: FileSheet[] };

/** What a mapping could not carry, named so it is never silent (standard-mapping.md "Unknown content"). */
export type FileLoss =
  | { k: 'formula_unread'; sheet: string; r: number; c: number }
  | { k: 'formula_unwritten'; sheet: string; r: number; c: number }
  | { k: 'sheet_cut'; sheet: string; rows: number; cols: number }
  | { k: 'sheets_cut'; kept: number; had: number }
  | { k: 'sheet_renamed'; from: string; to: string };

function fileValueOf(value: Scalar): FileValue | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return { k: 'n', v: value };
  if (typeof value === 'string') return { k: 's', v: value };
  if (typeof value === 'boolean') return { k: 'b', v: value };
  return isError(value) ? { k: 'e', v: value.e } : undefined;
}

/** The workbook's sheets, in tab order, as a file holds them, with every value the engine shows now. */
export function workbookFileOf(engine: Workbook, sheets: readonly Sheet[]): WorkbookFile {
  return {
    sheets: sheets.map((sheet) => {
      const index = layoutIndex(sheet.layout);
      const ctx = engine.ctxFor(sheet.id);
      const cells: FileCell[] = [];
      for (const [key, cell] of sheet.cells) {
        if (!cell.input) continue;
        const { r: rowId, c: colId } = splitCellKey(key);
        const r = index.rowPos.get(rowId);
        const c = index.colPos.get(colId);
        if (r === undefined || c === undefined) continue;
        const shown = engine.value(sheet.id, r, c);
        const value = fileValueOf(isArray(shown) ? scalarOf(shown) : shown);
        const out: FileCell = { r, c };
        if ('f' in cell.input) out.formula = renderFormula(cell.input.f, ctx);
        if (value) out.value = value;
        cells.push(out);
      }
      cells.sort((a, b) => a.r - b.r || a.c - b.c);
      return {
        name: sheet.title,
        rows: sheet.layout.rows.length,
        cols: sheet.layout.cols.length,
        cells,
      };
    }),
  };
}

/** A sheet to make from a file: its title, its grid, and its cells by id. */
export type SheetFromFile = {
  id: string;
  title: string;
  layout: SheetLayout;
  cells: { r: string; c: string; i: CellInput }[];
};

export type SheetsFromFile = { sheets: SheetFromFile[]; losses: FileLoss[] };

function literalInput(value: FileValue): CellInput | null {
  switch (value.k) {
    case 'n':
      return { n: value.v };
    case 's':
      return { s: value.v };
    case 'b':
      return { b: value.v };
    case 'e':
      return null;
  }
}

/**
 * The sheets a file makes (a spreadsheet opened from it): each its grid (at least a new sheet's, at most the
 * grid's ceiling) and its cells, formulas compiled against the file's own sheets. A cell past the ceiling, a sheet
 * name taken or too long, and a formula LiveDoc cannot read are each named in `losses`; the last keeps its value.
 */
export function sheetsFromFile(file: WorkbookFile, rand: Rand = Math.random): SheetsFromFile {
  const losses: FileLoss[] = [];
  const taken: string[] = [];
  const made = file.sheets.map((sheet) => {
    const wanted = sheet.name.slice(0, SHEET_TITLE_MAX);
    const title = uniqueSheetTitle(wanted === '' ? 'Sheet' : wanted, taken);
    taken.push(title);
    if (title !== sheet.name) losses.push({ k: 'sheet_renamed', from: sheet.name, to: title });
    const rows = Math.min(Math.max(sheet.rows, WORKBOOK_ROWS_NEW), SHEET_ROWS_MAX);
    const cols = Math.min(Math.max(sheet.cols, WORKBOOK_COLS_NEW), SHEET_COLS_MAX);
    if (sheet.rows > rows || sheet.cols > cols)
      losses.push({ k: 'sheet_cut', sheet: title, rows, cols });
    return { file: sheet, id: makeSheetId(rand), title, layout: emptyLayout(rand, rows, cols) };
  });
  const handles: SheetHandle[] = made.map((m) => ({
    id: m.id,
    title: m.title,
    layout: m.layout,
  }));
  const byTitle = (title: string) => {
    const lower = title.toLowerCase();
    return handles.find((h) => h.title.toLowerCase() === lower);
  };
  const byId = (id: string) => handles.find((h) => h.id === id);
  const sheets = made.map((m, i): SheetFromFile => {
    const ctx: SheetsCtx = { own: handles[i]!, byTitle, byId };
    const cells: SheetFromFile['cells'] = [];
    for (const cell of m.file.cells) {
      const r = m.layout.rows[cell.r];
      const c = m.layout.cols[cell.c];
      if (r === undefined || c === undefined) continue;
      let input: CellInput | null = null;
      if (cell.formula !== undefined) {
        const compiled = compileFormula(cell.formula, ctx);
        if (compiled.ok) input = { f: compiled.formula };
        else losses.push({ k: 'formula_unread', sheet: m.title, r: cell.r, c: cell.c });
      }
      input ??= cell.value ? literalInput(cell.value) : null;
      if (input) cells.push({ r, c, i: input });
    }
    return { id: m.id, title: m.title, layout: m.layout, cells };
  });
  return { sheets, losses };
}
