// A workbook as a file holds it (docs/specs/029-sheets/standard-mapping.md "One model, two mappings"): sheets by
// name, cells by position, each with its formula in Google's syntax and the value it last showed. The bridge between
// the model (cells by row and column id, formulas by id references) and each format's reader and writer, so neither
// format ever sees an id and the model never sees a format.
import { fileChartsOf, sheetChartsFromFile, type FileChart } from './file-charts';
import { picturesToPlace, type PictureToPlace, type PictureUnstored } from './import-pictures';
import {
  filePicturesOf,
  type FilePicture,
  type FilePictureFetches,
  type ReadPicture,
} from './file-pictures';
import {
  filePivotsOf,
  pivotCachePositions,
  sheetPivotsFromFile,
  type FilePivot,
} from './file-pivots';
import type { PackageRefusal } from '@livedoc/office-packages';
import { layoutIndex } from '../layout';
import {
  splitCellKey,
  type CellFormat,
  type CellInput,
  type Sheet,
  type SheetLayout,
  type StoredFormula,
} from '../sheet';
import { makeSheetId, type Rand } from '../ids';
import {
  compileFormula,
  mapFormulaRefs,
  readsUnknownTable,
  renderFormula,
  tableRefAsRange,
  type SheetHandle,
  type SheetsCtx,
} from '../formula/stored';
import { err, isArray, scalarOf, type ErrorCode, type Scalar } from '../formula/values';
import { displayValue } from '../number-format';
import { pivotHidesResolved } from './pivot-standard';
import type { Workbook } from '../engine/workbook';
import { cellText } from '../engine/sheets-ctx';
import { sameTableName, type CellText } from '../tables/table';
import { SheetLimits } from '../sheet-limits';
import { isColour } from '../format';
import { SheetName } from '../workbook/sheet-name';
import { WORKBOOK_COLS_NEW, WORKBOOK_ROWS_NEW, workbookSheetLayout } from '../workbook-record';
import { formatCodeOf, formatFromCode } from './number-format-code';
import { cellStyleOf, type CellStyle } from './cell-style';
import { storedKept } from './kept-anchors';
import { fileFunctionsOf, functionsFromFile, type FileFunction } from './file-functions';
import { fileNamesOf, namesFromFile, type FileRangeName } from './file-names';
import { fileProtectionsOf, protectionsFromFile, type FileProtection } from './file-protections';
import { fileTablesOf, tablesFromFile, type FileTable } from './file-tables';
import { tableFiltersFromFile } from './file-table-filters';
import type { FileAt, KeptItem } from './kept-content';
import type { NamedFunction } from '../named-functions';
import { fileLinesOf, layoutFromLines, withFilteredRows, type FileLines } from './file-lines';
import {
  fileFiltersOf,
  filtersFromFile,
  type FileFilter,
  type FileFilterView,
} from './file-filters';
import { filteredOutRows } from '../filter';
import type { KeptContent, StoredAt } from './kept-content';
import { bandingRules } from '../rules/bandings';
import { STANDARD_THEME, type SpreadsheetTheme } from '../themes/spreadsheet-theme';
import { fileFormatRulesOf, formatRulesFromFile, type FileFormatRule } from './file-format-rules';
import {
  fileValidationRulesOf,
  validationRulesFromFile,
  type FileValidationRule,
} from './file-validation';

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
  // Its style beyond the number format (standard-mapping.md "Cell styles in the file"); none for the default.
  style?: CellStyle;
  // A formula reading a table, with each table reference as the plain absolute range it reads now, for a format
  // without them (OpenFormula, standard-mapping.md "Tables in the file").
  plain?: string;
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
  // Its format rules in list order (standard-mapping.md "Format rules in the file").
  formatRules?: FileFormatRule[];
  // Its validation rules in list order (standard-mapping.md "Validation in the file").
  validations?: FileValidationRule[];
  // Its charts in paint order (standard-mapping.md "Charts in the file").
  charts?: FileChart[];
  // Its images over cells in paint order (standard-mapping.md "Pictures in the file").
  pictures?: FilePicture[];
  // Read from a file, its pictures over the cells with their bytes, for the import to store (D628).
  readPictures?: ReadPicture[];
  // Its protections in its order (standard-mapping.md "Protection in the file").
  protections?: FileProtection[];
  // Its tables in order (standard-mapping.md "Tables in the file").
  tables?: FileTable[];
  // Its pivot tables in object order (standard-mapping.md "Pivot tables in the file"); read back, their records.
  pivots?: FilePivot[];
  // Its pivot tables no file can hold (a source deleted), left out (D607).
  pivotsLeft?: number;
  // Its filter and filter views (standard-mapping.md "Filters in the file").
  filter?: FileFilter;
  filterViews?: FileFilterView[];
};

/**
 * A workbook as a file holds it, what it holds that the model does not (standard-mapping.md "Unknown content"), its
 * theme ("The theme in the file"; absent, Standard), its named functions ("Named functions in the file") and its named
 * ranges.
 */
export type WorkbookFile = {
  sheets: FileSheet[];
  kept?: KeptContent;
  theme?: SpreadsheetTheme;
  functions?: FileFunction[];
  // Its named ranges, each on its sheet by place ("Named ranges in the file").
  names?: FileRangeName[];
  // The pictures' bytes a download read from the gallery, by image id ("Pictures in the file"); absent, none.
  pictureBytes?: FilePictureFetches;
};

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
  // A file's format rule the grid cannot hold (standard-mapping.md "Format rules in the file"), at its anchor.
  | { k: 'format_rule_unread'; sheet: string; r: number; c: number }
  // A file's validation rule the grid cannot hold (standard-mapping.md "Validation in the file"), at its top-left cell.
  | { k: 'validation_rule_unread'; sheet: string; r: number; c: number }
  // LiveDoc's rule beside a standard rule another app changed since: the standard rule read (D294); logged only.
  | { k: 'validation_rule_changed'; sheet: string; r: number; c: number }
  // A sheet whose sized rows and columns pass the most it holds: the rest left out (D124).
  | { k: 'sizes_cut'; sheet: string }
  | { k: 'kept_unread'; count: number }
  | { k: 'kept_dropped'; count: number }
  // Kept items, relationships and entries past the sizes a spreadsheet stores (D113).
  | { k: 'kept_too_large'; count: number }
  | { k: 'entries_dropped'; entries: string[] }
  // Kept pictures and objects a flat file cannot hold (D111).
  | { k: 'parts_left'; count: number }
  // A sheet's own charts not written beside the drawings it kept from its file (standard-mapping.md "Charts in the file").
  | { k: 'charts_unwritten'; sheet: string }
  // A picture over the cells left out of the file: its bytes not served, past the file's budget, or its sheet keeping
  // the file's own drawing (standard-mapping.md "Pictures in the file", D626).
  | { k: 'picture_unwritten'; sheet: string; why: 'unavailable' | 'too_large' | 'kept_drawing' }
  // A picture over the cells a file holds that the opener's gallery did not take, or past the sheet's objects (D628).
  | { k: 'picture_unread'; sheet: string; why: PictureUnstored }
  // A chart read from the file, changed since, written from the model in place of its own XML (D276).
  | { k: 'chart_rewritten'; sheet: string }
  // A chart of a type no format holds, written as the nearest one that does, its original kept for LiveDoc (D290).
  | { k: 'chart_nearest_type'; sheet: string }
  // Formulas calling a function the spreadsheet's meaning and the format's standard answer differently (D100).
  | { k: 'answers_differ'; count: number; functions: string[] }
  // Named functions (standard-mapping.md "Named functions in the file"): one LiveDoc cannot hold, kept as it came
  // (D342); one a file leaves out (all in ODF, a name Excel refuses); one whose description or argument help is cut
  // (D340).
  | { k: 'function_unread'; name: string }
  | { k: 'function_unwritten'; name: string }
  | { k: 'function_cut'; name: string }
  // Named ranges (standard-mapping.md "Named ranges in the file"): one LiveDoc cannot read, kept as it came (D343); one
  // a write leaves out, a name twice or one Excel refuses (D344).
  | { k: 'name_unread'; name: string }
  | { k: 'name_unwritten'; name: string }
  // Protections (standard-mapping.md "Protection in the file"): LiveDoc's record beside a standard form another app
  // changed since, the standard form read (D349, logged only); one the grid cannot hold (logged only); a protected
  // sheet's free ranges past 50, the rest left protected (D352).
  | { k: 'protection_changed'; sheet: string }
  | { k: 'protection_unread'; sheet: string }
  | { k: 'protection_cut'; sheet: string }
  // Tables (standard-mapping.md "Tables in the file"): LiveDoc's record beside a standard form another app changed
  // since, the standard form read (logged only); one LiveDoc cannot hold, left as plain cells (kept for the file when
  // its reader kept it).
  | { k: 'tables_changed'; sheet: string }
  // Filters (standard-mapping.md "Filters in the file"): a column whose form LiveDoc has no condition for, named at
  // its header; a view past the most a sheet holds, by its name; LiveDoc's record dropped for the standard form.
  | { k: 'filter_unread'; sheet: string; r: number; c: number }
  | { k: 'filter_view_unread'; sheet: string; name: string }
  | { k: 'filters_changed'; sheet: string }
  // A filter over part of a table (D480), kept as it is: logged once a read or a write, never reported.
  | { k: 'filter_beside_table'; sheet: string }
  | { k: 'table_unread'; sheet: string; name: string }
  // Pivot tables (standard-mapping.md "Pivot tables in the file"): one with no source, left out of a write; LiveDoc's
  // record beside a standard form another app changed since, the standard form read instead (D607, logged); another
  // app's the model cannot hold, kept as the file's own (D609, reported).
  | { k: 'pivot_unwritten'; sheet: string }
  | { k: 'pivot_changed'; sheet: string }
  | { k: 'pivot_unread'; sheet: string };

export function fileValueOf(value: Scalar): FileValue | undefined {
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
        // A theme colour stays one: XLSX holds it by its theme, ODF as the colour it is (D218).
        const style = cellStyleOf(cell.format);
        if (!cell.input && format === undefined && !style) continue;
        const { r: rowId, c: colId } = splitCellKey(key);
        const r = index.rowPos.get(rowId);
        const c = index.colPos.get(colId);
        if (r === undefined || c === undefined) continue;
        const out: FileCell = { r, c };
        if (format !== undefined) out.format = format;
        if (style) out.style = style;
        if (!cell.input) {
          cells.push(out);
          continue;
        }
        const value = shownValue(engine, sheet.id, r, c);
        if ('f' in cell.input) {
          out.formula = renderFormula(cell.input.f, ctx);
          const plain = plainFormula(cell.input.f, ctx, r);
          if (plain !== null) out.plain = plain;
          const spans = spilledBlock(engine, sheet.id, r, c);
          if (spans) {
            out.spans = spans;
            cells.push(...blockCells(engine, sheet.id, out, spans));
          }
        }
        if (value) out.value = value;
        cells.push(out);
      }
      // Alternating colours travel as format rules after the sheet's own (D216).
      const own = fileFormatRulesOf(sheet.layout, ctx, locale) ?? [];
      const all = [...own, ...bandingRules(sheet.layout)];
      const formatRules = all.length ? all : undefined;
      const validations = fileValidationRulesOf(sheet.layout, ctx);
      const charts = fileChartsOf(engine, sheet, locale);
      const pictures = filePicturesOf(sheet);
      const protections = fileProtectionsOf(sheet.layout);
      const dates = { locale: engine.locale, today: engine.today() };
      const tables = fileTablesOf(sheet.layout, (r, c) => cellText(sheet, r, c), { ctx, dates });
      // Its pivot tables, and the cells their outputs cache (D604).
      const pivoted = filePivotsOf(engine, sheet, sheets, locale);
      cells.push(...pivoted.cells);
      // Its filter and views; the rows its filter hides marked on its lines (standard-mapping.md "Filters in the file").
      const filters = fileFiltersOf(
        sheet.layout,
        new Set(sheet.layout.hiddenRows ?? []),
        ctx,
        dates,
      );
      const filtered = [...filteredOutRows(engine, sheet.id)].flatMap((id) => {
        const r = index.rowPos.get(id);
        return r === undefined ? [] : [r];
      });
      const lines = withFilteredRows(fileLinesOf(sheet.layout), filtered);
      return {
        name: sheet.title,
        rows: sheet.layout.rows.length,
        cols: sheet.layout.cols.length,
        cells: inOrder(cells),
        lines,
        ...(sheet.layout.tabColour ? { tabColour: sheet.layout.tabColour } : {}),
        ...(sheet.layout.hidden ? { hidden: true as const } : {}),
        ...(formatRules ? { formatRules } : {}),
        ...(validations ? { validations } : {}),
        ...(charts.length ? { charts } : {}),
        ...(pictures.length ? { pictures } : {}),
        ...(protections ? { protections } : {}),
        ...(tables ? { tables } : {}),
        ...(pivoted.pivots.length ? { pivots: pivoted.pivots } : {}),
        ...(pivoted.unwritten ? { pivotsLeft: pivoted.unwritten } : {}),
        ...filters,
      };
    }),
    ...(engine.theme === STANDARD_THEME ? {} : { theme: engine.theme }),
    ...functionsOf(engine, sheets),
    ...namesOf(sheets),
  };
}

// A formula's text with its table references as the plain absolute ranges they read from row `r`; null when it reads
// no table.
function plainFormula(f: StoredFormula, ctx: SheetsCtx, r: number): string | null {
  if (!f.r.some((ref) => ref.t !== undefined)) return null;
  const plain = mapFormulaRefs(f, (ref) =>
    ref.t === undefined ? ref : tableRefAsRange(ref, ctx, r),
  );
  return renderFormula(plain, ctx);
}

// The workbook's named ranges, each on its sheet by place.
function namesOf(sheets: readonly Sheet[]): { names?: FileRangeName[] } {
  const names = fileNamesOf(sheets);
  return names.length ? { names } : {};
}

// The named functions the engine works out, each definition against the workbook's sheets.
function functionsOf(engine: Workbook, sheets: readonly Sheet[]): { functions?: FileFunction[] } {
  const list = engine.functionList();
  const first = sheets[0];
  if (list.length === 0 || !first) return {};
  return { functions: fileFunctionsOf(list, engine.ctxFor(first.id)) };
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

/**
 * The sheets a file makes, what it could not carry, its kept content anchored to them by id, and its named functions
 * read against them.
 */
export type SheetsFromFile = {
  sheets: SheetFromFile[];
  losses: FileLoss[];
  kept?: KeptContent<StoredAt>;
  functions?: NamedFunction[];
  // The pictures over the cells it read, for the opener's gallery to store before they are placed (D628).
  pictures?: PictureToPlace[];
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
  joined: Joined,
): CellFormat | undefined {
  const number = numberFormatOf(cell, sheet, formats, losses);
  if (!cell.style) return number;
  // One format per number format and style a file holds, as each code is read once (D121).
  const byNumber = joined.get(cell.style) ?? new Map<CellFormat | undefined, CellFormat>();
  joined.set(cell.style, byNumber);
  const known = byNumber.get(number);
  if (known) return known;
  const made = { ...number, ...cell.style };
  byNumber.set(number, made);
  return made;
}

// The formats made of a style and a number format, by the style a reader shares among its cells.
type Joined = Map<CellStyle, Map<CellFormat | undefined, CellFormat>>;

function numberFormatOf(
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

// A sheet's tables' header cells' text as entered (their column names, D443), by row and column id.
function headerText(m: Made): CellText {
  const rows = new Set((m.file.tables ?? []).map((t) => t.range.r1));
  const text = new Map<string, string>();
  if (rows.size === 0) return () => undefined;
  for (const cell of m.file.cells) {
    if (!rows.has(cell.r) || cell.formula !== undefined || !cell.value) continue;
    const v = cell.value;
    if (v.k === 'e') continue;
    const shown = v.k === 'b' ? (v.v ? 'TRUE' : 'FALSE') : String(v.v);
    text.set(`${m.layout.rows[cell.r]},${m.layout.cols[cell.c]}`, shown);
  }
  return (r, c) => text.get(`${r},${c}`);
}

// A pivot table read from another app's standard form, its hidden items matched to its source's cells as they show.
function hidesResolved(
  p: FilePivot,
  own: FileSheet,
  sheets: readonly FileSheet[],
  formats: FormatsRead,
  locale: string,
): FilePivot {
  if (!p.hides) return p;
  // The readers name only sheets the file holds.
  const source = p.source.sheet === null ? own : sheets.find((s) => s.name === p.source.sheet)!;
  const cells = new Map(source.cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
  const cellAt = (r: number, c: number) => cells.get(`${r},${c}`)?.value ?? null;
  return pivotHidesResolved(p, cellAt, (r, c) => {
    const cell = cells.get(`${r},${c}`);
    const v = cell?.value;
    if (!v) return '';
    const read = cell.format === undefined ? undefined : formats(cell.format);
    const format = read?.ok ? read.format : undefined;
    return displayValue(v.k === 'e' ? err(v.v) : v.v, format, locale).text;
  });
}

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

// The kept content with what LiveDoc read but could not hold, kept as it came; an ODF item sits after the tables.
function keptWith(
  kept: KeptContent | undefined,
  refused: readonly KeptItem<FileAt>[],
): KeptContent | undefined {
  if (refused.length === 0) return kept;
  const standard = refused[0]!.place === 'spreadsheet-after' ? 'odf' : 'ooxml';
  return {
    ...(kept ?? { standard, parts: [], relationships: [] }),
    items: [...(kept?.items ?? []), ...refused],
  };
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
  // The file's names on the sheets they cover; one LiveDoc cannot hold is kept as it came (D343).
  const named = namesFromFile(
    file.names,
    made.map((m) => m.layout),
    losses,
  );
  for (const [at, names] of named.names) made[at]!.layout = { ...made[at]!.layout, names };
  // The file's tables on their sheets before any formula is read, so a formula reads them (D447).
  const texts = made.map((m) => headerText(m));
  made.forEach((m, i) => {
    const others = made.filter((o) => o !== m).map((o) => o.layout);
    const making = { sheet: m.title, rand, losses, text: texts[i]!, others };
    const tables = tablesFromFile(m.file.tables, m.layout, making);
    if (tables) m.layout = { ...m.layout, tables };
  });
  const formats = formatsRead(locale);
  const joined: Joined = new Map();
  const handles: SheetHandle[] = made.map((m, i) => ({
    id: m.id,
    title: m.title,
    layout: m.layout,
    text: texts[i]!,
  }));
  const byTitle = (title: string) => {
    const lower = title.toLowerCase();
    return handles.find((h) => h.title.toLowerCase() === lower);
  };
  const byId = (id: string) => handles.find((h) => h.id === id);
  const pictures: PictureToPlace[] = [];
  const sheets = made.map((m, i): SheetFromFile => {
    const own = handles[i]!;
    const table = (name: string) => {
      for (const h of [own, ...handles.filter((x) => x !== own)]) {
        const found = h.layout.tables?.find((t) => sameTableName(t.name, name));
        if (found) return { sheet: h, table: found };
      }
      return null;
    };
    const ctx: SheetsCtx = { own, byTitle, byId, table };
    const cells: SheetFromFile['cells'] = [];
    const cache = blockCachePositions(m.file.cells);
    // A read pivot table's output is the engine's to work out again (D607).
    const pivotCache = pivotCachePositions(m.file.pivots);
    for (const cell of m.file.cells) {
      if (cache.has(`${cell.r},${cell.c}`) || pivotCache.has(`${cell.r},${cell.c}`)) continue;
      const r = m.layout.rows[cell.r];
      const c = m.layout.cols[cell.c];
      if (r === undefined || c === undefined) continue;
      let input: CellInput | null = null;
      if (cell.formula !== undefined) {
        const compiled = compileFormula(cell.formula, { ...ctx, here: cell });
        // A table reference naming no table the file holds is unread: its value stays as the file had it.
        if (compiled.ok && !readsUnknownTable(compiled.formula)) input = { f: compiled.formula };
        else losses.push({ k: 'formula_unread', sheet: m.title, r: cell.r, c: cell.c });
      }
      input ??= cell.value ? literalInput(cell.value) : null;
      const format = cellFormatOf(cell, m.title, formats, losses, joined);
      if (input || format)
        cells.push({ r, c, ...(input ? { i: input } : {}), ...(format ? { f: format } : {}) });
    }
    const formatRules = formatRulesFromFile(
      m.file.formatRules,
      m.layout,
      ctx,
      m.title,
      rand,
      losses,
    );
    const rules = validationRulesFromFile(m.file.validations, m.layout, ctx, m.title, rand, losses);
    const charts = sheetChartsFromFile(m.file.charts, m.layout, rand);
    const pivots = sheetPivotsFromFile(
      m.file.pivots?.map((p) => hidesResolved(p, m.file, file.sheets, formats, locale)),
      m.layout,
      ctx,
      rand,
      new Set(charts.map((x) => x.id)),
    );
    if (pivots.refused > 0) losses.push({ k: 'pivot_changed', sheet: m.title });
    const objects = [...charts, ...pivots.pivots];
    const protections = protectionsFromFile(m.file.protections, m.layout, m.title, rand, losses);
    const making = { sheet: m.title, rand, losses, ctx };
    const filters = filtersFromFile(m.file, m.layout, making);
    // Each table's own filter's conditions, read now the sheet's formulas can be (D481).
    const tables = tableFiltersFromFile(m.file.tables, m.layout, making);
    const layout = {
      ...m.layout,
      ...(tables ? { tables } : {}),
      ...filters,
      ...(protections ? { protections } : {}),
      ...(rules ? { rules } : {}),
      ...(formatRules ? { formatRules } : {}),
      ...(objects.length ? { objects } : {}),
    };
    pictures.push(
      ...picturesToPlace({ id: m.id, title: m.title, layout }, m.file.readPictures, rand, losses),
    );
    return { id: m.id, title: m.title, layout, cells };
  });
  const placing = pictures.length ? { pictures } : {};
  // A named function's reference naming no sheet names the first (D342); one LiveDoc cannot hold is kept as it came.
  const read = handles[0]
    ? functionsFromFile(file.functions, { own: handles[0], byTitle, byId }, losses)
    : { functions: [], refused: [] };
  const functions = read.functions.length ? { functions: read.functions } : {};
  const kept = keptWith(file.kept, [...named.refused, ...read.refused]);
  if (!kept) return { sheets, losses, ...functions, ...placing };
  // Kept content on a sheet, row or column the workbook's limits cut goes with it, counted.
  const stored = storedKept(kept, made);
  if (stored.dropped > 0) losses.push({ k: 'kept_dropped', count: stored.dropped });
  return { sheets, losses, kept: stored.kept, ...functions, ...placing };
}
