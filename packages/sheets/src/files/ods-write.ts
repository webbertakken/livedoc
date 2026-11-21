// A workbook written as ODF (docs/specs/029-sheets/standard-mapping.md "What the model holds, and where each format
// keeps it"): `office:spreadsheet` with a `table:table` per sheet, each cell its value type and value, its formula in
// OpenFormula beside its cached value. One cell a line, attributes in a fixed order, so the same workbook gives the
// same bytes and a changed value is a one-line diff ("The flat form").
import {
  escapeXmlAttribute,
  escapeXmlText,
  ODF_MEDIA_TYPES,
  ODF_NS,
  ODF_VERSION,
  writeOdfPackage,
  XML_DECLARATION,
} from '@livedoc/office-packages';
import { toOpenFormula } from './open-formula';
import type {
  FileCell,
  FileLoss,
  FileSheet,
  FileValue,
  FileWritten,
  WorkbookFile,
} from './workbook-file';

/** The generator every file LiveDoc writes names (office-packages.md "Metadata"). */
export const ODS_GENERATOR = 'LiveDoc';

type Prefix = keyof typeof ODF_NS;

// Each root declares only the namespaces its entry uses (office-packages.md "Writing a package").
const CONTENT_NAMESPACES: readonly Prefix[] = ['office', 'table', 'text', 'of'];
const META_NAMESPACES: readonly Prefix[] = ['office', 'meta', 'dc'];
const FLAT_NAMESPACES: readonly Prefix[] = ['office', 'meta', 'dc', 'table', 'text', 'of'];

function namespaces(prefixes: readonly Prefix[]): string {
  return prefixes.map((p) => `xmlns:${p}="${ODF_NS[p]}"`).join(' ');
}

function valueAttributes(value: FileValue): string {
  switch (value.k) {
    case 'n':
      return `office:value-type="float" office:value="${value.v}"`;
    case 'b':
      return `office:value-type="boolean" office:boolean-value="${value.v}"`;
    case 's':
      return 'office:value-type="string"';
    // ODF has no error value: a formula's error is cached as the text it shows.
    case 'e':
      return 'office:value-type="string"';
  }
}

function shownText(value: FileValue): string {
  switch (value.k) {
    case 'n':
      return String(value.v);
    case 'b':
      return value.v ? 'TRUE' : 'FALSE';
    case 's':
    case 'e':
      return value.v;
  }
}

// One text:p per line, as ODF holds a cell's lines.
function paragraphs(text: string): string {
  return text
    .split('\n')
    .map((line) => `<text:p>${escapeXmlText(line)}</text:p>`)
    .join('');
}

function cellXml(cell: FileCell, sheet: string, losses: FileLoss[]): string {
  const formula = cell.formula === undefined ? null : toOpenFormula(cell.formula);
  if (cell.formula !== undefined && formula === null)
    losses.push({ k: 'formula_unwritten', sheet, r: cell.r, c: cell.c });
  const attrs = [
    ...(formula ? [`table:formula="${escapeXmlAttribute(formula)}"`] : []),
    ...(formula && cell.spans
      ? [
          `table:number-matrix-columns-spanned="${cell.spans.cols}" table:number-matrix-rows-spanned="${cell.spans.rows}"`,
        ]
      : []),
    ...(cell.value ? [valueAttributes(cell.value)] : []),
  ];
  const body = cell.value ? paragraphs(shownText(cell.value)) : '';
  const open = attrs.length > 0 ? `<table:table-cell ${attrs.join(' ')}>` : '<table:table-cell>';
  return `${open}${body}</table:table-cell>`;
}

const repeated = (axis: 'columns' | 'rows', n: number) =>
  n > 1 ? ` table:number-${axis}-repeated="${n}"` : '';

function emptyCells(n: number): string {
  return `<table:table-cell${repeated('columns', n)}/>`;
}

function rowXml(
  cells: readonly FileCell[],
  cols: number,
  sheet: string,
  losses: FileLoss[],
): string[] {
  const lines = ['<table:table-row>'];
  let at = 0;
  for (const cell of cells) {
    if (cell.c > at) lines.push(emptyCells(cell.c - at));
    lines.push(cellXml(cell, sheet, losses));
    at = cell.c + 1;
  }
  if (cols > at) lines.push(emptyCells(cols - at));
  lines.push('</table:table-row>');
  return lines;
}

function emptyRows(n: number, cols: number): string {
  return `<table:table-row${repeated('rows', n)}>${emptyCells(cols)}</table:table-row>`;
}

function tableXml(sheet: FileSheet, losses: FileLoss[]): string[] {
  const rows = new Map<number, FileCell[]>();
  for (const cell of sheet.cells) {
    const row = rows.get(cell.r);
    if (row) row.push(cell);
    else rows.set(cell.r, [cell]);
  }
  const cols = Math.max(1, sheet.cols, ...sheet.cells.map((c) => c.c + 1));
  const rowCount = Math.max(1, sheet.rows, ...sheet.cells.map((c) => c.r + 1));
  const lines = [
    `<table:table table:name="${escapeXmlAttribute(sheet.name)}">`,
    `<table:table-column${repeated('columns', cols)}/>`,
  ];
  let at = 0;
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    if (r > at) lines.push(emptyRows(r - at, cols));
    lines.push(
      ...rowXml(
        rows.get(r)!.sort((a, b) => a.c - b.c),
        cols,
        sheet.name,
        losses,
      ),
    );
    at = r + 1;
  }
  if (rowCount > at) lines.push(emptyRows(rowCount - at, cols));
  lines.push('</table:table>');
  return lines;
}

// How the file's formulas compare and match: as Google's do, text ignoring case, criteria with `*` and `?` over the
// whole cell, no regular expressions (formulas.md "Functions"), so another suite works them out to the same values.
const CALCULATION_SETTINGS =
  '<table:calculation-settings table:case-sensitive="false" ' +
  'table:search-criteria-must-apply-to-whole-cell="true" table:use-regular-expressions="false" ' +
  'table:use-wildcards="true"/>';

function bodyXml(file: WorkbookFile, losses: FileLoss[]): string[] {
  return [
    '<office:body>',
    '<office:spreadsheet>',
    CALCULATION_SETTINGS,
    ...file.sheets.flatMap((sheet) => tableXml(sheet, losses)),
    '</office:spreadsheet>',
    '</office:body>',
  ];
}

function metaXml(title: string): string[] {
  return [
    '<office:meta>',
    `<meta:generator>${ODS_GENERATOR}</meta:generator>`,
    `<dc:title>${escapeXmlText(title)}</dc:title>`,
    '</office:meta>',
  ];
}

/** The workbook as an ODF flat file (`.fods`): one `office:document`, every part inline. */
export function writeFlatOds(file: WorkbookFile, title: string): FileWritten<string> {
  const losses: FileLoss[] = [];
  const data = [
    XML_DECLARATION,
    `<office:document ${namespaces(FLAT_NAMESPACES)} office:version="${ODF_VERSION}" office:mimetype="${ODF_MEDIA_TYPES.spreadsheet}">`,
    ...metaXml(title),
    ...bodyXml(file, losses),
    '</office:document>',
    '',
  ].join('\n');
  return { data, losses };
}

/** The workbook as an ODF package (`.ods`): `content.xml` and `meta.xml` in the shared package. */
export function writeOds(file: WorkbookFile, title: string): FileWritten<Uint8Array<ArrayBuffer>> {
  const losses: FileLoss[] = [];
  const xml = (lines: string[]) =>
    new TextEncoder().encode([XML_DECLARATION, ...lines, ''].join('\n'));
  const root = (name: string, prefixes: readonly Prefix[], inner: string[]) => [
    `<office:${name} ${namespaces(prefixes)} office:version="${ODF_VERSION}">`,
    ...inner,
    `</office:${name}>`,
  ];
  const data = writeOdfPackage(ODF_MEDIA_TYPES.spreadsheet, [
    {
      name: 'content.xml',
      mediaType: 'text/xml',
      data: xml(root('document-content', CONTENT_NAMESPACES, bodyXml(file, losses))),
    },
    {
      name: 'meta.xml',
      mediaType: 'text/xml',
      data: xml(root('document-meta', META_NAMESPACES, metaXml(title))),
    },
  ]);
  return { data, losses };
}
