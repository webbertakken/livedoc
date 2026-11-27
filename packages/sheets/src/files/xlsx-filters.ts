// Filters in XLSX (docs/specs/029-sheets/standard-mapping.md "Filters in the file"): the sheet's filter as the
// worksheet's `autoFilter` with Excel's hidden `_xlnm._FilterDatabase` name, each filter view as Google writes one (a
// `customSheetView` holding an `autoFilter`, a hidden `Z_<guid>_.wvu.FilterData` name and a `customWorkbookView`
// naming it), each column's standard column (filter-standard.ts) as a `filterColumn`, and LiveDoc's record
// (`livedoc:filters`) in the worksheet's LiveDoc `ext`; the reader is xlsx-filters-read.ts.
import { escapeXmlAttribute } from '@livedoc/office-packages';
import { formatRange, type GridRange } from '../address';
import { a1Text, FILE_LAST_COL } from './a1-text';
import type { FileFilterColumn, FileFilterView } from './file-filters';
import { filterFingerprint, filterRecordText } from './filter-record';
import type { StandardColumn, StandardOp, StandardTest } from './filter-standard';
import type { FileSheet } from './workbook-file';

/** Excel's own name for a sheet's filter range. */
export const FILTER_DATABASE_NAME = '_xlnm._FilterDatabase';

/** XLSX holds every standard column. */
export const xlsxHeld = (std: StandardColumn): StandardColumn => std;

// ------------------------------------------------------------------------------------------------ writing

const OPERATOR: Record<StandardOp, string | null> = {
  eq: null,
  neq: 'notEqual',
  gt: 'greaterThan',
  gte: 'greaterThanOrEqual',
  lt: 'lessThan',
  lte: 'lessThanOrEqual',
  contains: null,
  notContains: 'notEqual',
  begins: null,
  ends: null,
  empty: null,
  notEmpty: 'notEqual',
};

// A text with Excel's wildcards (`*`, `?`) and its escape (`~`) escaped.
const escapeWild = (text: string) => text.replace(/[*?~]/g, (m) => `~${m}`);

function wildcardOf(t: StandardTest): string {
  switch (t.op) {
    case 'contains':
    case 'notContains':
      return `*${escapeWild(t.v)}*`;
    case 'begins':
      return `${escapeWild(t.v)}*`;
    case 'ends':
      return `*${escapeWild(t.v)}`;
    case 'empty':
    case 'notEmpty':
      return '';
    case 'eq':
    case 'neq':
      return escapeWild(t.v);
    default:
      return t.v;
  }
}

const customFilterXml = (t: StandardTest) => {
  const op = OPERATOR[t.op];
  return `<customFilter${op ? ` operator="${op}"` : ''} val="${escapeXmlAttribute(wildcardOf(t))}"/>`;
};

/** A column's standard column as a `filterColumn`, `colId` its place in the filter's range. */
export function xlsxFilterColumnXml(colId: number, std: StandardColumn): string {
  let inner: string;
  if ('values' in std)
    inner =
      std.values.length === 0
        ? `<filters${std.blank ? ' blank="1"' : ''}/>`
        : `<filters${std.blank ? ' blank="1"' : ''}>${std.values
            .map((v) => `<filter val="${escapeXmlAttribute(v)}"/>`)
            .join('')}</filters>`;
  else if ('day' in std) inner = `<dynamicFilter type="${std.day}"/>`;
  else
    inner = `<customFilters${std.tests.length > 1 && !std.or ? ' and="1"' : ''}>${std.tests
      .map(customFilterXml)
      .join('')}</customFilters>`;
  return `<filterColumn colId="${colId}">${inner}</filterColumn>`;
}

// A filter's range cut to Excel's last column; null when it starts past it.
function inExcel(range: GridRange): GridRange | null {
  if (range.c1 >= FILE_LAST_COL) return null;
  return { ...range, c2: Math.min(range.c2, FILE_LAST_COL - 1) };
}

/** A filter's (or a view's) `autoFilter`, its sort as its `sortState` (Google's form). */
export function xlsxAutoFilterXml(
  range: GridRange,
  cols: readonly FileFilterColumn[],
  sort: FileFilterView['sort'] = [],
): string {
  const columns = cols
    .filter((x) => x.std && x.c >= range.c1 && x.c <= range.c2)
    .map((x) => xlsxFilterColumnXml(x.c - range.c1, x.std!))
    .join('');
  const keys = sort.filter((k) => k.c >= range.c1 && k.c <= range.c2);
  const state = keys.length
    ? `<sortState ref="${formatRange(range)}">${keys
        .map(
          (k) =>
            `<sortCondition${k.desc ? ' descending="1"' : ''} ref="${formatRange({ ...range, c1: k.c, c2: k.c })}"/>`,
        )
        .join('')}</sortState>`
    : '';
  const ref = formatRange(range);
  return columns || state
    ? `<autoFilter ref="${ref}">${columns}${state}</autoFilter>`
    : `<autoFilter ref="${ref}"/>`;
}

/** A view's `guid` (D479): the sheet's place in four hex digits, the view's id in hex, padded, as Excel writes one. */
export function filterViewGuid(sheet: number, key: string): string {
  const hex = (
    sheet.toString(16).padStart(4, '0') +
    [...key].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  )
    .padEnd(32, '0')
    .slice(0, 32)
    .toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

const rangeName = (title: string, range: GridRange) =>
  escapeXmlAttribute(a1Text({ sheet: title, ...range, a: 15 }, true));

/** What a sheet's filter and views write: its worksheet's children, its record, the workbook's names and views. */
export type XlsxFiltersOut = {
  own: { name: string; xml: string }[];
  record: string | null;
  names: string[];
  views: string[];
  // A filter over part of a table, kept in the record alone (D480).
  beside: boolean;
};

/** A table's header and data rows: the range its table part's `autoFilter` holds. */
export const tableDataRange = (t: { range: GridRange; total?: true }): GridRange => ({
  ...t.range,
  r2: t.total ? t.range.r2 - 1 : t.range.r2,
});

const sameRange = (a: GridRange, b: GridRange) =>
  a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

/** How a filter lies over a sheet's tables: on none, as one's filter (`table`), or over part of one (`beside`). */
export function filterOverTables(
  filter: GridRange,
  tables: readonly { range: GridRange; total?: true }[],
): 'none' | 'table' | 'beside' {
  const met = tables.filter(
    (t) =>
      t.range.r1 <= filter.r2 &&
      filter.r1 <= t.range.r2 &&
      t.range.c1 <= filter.c2 &&
      filter.c1 <= t.range.c2,
  );
  if (met.length === 0) return 'none';
  return met.length === 1 && sameRange(tableDataRange(met[0]!), filter) ? 'table' : 'beside';
}

/** A sheet's filter and filter views as XLSX (`index` its place, `title` its name as written). */
export function xlsxFiltersOut(sheet: FileSheet, index: number, title: string): XlsxFiltersOut {
  const out: XlsxFiltersOut = { own: [], record: null, names: [], views: [], beside: false };
  const filter = sheet.filter && inExcel(sheet.filter.range);
  const views = (sheet.filterViews ?? []).flatMap((v) => {
    const range = inExcel(v.range);
    return range ? [{ ...v, range }] : [];
  });
  // A table's filter is its table part's (xlsx-tables.ts, D481); Excel refuses a sheet's `autoFilter` over a table's
  // cells, so a filter overlapping one another way is LiveDoc's record's alone (D480).
  const over = filter ? filterOverTables(filter, sheet.tables ?? []) : 'none';
  out.beside = over === 'beside';
  const standardFilter = over === 'none' ? filter : null;
  if (standardFilter) {
    out.own.push({
      name: 'autoFilter',
      xml: xlsxAutoFilterXml(standardFilter, sheet.filter!.cols),
    });
    out.names.push(
      `<definedName name="${FILTER_DATABASE_NAME}" localSheetId="${index}" hidden="1">${rangeName(title, standardFilter)}</definedName>`,
    );
  }
  if (views.length) {
    const each = views.map((v, i) => {
      const guid = filterViewGuid(index, v.key ?? String(i));
      const bare = guid.slice(1, -1).replace(/-/g, '_');
      out.names.push(
        `<definedName name="Z_${bare}_.wvu.FilterData" localSheetId="${index}" hidden="1">${rangeName(title, v.range)}</definedName>`,
      );
      out.views.push(
        `<customWorkbookView name="${escapeXmlAttribute(v.name)}" guid="${guid}" activeSheetId="${index}" maximized="1" windowWidth="0" windowHeight="0"/>`,
      );
      return `<customSheetView guid="${guid}" filter="1" showAutoFilter="1">${xlsxAutoFilterXml(v.range, v.cols, v.sort)}</customSheetView>`;
    });
    out.own.push({
      name: 'customSheetViews',
      xml: `<customSheetViews>${each.join('')}</customSheetViews>`,
    });
  }
  if (filter || views.length) {
    const standard =
      filter && over !== 'beside' ? { range: filter, cols: sheet.filter!.cols } : undefined;
    const text = filterRecordText(filter ? { ...sheet.filter!, range: filter } : undefined, views);
    const fingerprint = filterFingerprint(standard, views, xlsxHeld);
    out.record = `<livedoc:filters record="${escapeXmlAttribute(text)}" fingerprint="${fingerprint}"/>`;
  }
  return out;
}
