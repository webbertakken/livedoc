// Pivot tables in ODF, written (docs/specs/029-sheets/standard-mapping.md "Pivot tables in the file", D604 to D606):
// one `table:data-pilot-table` a pivot table in the spreadsheet's one `table:data-pilot-tables`, its fields as
// LibreOffice reads them, LiveDoc's record and the standard form's fingerprint in `livedoc:` attributes.
import { escapeXmlAttribute } from '@livedoc/office-packages';
import { columnLetters, type GridRange } from '../address';
import type { PivotShowAs, PivotSummary } from '../pivot/pivot-spec';
import {
  pageColumns,
  pivotFieldNames,
  pivotFingerprint,
  pivotRecordText,
  pivotSourceText,
  pivotStandardFields,
  standardHasSummary,
  subtotalsOf,
  valueFieldIndex,
  valueFilters,
  type FilePivot,
  type FilePivotGroup,
  type FilePivotValue,
  type PivotStandard,
} from './file-pivots';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileSheet } from './workbook-file';

/** The name a written data pilot table takes, numbered from 1. */
export const ODS_PIVOT_NAME = 'LiveDocPivot';

// ODF's function for each summary it has; one it lacks is written `sum` (D605).
const FUNCTION: Readonly<Partial<Record<PivotSummary, string>>> = {
  SUM: 'sum',
  COUNTA: 'count',
  COUNT: 'countnums',
  AVERAGE: 'average',
  MAX: 'max',
  MIN: 'min',
  PRODUCT: 'product',
  STDEV: 'stdev',
  STDEVP: 'stdevp',
  VAR: 'var',
  VARP: 'varp',
  MEDIAN: 'median',
};

const SHOW_AS: Readonly<Record<PivotShowAs, string>> = {
  row: 'row-percentage',
  column: 'column-percentage',
  total: 'total-percentage',
};

/** A value's function in ODF; none for a calculated field, which ODF leaves out (D606). */
export const odsFunction = (v: FilePivotValue): string | null => {
  if (v.formula !== undefined) return null;
  return standardHasSummary(v.summary, 'odf') ? FUNCTION[v.summary]! : 'sum';
};

const attr = (name: string, value: string | number) =>
  ` ${name}="${escapeXmlAttribute(String(value))}"`;

const quoted = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

/** A range as ODF addresses it: `'Sales'.A1:'Sales'.F25`. */
export const odfRangeAddress = (sheet: string, g: GridRange): string =>
  `${quoted(sheet)}.${columnLetters(g.c1)}${g.r1 + 1}:${quoted(sheet)}.${columnLetters(g.c2)}${g.r2 + 1}`;

/** Where LibreOffice lays a pivot table out: its page fields' rows and a row more above its output (D604). */
export function odsPivotTarget(p: FilePivot): GridRange {
  const pages = pageColumns(p.fields).length;
  return {
    r1: p.at.r,
    c1: p.at.c,
    r2: p.at.r + (pages ? pages + 1 : 0) + p.output.rows - 1,
    c2: p.at.c + p.output.cols - 1,
  };
}

/** The standard form of a pivot table in ODF, on sheet `sheet`. */
export function odsPivotStandard(p: FilePivot, sheet: string): PivotStandard {
  return {
    location: odsPivotTarget(p),
    source: pivotSourceText(p.source.sheet ?? sheet, p.source.range),
    fields: pivotStandardFields(p, pivotFieldNames(p), odsFunction),
  };
}

// A row or column field's level: its subtotals, its members (a filtered value hidden), its sort.
function levelXml(
  p: FilePivot,
  col: number,
  group: FilePivotGroup | null,
  totals: boolean,
): string {
  const shown = valueFilters(p.fields).get(col);
  const subtotals = totals
    ? '<table:data-pilot-subtotals><table:data-pilot-subtotal table:function="auto"/></table:data-pilot-subtotals>'
    : '<table:data-pilot-subtotals/>';
  const members = shown
    ? `<table:data-pilot-members>${p.items[col]!.map(
        (it) =>
          `<table:data-pilot-member${attr('table:name', it.shown)}${attr('table:display', shown.has(it.shown) ? 'true' : 'false')}/>`,
      ).join('')}</table:data-pilot-members>`
    : '';
  const sort = group
    ? `<table:data-pilot-sort-info table:sort-mode="name"${attr('table:order', group.desc ? 'descending' : 'ascending')}/>`
    : '';
  return `<table:data-pilot-level table:show-empty="false">${subtotals}${members}${sort}</table:data-pilot-level>`;
}

// The member a page field names as selected, as ODF asks one: the first its filter shows (its first when none does).
function selectedPage(p: FilePivot, col: number): string {
  const items = p.items[col]!;
  const shown = valueFilters(p.fields).get(col);
  return (items.find((it) => shown?.has(it.shown)) ?? items[0])?.shown ?? '';
}

// ODF's grand totals from the outermost groups' totals: a row group's off hides the row grand total, a column's the
// column's, as Google Sheets' export says them.
function grandTotal(p: FilePivot): string {
  const rows = p.fields.rows?.[0]?.totals !== false;
  const cols = p.fields.columns?.[0]?.totals !== false;
  if (rows && cols) return '';
  return attr('table:grand-total', rows ? 'row' : cols ? 'column' : 'none');
}

/** One data pilot table: its place, its source, its fields, and LiveDoc's record beside them. */
export function odsDataPilotXml(p: FilePivot, name: string, sheet: string): string {
  const names = pivotFieldNames(p);
  const field = (col: number, orientation: string, inner: string) =>
    `<table:data-pilot-field${attr('table:source-field-name', names[col]!)}${attr('table:orientation', orientation)}${orientation === 'page' ? attr('table:selected-page', selectedPage(p, col)) : ''}>${inner}</table:data-pilot-field>`;
  const { rows = [], columns = [], values = [] } = p.fields;
  const data = values.flatMap((v, i) => {
    const fn = odsFunction(v);
    if (fn === null) return [];
    const col = valueFieldIndex(p, i);
    const reference = v.showAs
      ? `<table:data-pilot-field-reference${attr('table:field-name', names[col]!)}${attr('table:type', SHOW_AS[v.showAs])} table:member-type="named" table:member-name=""/>`
      : '';
    return [
      `<table:data-pilot-field${attr('table:source-field-name', names[col]!)} table:orientation="data"${attr('table:function', fn)}>${reference}</table:data-pilot-field>`,
    ];
  });
  const layout =
    data.length > 1
      ? `<table:data-pilot-field table:source-field-name="" table:is-data-layout-field="true"${attr('table:orientation', p.fields.valuesAsRows ? 'row' : 'column')}/>`
      : '';
  const standard = odsPivotStandard(p, sheet);
  return [
    `<table:data-pilot-table xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"${attr('table:name', name)}${attr('table:target-range-address', odfRangeAddress(sheet, standard.location))}${grandTotal(p)}`,
    `${attr('livedoc:pivot', pivotRecordText(p))}${attr('livedoc:pivot-fingerprint', pivotFingerprint(standard))}>`,
    `<table:source-cell-range${attr('table:cell-range-address', odfRangeAddress(p.source.sheet ?? sheet, p.source.range))}/>`,
    ...rows.map((g, i) => field(g.col, 'row', levelXml(p, g.col, g, subtotalsOf(rows, i)))),
    ...columns.map((g, i) =>
      field(g.col, 'column', levelXml(p, g.col, g, subtotalsOf(columns, i))),
    ),
    ...pageColumns(p.fields).map((c) => field(c, 'page', levelXml(p, c, null, true))),
    ...data,
    layout,
    '</table:data-pilot-table>',
  ].join('');
}

/** The data pilot tables of a workbook's pivot tables, each named past the names in `taken`. */
export function odsDataPilots(sheets: readonly FileSheet[], taken: ReadonlySet<string>): string[] {
  const out: string[] = [];
  let n = 0;
  for (const sheet of sheets)
    for (const p of sheet.pivots ?? []) {
      let name: string;
      do name = `${ODS_PIVOT_NAME}${++n}`;
      while (taken.has(name));
      out.push(odsDataPilotXml(p, name, sheet.name));
    }
  return out;
}

// ODF's order of the spreadsheet's children after its tables.
const AFTER_PILOTS = /^<[\w.-]+:(?:consolidation|dde-links)\b/;
const PILOTS = /^<([\w.-]+:data-pilot-tables)\b/;

/** The names the kept data pilot tables hold, so LiveDoc's own take others. */
export function keptPilotNames(after: readonly string[]): Set<string> {
  const holder = after.find((xml) => PILOTS.test(xml));
  const names = new Set<string>();
  for (const m of holder?.matchAll(/<[\w.-]+:data-pilot-table\b[^>]*?\s[\w.-]+:name="([^"]*)"/g) ??
    [])
    names.add(m[1]!);
  return names;
}

/** The kept content after the tables with LiveDoc's data pilot tables in the kept `table:data-pilot-tables`, or in one of their own in ODF's order. */
export function withDataPilots(after: readonly string[], own: readonly string[]): string[] {
  if (own.length === 0) return [...after];
  const at = after.findIndex((xml) => PILOTS.test(xml));
  if (at < 0) {
    const before = after.findIndex((xml) => AFTER_PILOTS.test(xml));
    const holder = `<table:data-pilot-tables>${own.join('')}</table:data-pilot-tables>`;
    return before < 0 ? [...after, holder] : after.toSpliced(before, 0, holder);
  }
  const holder = after[at]!;
  const close = holder.lastIndexOf('</');
  return after.with(at, holder.slice(0, close) + own.join('') + holder.slice(close));
}
