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
  type XmlBindings,
} from '@livedoc/office-packages';
import { declarations, OdsKeptWriter } from './ods-kept-write';
import { OdsStyles } from './ods-styles';
import { odsFormatRulesXml } from './ods-format-rules';
import { ODS_DEFAULT_CELL_STYLES } from './ods-cell-style';
import { OdsAxisOut } from './ods-lines';
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
const CONTENT_NAMESPACES: readonly Prefix[] = [
  'office',
  'style',
  'number',
  'fo',
  'table',
  'text',
  'of',
];
const META_NAMESPACES: readonly Prefix[] = ['office', 'meta', 'dc'];
const STYLES_NAMESPACES: readonly Prefix[] = ['office', 'style', 'fo'];
const SETTINGS_NAMESPACES: readonly Prefix[] = ['office'];
const FLAT_NAMESPACES: readonly Prefix[] = [
  'office',
  'meta',
  'dc',
  'style',
  'number',
  'fo',
  'table',
  'text',
  'of',
];

// What writing a sheet carries along: its name and index, the losses so far, the cell styles named, the kept content.
type Out = {
  sheet: string;
  index: number;
  losses: FileLoss[];
  styles: OdsStyles;
  kept: OdsKeptWriter;
};

// A cell's style, its number format's and its look's; a format ODF cannot say is named, the cell written without it.
function styleAttribute(cell: FileCell, out: Out): string[] {
  if (cell.format === undefined && !cell.style) return [];
  const { name, unwritten } = out.styles.cellStyle(cell.format, cell.style);
  if (unwritten) out.losses.push({ k: 'format_unwritten', sheet: out.sheet, r: cell.r, c: cell.c });
  return name ? [`table:style-name="${name}"`] : [];
}

function namespaces(prefixes: readonly Prefix[]): string {
  return prefixes.map((p) => `xmlns:${p}="${ODF_NS[p]}"`).join(' ');
}

const bindings = (prefixes: readonly Prefix[]) =>
  Object.fromEntries(prefixes.map((p) => [p, ODF_NS[p]])) as Record<string, string>;

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

function cellXml(cell: FileCell, out: Out): string {
  const formula = cell.formula === undefined ? null : toOpenFormula(cell.formula);
  if (cell.formula !== undefined && formula === null)
    out.losses.push({ k: 'formula_unwritten', sheet: out.sheet, r: cell.r, c: cell.c });
  const attrs = [
    ...styleAttribute(cell, out),
    ...(formula ? [`table:formula="${escapeXmlAttribute(formula)}"`] : []),
    ...(formula && cell.spans
      ? [
          `table:number-matrix-columns-spanned="${cell.spans.cols}" table:number-matrix-rows-spanned="${cell.spans.rows}"`,
        ]
      : []),
    ...(cell.value ? [valueAttributes(cell.value)] : []),
  ];
  // Kept content stays on its cell: its attributes, and its children before and after the paragraphs.
  const kept = out.kept.cell(out.index, cell.r, cell.c);
  const body = cell.value ? paragraphs(shownText(cell.value)) : '';
  const open = `<table:table-cell${attrs.map((a) => ` ${a}`).join('')}${kept?.attributes ?? ''}>`;
  return `${open}${kept?.before ?? ''}${body}${kept?.after ?? ''}</table:table-cell>`;
}

const repeated = (axis: 'columns' | 'rows', n: number) =>
  n > 1 ? ` table:number-${axis}-repeated="${n}"` : '';

function emptyCells(n: number): string {
  return `<table:table-cell${repeated('columns', n)}/>`;
}

function rowXml(cells: readonly FileCell[], cols: number, out: Out, attrs: string): string[] {
  const lines = [`<table:table-row${attrs}>`];
  let at = 0;
  for (const cell of cells) {
    if (cell.c > at) lines.push(emptyCells(cell.c - at));
    lines.push(cellXml(cell, out));
    at = cell.c + 1;
  }
  if (cols > at) lines.push(emptyCells(cols - at));
  lines.push('</table:table-row>');
  return lines;
}

function emptyRows(n: number, cols: number, attrs: string): string {
  return `<table:table-row${attrs}${repeated('rows', n)}>${emptyCells(cols)}</table:table-row>`;
}

// Where runs of lines start: 0, each line with something of its own and the one after it, and the end.
function runStarts(count: number, breaks: Iterable<number>): number[] {
  const at = new Set([0, count]);
  for (const p of breaks) if (p >= 0 && p <= count) at.add(p);
  return [...at].sort((a, b) => a - b);
}

// The columns, each run with its style and visibility, in their groups.
function columnsXml(cols: number, axis: OdsAxisOut): string[] {
  const starts = runStarts(cols, axis.breaks());
  const runs = starts.slice(0, -1).map((from, i) => ({
    from,
    xml: [
      `<table:table-column${axis.at(from).attrs}${repeated('columns', starts[i + 1]! - from)}/>`,
    ],
  }));
  return axis.nest(runs, 'table-column-group');
}

function tableXml(sheet: FileSheet, index: number, out: Omit<Out, 'sheet' | 'index'>): string[] {
  const { kept } = out;
  const sheetOut: Out = { ...out, sheet: sheet.name, index };
  // A cell keeping content is written, empty or not, so its content stays on it.
  const held = new Set(sheet.cells.map((c) => `${c.r},${c.c}`));
  const keptCells = kept.cellsOf(index).filter((p) => !held.has(`${p.r},${p.c}`));
  const rows = new Map<number, FileCell[]>();
  for (const cell of [...sheet.cells, ...keptCells]) {
    const row = rows.get(cell.r);
    if (row) row.push(cell);
    else rows.set(cell.r, [cell]);
  }
  // Reduced, not spread: a sheet's cells are past what a call's arguments hold.
  let cols = Math.max(1, sheet.cols);
  for (const row of rows.values()) for (const cell of row) cols = Math.max(cols, cell.c + 1);
  let rowCount = Math.max(1, sheet.rows);
  for (const r of rows.keys()) rowCount = Math.max(rowCount, r + 1);
  const lineStyle = out.styles.lineStyle.bind(out.styles);
  const rowAxis = new OdsAxisOut(sheet.lines?.r, 'table-row', lineStyle);
  const colAxis = new OdsAxisOut(sheet.lines?.c, 'table-column', lineStyle);
  // A row with cells is a run of its own; rows between are runs of empty rows, split where their attributes change.
  const starts = runStarts(rowCount, [
    ...rowAxis.breaks(),
    ...[...rows.keys()].flatMap((r) => [r, r + 1]),
  ]);
  const runs = starts.slice(0, -1).map((from, i) => {
    const { attrs } = rowAxis.at(from);
    const cells = rows.get(from);
    const xml = cells
      ? rowXml(
          cells.sort((a, b) => a.c - b.c),
          cols,
          sheetOut,
          attrs,
        )
      : [emptyRows(starts[i + 1]! - from, cols, attrs)];
    return { from, xml };
  });
  return [
    `<table:table table:name="${escapeXmlAttribute(sheet.name)}"${tableStyleAttribute(sheet, out.styles)}${kept.tableAttributes(index)}>`,
    ...kept.table('table-before', index),
    ...columnsXml(cols, colAxis),
    ...rowAxis.nest(runs, 'table-row-group'),
    ...withFormatRules(
      kept.table('table-after', index),
      odsFormatRulesXml(sheet.formatRules, sheet.name, (s) => out.styles.conditionalStyle(s)),
    ),
    '</table:table>',
  ];
}

// A table's format rules after its kept ones, in the kept `calcext:conditional-formats` or one of their own (D215).
function withFormatRules(after: string[], own: string[]): string[] {
  if (own.length === 0) return after;
  const at = after.findIndex((xml) => /^<[\w.-]+:conditional-formats\b/.test(xml));
  if (at < 0)
    return [...after, `<calcext:conditional-formats>${own.join('')}</calcext:conditional-formats>`];
  const holder = after[at]!.replace(/^<([\w.-]+:conditional-formats)([^>]*?)\/>$/, '<$1$2></$1>');
  const close = holder.lastIndexOf('</');
  return after.with(at, holder.slice(0, close) + own.join('') + holder.slice(close));
}

// A table's style, when its tab has a look (standard-mapping.md "Sheet name, hidden, tab colour").
function tableStyleAttribute(sheet: FileSheet, styles: OdsStyles): string {
  const name = styles.tableStyle(sheet);
  return name ? ` table:style-name="${name}"` : '';
}

// How the file's formulas compare and match: as Google's do, text ignoring case, criteria with `*` and `?` over the
// whole cell, no regular expressions (formulas.md "Functions"), so another suite works them out to the same values.
const CALCULATION_SETTINGS =
  '<table:calculation-settings table:case-sensitive="false" ' +
  'table:search-criteria-must-apply-to-whole-cell="true" table:use-regular-expressions="false" ' +
  'table:use-wildcards="true"/>';

// LiveDoc's common styles: its default cell style (standard-mapping.md "Cell styles in the file", D204), then the
// named styles kept format rules name and its own rules' conditional styles ("Format rules in the file").
const commonStyles = (more: readonly string[]) => [
  '<office:styles>',
  ...ODS_DEFAULT_CELL_STYLES,
  ...more,
  '</office:styles>',
];

// The body, after the scripts kept and the automatic styles its cells and its kept content name (D93); a flat file's
// common styles between them, as a package keeps them in `styles.xml`.
function bodyXml(
  file: WorkbookFile,
  losses: FileLoss[],
  kept: OdsKeptWriter,
  common: XmlBindings,
  flat: boolean,
): { body: string[]; common: string[] } {
  const styles = new OdsStyles();
  const keptCommon = kept.commonStyles(common);
  styles.reserve(
    new Set(keptCommon.flatMap((xml) => /style:display-name="([^"]*)"/.exec(xml)?.[1] ?? [])),
  );
  const tables = file.sheets.flatMap((sheet, i) => tableXml(sheet, i, { losses, styles, kept }));
  const commonXml = commonStyles([...keptCommon, ...styles.conditionalStyles()]);
  const body = [
    ...kept.workbook('scripts'),
    ...(flat ? commonXml : []),
    ...styles.automaticStyles(kept.workbook('styles')),
    '<office:body>',
    '<office:spreadsheet>',
    ...kept.spreadsheetBefore('before'),
    CALCULATION_SETTINGS,
    ...kept.spreadsheetBefore('after'),
    ...tables,
    ...kept.workbook('spreadsheet-after'),
    '</office:spreadsheet>',
    '</office:body>',
  ];
  return { body, common: commonXml };
}

// The namespaces a root declares: `calcext` too when a sheet has format rules.
const withRules = (file: WorkbookFile, prefixes: readonly Prefix[]): readonly Prefix[] =>
  file.sheets.some((s) => s.formatRules?.length) ? [...prefixes, 'calcext'] : prefixes;

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
  const prefixes = withRules(file, FLAT_NAMESPACES);
  const own = bindings(prefixes);
  const kept = new OdsKeptWriter(file.kept, own);
  const { body } = bodyXml(file, losses, kept, own, true);
  const data = [
    XML_DECLARATION,
    `<office:document ${namespaces(prefixes)}${kept.rootDeclarations(own, true)} office:version="${ODF_VERSION}" office:mimetype="${ODF_MEDIA_TYPES.spreadsheet}">`,
    ...metaXml(title),
    ...kept.settings({ ...kept.settingsNs, ...own }),
    ...body,
    '</office:document>',
    '',
  ].join('\n');
  // A flat file holds no package entries: a kept picture or object still reached is left out, and named (D111).
  const left = kept.entries().filter((entry) => !entry.name.endsWith('/')).length;
  if (left > 0) losses.push({ k: 'parts_left', count: left });
  return { data, losses };
}

/** The workbook as an ODF package (`.ods`): `content.xml` and `meta.xml` in the shared package. */
export function writeOds(file: WorkbookFile, title: string): FileWritten<Uint8Array<ArrayBuffer>> {
  const losses: FileLoss[] = [];
  const xml = (lines: string[]) =>
    new TextEncoder().encode([XML_DECLARATION, ...lines, ''].join('\n'));
  const root = (name: string, prefixes: readonly Prefix[], inner: string[], more = '') => [
    `<office:${name} ${namespaces(prefixes)}${more} office:version="${ODF_VERSION}">`,
    ...inner,
    `</office:${name}>`,
  ];
  const prefixes = withRules(file, CONTENT_NAMESPACES);
  const own = bindings(prefixes);
  const kept = new OdsKeptWriter(file.kept, own);
  const { body, common } = bodyXml(file, losses, kept, bindings(STYLES_NAMESPACES), false);
  const settingsOwn = bindings(SETTINGS_NAMESPACES);
  const settings = kept.settings({ ...kept.settingsNs, ...settingsOwn });
  const data = writeOdfPackage(ODF_MEDIA_TYPES.spreadsheet, [
    {
      name: 'content.xml',
      mediaType: 'text/xml',
      data: xml(root('document-content', prefixes, body, kept.rootDeclarations(own))),
    },
    {
      name: 'styles.xml',
      mediaType: 'text/xml',
      data: xml(root('document-styles', STYLES_NAMESPACES, common)),
    },
    {
      name: 'meta.xml',
      mediaType: 'text/xml',
      data: xml(root('document-meta', META_NAMESPACES, metaXml(title))),
    },
    ...(settings.length > 0
      ? [
          {
            name: 'settings.xml',
            mediaType: 'text/xml',
            data: xml(
              root(
                'document-settings',
                SETTINGS_NAMESPACES,
                settings,
                declarations(kept.settingsNs, settingsOwn),
              ),
            ),
          },
        ]
      : []),
    ...kept.entries(),
  ]);
  return { data, losses };
}
