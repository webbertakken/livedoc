// An XLSX workbook read into the file model (docs/specs/029-sheets/standard-mapping.md): the OOXML container through
// the shared package's guards (office-packages.md "Reading a package"), its workbook part's sheets in order, each
// worksheet's cells by their type, text from the shared strings, formulas from Excel's grammar into Google's, shared
// formulas unfolded and array blocks kept. What does not fit or cannot be read is named in `losses`.
import {
  attributeOf,
  childElement,
  childElements,
  keptXmlOf,
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
  type XmlBindings,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { SheetLimits } from '../sheet-limits';
import { ERROR_CODES, type ErrorCode } from '../formula/values';
import { fromExcelFormula } from './excel-formula';
import { shiftFormulaText } from './formula-text-shift';
import { isoDateSerial } from './ods-read';
import { FILE_READ_CELLS_MAX } from './file-read-limits';
import type { FileCell, FileLoss, FileRead, FileSheet, FileValue } from './workbook-file';
import { readXlsxCharts } from './xlsx-charts-read';
import { readXlsxCellPictures, type RichCell } from './xlsx-cell-pictures-read';
import { SLICER_CACHE_NAME } from './xlsx-slicers';
import {
  allPlaced,
  keptWithoutSlicers,
  slicerNamesBySheet,
  xlsxSlicersHeld,
  withXlsxSlicers,
} from './xlsx-slicers-read';
import { readXlsxPivots } from './xlsx-pivots-read';
import { allRead, WORKBOOK_READ, WORKSHEET_READ, XlsxKeeper } from './xlsx-kept-read';
import { readXlsxDxfs, readXlsxFormatRules } from './xlsx-format-rules';
import { readXlsxValidations } from './xlsx-validation';
import { liveDocExtOf, readXlsxProtection } from './xlsx-protection';
import { keptTables, readXlsxTableRecord, readXlsxTables } from './xlsx-tables';
import {
  isFilterName,
  readXlsxFilters,
  readXlsxWorkbookViews,
  withXlsxFilters,
  type XlsxFiltersRead,
} from './xlsx-filters-read';
import { protectionsFound } from './file-protections';
import { readThemeColours } from './xlsx-colours';
import {
  dateStyles,
  readCellStyles,
  xlsxStylesDefaultFont,
  type XlsxCellStyle,
} from './xlsx-styles';
import { readXlsxTheme } from './xlsx-theme';
import { readXlsxFunction, type FileFunction } from './file-functions';
import { isExcelOwnName, xlsxRangeName, type FileRangeName } from './file-names';
import { STANDARD_THEME } from '../themes/spreadsheet-theme';
import {
  DATE1904_OFFSET,
  fromXstring,
  OFFICE_RELATIONSHIPS_NS,
  readBlock,
  readCellAddress,
  SPREADSHEETML_NS,
} from './xlsx-parts';
import { readXlsxLines } from './xlsx-lines';
import { cellsLinked, readXlsxHyperlinks } from './xlsx-hyperlinks';
import { cellsNoted, NOTES_RELATIONSHIP, readXlsxNotes, type ReadNote } from './xlsx-notes';
import {
  PERSONS_RELATIONSHIP,
  readXlsxPersons,
  readXlsxThreads,
  THREADS_RELATIONSHIP,
  type ReadThreads,
} from './xlsx-threads';
import { threadsWithinLimits } from './file-threads';
import { readXlsxTabLook } from './xlsx-tab-look';
import { isRichItem, itemText } from './xlsx-cell-text';

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

// A rich string item's children as the file wrote them (D377).
type Runs = readonly { xml: string; ns: XmlBindings }[];

// A rich string item's children, kept; null when it is plain.
const runsOf = (parsed: XmlParsed, item: XmlElement, ns: string): Runs | null =>
  isRichItem(item, ns) ? childElements(item).map((child) => keptXmlOf(parsed, child)) : null;

type Book = {
  ns: string;
  strings: readonly string[];
  // The shared strings' runs, by index, of those that are rich.
  runs: ReadonlyMap<number, Runs>;
  styles: readonly XlsxCellStyle[];
  dates: ReadonlySet<number>;
  date1904: boolean;
  budget: { cells: number };
  losses: FileLoss[];
};

const text = (pkg: OoxmlPackage, part: string | undefined): string | undefined => {
  const bytes = part === undefined ? undefined : pkg.parts.get(part);
  return bytes && new TextDecoder().decode(bytes);
};

// A worksheet's notes, from the notes part its relationships name (standard-mapping.md "Notes in the file"); none
// when it names none, or one that is not there or does not parse.
function sheetNotes(pkg: OoxmlPackage, part: string): ReadNote[] {
  const rel = (pkg.relationships.get(part) ?? []).find(
    (r) => r.type === NOTES_RELATIONSHIP && !r.external,
  );
  const xml = rel && text(pkg, resolvePartName(part, rel.target));
  const parsed = xml === undefined ? null : parseXml(xml);
  return parsed?.ok ? readXlsxNotes(parsed.root) : [];
}

// A worksheet's comment threads, from the threaded comments part its relationships name, and the notes LiveDoc's
// records carried ("Comments in the file", D658); none when it names none, or one that does not parse.
function sheetThreads(
  pkg: OoxmlPackage,
  part: string,
  persons: ReadonlyMap<string, string>,
): ReadThreads {
  const rel = (pkg.relationships.get(part) ?? []).find(
    (r) => r.type === THREADS_RELATIONSHIP && !r.external,
  );
  const xml = rel && text(pkg, resolvePartName(part, rel.target));
  const parsed = xml === undefined ? null : parseXml(xml);
  return parsed?.ok ? readXlsxThreads(parsed.root, persons) : { threads: [], notes: [] };
}

const children = (element: XmlElement | undefined, ns: string, local: string): XmlElement[] =>
  element ? childElements(element).filter((e) => e.uri === ns && e.local === local) : [];

// The shared strings' texts, and the runs of those that are rich.
function sharedStrings(
  pkg: OoxmlPackage,
  part: string | undefined,
  ns: string,
): Pick<Book, 'strings' | 'runs'> {
  const xml = text(pkg, part);
  const parsed = xml === undefined ? undefined : parseXml(xml, part);
  const runs = new Map<number, Runs>();
  if (!parsed?.ok) return { strings: [], runs };
  const items = children(parsed.root, ns, 'si');
  for (const [i, si] of items.entries()) {
    const kept = runsOf(parsed, si, ns);
    if (kept) runs.set(i, kept);
  }
  return { strings: items.map((si) => itemText(si, ns)), runs };
}

function inlineValue(cell: XmlElement, ns: string): FileValue | undefined {
  const is = childElement(cell, ns, 'is');
  const inline = is ? itemText(is, ns) : '';
  return inline ? { k: 's', v: inline } : undefined;
}

// A string cell's runs, when its text is rich (D377): its shared string's, or its inline string's.
function cellRuns(cell: XmlElement, parsed: XmlParsed, book: Book): Runs | null {
  const type = attributeOf(cell, '', 't');
  // An inline string cell holding text has its `is`.
  if (type === 'inlineStr') return runsOf(parsed, childElement(cell, book.ns, 'is')!, book.ns);
  const v = type === 's' ? childElement(cell, book.ns, 'v') : undefined;
  return v ? (book.runs.get(Number(textContent(v))) ?? null) : null;
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
  if ('unknown' in style.number) {
    book.losses.push({ k: 'format_unread', sheet, r: at.r, c: at.c });
    return undefined;
  }
  return style.number.code ?? undefined;
}

// `ruled`: a format rule's style says more than a style holds, named with the cells' (D104). On a sheet that is not
// `guarded` (protected), a style that is not locked says more too.
function readSheet(
  name: string,
  parsed: XmlParsed,
  book: Book,
  ruled: boolean,
  guarded: boolean,
  keepRuns: (at: { r: number; c: number }, runs: Runs) => void,
  // A cell naming a rich value (`vm`), for its picture to be read once every sheet is (D634).
  richCell: (cell: FileCell, vm: number) => void,
): FileSheet {
  const root = parsed.root;
  const cells: FileCell[] = [];
  const shared = new Map<string, Shared>();
  const cache = new Set<string>();
  let cut = false;
  let cellsCut = false;
  let styled = ruled;
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
      const s = Number(attributeOf(cell, '', 's') ?? 0);
      styled ||= (book.styles[s]?.lost ?? false) || (!guarded && book.styles[s]?.unlocked === true);
      const read = cellFormula(cell, at, shared, book, name);
      const value = cellValue(cell, book);
      const format = cellFormat(cell, book, name, at);
      // The file's default style is every cell's: an empty cell in it holds nothing (D203).
      const style = book.styles[s]?.style;
      if (read.cache) cache.add(`${at.r},${at.c}`);
      if (read.formula === undefined && !value && format === undefined && (s === 0 || !style))
        continue;
      const out: FileCell = { ...at };
      if (format !== undefined) out.format = format;
      if (style) out.style = style;
      if (read.formula !== undefined) out.formula = read.formula;
      if (read.spans) out.spans = read.spans;
      if (value) out.value = value;
      const runs =
        value?.k === 's' && read.formula === undefined ? cellRuns(cell, parsed, book) : null;
      if (runs) keepRuns(at, runs);
      const vm = Number(attributeOf(cell, '', 'vm'));
      if (Number.isInteger(vm) && vm > 0) richCell(out, vm);
      cells.push(out);
      book.budget.cells++;
    }
  }
  wrappedBlocks(cells, cache);
  if (cut) book.losses.push({ k: 'sheet_cut', sheet: name, rows: ROWS_MAX, cols: COLS_MAX });
  if (cellsCut) book.losses.push({ k: 'cells_cut', sheet: name });
  // A style saying more than the model holds is named (D104).
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
  const stylesXml = text(pkg, partOf(RELATIONSHIP_TYPES.styles));
  const themeXml = text(pkg, partOf(RELATIONSHIP_TYPES.theme));
  const styles = readCellStyles(stylesXml, locale, themeXml);
  const dxfs = readXlsxDxfs(stylesXml, themeXml);
  // The workbook's theme, its font the file's default (standard-mapping.md "The theme in the file", D218).
  const fileTheme = readXlsxTheme(themeXml, xlsxStylesDefaultFont(stylesXml));
  const theme = readThemeColours(themeXml);
  // The workbook's persons, naming its threads' authors ("Comments in the file").
  const personsXml = text(pkg, partOf(PERSONS_RELATIONSHIP));
  const personsParsed = personsXml === undefined ? null : parseXml(personsXml);
  const persons = personsParsed?.ok
    ? readXlsxPersons(personsParsed.root)
    : new Map<string, string>();
  const book: Book = {
    ns,
    ...sharedStrings(pkg, partOf(RELATIONSHIP_TYPES.sharedStrings), ns),
    styles,
    dates: dateStyles(styles),
    date1904,
    budget: { cells: 0 },
    losses: [],
  };
  const listed = children(childElement(parsed.root, ns, 'sheets'), ns, 'sheet');
  const sheetNames = new Set(listed.map((s) => (attributeOf(s, '', 'name') ?? '').toLowerCase()));
  const sheets: FileSheet[] = [];
  // A Strict file's content is not kept, but named (D108); a Transitional one's is, each sheet's by its place here.
  const keeper = ns === STRICT_NS ? null : new XlsxKeeper(pkg);
  let strictUnread = ns === STRICT_NS ? unreadChildren(parsed.root, WORKBOOK_READ) : 0;
  const placed = new Map<number, number>();
  // Each sheet's record of its tables (standard-mapping.md "Tables in the file"), by its place in `sheets`.
  const tableRecords: ReturnType<typeof readXlsxTableRecord>[] = [];
  // The cells naming rich values, whose pictures are read once every sheet is (D634).
  const richCells: RichCell[] = [];
  // Each sheet's filter and filter views (standard-mapping.md "Filters in the file"), by its place in `sheets`.
  const filterReads: XlsxFiltersRead[] = [];
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
    const rules = readXlsxFormatRules(worksheet.root, ns, dxfs, theme);
    const validations = readXlsxValidations(worksheet.root, ns);
    for (const { r, c } of validations.changed)
      book.losses.push({ k: 'validation_rule_changed', sheet: name, r, c });
    // Its protection (standard-mapping.md "Protection in the file").
    const protection = readXlsxProtection(worksheet.root, ns, (s) => styles[s]?.unlocked === true);
    const found = protectionsFound(protection);
    if (found.changed) book.losses.push({ k: 'protection_changed', sheet: name });
    if (protection.cut) book.losses.push({ k: 'protection_cut', sheet: name });
    const filtered = readXlsxFilters(worksheet.root, ns, liveDocExtOf(worksheet.root, ns));
    filterReads.push(filtered);
    // Its cells' links (standard-mapping.md "Links in the file"), within the workbook by the sheets it lists.
    const hyperlinks = readXlsxHyperlinks(
      worksheet.root,
      ns,
      relsNs,
      pkg.relationships.get(part!) ?? [],
      (title) => sheetNames.has(title.toLowerCase()),
    );
    // Its cells' notes (standard-mapping.md "Notes in the file"): its notes part read, its VML drawing LiveDoc's to
    // write, so its `legacyDrawing` is read too.
    const notes = sheetNotes(pkg, part!);
    const threaded = sheetThreads(pkg, part!, persons);
    const threads = threadsWithinLimits(
      threaded.threads.filter((t) => t.r2 < ROWS_MAX && t.c2 < COLS_MAX),
    ).threads;
    const legacy = childElement(worksheet.root, ns, 'legacyDrawing');
    const read = new Set([
      ...(legacy ? [legacy] : []),
      ...rules.read,
      ...validations.read,
      ...protection.read,
      ...filtered.read,
      ...hyperlinks.read,
    ]);
    tableRecords.push(readXlsxTableRecord(liveDocExtOf(worksheet.root, ns)));
    keeper?.sheetEntry(sheet, sheets.length);
    keeper?.worksheet(worksheet, part!, sheets.length, read);
    strictUnread += keeper
      ? 0
      : unreadChildren(worksheet.root, WORKSHEET_READ) -
        childElements(worksheet.root).filter((e) => read.has(e) || allRead(e, read)).length;
    const index = sheets.length;
    // A cell's rich text is kept on its cell (D377); a Strict file's is named with its other unread content (D108).
    const cells = readSheet(
      name,
      worksheet,
      book,
      rules.styled,
      protection.protected,
      (at, runs) => {
        if (keeper) keeper.cellText(runs, { sheet: index, ...at });
        else strictUnread++;
      },
      (cell, vm) => richCells.push({ sheet: index, cell, vm }),
    );
    cellsLinked(cells.cells, hyperlinks.links, { rows: ROWS_MAX, cols: COLS_MAX });
    cellsNoted(cells.cells, [...notes, ...threaded.notes], { rows: ROWS_MAX, cols: COLS_MAX });
    sheets.push({
      ...cells,
      ...readXlsxTabLook(sheet, worksheet.root, ns),
      ...(rules.rules.length ? { formatRules: rules.rules } : {}),
      ...(validations.rules.length ? { validations: validations.rules } : {}),
      ...(found.protections ? { protections: found.protections } : {}),
      ...(threads.length ? { threads } : {}),
    });
  }
  // Its cells' pictures (standard-mapping.md "Pictures in a cell").
  readXlsxCellPictures(pkg, rels, ns, sheets, richCells, book.losses);
  // The workbook's names: a named LAMBDA is a named function, a cell or rectangle a named range, no longer kept; any
  // other a person gave is kept and named (standard-mapping.md "Named ranges in the file", "Named functions in the file").
  const functions: FileFunction[] = [];
  const names: FileRangeName[] = [];
  const sheetAt = (title: string) => {
    const at = sheets.findIndex((s) => s.name.toLowerCase() === title.toLowerCase());
    return at < 0 ? undefined : at;
  };
  // The filter views' names, by `guid`; their workbook views and the filters' names are LiveDoc's to write again.
  const guids = new Set(filterReads.flatMap((f) => f.views.map((v) => v.guid)));
  const workbookViews = readXlsxWorkbookViews(parsed.root, ns, guids);
  keeper?.workbook(
    parsed,
    pkg.mainPart,
    listed,
    placed,
    (name, kept, scoped) => {
      const own = attributeOf(name, '', 'name');
      if (own && isFilterName(own, guids)) return true;
      // A slicer cache's name is the slicers' (xlsx-slicers-read.ts): kept with them, never a line of its own.
      if (!own || isExcelOwnName(own, name) || SLICER_CACHE_NAME.test(own)) return false;
      const fn = scoped ? null : readXlsxFunction(name, kept);
      const range = scoped || fn ? null : xlsxRangeName(own, name, sheetAt, kept);
      if (fn) functions.push(fn);
      if (range) names.push(range);
      if (fn || range) return true;
      const lambda = /^\s*_xlfn\.LAMBDA\(/i.test(textContent(name));
      book.losses.push({ k: lambda ? 'function_unread' : 'name_unread', name: own });
      return false;
    },
    workbookViews.read,
  );
  keeper?.styles(stylesXml);
  const unread = strictUnread + (keeper?.unread ?? 0);
  if (unread > 0) book.losses.push({ k: 'kept_unread', count: unread });
  if (pkg.dropped.length > 0) book.losses.push({ k: 'entries_dropped', entries: [...pkg.dropped] });
  // The tables of its kept table parts LiveDoc holds are the sheets' own ("Tables in the file").
  const content = keeper?.content();
  const tableParts = keptTables(content);
  const tabled = readXlsxTables(
    sheets,
    content,
    tableRecords,
    names.map((n) => n.name),
    book.losses,
  );
  // Its table slicers, read all or none ("Filters in the file", D489), and the charts of a kept drawing that
  // qualifies, the slicers' anchors beside them ("Charts in the file").
  let held = xlsxSlicersHeld(tabled.kept, tableParts, tabled.sheets);
  let charted = readXlsxCharts(tabled.sheets, tabled.kept, (i) => slicerNamesBySheet(held, i));
  if (held?.readable && !allPlaced(held, charted.slicers)) {
    held = { readable: false, sheets: new Set(held.slicers.map((s) => s.sheet)) };
    charted = readXlsxCharts(tabled.sheets, tabled.kept);
  }
  const sliced = withXlsxSlicers(
    charted.sheets,
    held,
    charted.slicers,
    filterReads.map((f) => f.record?.text),
    book.losses,
  );
  const keptNow =
    held?.readable && charted.kept ? keptWithoutSlicers(charted.kept, held) : charted.kept;
  // Each sheet's filter and views ("Filters in the file"); a table's own filter is its table part's (D481).
  const filtered = sliced.map((sheet, i) =>
    withXlsxFilters(sheet, filterReads[i]!, workbookViews.names, book.losses),
  );
  // Its pivot tables LiveDoc wrote are its own again (standard-mapping.md "Pivot tables in the file").
  const pivoted = readXlsxPivots(filtered, keptNow, book.losses, names);
  const kept = pivoted.kept;
  return {
    ok: true,
    file: {
      sheets: pivoted.sheets,
      ...(kept ? { kept } : {}),
      ...(fileTheme && fileTheme !== STANDARD_THEME ? { theme: fileTheme } : {}),
      ...(functions.length ? { functions } : {}),
      ...(names.length ? { names } : {}),
    },
    losses: book.losses,
  };
}
