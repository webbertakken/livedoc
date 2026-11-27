// Another app's pivot table in ODF, read from its standard form (docs/specs/029-sheets/standard-mapping.md "Pivot tables
// in the file", D608, D609): a `table:data-pilot-table` as LibreOffice and Google Sheets write one, in the model's
// terms; null for one the model cannot hold, which stays the file's own.
import {
  ODF_NS,
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
} from '@livedoc/office-packages';
import { columnIndex, type GridRange } from '../address';
import type { PivotShowAs, PivotSummary } from '../pivot/pivot-spec';
import { pivotFieldNames } from './file-pivots';
import type { FilePivotHides, StandardGroup, StandardPivot, StandardValue } from './pivot-standard';

const TABLE = ODF_NS.table;

// Each function back to its summary (D608); `auto` sums.
const SUMMARY: Readonly<Record<string, PivotSummary>> = {
  auto: 'SUM',
  sum: 'SUM',
  count: 'COUNTA',
  countnums: 'COUNT',
  average: 'AVERAGE',
  max: 'MAX',
  min: 'MIN',
  product: 'PRODUCT',
  stdev: 'STDEV',
  stdevp: 'STDEVP',
  var: 'VAR',
  varp: 'VARP',
  median: 'MEDIAN',
};

const SHOW_AS: Readonly<Record<string, PivotShowAs | null>> = {
  none: null,
  'row-percentage': 'row',
  'column-percentage': 'column',
  'total-percentage': 'total',
};

// One end of an ODF range address: its sheet (quotes undone; none when left out), column and row.
const END = /^(?:(?:'((?:[^']|'')*)'|([^.']*))\.)?\$?([A-Za-z]{1,3})\$?(\d+)$/;

/** An ODF range address (`'Sales'.A1:'Sales'.F25`, `Sales.$A$1:.$F$25`): its sheet and its cells; null for another. */
export function parseOdfRange(text: string): { sheet: string; range: GridRange } | null {
  const [from, to] = text.split(':');
  const a = from ? END.exec(from) : null;
  const b = to ? END.exec(to) : null;
  const sheet = a && (a[1] !== undefined ? a[1].replace(/''/g, "'") : a[2]);
  if (!a || !b || !sheet) return null;
  const r1 = Number(a[4]) - 1;
  const r2 = Number(b[4]) - 1;
  const c1 = columnIndex(a[3]!.toUpperCase());
  const c2 = columnIndex(b[3]!.toUpperCase());
  if (r1 < 0 || r2 < r1 || c2 < c1) return null;
  return { sheet, range: { r1, c1, r2, c2 } };
}

const t = (e: XmlElement, name: string) => attributeOf(e, TABLE, name);
const child = (e: XmlElement | undefined, local: string) =>
  e ? childElement(e, TABLE, local) : undefined;

type Field = {
  col: number;
  orientation: string;
  level: XmlElement | undefined;
  element: XmlElement;
};

// A level's order, sort by a value, subtotals and Repeat Row Labels; null for a sort by a value it does not hold.
function groupOf(
  f: Field,
  dataCols: readonly (number | undefined)[],
  col: (name: string) => number | undefined,
): StandardGroup | null {
  const sort = child(f.level, 'data-pilot-sort-info');
  const mode = sort && t(sort, 'sort-mode');
  const desc = (mode === 'name' || mode === 'data') && t(sort!, 'order') === 'descending';
  let sortBy: StandardGroup['sortBy'];
  if (mode === 'data') {
    const value = dataCols.indexOf(col(t(sort!, 'data-field') ?? ''));
    if (value < 0) return null;
    sortBy = { value };
  }
  const subtotals = child(f.level, 'data-pilot-subtotals');
  const repeat =
    f.level !== undefined && attributeOf(f.level, ODF_NS.calcext, 'repeat-item-labels') === 'true';
  return {
    col: f.col,
    ...(desc ? { desc: true } : {}),
    subtotals: subtotals === undefined || childElements(subtotals).length > 0,
    ...(repeat && f.orientation === 'row' ? { repeat: true } : {}),
    ...(sortBy ? { sortBy } : {}),
  };
}

/**
 * A data pilot table's standard form, its source's header texts by `headersOf`; null when the model cannot hold it (a
 * source not a range of the workbook, a field it cannot find, a grouping, a Show As LiveDoc lacks).
 */
export function readOdsStandard(
  table: XmlElement,
  sheets: readonly string[],
  headersOf: (sheet: string, range: GridRange) => string[],
): (StandardPivot & { sheet: string }) | null {
  const target = parseOdfRange(t(table, 'target-range-address') ?? '');
  const range = child(table, 'source-cell-range');
  const source = range ? parseOdfRange(t(range, 'cell-range-address') ?? '') : null;
  if (!target || !source || !sheets.includes(source.sheet) || !sheets.includes(target.sheet))
    return null;
  const headers = headersOf(source.sheet, source.range);
  const names = pivotFieldNames({ headers, fields: {} });
  const col = (name: string) => {
    const at = names.indexOf(name);
    return at < 0 ? undefined : at;
  };
  const fields: Field[] = [];
  let valuesAsRows = false;
  for (const element of childElements(table)) {
    if (element.local !== 'data-pilot-field' || element.uri !== TABLE) continue;
    const orientation = t(element, 'orientation') ?? 'hidden';
    if (t(element, 'is-data-layout-field') === 'true') {
      valuesAsRows = orientation === 'row';
      continue;
    }
    if (orientation === 'hidden') continue;
    const at = col(t(element, 'source-field-name') ?? '');
    if (at === undefined || child(element, 'data-pilot-groups')) return null;
    fields.push({ col: at, orientation, level: child(element, 'data-pilot-level'), element });
  }
  const values: StandardValue[] = [];
  for (const f of fields.filter((x) => x.orientation === 'data')) {
    const summary = SUMMARY[t(f.element, 'function') ?? 'auto'];
    const reference = child(f.element, 'data-pilot-field-reference');
    const showAs = reference ? SHOW_AS[t(reference, 'type') ?? 'none'] : null;
    if (!summary || showAs === undefined) return null;
    const label = attributeOf(f.element, ODF_NS.tableooo, 'display-name');
    values.push({
      col: f.col,
      summary,
      ...(showAs ? { showAs } : {}),
      ...(label !== undefined ? { label } : {}),
    });
  }
  const dataCols = values.map((v) => v.col);
  const groups = (orientation: string) =>
    fields.filter((f) => f.orientation === orientation).map((f) => groupOf(f, dataCols, col));
  const rows = groups('row');
  const columns = groups('column');
  if (rows.includes(null) || columns.includes(null)) return null;
  const hides: FilePivotHides[] = [];
  for (const f of fields) {
    const members = child(f.level, 'data-pilot-members');
    if (f.orientation === 'data' || !members || hides.some((h) => h.col === f.col)) continue;
    const hidden = childElements(members).filter(
      (m) => m.local === 'data-pilot-member' && t(m, 'display') === 'false',
    );
    hides.push({ col: f.col, hides: hidden.map((m) => ({ shown: t(m, 'name') ?? '' })) });
  }
  const grand = t(table, 'grand-total') ?? 'both';
  return {
    sheet: target.sheet,
    at: { r: target.range.r1, c: target.range.c1 },
    output: {
      rows: target.range.r2 - target.range.r1 + 1,
      cols: target.range.c2 - target.range.c1 + 1,
    },
    source: { sheet: source.sheet === target.sheet ? null : source.sheet, range: source.range },
    headers,
    rows: rows as StandardGroup[],
    columns: columns as StandardGroup[],
    values,
    hides,
    valuesAsRows,
    grand: {
      rows: grand === 'both' || grand === 'row',
      cols: grand === 'both' || grand === 'column',
    },
  };
}
