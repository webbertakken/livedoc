// A workbook written as XLSX (docs/specs/029-sheets/standard-mapping.md "What the model holds, and where each format
// keeps it"): a SpreadsheetML workbook part naming a worksheet part per sheet, text in the shared strings, formulas in
// Excel's grammar beside their cached values, and a spilled formula as a dynamic array. Same workbook, same bytes.
import {
  escapeXmlAttribute,
  escapeXmlText,
  OOXML_CONTENT_TYPES,
  ooxmlAppXml,
  ooxmlCoreXml,
  RELATIONSHIP_TYPES,
  statisticsOf,
  writeOoxmlPackage,
  XML_DECLARATION,
  type OoxmlPart,
  type Relationship,
} from '@livedoc/office-packages';
import { SheetName } from '../workbook/sheet-name';
import { FILE_LAST_COL } from './a1-text';
import { xlsxLinesOut } from './xlsx-lines';
import { dummyFunction } from './excel-formula';
import { ODS_GENERATOR } from './ods-write';
import {
  cellAddress,
  DYNAMIC_ARRAY_METADATA_XML,
  OFFICE_RELATIONSHIPS_NS,
  SPREADSHEETML_NS,
  toXstring,
  XLSX_ERRORS,
  XLSX_SHEET_NAME_MAX,
} from './xlsx-parts';
import { cachedLiteral, cutXlsxText, xlsxFormula, type XlsxFormula } from './xlsx-bounds';
import { ownIds, XlsxKeptWriter } from './xlsx-kept-write';
import { xlsxChartParts } from './xlsx-chart-parts';
import {
  keptBesideOwnTables,
  withTextHeaders,
  xlsxTableParts,
  xlsxTablesOf,
  type XlsxTableParts,
} from './xlsx-tables';
import { tableFormulaName } from '../tables/table';
import { xlsxPivotParts } from './xlsx-pivots';
import { xlsxTabColor } from './xlsx-tab-look';
import { XlsxStyles } from './xlsx-styles';
import { xlsxFormatRulesXml } from './xlsx-format-rules';
import { xlsxValidationsXml } from './xlsx-validation';
import { liveDocExtXml, xlsxProtectionXml } from './xlsx-protection';
import { xlsxFiltersOut, type XlsxFiltersOut } from './xlsx-filters';
import { xlsxThemeXml } from './xlsx-theme';
import { xlsxFunctionNames } from './file-functions';
import { namesToWrite, xlsxNameXml } from './file-names';
import { themeOf } from '../themes/spreadsheet-theme';
import type {
  FileCell,
  FileLoss,
  FileSheet,
  FileValue,
  FileWritten,
  WorkbookFile,
} from './workbook-file';

// The text a wrapped formula's block caches in its other cells, as Google Sheets writes it (S5).
const COMPUTED_VALUE = '="COMPUTED_VALUE"';

/** Text, numbered in order of first use (standard-mapping.md "Values in XLSX"). */
class SharedStrings {
  // Each item's XML (its `si`'s children) by its number.
  private readonly ids = new Map<string, number>();
  private uses = 0;

  // A plain text's number.
  id(text: string): number {
    const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
    return this.item(`<t${space}>${escapeXmlText(toXstring(text))}</t>`);
  }

  // A kept rich text's number, its runs as the file wrote them (D377).
  rich(runs: string): number {
    return this.item(runs);
  }

  private item(xml: string): number {
    this.uses++;
    const known = this.ids.get(xml);
    if (known !== undefined) return known;
    this.ids.set(xml, this.ids.size);
    return this.ids.size - 1;
  }

  xml(): string {
    const items = [...this.ids.keys()].map((xml) => `<si>${xml}</si>`);
    return `<sst xmlns="${SPREADSHEETML_NS}" count="${this.uses}" uniqueCount="${this.ids.size}">${items.join('')}</sst>`;
  }
}

/** Each sheet's name as Excel holds it: at most 31 characters, unique, case aside (D84); each renamed one a loss. */
export function excelNames(sheets: readonly FileSheet[], losses: FileLoss[]): Map<string, string> {
  const renamed = new Map<string, string>();
  const taken: string[] = [];
  for (const sheet of sheets) {
    const short = [...sheet.name].length <= XLSX_SHEET_NAME_MAX;
    const name = short ? sheet.name : fitExcel(sheet.name, taken);
    taken.push(name);
    if (name !== sheet.name) {
      renamed.set(sheet.name, name);
      losses.push({ k: 'sheet_renamed', from: sheet.name, to: name });
    }
  }
  return renamed;
}

// A name cut to Excel's length, then numbered as a taken name is, the number within the length too.
function fitExcel(name: string, taken: readonly string[]): string {
  const cut = (text: string, max: number) => [...text].slice(0, max).join('').trimEnd();
  const fitted = SheetName.fit(cut(name, XLSX_SHEET_NAME_MAX), taken);
  if ([...fitted].length <= XLSX_SHEET_NAME_MAX) return fitted;
  const suffix = fitted.slice(fitted.lastIndexOf(' '));
  return `${cut(name, XLSX_SHEET_NAME_MAX - suffix.length)}${suffix}`;
}

type CellWrite = { type?: string; formula?: string; array?: string; value?: string };

// A value as a cell holds it: a number as is, text shared (a formula's inline) and cut to Excel's length (D89), an
// error Excel knows as one (D82).
function valueWrite(
  value: FileValue,
  inFormula: boolean,
  ctx: SheetContext,
  at: { r: number; c: number },
): CellWrite {
  const { strings } = ctx;
  switch (value.k) {
    case 'n':
      return { value: String(value.v) };
    case 'b':
      return { type: 'b', value: value.v ? '1' : '0' };
    case 'e':
      if (XLSX_ERRORS.has(value.v)) return { type: 'e', value: value.v };
      return inFormula
        ? { type: 'str', value: value.v }
        : { type: 's', value: String(strings.id(value.v)) };
    case 's': {
      const text = cutXlsxText(value.v);
      if (text !== value.v) ctx.cut++;
      if (inFormula) return { type: 'str', value: text };
      // A cell's kept rich text while its text reads the same; else its own (D377).
      const kept = ctx.richText(at.r, at.c);
      const id = kept?.reads === value.v ? strings.rich(kept.xml) : strings.id(text);
      return { type: 's', value: String(id) };
    }
  }
}

type SheetContext = {
  strings: SharedStrings;
  // A cell's kept rich text (D377).
  richText: (r: number, c: number) => { reads: string; xml: string } | null;
  // Each formula as Excel holds it (D89).
  excel: Map<FileCell, XlsxFormula>;
  // The positions a wrapped formula's block caches (`"r,c"`).
  computed: Set<string>;
  dynamic: boolean;
  // Texts cut to Excel's length.
  cut: number;
};

function cellWrite(cell: FileCell, ctx: SheetContext): CellWrite | null {
  if (cell.value && ctx.computed.has(`${cell.r},${cell.c}`))
    return {
      ...valueWrite(cell.value, true, ctx, cell),
      formula: dummyFunction(COMPUTED_VALUE, cachedLiteral(cell.value)),
    };
  const plan = cell.formula === undefined ? undefined : ctx.excel.get(cell)!;
  const inFormula = plan !== undefined && plan.k !== 'value';
  const cached = cell.value ? valueWrite(cell.value, inFormula, ctx, cell) : {};
  if (!inFormula) return cell.value ? cached : null;
  if (plan.k === 'wrapped' || !cell.spans) return { ...cached, formula: plan.text };
  ctx.dynamic = true;
  // A block spilling past Excel's last column is written to it (D89).
  const cols = Math.min(cell.spans.cols, FILE_LAST_COL - cell.c);
  const last = cellAddress(cell.r + cell.spans.rows - 1, cell.c + cols - 1);
  return { ...cached, formula: plan.text, array: `${cellAddress(cell.r, cell.c)}:${last}` };
}

function markComputed(cell: FileCell, computed: Set<string>): void {
  const { rows, cols } = cell.spans!;
  for (let dr = 0; dr < rows; dr++)
    for (let dc = 0; dc < cols; dc++)
      if (dr > 0 || dc > 0) computed.add(`${cell.r + dr},${cell.c + dc}`);
}

function cellXml(cell: FileCell, write: CellWrite, style: number): string {
  const attrs = [
    `r="${cellAddress(cell.r, cell.c)}"`,
    ...(style > 0 ? [`s="${style}"`] : []),
    ...(write.type ? [`t="${write.type}"`] : []),
    ...(write.array ? ['cm="1"'] : []),
  ];
  const formula =
    write.formula === undefined
      ? ''
      : write.array
        ? `<f t="array" ref="${write.array}">${escapeXmlText(write.formula)}</f>`
        : `<f>${escapeXmlText(write.formula)}</f>`;
  const value = write.value === undefined ? '' : `<v>${escapeXmlText(toXstring(write.value))}</v>`;
  return `<c ${attrs.join(' ')}>${formula}${value}</c>`;
}

// The bindings every root LiveDoc writes declares: SpreadsheetML's, and relationships' as `r`.
const OWN_NS = { '': SPREADSHEETML_NS, r: OFFICE_RELATIONSHIPS_NS };

// What the workbook's other parts give a worksheet: its drawing's relationship, its tables' `tableParts` and record,
// its filter's and views' children and record.
type SheetParts = {
  drawingRelId: string | null;
  tables: XlsxTableParts['sheets'][number];
  filters: XlsxFiltersOut;
};

function worksheetXml(
  sheet: FileSheet,
  index: number,
  book: {
    strings: SharedStrings;
    styles: XlsxStyles;
    kept: XlsxKeptWriter;
    // The workbook's tables' formula names, upper case.
    tables: ReadonlySet<string>;
  },
  renamed: ReadonlyMap<string, string>,
  losses: FileLoss[],
  parts: SheetParts,
): { xml: string; dynamic: boolean } {
  const { strings, styles, kept } = book;
  const { drawingRelId } = parts;
  // A table's header cells hold its column names (D452).
  const cells = withTextHeaders(sheet);
  // Cells past Excel's last column are left out, and the cut named (D89).
  const ordered = cells
    .filter((cell) => cell.c < FILE_LAST_COL)
    .sort((a, b) => a.r - b.r || a.c - b.c);
  if (ordered.length < cells.length)
    losses.push({ k: 'sheet_cut', sheet: sheet.name, rows: sheet.rows, cols: FILE_LAST_COL });
  const ctx: SheetContext = {
    strings,
    richText: (r, c) => kept.cellText(index, r, c),
    excel: new Map(),
    computed: new Set(),
    dynamic: false,
    cut: 0,
  };
  // Every formula first, so each wrapped block's other cells know they cache it, whatever their order.
  for (const cell of ordered) {
    if (cell.formula === undefined) continue;
    const plan = xlsxFormula(cell.formula, cell.value, renamed, book.tables);
    ctx.excel.set(cell, plan);
    if (plan.k === 'value')
      losses.push({ k: 'formula_unwritten', sheet: sheet.name, r: cell.r, c: cell.c });
    if (plan.k === 'wrapped' && cell.spans) markComputed(cell, ctx.computed);
  }
  const rows = new Map<number, string[]>();
  for (const cell of ordered) {
    // A cell with a format and nothing else keeps it, as an empty styled cell.
    const write = cellWrite(cell, ctx) ?? (cell.format === undefined && !cell.style ? null : {});
    if (!write) continue;
    const row = rows.get(cell.r) ?? [];
    row.push(cellXml(cell, write, styles.xf(cell.format, cell.style)));
    rows.set(cell.r, row);
  }
  if (ctx.cut > 0) losses.push({ k: 'text_cut', sheet: sheet.name, cells: ctx.cut });
  // Rows with attributes of their own (a size, hidden, a group) are written too, with or without cells.
  const shape = sheet.lines ? xlsxLinesOut(sheet.lines, sheet.rows, sheet.cols) : null;
  for (const r of shape?.rows.keys() ?? []) if (!rows.has(r)) rows.set(r, []);
  const lines = [...rows]
    .sort(([a], [b]) => a - b)
    .map(([r, cells]) => `<row r="${r + 1}"${shape?.rows.get(r) ?? ''}>${cells.join('')}</row>`);
  const last = ordered.at(-1);
  const extent = last
    ? `A1:${cellAddress(
        ordered.reduce((n, c) => Math.max(n, c.r), 0),
        ordered.reduce((n, c) => Math.max(n, c.c), 0),
      )}`
    : 'A1';
  const validations = xlsxValidationsXml(sheet.validations, renamed);
  // Its protection (standard-mapping.md "Protection in the file"), its record in LiveDoc's one `ext`.
  const protection = xlsxProtectionXml(sheet.protections);
  const ext = liveDocExtXml(
    validations.ext,
    protection.record,
    parts.tables?.record ?? null,
    parts.filters.record,
  );
  const own = [
    { name: 'dimension', xml: `<dimension ref="${extent}"/>` },
    ...(shape ? [{ name: 'sheetFormatPr', xml: shape.sheetFormatPr }] : []),
    ...(shape?.cols ? [{ name: 'cols', xml: shape.cols }] : []),
    {
      name: 'sheetData',
      xml: lines.length > 0 ? ['<sheetData>', ...lines, '</sheetData>'].join('\n') : '<sheetData/>',
    },
    ...protection.own,
    // Its filter and filter views (standard-mapping.md "Filters in the file").
    ...parts.filters.own,
    // Format rules after the kept ones' priorities, so a kept rule draws first (D215).
    ...xlsxFormatRulesXml(
      sheet.formatRules,
      kept.priorityMax(index) + 1,
      (style) => styles.dxf(style),
      renamed,
    ),
    ...(validations.validations.length
      ? [
          {
            name: 'dataValidations',
            xml: `<dataValidations count="${validations.validations.length}">${validations.validations.join('')}</dataValidations>`,
          },
        ]
      : []),
    // Its charts, through its drawing part (standard-mapping.md "Charts in the file").
    ...(drawingRelId ? [{ name: 'drawing', xml: `<drawing r:id="${drawingRelId}"/>` }] : []),
    // Its tables, through their table parts (standard-mapping.md "Tables in the file").
    ...(parts.tables ? [{ name: 'tableParts', xml: parts.tables.tableParts }] : []),
    // LiveDoc's exact validation rules, protections and tables ("Validation in the file", "Protection in the file").
    ...(ext ? [{ name: 'extLst', xml: `<extLst>${ext}</extLst>` }] : []),
  ];
  const rootNs = kept.rootBindings('worksheet', OWN_NS, index);
  const xml = [
    XML_DECLARATION,
    `<worksheet xmlns="${SPREADSHEETML_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}"${kept.rootAttributes('worksheet', OWN_NS, index)}>`,
    ...kept.worksheetChildren(
      index,
      own,
      rootNs,
      sheetPrOwn(sheet.tabColour, shape?.outlinePr ?? null),
    ),
    '</worksheet>',
    '',
  ].join('\n');
  return { xml, dynamic: ctx.dynamic };
}

// A worksheet's own `sheetPr` children, in the schema's order: its tab colour, then its `outlinePr`; null for none.
function sheetPrOwn(
  tabColour: string | undefined,
  outlinePr: string | null,
): ((prefix: string) => string) | null {
  if (!tabColour && outlinePr === null) return null;
  return (p) =>
    (tabColour ? xlsxTabColor(tabColour, p) : '') +
    (outlinePr === null ? '' : `<${p}outlinePr${outlinePr}/>`);
}

// The workbook's sheets, a hidden one's state said; a first sheet hidden makes the first shown the open one, unless
// a kept view says which (standard-mapping.md "Sheet name, hidden, tab colour").
function workbookXml(
  sheetsOf: readonly { name: string; hidden: boolean }[],
  ids: readonly string[],
  kept: XlsxKeptWriter,
  functions: ReturnType<typeof definedNames>,
  pivotCaches: readonly string[],
  views: readonly string[],
): string {
  const sheets = sheetsOf.map(
    ({ name, hidden }, i) =>
      `<sheet name="${escapeXmlAttribute(name)}" sheetId="${i + 1}"${hidden ? ' state="hidden"' : ''}${kept.sheetAttributes(i)} r:id="${ids[i]}"/>`,
  );
  const first = kept.firstShown;
  const own = [
    { name: 'workbookPr', xml: '<workbookPr/>' },
    ...(first > 0 && !kept.keepsWorkbookChild('bookViews')
      ? [{ name: 'bookViews', xml: `<bookViews><workbookView activeTab="${first}"/></bookViews>` }]
      : []),
    { name: 'sheets', xml: `<sheets>${sheets.join('')}</sheets>` },
  ];
  return [
    XML_DECLARATION,
    `<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}"${kept.rootAttributes('workbook', OWN_NS)}>`,
    ...kept.workbookChildren(
      own,
      kept.rootBindings('workbook', OWN_NS),
      functions,
      pivotCaches,
      views,
    ),
    '</workbook>',
    '',
  ].join('\n');
}

// The workbook's own defined names as XML, and the names they take (upper case): its named ranges, then its named
// functions (standard-mapping.md "Named ranges in the file", "Named functions in the file").
function definedNames(
  file: WorkbookFile,
  renamed: ReadonlyMap<string, string>,
  losses: FileLoss[],
): { names: string[]; taken: Set<string> } {
  const titles = file.sheets.map((s) => renamed.get(s.name) ?? s.name);
  const ranges = namesToWrite(file.names, true, losses);
  const taken = new Set(ranges.map((n) => n.name.toUpperCase()));
  const functions = xlsxFunctionNames(file.functions, renamed, losses, taken);
  return {
    names: [...ranges.map((n) => xlsxNameXml(n, titles)), ...functions.names],
    taken: new Set([...taken, ...functions.taken]),
  };
}

/** The workbook as an XLSX file: Excel's workbook, a worksheet per sheet, shared strings and one cell style. */
export function writeXlsx(file: WorkbookFile, title: string): FileWritten<Uint8Array<ArrayBuffer>> {
  const losses: FileLoss[] = [];
  const renamed = excelNames(file.sheets, losses);
  const strings = new SharedStrings();
  // The workbook's tables; a kept table of one's name gives way to it (D453).
  const tables = new Set(
    file.sheets.flatMap((s) => xlsxTablesOf(s).map((t) => tableFormulaName(t.name).toUpperCase())),
  );
  const beside = keptBesideOwnTables(file.kept, tables);
  if (beside.dropped > 0) losses.push({ k: 'kept_dropped', count: beside.dropped });
  // What the file kept goes back where it sat, its relationships with their ids (standard-mapping.md "Unknown content").
  const kept = new XlsxKeptWriter(
    beside.kept,
    file.sheets.length,
    new Set(file.sheets.flatMap((s, i) => (s.hidden ? [i] : []))),
  );
  const theme = themeOf(file.theme);
  const styles = new XlsxStyles(kept.stylesheet({ '': SPREADSHEETML_NS }), theme.font);
  let dynamic = false;
  const keptParts = kept.parts();
  const drawn = xlsxChartParts(file.sheets, kept, keptParts.parts, renamed, losses);
  const sheetRels = (i: number) => [
    ...kept.relationships('sheet', i),
    ...(drawn.sheets[i]?.rels ?? []),
  ];
  const tabled = xlsxTableParts(file.sheets, beside.kept, keptParts.parts, (i) =>
    ownIds(sheetRels(i)),
  );
  const filters = file.sheets.map((sheet, i) =>
    xlsxFiltersOut(sheet, i, renamed.get(sheet.name) ?? sheet.name),
  );
  // A filter over part of a table is its record's alone (D480): logged with the write's losses, never reported.
  file.sheets.forEach((sheet, i) => {
    if (filters[i]!.beside) losses.push({ k: 'filter_beside_table', sheet: sheet.name });
  });
  const sheetParts = file.sheets.map((sheet, i): OoxmlPart => {
    const written = worksheetXml(sheet, i, { strings, styles, kept, tables }, renamed, losses, {
      drawingRelId: drawn.sheets[i]?.relId ?? null,
      tables: tabled.sheets[i] ?? null,
      filters: filters[i]!,
    });
    dynamic ||= written.dynamic;
    return {
      name: `xl/worksheets/sheet${i + 1}.xml`,
      contentType: OOXML_CONTENT_TYPES.worksheet,
      data: encode(written.xml),
    };
  });
  // The workbook's names: its named ranges, then its named functions as named LAMBDAs, each name once (D344).
  const defined = definedNames(file, renamed, losses);
  // The filters' names after the workbook's own (standard-mapping.md "Filters in the file").
  const functions = { ...defined, names: [...defined.names, ...filters.flatMap((f) => f.names)] };
  const names = file.sheets.map((s) => ({
    name: renamed.get(s.name) ?? s.name,
    hidden: s.hidden === true,
  }));
  const keptWorkbookRels = kept.relationships('workbook');
  const workbookId = ownIds(keptWorkbookRels);
  const workbookRels: Relationship[] = sheetParts.map((part) => ({
    id: workbookId(),
    type: RELATIONSHIP_TYPES.worksheet,
    target: part.name.slice('xl/'.length),
  }));
  const sheetIds = workbookRels.map((r) => r.id);
  const more = (type: string, target: string) =>
    workbookRels.push({ id: workbookId(), type, target });
  more(RELATIONSHIP_TYPES.styles, 'styles.xml');
  more(RELATIONSHIP_TYPES.sharedStrings, 'sharedStrings.xml');
  more(RELATIONSHIP_TYPES.theme, 'theme/theme1.xml');
  if (dynamic) more(RELATIONSHIP_TYPES.sheetMetadata, 'metadata.xml');
  // Its pivot tables, each with its cache (standard-mapping.md "Pivot tables in the file").
  const pivoted = xlsxPivotParts(file.sheets, kept, keptParts.parts, renamed, workbookId, (i) => [
    ...sheetRels(i),
    ...(tabled.sheets[i]?.rels ?? []),
  ]);
  workbookRels.push(...pivoted.caches.rels);
  const xmlPart = (name: string, contentType: string, xml: string): OoxmlPart => ({
    name,
    contentType,
    data: encode(`${XML_DECLARATION}\n${xml}\n`),
  });
  const parts: OoxmlPart[] = [
    {
      name: 'xl/workbook.xml',
      contentType: OOXML_CONTENT_TYPES.spreadsheet,
      data: encode(
        workbookXml(
          names,
          sheetIds,
          kept,
          functions,
          pivoted.caches.entries,
          filters.flatMap((f) => f.views),
        ),
      ),
    },
    ...sheetParts,
    xmlPart('xl/styles.xml', OOXML_CONTENT_TYPES.spreadsheetStyles, styles.xml()),
    xmlPart('xl/sharedStrings.xml', OOXML_CONTENT_TYPES.sharedStrings, strings.xml()),
    // The workbook's theme (standard-mapping.md "The theme in the file").
    xmlPart('xl/theme/theme1.xml', OOXML_CONTENT_TYPES.theme, xlsxThemeXml(theme)),
    ...drawn.parts,
    ...tabled.parts,
    ...pivoted.parts,
    ...(dynamic
      ? [xmlPart('xl/metadata.xml', OOXML_CONTENT_TYPES.sheetMetadata, DYNAMIC_ARRAY_METADATA_XML)]
      : []),
    {
      name: 'docProps/core.xml',
      contentType: OOXML_CONTENT_TYPES.coreProperties,
      data: encode(ooxmlCoreXml({ title })),
    },
    {
      name: 'docProps/app.xml',
      contentType: OOXML_CONTENT_TYPES.extendedProperties,
      data: encode(ooxmlAppXml({}, statisticsOf([]), ODS_GENERATOR)),
    },
  ];
  const keptPackageRels = kept.relationships('package');
  const packageId = ownIds(keptPackageRels);
  const relationships = new Map<string, readonly Relationship[]>([
    [
      '',
      [
        { id: packageId(), type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' },
        { id: packageId(), type: RELATIONSHIP_TYPES.coreProperties, target: 'docProps/core.xml' },
        {
          id: packageId(),
          type: RELATIONSHIP_TYPES.extendedProperties,
          target: 'docProps/app.xml',
        },
        ...keptPackageRels,
      ],
    ],
    ['xl/workbook.xml', [...workbookRels, ...keptWorkbookRels]],
    ...sheetParts.map((part, i): [string, Relationship[]] => [
      part.name,
      [...sheetRels(i), ...(tabled.sheets[i]?.rels ?? []), ...(pivoted.sheets[i] ?? [])],
    ]),
    ...drawn.relationships,
    ...pivoted.relationships,
    ...keptParts.relationships,
  ]);
  // A kept workbook name a named function took is dropped, and counted (D341).
  if (kept.namesDropped > 0) losses.push({ k: 'kept_dropped', count: kept.namesDropped });
  return { data: writeOoxmlPackage([...parts, ...keptParts.parts], relationships), losses };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
