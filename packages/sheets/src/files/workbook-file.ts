// A workbook as a file holds it (docs/specs/029-sheets/standard-mapping.md "One model, two mappings"): sheets by
// name, cells by position, each with its formula in Google's syntax and the value it last showed. The bridge between
// the model (cells by row and column id, formulas by id references) and each format's reader and writer, so neither
// format ever sees an id and the model never sees a format.
import type { PackageRefusal } from '@livedoc/office-packages';
import { layoutIndex } from '../layout';
import {
  splitCellKey,
  type CellFormat,
  type CellInput,
  type Sheet,
  type SheetLayout,
} from '../sheet';
import { makeSheetId, type Rand } from '../ids';
import { compileFormula, renderFormula, type SheetHandle, type SheetsCtx } from '../formula/stored';
import { isArray, scalarOf, type ErrorCode, type Scalar } from '../formula/values';
import type { Workbook } from '../engine/workbook';
import { SheetLimits } from '../sheet-limits';
import { isColour } from '../format';
import { SheetName } from '../workbook/sheet-name';
import { WORKBOOK_COLS_NEW, WORKBOOK_ROWS_NEW, workbookSheetLayout } from '../workbook-record';
import { formatCodeOf, formatFromCode } from './number-format-code';
import { storedKept } from './kept-anchors';
import { fileLinesOf, layoutFromLines, type FileLines } from './file-lines';
import type { KeptContent, StoredAt } from './kept-content';

export type FileValue =
  { k: 'n'; v: number } | { k: 's'; v: string } | { k: 'b'; v: boolean } | { k: 'e'; v: ErrorCode };

/**
 * One cell as a file holds it: zero-based position, its formula as typed (`=A1*2`), and its value. `spans` is the
 * block an array formula fills (ODF's matrix spans, OOXML's array `ref`), its own cell at the top left.
 */
export type FileCell = {
  r: number;
  c: number;
  formula?: string;
  value?: FileValue;
  spans?: { rows: number; cols: number };
  // Its number format as a format code (standard-mapping.md "Number formats in the file"); none for General.
  format?: string;
};

export type FileSheet = {
  name: string;
  rows: number;
  cols: number;
  cells: FileCell[];
  // Its rows' and columns' sizes, hidden lines and groups (standard-mapping.md "Rows and columns in the file").
  lines?: FileLines;
  // Its tab's colour (lower-case #rrggbb) and whether it is hidden (standard-mapping.md "Sheet name, hidden, tab colour").
  tabColour?: string;
  hidden?: true;
};

/** A workbook as a file holds it, and what it holds that the model does not (standard-mapping.md "Unknown content"). */
export type WorkbookFile = { sheets: FileSheet[]; kept?: KeptContent };

/** A file read: its sheets and what could not be carried, or the package's named rejection. */
export type FileRead = { ok: true; file: WorkbookFile; losses: FileLoss[] } | PackageRefusal;

/** A file written, and what it could not carry (a formula the format cannot say keeps only its value). */
export type FileWritten<T> = { data: T; losses: FileLoss[] };

/** What a mapping could not carry, named so it is never silent (standard-mapping.md "Unknown content"). */
export type FileLoss =
  | { k: 'formula_unread'; sheet: string; r: number; c: number }
  | { k: 'formula_unwritten'; sheet: string; r: number; c: number }
  | { k: 'sheet_cut'; sheet: string; rows: number; cols: number }
  // A sheet whose cells past the most one file makes are left out (D121).
  | { k: 'cells_cut'; sheet: string }
  | { k: 'sheets_cut'; kept: number; had: number }
  | { k: 'sheet_unread'; sheet: string }
  | { k: 'sheet_renamed'; from: string; to: string }
  | { k: 'text_cut'; sheet: string; cells: number }
  | { k: 'format_unread'; sheet: string; r: number; c: number }
  | { k: 'format_unwritten'; sheet: string; r: number; c: number }
  | { k: 'format_approximated'; sheet: string; code: string }
  | { k: 'formats_cut'; sheet: string }
  // Kept content (standard-mapping.md "Unknown content"): a repeated cell's past D105, a construct not kept (D108),
  // a kept anchor gone at a write, what the package dropped (D106).
  | { k: 'kept_cut'; sheet: string; cells: number }
  // A sheet's cells formatted past their number format (fonts, fills, borders, alignment): not read yet (D104).
  | { k: 'styles_unread'; sheet: string }
  // A sheet whose sized rows and columns pass the most it holds: the rest left out (D124).
  | { k: 'sizes_cut'; sheet: string }
  | { k: 'kept_unread'; count: number }
  | { k: 'kept_dropped'; count: number }
  // Kept items, relationships and entries past the sizes a spreadsheet stores (D113).
  | { k: 'kept_too_large'; count: number }
  | { k: 'entries_dropped'; entries: string[] }
  // Kept pictures and objects a flat file cannot hold (D111).
  | { k: 'parts_left'; count: number }
  // Formulas calling a function the spreadsheet's meaning and the format's standard answer differently (D100).
  | { k: 'answers_differ'; count: number; functions: string[] };

function fileValueOf(value: Scalar): FileValue | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return { k: 'n', v: value };
  if (typeof value === 'string') return { k: 's', v: value };
  if (typeof value === 'boolean') return { k: 'b', v: value };
  return { k: 'e', v: value.e };
}

function shownValue(
  engine: Workbook,
  sheetId: string,
  r: number,
  c: number,
): FileValue | undefined {
  return fileValueOf(scalarOf(engine.value(sheetId, r, c)));
}

// The block a formula's result spills into, when it spilled past its own cell (standard-mapping.md "Arrays in the
// file"): a blocked spill's result is its #REF!, and covers nothing.
function spilledBlock(
  engine: Workbook,
  sheetId: string,
  r: number,
  c: number,
): FileCell['spans'] | undefined {
  const result = engine.formulaResult(sheetId, r, c);
  if (!isArray(result)) return undefined;
  // The engine gives one value, never a one-by-one array, so an array here always spilled past its cell.
  return {
    rows: result.rows.length,
    cols: result.rows.reduce((n, row) => Math.max(n, row.length), 0),
  };
}

// Cells in order, one a position: a cell with only a format inside a spilled block lends the block's cell its format.
function inOrder(cells: FileCell[]): FileCell[] {
  cells.sort((a, b) => a.r - b.r || a.c - b.c);
  const out: FileCell[] = [];
  for (const cell of cells) {
    const last = out.at(-1);
    if (last && last.r === cell.r && last.c === cell.c) Object.assign(last, { ...cell, ...last });
    else out.push(cell);
  }
  return out;
}

/**
 * The workbook's sheets, in tab order, as a file holds them, with every value the engine shows now: a spilled
 * formula with its block, the block's other cells holding the values it spilled; each cell's number format as the code
 * `locale` writes it (standard-mapping.md "Number formats in the file").
 */
export function workbookFileOf(
  engine: Workbook,
  sheets: readonly Sheet[],
  locale: string,
): WorkbookFile {
  return {
    sheets: sheets.map((sheet) => {
      const index = layoutIndex(sheet.layout);
      const ctx = engine.ctxFor(sheet.id);
      const cells: FileCell[] = [];
      for (const [key, cell] of sheet.cells) {
        const format = formatCodeOf(cell.format, locale) ?? undefined;
        if (!cell.input && format === undefined) continue;
        const { r: rowId, c: colId } = splitCellKey(key);
        const r = index.rowPos.get(rowId);
        const c = index.colPos.get(colId);
        if (r === undefined || c === undefined) continue;
        const out: FileCell = { r, c };
        if (format !== undefined) out.format = format;
        if (!cell.input) {
          cells.push(out);
          continue;
        }
        const value = shownValue(engine, sheet.id, r, c);
        if ('f' in cell.input) {
          out.formula = renderFormula(cell.input.f, ctx);
          const spans = spilledBlock(engine, sheet.id, r, c);
          if (spans) {
            out.spans = spans;
            cells.push(...blockCells(engine, sheet.id, out, spans));
          }
        }
        if (value) out.value = value;
        cells.push(out);
      }
      return {
        name: sheet.title,
        rows: sheet.layout.rows.length,
        cols: sheet.layout.cols.length,
        cells: inOrder(cells),
        lines: fileLinesOf(sheet.layout),
        ...(sheet.layout.tabColour ? { tabColour: sheet.layout.tabColour } : {}),
        ...(sheet.layout.hidden ? { hidden: true as const } : {}),
      };
    }),
  };
}

// The cells of a spilled block but its own that show a value, each holding the value spilled there.
function blockCells(
  engine: Workbook,
  sheetId: string,
  at: FileCell,
  spans: NonNullable<FileCell['spans']>,
): FileCell[] {
  const out: FileCell[] = [];
  for (let dr = 0; dr < spans.rows; dr++)
    for (let dc = 0; dc < spans.cols; dc++) {
      if (dr === 0 && dc === 0) continue;
      const value = shownValue(engine, sheetId, at.r + dr, at.c + dc);
      if (value) out.push({ r: at.r + dr, c: at.c + dc, value });
    }
  return out;
}

/** The positions a file's cells cache for a block's formula: never inputs, as the formula spills there again. */
export function blockCachePositions(cells: readonly FileCell[]): Set<string> {
  const out = new Set<string>();
  for (const cell of cells) {
    if (!cell.spans || cell.formula === undefined) continue;
    for (let dr = 0; dr < cell.spans.rows; dr++)
      for (let dc = 0; dc < cell.spans.cols; dc++)
        if (dr > 0 || dc > 0) out.add(`${cell.r + dr},${cell.c + dc}`);
  }
  return out;
}

/** A sheet to make from a file: its title, its grid, and its cells by id. */
export type SheetFromFile = {
  id: string;
  title: string;
  layout: SheetLayout;
  cells: { r: string; c: string; i?: CellInput; f?: CellFormat }[];
};

/** The sheets a file makes, what it could not carry, and its kept content anchored to them by id. */
export type SheetsFromFile = {
  sheets: SheetFromFile[];
  losses: FileLoss[];
  kept?: KeptContent<StoredAt>;
};

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

// Each code read once a file: a file of two million cells holds a few codes (D121).
type FormatsRead = (code: string) => ReturnType<typeof formatFromCode>;

function formatsRead(locale: string): FormatsRead {
  const read = new Map<string, ReturnType<typeof formatFromCode>>();
  return (code) => {
    const known = read.get(code);
    if (known) return known;
    const made = formatFromCode(code, locale);
    read.set(code, made);
    return made;
  };
}

function cellFormatOf(
  cell: FileCell,
  sheet: string,
  formats: FormatsRead,
  losses: FileLoss[],
): CellFormat | undefined {
  if (cell.format === undefined) return undefined;
  const read = formats(cell.format);
  if (read.ok) return read.format;
  losses.push({ k: 'format_unread', sheet, r: cell.r, c: cell.c });
  return undefined;
}

type Made = { file: FileSheet; id: string; title: string; layout: SheetLayout };

// Each sheet's grid: at least a new sheet's, within a sheet's limits and the room every earlier sheet left in the
// workbook (its rows and grid cells, files-and-print.md "A file sent in parts"). A sheet with no row left, and every
// sheet after it, is cut.
function madeSheets(file: WorkbookFile, rand: Rand, losses: FileLoss[]): Made[] {
  const limits = SheetLimits.spreadsheet;
  const taken: string[] = [];
  const made: Made[] = [];
  let used = { rows: 0, gridCells: 0 };
  for (const sheet of file.sheets) {
    const cols = Math.min(Math.max(sheet.cols, WORKBOOK_COLS_NEW), limits.cols);
    const room = SheetLimits.room(limits, { rows: 0, cols }, used).rows;
    if (room === 0) {
      losses.push({ k: 'sheets_cut', kept: made.length, had: file.sheets.length });
      break;
    }
    const rows = Math.min(Math.max(sheet.rows, WORKBOOK_ROWS_NEW), room);
    used = { rows: used.rows + rows, gridCells: used.gridCells + rows * cols };
    const title = SheetName.fit(sheet.name, taken);
    taken.push(title);
    if (title !== sheet.name) losses.push({ k: 'sheet_renamed', from: sheet.name, to: title });
    if (sheet.rows > rows || sheet.cols > cols)
      losses.push({ k: 'sheet_cut', sheet: title, rows, cols });
    const layout = workbookSheetLayout(rand, rows, cols);
    const lines = layoutFromLines(sheet.lines, layout, limits.sizedAxes);
    if (lines.cut) losses.push({ k: 'sizes_cut', sheet: title });
    made.push({
      file: sheet,
      id: makeSheetId(rand),
      title,
      layout: {
        ...layout,
        ...lines.layout,
        ...(isColour(sheet.tabColour) ? { tabColour: sheet.tabColour } : {}),
        ...(sheet.hidden ? { hidden: true as const } : {}),
      },
    });
  }
  // A spreadsheet shows a sheet at least: a file hiding every one shows its first (D182).
  if (made.length > 0 && made.every((m) => m.layout.hidden)) delete made[0]!.layout.hidden;
  return made;
}

/**
 * The sheets a file makes (a spreadsheet opened from it): each its grid (at least a new sheet's, at most what the
 * workbook's limits leave) and its cells, formulas compiled against the file's own sheets. A cell or a sheet past the
 * limits, a sheet name taken or too long, and a formula LiveDoc cannot read are each named in `losses`; the last
 * keeps its value. Each number format is read in `locale`, the workbook's (standard-mapping.md "Number formats in the
 * file"); one that cannot be read is named too, its cell kept. Its kept content comes anchored to the sheets by id.
 */
export function sheetsFromFile(
  file: WorkbookFile,
  locale: string,
  rand: Rand = Math.random,
): SheetsFromFile {
  const losses: FileLoss[] = [];
  const made = madeSheets(file, rand, losses);
  const formats = formatsRead(locale);
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
    const cache = blockCachePositions(m.file.cells);
    for (const cell of m.file.cells) {
      if (cache.has(`${cell.r},${cell.c}`)) continue;
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
      const format = cellFormatOf(cell, m.title, formats, losses);
      if (input || format)
        cells.push({ r, c, ...(input ? { i: input } : {}), ...(format ? { f: format } : {}) });
    }
    return { id: m.id, title: m.title, layout: m.layout, cells };
  });
  if (!file.kept) return { sheets, losses };
  // Kept content on a sheet, row or column the workbook's limits cut goes with it, counted.
  const stored = storedKept(file.kept, made);
  if (stored.dropped > 0) losses.push({ k: 'kept_dropped', count: stored.dropped });
  return { sheets, losses, kept: stored.kept };
}
