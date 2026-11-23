// An XLSX workbook read into the file model (docs/specs/029-sheets/standard-mapping.md): the OOXML container through
// the shared package's guards (office-packages.md "Reading a package"), its workbook part's sheets in order, each
// worksheet's cells by their type, text from the shared strings, formulas from Excel's grammar into Google's, shared
// formulas unfolded and array blocks kept. What does not fit or cannot be read is named in `losses`.
import {
  attributeOf,
  childElement,
  childElements,
  OOXML_CONTENT_TYPES,
  PACKAGE_BUDGETS,
  parseXml,
  readOoxmlPackage,
  refuse,
  RELATIONSHIP_TYPES,
  resolvePartName,
  textContent,
  type OoxmlPackage,
  type PackageBudgets,
  type XmlElement,
} from '@livedoc/office-packages';
import { SheetLimits } from '../sheet-limits';
import { ERROR_CODES, type ErrorCode } from '../formula/values';
import { fromExcelFormula } from './excel-formula';
import { shiftFormulaText } from './formula-text-shift';
import { isoDateSerial } from './ods-read';
import { FILE_READ_CELLS_MAX } from './file-read-limits';
import type { FileCell, FileLoss, FileRead, FileSheet, FileValue } from './workbook-file';
import { WORKBOOK_READ, WORKSHEET_READ, XlsxKeeper } from './xlsx-kept-read';
import { dateStyles, readCellStyles, styledCellStyles, type XlsxCellStyle } from './xlsx-styles';
import {
  DATE1904_OFFSET,
  fromXstring,
  OFFICE_RELATIONSHIPS_NS,
  readBlock,
  readCellAddress,
  SPREADSHEETML_NS,
} from './xlsx-parts';
import { readXlsxLines } from './xlsx-lines';

// A file is read up to a workbook's limits (files-and-print.md "A file sent in parts"): past them it is cut, and said.
const {
  rows: ROWS_MAX,
  cols: COLS_MAX,

  sheets: SHEETS_MAX,
} = SheetLimits.spreadsheet;

const STRICT_NS = 'http://purl.oclc.org/ooxml/spreadsheetml/main';

// A Strict file's children the reader does not read are named, not kept (D108).
const unreadChildren = (root: XmlElement, read: ReadonlySet<string>) =>
  childElements(root).filter((child) => !read.has(child.local)).length;
const STRICT_RELATIONSHIPS_NS = 'http://purl.oclc.org/ooxml/officeDocument/relationships';
const ERRORS: readonly string[] = ERROR_CODES;
// The formula a wrapped block's other cells hold (S5): they only cache its values.
const COMPUTED_VALUE = '="COMPUTED_VALUE"';

const SPREADSHEET_TYPES: ReadonlySet<string> = new Set([
  OOXML_CONTENT_TYPES.spreadsheet,
  OOXML_CONTENT_TYPES.spreadsheetTemplate,
  OOXML_CONTENT_TYPES.macroSpreadsheet,
]);

type Book = {
  ns: string;
  strings: readonly string[];
  styles: readonly XlsxCellStyle[];
  dates: ReadonlySet<number>;
  styled: ReadonlySet<number>;
  date1904: boolean;
  budget: { cells: number };
  losses: FileLoss[];
};

const text = (pkg: OoxmlPackage, part: string | undefined): string | undefined => {
  const bytes = part === undefined ? undefined : pkg.parts.get(part);
  return bytes && new TextDecoder().decode(bytes);
};

const children = (element: XmlElement | undefined, ns: string, local: string): XmlElement[] =>
  element ? childElements(element).filter((e) => e.uri === ns && e.local === local) : [];

// A string item's text: its own `t`, or its runs' `t`s; phonetic guides are not its text.
function itemText(item: XmlElement, ns: string): string {
  const own = childElement(item, ns, 't');
  const runs = children(item, ns, 'r').map((r) => childElement(r, ns, 't'));
  return fromXstring([own, ...runs].map((t) => (t ? textContent(t) : '')).join(''));
}

function sharedStrings(pkg: OoxmlPackage, part: string | undefined, ns: string): string[] {
  const xml = text(pkg, part);
  const parsed = xml === undefined ? undefined : parseXml(xml, part);
  return parsed?.ok ? children(parsed.root, ns, 'si').map((si) => itemText(si, ns)) : [];
}

function inlineValue(cell: XmlElement, ns: string): FileValue | undefined {
  const is = childElement(cell, ns, 'is');
  const inline = is ? itemText(is, ns) : '';
  return inline ? { k: 's', v: inline } : undefined;
}

function cellValue(cell: XmlElement, book: Book): FileValue | undefined {
  const type = attributeOf(cell, '', 't') ?? 'n';
  if (type === 'inlineStr') return inlineValue(cell, book.ns);
  const v = childElement(cell, book.ns, 'v');
  const raw = v ? textContent(v) : '';
  if (raw === '') return undefined;
  switch (type) {
    case 'n': {
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(n)) return undefined;
      const date = book.date1904 && book.dates.has(Number(attributeOf(cell, '', 's') ?? 0));
      return { k: 'n', v: date ? n + DATE1904_OFFSET : n };
    }
    case 's': {
      const shared = book.strings[Number(raw)];
      return shared ? { k: 's', v: shared } : undefined;
    }
    case 'str':
      return { k: 's', v: fromXstring(raw) };
    case 'b':
      return { k: 'b', v: raw === '1' || raw === 'true' };
    case 'e':
      return ERRORS.includes(raw) ? { k: 'e', v: raw as ErrorCode } : undefined;
    case 'd': {
      const serial = isoDateSerial(raw);
      return serial === null ? undefined : { k: 'n', v: serial };
    }
    default:
      return undefined;
  }
}

type Shared = { r: number; c: number; formula: string };

// A cell's formula in Google's syntax, with the block it fills; `cache` when it only caches a wrapped block.
function cellFormula(
  cell: XmlElement,
  at: { r: number; c: number },
  shared: Map<string, Shared>,
  book: Book,
  sheet: string,
): { formula?: string; spans?: FileCell['spans']; cache?: true } {
  const f = childElement(cell, book.ns, 'f');
  if (!f) return {};
  const kind = attributeOf(f, '', 't') ?? 'normal';
  const body = textContent(f);
  const unread = () => {
    book.losses.push({ k: 'formula_unread', sheet, r: at.r, c: at.c });
    return {};
  };
  if (kind === 'dataTable') return unread();
  let formula: string | null;
  if (kind === 'shared' && body.trim() === '') {
    const first = shared.get(attributeOf(f, '', 'si') ?? '');
    if (!first) return unread();
    formula = shiftFormulaText(first.formula, at.r - first.r, at.c - first.c);
  } else formula = fromExcelFormula(body);
  if (formula === null) return unread();
  if (formula === COMPUTED_VALUE) return { cache: true };
  if (kind === 'shared') {
    const si = attributeOf(f, '', 'si');
    if (si !== undefined && body.trim() !== '') shared.set(si, { ...at, formula });
  }
  const block = kind === 'array' ? readBlock(attributeOf(f, '', 'ref') ?? '', at) : null;
  return block && block.rows * block.cols > 1 ? { formula, spans: block } : { formula };
}

// A wrapped formula's block, from the cells caching it to its right and below (S5 writes no block of its own).
function wrappedBlocks(cells: FileCell[], cache: ReadonlySet<string>): void {
  if (cache.size === 0) return;
  for (const cell of cells) {
    if (cell.formula === undefined || cell.spans) continue;
    let cols = 1;
    while (cache.has(`${cell.r},${cell.c + cols}`)) cols++;
    let rows = 1;
    while (cache.has(`${cell.r + rows},${cell.c}`)) rows++;
    if (rows * cols > 1) cell.spans = { rows, cols };
  }
}

// A cell's number format, as its style's code; a style the file does not define is a named loss.
function cellFormat(
  cell: XmlElement,
  book: Book,
  sheet: string,
  at: { r: number; c: number },
): string | undefined {
  const style = book.styles[Number(attributeOf(cell, '', 's') ?? 0)];
  if (!style) return undefined;
  if ('unknown' in style) {
    book.losses.push({ k: 'format_unread', sheet, r: at.r, c: at.c });
    return undefined;
  }
  return style.code ?? undefined;
}

function readSheet(name: string, root: XmlElement, book: Book): FileSheet {
  const cells: FileCell[] = [];
  const shared = new Map<string, Shared>();
  const cache = new Set<string>();
  let cut = false;
  let cellsCut = false;
  let styled = false;
  let nextRow = 0;
  for (const row of children(childElement(root, book.ns, 'sheetData'), book.ns, 'row')) {
    const r = Number(attributeOf(row, '', 'r') ?? nextRow + 1) - 1;
    nextRow = r + 1;
    let nextCol = 0;
    for (const cell of children(row, book.ns, 'c')) {
      const address = attributeOf(cell, '', 'r');
      const at = address === undefined ? { r, c: nextCol } : readCellAddress(address);
      if (!at || !Number.isInteger(at.r) || at.r < 0) continue;
      nextCol = at.c + 1;
      if (at.r >= ROWS_MAX || at.c >= COLS_MAX) {
        cut = true;
        continue;
      }
      // However many cells a file holds, it makes at most so many (D121).
      if (book.budget.cells >= FILE_READ_CELLS_MAX) {
        cellsCut = true;
        continue;
      }
      styled ||= book.styled.has(Number(attributeOf(cell, '', 's') ?? 0));
      const read = cellFormula(cell, at, shared, book, name);
      const value = cellValue(cell, book);
      const format = cellFormat(cell, book, name, at);
      if (read.cache) cache.add(`${at.r},${at.c}`);
      if (read.formula === undefined && !value && format === undefined) continue;
      const out: FileCell = { ...at };
      if (format !== undefined) out.format = format;
      if (read.formula !== undefined) out.formula = read.formula;
      if (read.spans) out.spans = read.spans;
      if (value) out.value = value;
      cells.push(out);
      book.budget.cells++;
    }
  }
  wrappedBlocks(cells, cache);
  if (cut) book.losses.push({ k: 'sheet_cut', sheet: name, rows: ROWS_MAX, cols: COLS_MAX });
  if (cellsCut) book.losses.push({ k: 'cells_cut', sheet: name });
  // Formatting past the number format waits for Formatting's mapping: named (D104).
  if (styled) book.losses.push({ k: 'styles_unread', sheet: name });
  const rows = cells.reduce((n, cell) => Math.max(n, cell.r + 1), 0);
  const cols = cells.reduce((n, cell) => Math.max(n, cell.c + 1), 0);
  const lines = readXlsxLines(root, book.ns);
  return lines ? { name, rows, cols, cells, lines } : { name, rows, cols, cells };
}

/**
 * An `.xlsx` (or `.xlsm`, `.xltx`) file's sheets, or the package's named rejection. Excel's built-in short date reads
 * in `locale`'s, as Excel shows it (D92).
 */
export async function readXlsx(
  bytes: Uint8Array<ArrayBuffer>,
  locale = 'en-US',
  budgets: PackageBudgets = PACKAGE_BUDGETS,
): Promise<FileRead> {
  const read = await readOoxmlPackage(bytes, budgets);
  if (!read.ok) return read;
  const pkg = read.package;
  if (!SPREADSHEET_TYPES.has(pkg.mediaType)) return refuse('package_wrong_type');
  const parsed = parseXml(text(pkg, pkg.mainPart)!, pkg.mainPart);
  if (!parsed.ok) return parsed;
  const ns = parsed.root.uri === STRICT_NS ? STRICT_NS : SPREADSHEETML_NS;
  const relsNs = ns === STRICT_NS ? STRICT_RELATIONSHIPS_NS : OFFICE_RELATIONSHIPS_NS;
  const rels = pkg.relationships.get(pkg.mainPart) ?? [];
  const partOf = (type: string) => {
    const rel = rels.find((r) => r.type === type);
    return rel && resolvePartName(pkg.mainPart, rel.target);
  };
  const workbookPr = childElement(parsed.root, ns, 'workbookPr');
  const date1904 = ['1', 'true'].includes(
    (workbookPr && attributeOf(workbookPr, '', 'date1904')) ?? '',
  );
  const styles = readCellStyles(text(pkg, partOf(RELATIONSHIP_TYPES.styles)), locale);
  const book: Book = {
    ns,
    strings: sharedStrings(pkg, partOf(RELATIONSHIP_TYPES.sharedStrings), ns),
    styles,
    dates: dateStyles(styles),
    styled: styledCellStyles(text(pkg, partOf(RELATIONSHIP_TYPES.styles))),
    date1904,
    budget: { cells: 0 },
    losses: [],
  };
  const listed = children(childElement(parsed.root, ns, 'sheets'), ns, 'sheet');
  const sheets: FileSheet[] = [];
  // A Strict file's content is not kept, but named (D108); a Transitional one's is, each sheet's by its place here.
  const keeper = ns === STRICT_NS ? null : new XlsxKeeper(pkg);
  let strictUnread = ns === STRICT_NS ? unreadChildren(parsed.root, WORKBOOK_READ) : 0;
  const placed = new Map<number, number>();
  for (const [at, sheet] of listed.entries()) {
    const name = attributeOf(sheet, '', 'name') ?? '';
    const rel = rels.find((r) => r.id === attributeOf(sheet, relsNs, 'id'));
    // A chart sheet or a dialog sheet holds no cells: named, not read.
    if (rel && rel.type !== RELATIONSHIP_TYPES.worksheet) {
      book.losses.push({ k: 'sheet_unread', sheet: name });
      continue;
    }
    const part = rel && resolvePartName(pkg.mainPart, rel.target);
    // A sheet past the most a workbook holds is never parsed.
    if (sheets.length === SHEETS_MAX) {
      book.losses.push({ k: 'sheets_cut', kept: SHEETS_MAX, had: listed.length });
      break;
    }
    const xml = text(pkg, part);
    if (xml === undefined) return refuse('package_damaged', { entry: part ?? pkg.mainPart });
    const worksheet = parseXml(xml, part);
    if (!worksheet.ok) return worksheet;
    placed.set(at, sheets.length);
    keeper?.sheetEntry(sheet, sheets.length);
    keeper?.worksheet(worksheet, part!, sheets.length);
    strictUnread += keeper ? 0 : unreadChildren(worksheet.root, WORKSHEET_READ);
    sheets.push(readSheet(name, worksheet.root, book));
  }
  keeper?.workbook(parsed, pkg.mainPart, listed, placed);
  keeper?.styles(text(pkg, partOf(RELATIONSHIP_TYPES.styles)));
  const unread = strictUnread + (keeper?.unread ?? 0);
  if (unread > 0) book.losses.push({ k: 'kept_unread', count: unread });
  if (pkg.dropped.length > 0) book.losses.push({ k: 'entries_dropped', entries: [...pkg.dropped] });
  const kept = keeper?.content();
  return { ok: true, file: kept ? { sheets, kept } : { sheets }, losses: book.losses };
}
