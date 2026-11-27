// The filter (docs/specs/029-sheets/sheet.md "Filter"): which rows of the filtered range every column's condition
// keeps. A column filters by the displayed values kept and/or a condition.
import { localeDayFirst, parseDateText } from './dates';
import { parsePlainNumber } from './input';
import { displayValue } from './number-format';
import { layoutIndex, posRangeOf } from './layout';
import {
  cellKey,
  type ConditionOp,
  type DatePeriod,
  type FilterColour,
  type FilterCondition,
  type IdRange,
  type Sheet,
  type StoredFormula,
} from './sheet';
import { dateFromSerial, serialFromDate } from './dates';
import { isColour } from './format';
import type { CellColourOf } from './filter-colours';
import { workbookFilterReads } from './filter-reads';
import { storedFormulaOk } from './rules/rule-shape';
import { isError, type Scalar, type Value } from './formula/values';
import { INPUT_MAX, SHEET_ROWS_MAX } from './limits';
import type { Workbook } from './engine/workbook';

export const CONDITION_OPS: readonly ConditionOp[] = [
  'empty',
  'notEmpty',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'exactly',
  'dateBefore',
  'dateAfter',
  'dateOn',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'notBetween',
  'eq',
  'neq',
];

const CONDITION_KEYS = new Set(['values', 'op', 'a', 'b', 'd', 'fx', 'colour']);

export const DATE_PERIODS: readonly DatePeriod[] = [
  'today',
  'tomorrow',
  'yesterday',
  'pastWeek',
  'pastMonth',
  'pastYear',
];
const DATE_OPS: ReadonlySet<unknown> = new Set(['dateOn', 'dateBefore', 'dateAfter']);

// A period's first and last day (serials), counted from `today`: the past week, month and year end today.
export function periodDays(d: DatePeriod, today: number): [number, number] {
  const back = (months: number) => {
    const p = dateFromSerial(today);
    const total = p.y * 12 + (p.m - 1) - months;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const last = serialFromDate(y, m + 1, 1) - serialFromDate(y, m, 1);
    return serialFromDate(y, m, Math.min(p.d, last));
  };
  switch (d) {
    case 'today':
      return [today, today];
    case 'tomorrow':
      return [today + 1, today + 1];
    case 'yesterday':
      return [today - 1, today - 1];
    case 'pastWeek':
      return [today - 7, today];
    case 'pastMonth':
      return [back(1), today];
    case 'pastYear':
      return [back(12), today];
  }
}

function isFilterColour(v: unknown): v is FilterColour {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return Object.keys(c).length === 2 && (c.key === 'bg' || c.key === 'fc') && isColour(c.is);
}
const shortText = (v: unknown) => typeof v === 'string' && v.length <= INPUT_MAX;

/** Whether `v` is a filter condition as a write may store one: its listed values (strings, at most
 *  a sheet's rows), a known operator and its operands (short strings), nothing else. Every viewer
 *  draws a stored condition, so a malformed one would break the sheet for all of them. */
export function isFilterCondition(
  v: unknown,
  // A custom formula's references (validate.ts isStoredRef), checked where a write is.
  refsOk: (refs: unknown[]) => boolean = () => true,
): v is FilterCondition {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  if (!Object.keys(c).every((k) => CONDITION_KEYS.has(k))) return false;
  if (
    c.values !== undefined &&
    !(Array.isArray(c.values) && c.values.length <= SHEET_ROWS_MAX && c.values.every(shortText))
  )
    return false;
  if (c.op === 'formula')
    return (
      c.a === undefined &&
      c.b === undefined &&
      c.d === undefined &&
      storedFormulaOk(c.fx) &&
      refsOk(c.fx.r) &&
      (c.colour === undefined || isFilterColour(c.colour))
    );
  if (c.fx !== undefined) return false;
  if (c.op !== undefined && !(CONDITION_OPS as readonly unknown[]).includes(c.op)) return false;
  if (
    c.d !== undefined &&
    !(DATE_OPS.has(c.op) && (DATE_PERIODS as readonly unknown[]).includes(c.d))
  )
    return false;
  if (c.colour !== undefined && !isFilterColour(c.colour)) return false;
  return (c.a === undefined || shortText(c.a)) && (c.b === undefined || shortText(c.b));
}

// A condition's value as a number (a date as its day number), as the conditions read it; null for text.
export function conditionNumber(text: string | undefined, locale: string): number | null {
  if (text === undefined) return null;
  const n = parsePlainNumber(text);
  if (n !== null) return n;
  const d = parseDateText(text, localeDayFirst(locale));
  return d ? d.serial : null;
}

export function conditionMatches(
  cond: FilterCondition,
  value: Scalar,
  shown: string,
  locale: string,
  // `cond.values` as a set, built once per filter rather than scanned per row.
  valueSet?: ReadonlySet<string>,
  today = 0,
): boolean {
  return conditionMatcher(cond, locale, valueSet, today)(value, shown);
}

// A condition read once (its operands parsed, its text lowered), for checking many cells: a format rule's condition
// is checked for every drawn cell it covers (conditional-formatting.md "Performance").
// A Custom Formula Is condition is met outside it (filterTest), so here it lets every value through.
export function conditionMatcher(
  cond: FilterCondition,
  locale: string,
  valueSet?: ReadonlySet<string>,
  // The day a period counts from (`cond.d`), as a serial.
  today = 0,
): (value: Scalar, shown: string) => boolean {
  const a = (cond.a ?? '').toLowerCase();
  const period = cond.d ? periodDays(cond.d, today) : null;
  const na = period ? null : conditionNumber(cond.a, locale);
  const nb = conditionNumber(cond.b, locale);
  const values = cond.values;
  const kept = values ? (valueSet ?? new Set(values)) : null;
  return (value, shown) => {
    if (kept && !kept.has(shown)) return false;
    if (!cond.op || cond.op === 'formula') return true;
    const empty = value === null || value === '';
    const text = shown.toLowerCase();
    const num = typeof value === 'number' ? value : null;
    switch (cond.op) {
      case 'empty':
        return empty;
      case 'notEmpty':
        return !empty;
      case 'contains':
        return text.includes(a);
      case 'notContains':
        return !text.includes(a);
      case 'startsWith':
        return text.startsWith(a);
      case 'endsWith':
        return text.endsWith(a);
      case 'exactly':
        return text === a;
      case 'dateBefore':
        if (period) return num !== null && Math.floor(num) < period[0];
        return num !== null && na !== null && num < Math.floor(na);
      case 'lt':
        return num !== null && na !== null && num < na;
      case 'dateAfter':
        if (period) return num !== null && Math.floor(num) > period[1];
        return num !== null && na !== null && Math.floor(num) > Math.floor(na);
      case 'dateOn':
        if (period)
          return num !== null && Math.floor(num) >= period[0] && Math.floor(num) <= period[1];
        return num !== null && na !== null && Math.floor(num) === Math.floor(na);
      case 'gt':
        return num !== null && na !== null && num > na;
      case 'gte':
        return num !== null && na !== null && num >= na;
      case 'lte':
        return num !== null && na !== null && num <= na;
      case 'between':
        return (
          num !== null &&
          na !== null &&
          nb !== null &&
          num >= Math.min(na, nb) &&
          num <= Math.max(na, nb)
        );
      case 'notBetween':
        return (
          num !== null &&
          na !== null &&
          nb !== null &&
          (num < Math.min(na, nb) || num > Math.max(na, nb))
        );
      case 'eq':
        return na !== null ? num === na : text === a;
      case 'neq':
        return na !== null ? num !== na : text !== a;
    }
  };
}

/** Whether a row (by position) is filtered out, its values read through `read`. */
export type FilterTest = (r: number, read: (r: number, c: number) => Value) => boolean;

// The test of a sheet's filter: rows of its range under the header row that some column's condition rejects; null
// when the sheet has no filter or no condition. SUBTOTAL reads it through its formula's frame, so its reads are noted.
export type FilterReads = {
  locale: string;
  // Today's serial, for a date condition's period.
  today: number;
  // The cells' drawn colours (filter-colours.ts), for Filter by Colour.
  colourOf: CellColourOf;
  // Whether a Custom Formula Is condition, written for `anchor`, holds in (r, c).
  formulaMet: (
    fx: StoredFormula,
    anchor: { r: number; c: number },
    r: number,
    c: number,
  ) => boolean;
};

// The filter drawn: the sheet's, or a filter view open in its place (data-tools.md "Filters, filter views and
// slicers"); null for none. Formulas read the sheet's alone.
export type DrawnFilter = IdRange & { conds: Record<string, FilterCondition> };

export function filterTest(
  sheet: Sheet,
  reads: FilterReads,
  filter: DrawnFilter | null | undefined = sheet.layout.filter,
): FilterTest | null {
  const { locale } = reads;
  if (!filter) return null;
  const box = posRangeOf(sheet.layout, filter);
  if (!box) return null;
  const ix = layoutIndex(sheet.layout);
  // A condition stored before writes were checked may be malformed (isFilterCondition): it filters
  // nothing, rather than breaking the sheet for every viewer. Checked once here, not per row.
  const conds = Object.entries(filter.conds)
    .map(([col, cond]) => ({ c: ix.colPos.get(col), col, cond }))
    .filter(
      (x): x is { c: number; col: string; cond: FilterCondition } =>
        x.c !== undefined && isFilterCondition(x.cond),
    )
    .map((x) => ({ ...x, matches: conditionMatcher(x.cond, locale, undefined, reads.today) }));
  if (conds.length === 0) return null;
  return (r, read) => {
    if (r <= box.r1 || r > box.r2) return false;
    const rowId = sheet.layout.rows[r]!;
    return conds.some(({ c, col, cond, matches }) => {
      if (cond.colour && reads.colourOf(r, c, cond.colour.key) !== cond.colour.is) return true;
      if (cond.op === 'formula' && !reads.formulaMet(cond.fx!, { r: box.r1 + 1, c }, r, c))
        return true;
      const v = read(r, c);
      const shown = displayValue(v, sheet.cells.get(cellKey(rowId, col))?.format, locale).text;
      return !matches(isError(v) ? v : (v as Scalar), shown);
    });
  };
}

// The row ids the drawn filter hides (its header row never): the sheet's unless another is given.
export function filteredOutRows(
  wb: Workbook,
  sheetId: string,
  filter?: DrawnFilter | null,
): Set<string> {
  const out = new Set<string>();
  const sheet = wb.sheet(sheetId);
  const test =
    sheet &&
    filterTest(
      sheet,
      workbookFilterReads(wb, sheetId),
      filter === undefined ? sheet.layout.filter : filter,
    );
  if (!sheet || !test) return out;
  const read = (r: number, c: number): Value => wb.value(sheetId, r, c);
  sheet.layout.rows.forEach((rowId, r) => {
    if (test(r, read)) out.add(rowId);
  });
  return out;
}

// A column's displayed values under the filter's header, with how many rows show each, for Filter by Values.
export function columnValueCounts(
  wb: Workbook,
  sheetId: string,
  colId: string,
  drawn?: DrawnFilter | null,
): { text: string; count: number }[] {
  const sheet = wb.sheet(sheetId);
  const filter = drawn === undefined ? sheet?.layout.filter : drawn;
  if (!sheet || !filter) return [];
  const box = posRangeOf(sheet.layout, filter);
  const c = layoutIndex(sheet.layout).colPos.get(colId);
  if (!box || c === undefined) return [];
  const counts = new Map<string, number>();
  for (let r = box.r1 + 1; r <= box.r2; r++) {
    const v = wb.value(sheetId, r, c);
    const shown = displayValue(
      v,
      sheet.cells.get(cellKey(sheet.layout.rows[r]!, colId))?.format,
      wb.locale,
    ).text;
    counts.set(shown, (counts.get(shown) ?? 0) + 1);
  }
  return [...counts]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) =>
      a.text === ''
        ? 1
        : b.text === ''
          ? -1
          : a.text.localeCompare(b.text, 'en', { numeric: true }),
    );
}
