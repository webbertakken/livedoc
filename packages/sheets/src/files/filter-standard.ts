// The one mapping of a filter column's condition to the files' filter forms (docs/specs/029-sheets/standard-mapping.md
// "Filters in the file", D477): a condition as a standard column, its kept values, one or two tests or a day, which
// each format writes and reads (xlsx-filters.ts, ods-filters.ts); read back, the condition a standard column says.
import { periodDays, conditionNumber } from '../filter';
import type { FilterCondition } from '../sheet';

export type StandardOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'notContains'
  | 'begins'
  | 'ends'
  | 'empty'
  | 'notEmpty';

/** One test of a column: its operator and operand (a number as its text, none for the two empty tests). */
export type StandardTest = { op: StandardOp; v: string };

/** The days a file's filter names by itself (Excel's `dynamicFilter`). */
export type StandardDay = 'today' | 'tomorrow' | 'yesterday';

/** A column's filter as the files say it: kept values (the blank apart), one or two tests joined by and (or by or), a day. */
export type StandardColumn =
  | { values: string[]; blank?: true }
  | { tests: StandardTest[]; or?: true }
  // `at` the day's number when written, for a format that says the day as its number.
  | { day: StandardDay; at?: number };

const NUMBER_OPS: ReadonlySet<StandardOp> = new Set(['gt', 'gte', 'lt', 'lte']);
const TEXT_OPS: Partial<Record<FilterCondition['op'] & string, StandardOp>> = {
  contains: 'contains',
  notContains: 'notContains',
  startsWith: 'begins',
  endsWith: 'ends',
};
const READ_TEXT_OPS: Partial<Record<StandardOp, FilterCondition['op'] & string>> = {
  contains: 'contains',
  notContains: 'notContains',
  begins: 'startsWith',
  ends: 'endsWith',
};

const num = (n: number) => String(n);
const one = (op: StandardOp, v: string): StandardColumn => ({ tests: [{ op, v }] });
const both = (a: StandardTest, b: StandardTest, or = false): StandardColumn =>
  or ? { tests: [a, b], or: true } : { tests: [a, b] };

// A date condition's standard column: a day as `≥ d` and `< d + 1`, before as `< d`, after as `≥ d + 1`.
function dateColumn(cond: FilterCondition, locale: string, today: number): StandardColumn | null {
  if (
    cond.op === 'dateOn' &&
    (cond.d === 'today' || cond.d === 'tomorrow' || cond.d === 'yesterday')
  )
    return { day: cond.d, at: periodDays(cond.d, today)[0] };
  const days = cond.d ? periodDays(cond.d, today) : null;
  const n = days ? null : conditionNumber(cond.a, locale);
  const [first, last] = days ?? (n === null ? [NaN, NaN] : [Math.floor(n), Math.floor(n)]);
  if (Number.isNaN(first)) return null;
  switch (cond.op) {
    case 'dateBefore':
      return one('lt', num(first));
    case 'dateAfter':
      return one('gte', num(last + 1));
    default:
      return both({ op: 'gte', v: num(first) }, { op: 'lt', v: num(last + 1) });
  }
}

/**
 * A column's condition as the files say it; null when no file's filter can (Filter by Colour, Custom Formula Is, a
 * comparison of text). A condition comes before kept values; dates count from `today`, a serial.
 */
export function standardColumnOf(
  cond: FilterCondition,
  locale: string,
  today: number,
): StandardColumn | null {
  const op = cond.op;
  if (op === undefined) {
    if (!cond.values) return null;
    const values = cond.values.filter((v) => v !== '');
    return values.length < cond.values.length ? { values, blank: true } : { values };
  }
  const a = cond.a ?? '';
  switch (op) {
    case 'formula':
      return null;
    case 'empty':
    case 'notEmpty':
      return one(op, '');
    case 'contains':
    case 'notContains':
    case 'startsWith':
    case 'endsWith':
      return one(TEXT_OPS[op]!, a);
    case 'exactly':
      return one('eq', a);
    case 'dateOn':
    case 'dateBefore':
    case 'dateAfter':
      return dateColumn(cond, locale, today);
    case 'eq':
    case 'neq': {
      const n = conditionNumber(cond.a, locale);
      return one(op, n === null ? a : num(n));
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const n = conditionNumber(cond.a, locale);
      return n === null ? null : one(op, num(n));
    }
    case 'between':
    case 'notBetween': {
      const x = conditionNumber(cond.a, locale);
      const y = conditionNumber(cond.b, locale);
      if (x === null || y === null) return null;
      const [lo, hi] = [Math.min(x, y), Math.max(x, y)];
      return op === 'between'
        ? both({ op: 'gte', v: num(lo) }, { op: 'lte', v: num(hi) })
        : both({ op: 'lt', v: num(lo) }, { op: 'gt', v: num(hi) }, true);
    }
  }
}

const isNumberText = (v: string) => v.trim() !== '' && Number.isFinite(Number(v));

// One test as a condition; null when LiveDoc has none for it.
function testCondition(t: StandardTest): FilterCondition | null {
  if (t.op === 'empty' || t.op === 'notEmpty') return { op: t.op };
  const text = READ_TEXT_OPS[t.op];
  if (text) return { op: text, a: t.v };
  if (NUMBER_OPS.has(t.op) && !isNumberText(t.v)) return null;
  return { op: t.op as FilterCondition['op'], a: t.v };
}

// Two tests as a condition: `≥ a` and `≤ b` Is Between, `≥ d` and `< d + 1` Date Is, `< a` or `> b` Is Not Between.
function pairCondition([x, y]: StandardTest[], or: boolean): FilterCondition | null {
  if (!isNumberText(x!.v) || !isNumberText(y!.v)) return null;
  if (!or && x!.op === 'gte' && y!.op === 'lte') return { op: 'between', a: x!.v, b: y!.v };
  if (!or && x!.op === 'gte' && y!.op === 'lt' && Number(y!.v) === Number(x!.v) + 1)
    return { op: 'dateOn', a: x!.v };
  if (or && x!.op === 'lt' && y!.op === 'gt') return { op: 'notBetween', a: x!.v, b: y!.v };
  return null;
}

/** The condition a standard column says; null when LiveDoc has none for it (`filter_unread`). */
export function conditionOfStandard(std: StandardColumn): FilterCondition | null {
  if ('values' in std) return { values: std.blank ? [...std.values, ''] : [...std.values] };
  if ('day' in std) return { op: 'dateOn', d: std.day };
  if (std.tests.length === 1) return testCondition(std.tests[0]!);
  if (std.tests.length === 2) return pairCondition(std.tests, std.or === true);
  return null;
}

/** A column's line of a filter's fingerprint: its place in the sheet and its standard column, one text. */
export const standardLine = (c: number, std: StandardColumn): string =>
  `${c} ${JSON.stringify(canonical(std))}`;

// A standard column with its keys in one order, however a reader built it.
function canonical(std: StandardColumn): StandardColumn {
  if ('values' in std)
    return { values: std.values, ...(std.blank ? { blank: true as const } : {}) };
  if ('day' in std) return { day: std.day };
  return {
    tests: std.tests.map((t) => ({ op: t.op, v: t.v })),
    ...(std.or ? { or: true as const } : {}),
  };
}
