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
import { dummyFunction } from './excel-formula';
import { ODS_GENERATOR } from './ods-write';
import {
  cellAddress,
  DYNAMIC_ARRAY_METADATA_XML,
  OFFICE_RELATIONSHIPS_NS,
  SPREADSHEETML_NS,
  STYLES_XML,
  toXstring,
  XLSX_ERRORS,
  XLSX_SHEET_NAME_MAX,
} from './xlsx-parts';
import { cachedLiteral, cutXlsxText, xlsxFormula, type XlsxFormula } from './xlsx-bounds';
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
  private readonly ids = new Map<string, number>();
  private uses = 0;

  id(text: string): number {
    this.uses++;
    const known = this.ids.get(text);
    if (known !== undefined) return known;
    this.ids.set(text, this.ids.size);
    return this.ids.size - 1;
  }

  xml(): string {
    const items = [...this.ids.keys()].map((text) => {
      const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
      return `<si><t${space}>${escapeXmlText(toXstring(text))}</t></si>`;
    });
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
function valueWrite(value: FileValue, inFormula: boolean, ctx: SheetContext): CellWrite {
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
      return inFormula
        ? { type: 'str', value: text }
        : { type: 's', value: String(strings.id(text)) };
    }
  }
}

type SheetContext = {
  strings: SharedStrings;
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
      ...valueWrite(cell.value, true, ctx),
      formula: dummyFunction(COMPUTED_VALUE, cachedLiteral(cell.value)),
    };
  const plan = cell.formula === undefined ? undefined : ctx.excel.get(cell)!;
  const inFormula = plan !== undefined && plan.k !== 'value';
  const cached = cell.value ? valueWrite(cell.value, inFormula, ctx) : {};
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

function cellXml(cell: FileCell, write: CellWrite): string {
  const attrs = [
    `r="${cellAddress(cell.r, cell.c)}"`,
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

function worksheetXml(
  sheet: FileSheet,
  strings: SharedStrings,
  renamed: ReadonlyMap<string, string>,
  losses: FileLoss[],
): { xml: string; dynamic: boolean } {
  // Cells past Excel's last column are left out, and the cut named (D89).
  const ordered = sheet.cells
    .filter((cell) => cell.c < FILE_LAST_COL)
    .sort((a, b) => a.r - b.r || a.c - b.c);
  if (ordered.length < sheet.cells.length)
    losses.push({ k: 'sheet_cut', sheet: sheet.name, rows: sheet.rows, cols: FILE_LAST_COL });
  const ctx: SheetContext = {
    strings,
    excel: new Map(),
    computed: new Set(),
    dynamic: false,
    cut: 0,
  };
  // Every formula first, so each wrapped block's other cells know they cache it, whatever their order.
  for (const cell of ordered) {
    if (cell.formula === undefined) continue;
    const plan = xlsxFormula(cell.formula, cell.value, renamed);
    ctx.excel.set(cell, plan);
    if (plan.k === 'value')
      losses.push({ k: 'formula_unwritten', sheet: sheet.name, r: cell.r, c: cell.c });
    if (plan.k === 'wrapped' && cell.spans) markComputed(cell, ctx.computed);
  }
  const rows = new Map<number, string[]>();
  for (const cell of ordered) {
    const write = cellWrite(cell, ctx);
    if (!write) continue;
    const row = rows.get(cell.r) ?? [];
    row.push(cellXml(cell, write));
    rows.set(cell.r, row);
  }
  if (ctx.cut > 0) losses.push({ k: 'text_cut', sheet: sheet.name, cells: ctx.cut });
  const lines = [...rows].map(([r, cells]) => `<row r="${r + 1}">${cells.join('')}</row>`);
  const last = ordered.at(-1);
  const extent = last
    ? `A1:${cellAddress(
        ordered.reduce((n, c) => Math.max(n, c.r), 0),
        ordered.reduce((n, c) => Math.max(n, c.c), 0),
      )}`
    : 'A1';
  const xml = [
    XML_DECLARATION,
    `<worksheet xmlns="${SPREADSHEETML_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}">`,
    `<dimension ref="${extent}"/>`,
    lines.length > 0 ? ['<sheetData>', ...lines, '</sheetData>'].join('\n') : '<sheetData/>',
    '</worksheet>',
    '',
  ].join('\n');
  return { xml, dynamic: ctx.dynamic };
}

function workbookXml(names: readonly string[]): string {
  const sheets = names.map(
    (name, i) =>
      `<sheet name="${escapeXmlAttribute(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
  );
  return [
    XML_DECLARATION,
    `<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="${OFFICE_RELATIONSHIPS_NS}">`,
    '<workbookPr/>',
    `<sheets>${sheets.join('')}</sheets>`,
    '</workbook>',
    '',
  ].join('\n');
}

/** The workbook as an XLSX file: Excel's workbook, a worksheet per sheet, shared strings and one cell style. */
export function writeXlsx(file: WorkbookFile, title: string): FileWritten<Uint8Array<ArrayBuffer>> {
  const losses: FileLoss[] = [];
  const renamed = excelNames(file.sheets, losses);
  const strings = new SharedStrings();
  let dynamic = false;
  const sheetParts = file.sheets.map((sheet, i): OoxmlPart => {
    const written = worksheetXml(sheet, strings, renamed, losses);
    dynamic ||= written.dynamic;
    return {
      name: `xl/worksheets/sheet${i + 1}.xml`,
      contentType: OOXML_CONTENT_TYPES.worksheet,
      data: encode(written.xml),
    };
  });
  const names = file.sheets.map((s) => renamed.get(s.name) ?? s.name);
  const workbookRels: Relationship[] = sheetParts.map((part, i) => ({
    id: `rId${i + 1}`,
    type: RELATIONSHIP_TYPES.worksheet,
    target: part.name.slice('xl/'.length),
  }));
  const more = (type: string, target: string) =>
    workbookRels.push({ id: `rId${workbookRels.length + 1}`, type, target });
  more(RELATIONSHIP_TYPES.styles, 'styles.xml');
  more(RELATIONSHIP_TYPES.sharedStrings, 'sharedStrings.xml');
  if (dynamic) more(RELATIONSHIP_TYPES.sheetMetadata, 'metadata.xml');
  const xmlPart = (name: string, contentType: string, xml: string): OoxmlPart => ({
    name,
    contentType,
    data: encode(`${XML_DECLARATION}\n${xml}\n`),
  });
  const parts: OoxmlPart[] = [
    {
      name: 'xl/workbook.xml',
      contentType: OOXML_CONTENT_TYPES.spreadsheet,
      data: encode(workbookXml(names)),
    },
    ...sheetParts,
    xmlPart('xl/styles.xml', OOXML_CONTENT_TYPES.spreadsheetStyles, STYLES_XML),
    xmlPart('xl/sharedStrings.xml', OOXML_CONTENT_TYPES.sharedStrings, strings.xml()),
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
  const relationships = new Map<string, readonly Relationship[]>([
    [
      '',
      [
        { id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' },
        { id: 'rId2', type: RELATIONSHIP_TYPES.coreProperties, target: 'docProps/core.xml' },
        { id: 'rId3', type: RELATIONSHIP_TYPES.extendedProperties, target: 'docProps/app.xml' },
      ],
    ],
    ['xl/workbook.xml', workbookRels],
  ]);
  return { data: writeOoxmlPackage(parts, relationships), losses };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
