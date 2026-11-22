// An ODF spreadsheet read into the file model (docs/specs/029-sheets/standard-mapping.md): an `.ods` package or a
// flat `.fods`, through the shared package's guards (office-packages.md "Reading a package"). Each `table:table` is
// a sheet; rows and cells unfold their repeats up to the grid's ceiling; values by their value type; formulas from
// OpenFormula into Google's syntax. What does not fit or cannot be read is named in `losses`, never dropped silently.
import {
  attributeOf,
  childElement,
  childElements,
  looksLikeXml,
  ODF_MEDIA_TYPES,
  ODF_NS,
  parseXml,
  readOdfPackage,
  refuse,
  type XmlElement,
  type XmlNode,
  type XmlParsed,
} from '@livedoc/office-packages';
import { serialFromParts } from '../dates';
import { SheetLimits } from '../sheet-limits';
import { ERROR_CODES, type ErrorCode } from '../formula/values';
import { KEPT_REPEAT_MAX, type FileAt, type KeptItem, type KeptPart } from './kept-content';
import { keptOdfParts, keptSettings, OdsKeeper } from './ods-kept-read';
import { odsCellFormats, odsStyledCellStyles, type OdsCellFormats } from './ods-styles';
import { fromOpenFormula } from './open-formula';
import type { FileCell, FileLoss, FileRead, FileSheet, FileValue } from './workbook-file';

// A file is read up to a workbook's limits (files-and-print.md "A file sent in parts"): past them it is cut, and said.
const {
  rows: ROWS_MAX,
  cols: COLS_MAX,
  gridCells: CELLS_MAX,
  sheets: SHEETS_MAX,
} = SheetLimits.spreadsheet;

const { office: OFFICE, table: TABLE, text: TEXT, calcext: CALCEXT } = ODF_NS;
const ERRORS: readonly string[] = ERROR_CODES;

const is = (node: XmlNode, uri: string, local: string): node is XmlElement =>
  typeof node !== 'string' && node.uri === uri && node.local === local;

function repeatOf(element: XmlElement, axis: 'rows' | 'columns'): number {
  const n = Number(attributeOf(element, TABLE, `number-${axis}-repeated`) ?? '1');
  return Number.isInteger(n) && n > 0 ? n : 1;
}

// A cell's text as ODF holds it: its paragraphs as lines, with spaces, tabs and line breaks spelled out.
function inlineText(node: XmlNode): string {
  if (typeof node === 'string') return node;
  if (node.uri === TEXT && node.local === 's') {
    const n = Number(attributeOf(node, TEXT, 'c') ?? '1');
    return ' '.repeat(Number.isInteger(n) && n > 0 ? Math.min(n, 1_000) : 1);
  }
  if (node.uri === TEXT && node.local === 'tab') return '\t';
  if (node.uri === TEXT && node.local === 'line-break') return '\n';
  // Annotations hold a comment's text, not the cell's.
  if (node.uri === OFFICE && node.local === 'annotation') return '';
  return node.children.map(inlineText).join('');
}

function cellText(cell: XmlElement): string {
  return childElements(cell)
    .filter((c) => c.uri === TEXT && c.local === 'p')
    .map(inlineText)
    .join('\n');
}

const ISO_DATE = /^(-?\d{4,})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?))?/;
const ISO_DURATION = /^-?PT?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;

/** An ISO 8601 date or date and time (`2024-03-01T12:00:00`) as a serial, or null. */
export function isoDateSerial(text: string): number | null {
  const m = ISO_DATE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return serialFromParts(
    Number(y),
    Number(mo),
    Number(d),
    Number(h ?? 0),
    Number(mi ?? 0),
    Number(s ?? 0),
  );
}

function durationDays(text: string): number | null {
  const m = ISO_DURATION.exec(text);
  if (!m) return null;
  const [, h, mi, s] = m;
  const days = (Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)) / 86_400;
  return text.startsWith('-') ? -days : days;
}

function numberValue(n: number | null): FileValue | undefined {
  return n !== null && Number.isFinite(n) ? { k: 'n', v: n } : undefined;
}

function cellValue(cell: XmlElement): FileValue | undefined {
  const type = attributeOf(cell, OFFICE, 'value-type');
  const attr = (local: string) => attributeOf(cell, OFFICE, local);
  switch (type) {
    case 'float':
    case 'percentage':
    case 'currency':
      return numberValue(Number(attr('value')));
    case 'date':
      return numberValue(isoDateSerial(attr('date-value') ?? ''));
    case 'time':
      return numberValue(durationDays(attr('time-value') ?? ''));
    case 'boolean':
      return { k: 'b', v: attr('boolean-value') === 'true' };
    case 'string': {
      // LibreOffice caches a formula's error as an empty string marked an error, the error's text in the cell.
      if (attributeOf(cell, CALCEXT, 'value-type') === 'error') {
        const shown = cellText(cell);
        return ERRORS.includes(shown) ? { k: 'e', v: shown as ErrorCode } : { k: 's', v: shown };
      }
      const text = attr('string-value') ?? cellText(cell);
      return text === '' ? undefined : { k: 's', v: text };
    }
    default:
      return undefined;
  }
}

// The rows of a table, wherever ODF groups them (header rows, row groups), in order.
function rowsOf(element: XmlElement): XmlElement[] {
  return childElements(element).flatMap((child) => {
    if (child.uri !== TABLE) return [];
    if (child.local === 'table-row') return [child];
    if (['table-rows', 'table-header-rows', 'table-row-group'].includes(child.local))
      return rowsOf(child);
    return [];
  });
}

// The block an array formula fills, when the file says it fills more than its own cell.
function matrixSpans(cell: XmlElement): FileCell['spans'] {
  const rows = Number(attributeOf(cell, TABLE, 'number-matrix-rows-spanned') ?? 1);
  const cols = Number(attributeOf(cell, TABLE, 'number-matrix-columns-spanned') ?? 1);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return undefined;
  return rows * cols > 1 ? { rows, cols } : undefined;
}

type Budget = { cells: number };

/** The most cells an empty styled cell may repeat over and keep its format (D94): past it, a whole line's format. */
export const ODS_FORMAT_REPEAT_MAX = 1_000;

// What reading a sheet carries along: its name, the losses so far, and the file's cell styles' formats.
type Sheet = {
  name: string;
  losses: FileLoss[];
  formats: OdsCellFormats;
  approximated: Set<string>;
  cut: { formats: boolean };
};

// A style's number format as a code; a format read only approximately is named once a sheet.
function formatOf(styleName: string | undefined, sheet: Sheet): string | undefined {
  const read = styleName === undefined ? null : sheet.formats(styleName);
  if (!read) return undefined;
  if (read.approximate && !sheet.approximated.has(read.code)) {
    sheet.approximated.add(read.code);
    sheet.losses.push({ k: 'format_approximated', sheet: sheet.name, code: read.code });
  }
  return read.code === '' ? undefined : read.code;
}

// Each column's default cell style, by index, up to the grid's ceiling.
function columnStyles(table: XmlElement): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  const walk = (element: XmlElement) => {
    for (const child of childElements(element)) {
      if (child.uri !== TABLE) continue;
      if (child.local === 'table-column') {
        const style = attributeOf(child, TABLE, 'default-cell-style-name');
        const n = Math.min(repeatOf(child, 'columns'), COLS_MAX - out.length);
        for (let k = 0; k < n; k++) out.push(style);
      } else if (
        ['table-columns', 'table-header-columns', 'table-column-group'].includes(child.local)
      )
        walk(child);
    }
  };
  walk(table);
  return out;
}

// A cell's kept content on each cell it repeats over, up to the most a cell keeps it on (D105).
type RowKept = { items: KeptItem<FileAt>[]; c: number; n: number };

// The kept cells of a row, on each of its repeats; `extent` grows to hold them.
function keepRow(
  row: readonly RowKept[],
  r: number,
  rowRepeat: number,
  sheet: number,
  keeper: OdsKeeper,
  extent: { rows: number; cols: number },
) {
  for (const { items, c, n } of row) {
    if (n * rowRepeat > KEPT_REPEAT_MAX) {
      keeper.cut += n * rowRepeat;
      continue;
    }
    const at: Required<FileAt>[] = [];
    for (let dr = 0; dr < rowRepeat && r + dr < ROWS_MAX; dr++)
      for (let dc = 0; dc < n && c + dc < COLS_MAX; dc++) {
        at.push({ sheet, r: r + dr, c: c + dc });
        extent.rows = Math.max(extent.rows, r + dr + 1);
        extent.cols = Math.max(extent.cols, c + dc + 1);
      }
    keeper.place(items, at);
  }
}

// What reading every table carries along: the losses, the cells read so far, the styles' formats and which styles
// format more than the number, and the kept content.
type Book = {
  losses: FileLoss[];
  budget: Budget;
  formats: OdsCellFormats;
  styled: ReadonlySet<string>;
  keeper: OdsKeeper;
};

function readTable(table: XmlElement, index: number, book: Book): FileSheet {
  const { losses, budget, formats, keeper } = book;
  const name = attributeOf(table, TABLE, 'name') ?? '';
  keeper.table(table, index);
  const cutBefore = keeper.cut;
  const extent = { rows: 0, cols: 0 };
  const sheet: Sheet = { name, losses, formats, approximated: new Set(), cut: { formats: false } };
  const columns = columnStyles(table);
  const cells: FileCell[] = [];
  let cut = false;
  let styled = columns.some((style) => book.styled.has(style ?? ''));
  let r = 0;
  for (const row of rowsOf(table)) {
    const rowRepeat = repeatOf(row, 'rows');
    const rowStyle = attributeOf(row, TABLE, 'default-cell-style-name');
    let c = 0;
    const rowCells: FileCell[] = [];
    const rowKept: RowKept[] = [];
    for (const cell of childElements(row)) {
      const isCell = is(cell, TABLE, 'table-cell') || is(cell, TABLE, 'covered-table-cell');
      if (!isCell) continue;
      const colRepeat = repeatOf(cell, 'columns');
      const kept = keeper.cell(cell);
      if (kept.length > 0) rowKept.push({ items: kept, c, n: colRepeat });
      const formulaText = attributeOf(cell, TABLE, 'formula');
      const value = cellValue(cell);
      const own = attributeOf(cell, TABLE, 'style-name');
      styled ||= book.styled.has(own ?? rowStyle ?? '');
      const content = formulaText !== undefined || value !== undefined;
      // An empty cell keeps its own style's format over a few cells; a whole line's is past what the grid holds (D94).
      const ownFormat = content ? undefined : formatOf(own, sheet);
      if (ownFormat !== undefined && rowRepeat * colRepeat > ODS_FORMAT_REPEAT_MAX)
        sheet.cut.formats = true;
      else if (ownFormat !== undefined)
        for (let k = 0; k < colRepeat && c + k < COLS_MAX; k++)
          rowCells.push({ r: 0, c: c + k, format: ownFormat });
      if (content) {
        const formula = formulaText === undefined ? undefined : fromOpenFormula(formulaText);
        const spans = formula ? matrixSpans(cell) : undefined;
        for (let k = 0; k < colRepeat; k++) {
          if (c + k >= COLS_MAX) {
            cut = true;
            break;
          }
          const out: FileCell = { r: 0, c: c + k };
          if (formula) out.formula = formula;
          else if (formulaText !== undefined)
            losses.push({ k: 'formula_unread', sheet: name, r, c: c + k });
          if (spans) out.spans = spans;
          if (value) out.value = value;
          const format = formatOf(own ?? rowStyle ?? columns[c + k], sheet);
          if (format !== undefined) out.format = format;
          rowCells.push(out);
        }
      }
      c += colRepeat;
    }
    if (rowCells.length > 0) {
      for (let k = 0; k < rowRepeat; k++) {
        if (r + k >= ROWS_MAX || budget.cells + rowCells.length > CELLS_MAX) {
          cut = true;
          break;
        }
        budget.cells += rowCells.length;
        for (const cell of rowCells) cells.push({ ...cell, r: r + k });
      }
    }
    keepRow(rowKept, r, rowRepeat, index, keeper, extent);
    r += rowRepeat;
  }
  // The sheet is as big as what it holds, its kept cells too: ODF repeats empty rows and columns to its grid's end.
  const rows = cells.reduce((n, cell) => Math.max(n, cell.r + 1), extent.rows);
  const cols = cells.reduce((n, cell) => Math.max(n, cell.c + 1), extent.cols);
  if (cut) losses.push({ k: 'sheet_cut', sheet: name, rows: ROWS_MAX, cols: COLS_MAX });
  // Formatting past the number format waits for Formatting's mapping: named (D104).
  if (styled) losses.push({ k: 'styles_unread', sheet: name });
  if (keeper.cut > cutBefore)
    losses.push({ k: 'kept_cut', sheet: name, cells: keeper.cut - cutBefore });
  if (sheet.cut.formats || columns.some((style) => formatOf(style, sheet) !== undefined))
    losses.push({ k: 'formats_cut', sheet: name });
  return { name, rows, cols, cells };
}

function readBody(
  parsed: XmlParsed,
  styleRoots: readonly XmlElement[],
  keeper: OdsKeeper,
  parts: KeptPart[],
): FileRead {
  const root = parsed.root;
  const formats = odsCellFormats([root, ...styleRoots]);
  const styled = odsStyledCellStyles([root, ...styleRoots]);
  const spreadsheet = childElement(
    childElement(root, OFFICE, 'body') ?? root,
    OFFICE,
    'spreadsheet',
  );
  if (!spreadsheet) return refuse('package_wrong_type');
  const tables = childElements(spreadsheet).filter((e) => is(e, TABLE, 'table'));
  const losses: FileLoss[] = [];
  const budget: Budget = { cells: 0 };
  keeper.root(root);
  keeper.spreadsheet(spreadsheet);
  const sheets = tables
    .slice(0, SHEETS_MAX)
    .map((t, i) => readTable(t, i, { losses, budget, formats, styled, keeper }));
  if (tables.length > SHEETS_MAX)
    losses.push({ k: 'sheets_cut', kept: SHEETS_MAX, had: tables.length });
  // A file that keeps nothing reads as the model alone.
  if (keeper.items.length === 0 && parts.length === 0)
    return { ok: true, file: { sheets }, losses };
  const kept = { standard: 'odf' as const, items: keeper.items, parts, relationships: [] };
  return { ok: true, file: { sheets, kept }, losses };
}

/** An `.ods` or `.fods` file's sheets, or the package's named rejection. */
export async function readOds(bytes: Uint8Array<ArrayBuffer>): Promise<FileRead> {
  if (looksLikeXml(bytes)) {
    const parsed = parseXml(new TextDecoder().decode(bytes));
    if (!parsed.ok) return parsed;
    const mediaType = attributeOf(parsed.root, OFFICE, 'mimetype');
    if (!is(parsed.root, OFFICE, 'document') || mediaType !== ODF_MEDIA_TYPES.spreadsheet)
      return refuse('package_wrong_type');
    return readBody(parsed, [], new OdsKeeper(parsed), []);
  }
  const opened = await readOdfPackage(bytes);
  if (!opened.ok) return opened;
  const pkg = opened.package;
  if (pkg.mediaType !== ODF_MEDIA_TYPES.spreadsheet) return refuse('package_wrong_type');
  const content = pkg.entries.get('content.xml');
  if (!content) return refuse('package_damaged', { entry: 'content.xml' });
  const parsed = parseXml(new TextDecoder().decode(content), 'content.xml');
  if (!parsed.ok) return parsed;
  // Common styles (a named cell style and its data style) live in styles.xml; an unreadable one gives none.
  const stylesEntry = pkg.entries.get('styles.xml');
  const styles = stylesEntry && parseXml(new TextDecoder().decode(stylesEntry), 'styles.xml');
  const keeper = new OdsKeeper(parsed);
  keeper.items.push(...keptSettings(pkg));
  const read = readBody(
    parsed,
    styles && styles.ok ? [styles.root] : [],
    keeper,
    keptOdfParts(pkg),
  );
  // What the package dropped, as what may run or signs bytes LiveDoc rewrites, is named (D106).
  if (read.ok && pkg.dropped.length > 0)
    read.losses.push({ k: 'entries_dropped', entries: [...pkg.dropped] });
  return read;
}
