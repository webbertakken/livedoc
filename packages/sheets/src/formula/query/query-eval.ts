// A QUERY expression's value for one row, or for a group of rows where it aggregates (formulas.md "QUERY"): scalar
// functions, arithmetic, comparisons and text matches as Google's Visualization API Query Language defines them.
import { dateFromSerial } from '../../dates';
import { regex } from '../functions/text-patterns';
import type { Aggregate, QueryExpr, QueryValue } from './query-parse';
import type { QueryTable } from './query-table';

export type QueryContext = {
  table: QueryTable;
  // The row a column reads (a group's first), and the rows an aggregate reads.
  row: QueryValue[] | null;
  rows: QueryValue[][];
  now: number;
};

const TYPE_ORDER = ['number', 'string', 'boolean'];

// The order values sort in: null first, then numbers, text and booleans; within a type numbers and booleans by
// value, text by its code units (case-sensitive).
export function compareQueryValues(a: QueryValue, b: QueryValue): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
  if (typeof a !== typeof b) return TYPE_ORDER.indexOf(typeof a) - TYPE_ORDER.indexOf(typeof b);
  return a < b ? -1 : a > b ? 1 : 0;
}

function aggregate(fn: Aggregate, values: QueryValue[]): QueryValue {
  const present = values.filter((v) => v !== null);
  if (fn === 'count') return present.length;
  if (present.length === 0) return null;
  if (fn === 'sum' || fn === 'avg') {
    const total = (present as number[]).reduce((s, n) => s + n, 0);
    return fn === 'sum' ? total : total / present.length;
  }
  const sign = fn === 'max' ? 1 : -1;
  return present.reduce((best, v) => (sign * compareQueryValues(v, best) > 0 ? v : best));
}

const escaped = (ch: string) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const asText = (v: QueryValue): string =>
  typeof v === 'boolean' ? String(v).toUpperCase() : String(v);

function textMatch(op: string, whole: string, part: string): boolean | null {
  if (op === 'contains') return whole.includes(part);
  if (op === 'starts with') return whole.startsWith(part);
  if (op === 'ends with') return whole.endsWith(part);
  const source =
    op === 'like'
      ? [...part]
          .map((ch) => (ch === '%' ? '[\\s\\S]*' : ch === '_' ? '[\\s\\S]' : escaped(ch)))
          .join('')
      : part;
  const re = regex(`^(?:${source})$`, whole);
  return re instanceof RegExp ? re.test(whole) : null;
}

function scalar(fn: string, args: QueryValue[], now: number): QueryValue {
  if (fn === 'now') return now;
  const [a, b] = args;
  if (fn === 'upper' || fn === 'lower')
    return typeof a === 'string' ? (fn === 'upper' ? a.toUpperCase() : a.toLowerCase()) : null;
  if (typeof a !== 'number') return null;
  if (fn === 'datediff') return typeof b === 'number' ? Math.floor(a) - Math.floor(b) : null;
  if (fn === 'todate') return Math.floor(a);
  const d = dateFromSerial(a);
  const parts: Record<string, number> = {
    year: d.y,
    month: d.m - 1,
    day: d.d,
    hour: d.h,
    minute: d.min,
    second: d.s,
    millisecond: Math.round((a * 86_400_000) % 1000),
    quarter: Math.ceil(d.m / 3),
    dayofweek: d.weekday + 1,
  };
  return parts[fn]!;
}

function arithmetic(op: string, a: QueryValue, b: QueryValue): QueryValue {
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  return b === 0 ? null : a / b;
}

function compare(op: string, a: QueryValue, b: QueryValue): boolean {
  // A comparison with null, or between two types, is false.
  if (a === null || b === null || typeof a !== typeof b) return false;
  const c = compareQueryValues(a, b);
  if (op === '=') return c === 0;
  if (op === '!=') return c !== 0;
  if (op === '<') return c < 0;
  if (op === '<=') return c <= 0;
  if (op === '>') return c > 0;
  return c >= 0;
}

/** An expression's value in a context; a text match whose pattern is too costly is null. */
export function evaluateQuery(e: QueryExpr, ctx: QueryContext): QueryValue {
  const at = (x: QueryExpr) => evaluateQuery(x, ctx);
  switch (e.k) {
    case 'col':
      return ctx.row ? ctx.row[ctx.table.ids.get(e.id)!]! : null;
    case 'lit':
      return e.v;
    case 'agg': {
      const j = ctx.table.ids.get(e.col)!;
      return aggregate(
        e.fn,
        ctx.rows.map((r) => r[j]!),
      );
    }
    case 'fn':
      return scalar(e.fn, e.args.map(at), ctx.now);
    case 'arith':
      return arithmetic(e.op, at(e.a), at(e.b));
    case 'neg': {
      const a = at(e.a);
      return typeof a === 'number' ? -a : null;
    }
    case 'cmp':
      return compare(e.op, at(e.a), at(e.b));
    case 'text': {
      const a = at(e.a);
      const b = at(e.b);
      return a === null || b === null ? false : textMatch(e.op, asText(a), asText(b));
    }
    case 'isNull':
      return (at(e.a) === null) !== e.not;
    case 'logic': {
      const a = at(e.a) === true;
      if (e.op === 'and') return a && at(e.b) === true;
      return a || at(e.b) === true;
    }
    case 'not':
      return at(e.a) !== true;
  }
}
