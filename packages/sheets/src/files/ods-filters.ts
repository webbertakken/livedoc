// Filters in ODF (docs/specs/029-sheets/standard-mapping.md "Filters in the file"): the sheet's filter in LibreOffice's
// own form, the sheet's unnamed database range `__Anonymous_Sheet_DB__N` with its `table:filter`, each column's
// standard column (filter-standard.ts) as `table:filter-condition`s joined by and, and LiveDoc's record on the
// `table:table` (`livedoc:filters`, `livedoc:filters-fingerprint`). ODF holds no filter views nor slicers.
import {
  attributeOf,
  childElements,
  escapeXmlAttribute,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import { formatA1, type GridRange } from '../address';
import {
  filterFingerprint,
  filterRecordText,
  filtersFound,
  type FileFilter,
  type FileFilterColumn,
} from './file-filters';
import type { StandardColumn, StandardOp, StandardTest } from './filter-standard';
import { LIVEDOC_SPREADSHEET_NS } from './validation-standard';
import type { FileLoss, FileSheet } from './workbook-file';

const { table: TABLE } = ODF_NS;

/** LibreOffice's name for a sheet's own unnamed database range: an autofilter's. */
export const ANONYMOUS_RANGE = /^__Anonymous_Sheet_DB__\d+$/;

/**
 * How ODF holds a standard column, as LibreOffice reads it: one list joined by and, so a day is its day number's `≥`
 * and the next's `<`, and tests joined by or have no form.
 */
export function odsHeld(std: StandardColumn): StandardColumn | null {
  if ('day' in std)
    return std.at === undefined
      ? null
      : {
          tests: [
            { op: 'gte', v: String(std.at) },
            { op: 'lt', v: String(std.at + 1) },
          ],
        };
  if ('tests' in std && std.or) return null;
  return std;
}

// ------------------------------------------------------------------------------------------------ writing

const OPERATOR: Record<StandardOp, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  contains: 'contains',
  notContains: '!contains',
  begins: 'begins',
  ends: 'ends',
  empty: 'empty',
  notEmpty: '!empty',
};

const conditionXml = (field: number, op: string, value: string, items = '') =>
  `<table:filter-condition table:field-number="${field}" table:operator="${escapeXmlAttribute(op)}" table:value="${escapeXmlAttribute(value)}"${items ? `>${items}</table:filter-condition>` : '/>'}`;

// A column's conditions, `field` its place in the range.
function columnConditions(field: number, std: StandardColumn): string[] {
  if ('values' in std) {
    const all = std.blank ? [...std.values, ''] : std.values;
    const items = all
      .map((v) => `<table:filter-set-item table:value="${escapeXmlAttribute(v)}"/>`)
      .join('');
    return [conditionXml(field, '=', all[0] ?? '', items)];
  }
  if ('day' in std) return [];
  return std.tests.map((t: StandardTest) => conditionXml(field, OPERATOR[t.op], t.v));
}

const quoted = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

/** A sheet's filter as LibreOffice's anonymous database range (`index` its sheet's place); none without one. */
export function odsFilterRange(sheet: FileSheet, index: number): string | null {
  const f = sheet.filter;
  if (!f) return null;
  const at = quoted(sheet.name);
  const range = `${at}.${formatA1(f.range.r1, f.range.c1)}:${at}.${formatA1(f.range.r2, f.range.c2)}`;
  const conditions = f.cols.flatMap((x) => {
    const std = x.std && odsHeld(x.std);
    return std ? columnConditions(x.c - f.range.c1, std) : [];
  });
  const filter =
    conditions.length === 0
      ? ''
      : conditions.length === 1
        ? `<table:filter>${conditions[0]}</table:filter>`
        : `<table:filter><table:filter-and>${conditions.join('')}</table:filter-and></table:filter>`;
  const open = `<table:database-range table:name="__Anonymous_Sheet_DB__${index}" table:target-range-address="${escapeXmlAttribute(range)}" table:display-filter-buttons="true"`;
  return filter ? `${open}>${filter}</table:database-range>` : `${open}/>`;
}

/** A sheet's record of its filter as `table:table` attributes (`declared` when LiveDoc's namespace is already). */
export function odsFilterRecordAttributes(sheet: FileSheet, declared: boolean): string {
  if (!sheet.filter) return '';
  return (
    (declared ? '' : ` xmlns:livedoc="${LIVEDOC_SPREADSHEET_NS}"`) +
    ` livedoc:filters="${escapeXmlAttribute(filterRecordText(sheet.filter))}"` +
    ` livedoc:filters-fingerprint="${filterFingerprint(sheet.filter, [], odsHeld)}"`
  );
}

/** Whether a table's attribute is LiveDoc's record of its filter (so not kept). */
export const isOdsFilterRecordAttribute = (a: { uri: string; local: string }): boolean =>
  a.uri === LIVEDOC_SPREADSHEET_NS && (a.local === 'filters' || a.local === 'filters-fingerprint');

// ------------------------------------------------------------------------------------------------ reading

const READ_OPERATOR: Record<string, StandardOp> = Object.fromEntries(
  Object.entries(OPERATOR).map(([op, text]) => [text, op as StandardOp]),
);

// One column's conditions as its standard column; null when LiveDoc has none for them.
function columnOf(conditions: readonly XmlElement[]): StandardColumn | null {
  const tests: StandardTest[] = [];
  for (const c of conditions) {
    const op = attributeOf(c, TABLE, 'operator') ?? '';
    const value = attributeOf(c, TABLE, 'value') ?? '';
    const items = childElements(c).filter((e) => e.uri === TABLE && e.local === 'filter-set-item');
    if (op === '=' && items.length > 0) {
      if (conditions.length !== 1) return null;
      const all = items.map((e) => attributeOf(e, TABLE, 'value') ?? '');
      const values = all.filter((v) => v !== '');
      return values.length < all.length ? { values, blank: true } : { values };
    }
    const read = READ_OPERATOR[op];
    if (!read) return null;
    tests.push({ op: read, v: read === 'empty' || read === 'notEmpty' ? '' : value });
  }
  return tests.length === 1 || tests.length === 2 ? { tests } : null;
}

const field = (c: XmlElement) => Number(attributeOf(c, TABLE, 'field-number'));
const isCondition = (e: XmlElement) => e.uri === TABLE && e.local === 'filter-condition';

// LibreOffice's kept values with the blank: an or of a set and an `empty` of one column; null for another or.
function blankSet(list: readonly XmlElement[]): StandardColumn | null {
  const set = list.find((c) => attributeOf(c, TABLE, 'operator') === '=');
  const blank = list.find((c) => attributeOf(c, TABLE, 'operator') === 'empty');
  if (list.length !== 2 || !set || !blank) return null;
  const items = childElements(set).filter((e) => e.uri === TABLE && e.local === 'filter-set-item');
  const values = items.length
    ? items.map((e) => attributeOf(e, TABLE, 'value') ?? '')
    : [attributeOf(set, TABLE, 'value') ?? ''];
  return { values: values.filter((v) => v !== ''), blank: true };
}

/**
 * A `table:filter`'s columns over `range`: its conditions joined by and, grouped by column, and LibreOffice's kept
 * values with the blank; a column of any other or has no standard column.
 */
export function readOdsFilter(filter: XmlElement, range: GridRange): FileFilterColumn[] {
  const inRange = (f: number) => Number.isInteger(f) && f >= 0 && range.c1 + f <= range.c2;
  const top = childElements(filter).filter((e) => e.uri === TABLE);
  const and = top.length === 1 && top[0]!.local === 'filter-and' ? childElements(top[0]!) : top;
  const conditions = new Map<number, XmlElement[]>();
  const columns = new Map<number, StandardColumn | null>();
  for (const e of and) {
    if (isCondition(e)) {
      const f = field(e);
      if (inRange(f)) conditions.set(f, [...(conditions.get(f) ?? []), e]);
      continue;
    }
    if (e.uri !== TABLE || e.local !== 'filter-or') continue;
    const list = childElements(e).filter(isCondition);
    const fields = [...new Set(list.map(field))].filter(inRange);
    for (const f of fields) columns.set(f, fields.length === 1 ? blankSet(list) : null);
  }
  for (const [f, list] of conditions) columns.set(f, columns.has(f) ? null : columnOf(list));
  return [...columns]
    .map(([f, std]) => ({ c: range.c1 + f, ...(std ? { std } : {}) }))
    .sort((a, b) => a.c - b.c);
}

/** A sheet read with its filter: LiveDoc's record while its fingerprint holds (`filters_changed` when dropped). */
export function withOdsFilter(
  sheet: FileSheet,
  standard: FileFilter | undefined,
  table: XmlElement,
  losses: FileLoss[],
): FileSheet {
  const text = attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'filters');
  const record =
    text === undefined
      ? undefined
      : { text, fingerprint: attributeOf(table, LIVEDOC_SPREADSHEET_NS, 'filters-fingerprint') };
  if (!standard && !record) return sheet;
  const found = filtersFound(
    { ...(standard ? { filter: standard } : {}), views: [] },
    record,
    odsHeld,
  );
  if (found.changed) losses.push({ k: 'filters_changed', sheet: sheet.name });
  return found.filter ? { ...sheet, filter: found.filter } : sheet;
}
