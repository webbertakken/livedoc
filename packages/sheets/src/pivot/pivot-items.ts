// A pivot group's items (docs/specs/029-sheets/pivot-tables.md "The output", Groups and Grouping): what each source
// cell groups as, its label and its place in the order; and the group's header. Grouped items (dates, intervals) come
// first in their own order; then numbers, text (a blank as empty text) without case, booleans and errors.
import { dateFromSerial, DAY_NAMES, MONTH_NAMES } from '../dates';
import { isError, type Scalar } from '../formula/values';
import type { PivotCell, PivotDateRule, PivotFormat, PivotGroupSpec } from './pivot-spec';

export type PivotItem = {
  /** Same key, same item. */
  key: string;
  /** Grouped items 0, then numbers 1, text 2, booleans 3, errors 4. */
  rank: number;
  order: number | string;
  label: Scalar;
  fmt?: PivotFormat;
  /** A cell's own item: the source cell as it shows, which a custom group names it by. */
  shown?: string;
  /** An item a grouping made: a date rule's or an interval's (`rule`), or a custom group's. */
  made?: 'rule' | 'custom';
};

const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
const pad = (n: number) => String(n).padStart(2, '0');

const DATE_HEADERS: Record<PivotDateRule, string> = {
  second: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  hourMinute: 'Hour-Minute',
  hourMinuteAmPm: 'Hour-Minute (12 hour)',
  dayOfWeek: 'Day of the week',
  dayOfYear: 'Day of the year',
  dayOfMonth: 'Day of the month',
  dayMonth: 'Day-Month',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  yearQuarter: 'Year-Quarter',
  yearMonth: 'Year-Month',
  yearMonthDay: 'Year-Month-Day',
};

/** A group's header: its column's name, or its grouping's. */
export function groupHeader(group: PivotGroupSpec, name: string): string {
  const g = group.grouping;
  if (!g) return name;
  return g.k === 'date' ? `${name} - ${DATE_HEADERS[g.rule]}` : `Grouped ${name}`;
}

// A date's item under a rule: its label and its order in time.
function dateItem(serial: number, rule: PivotDateRule): [string, number] {
  const p = dateFromSerial(serial);
  const q = Math.ceil(p.m / 3);
  const yearDay = Math.floor(serial) - Math.floor(Date.UTC(p.y, 0, 1) / 86_400_000 + 25_569) + 1;
  switch (rule) {
    case 'second':
      return [String(p.s), p.s];
    case 'minute':
      return [String(p.min), p.min];
    case 'hour':
      return [String(p.h), p.h];
    case 'hourMinute':
      return [`${p.h}:${pad(p.min)}`, p.h * 60 + p.min];
    case 'hourMinuteAmPm':
      return [`${p.h % 12 || 12}:${pad(p.min)} ${p.h < 12 ? 'AM' : 'PM'}`, p.h * 60 + p.min];
    case 'dayOfWeek':
      return [DAY_NAMES[p.weekday]!, p.weekday];
    case 'dayOfYear':
      return [String(yearDay), yearDay];
    case 'dayOfMonth':
      return [String(p.d), p.d];
    case 'dayMonth':
      return [`${p.d}-${MONTH_SHORT[p.m - 1]}`, p.m * 100 + p.d];
    case 'month':
      return [MONTH_SHORT[p.m - 1]!, p.m];
    case 'quarter':
      return [`Q${q}`, q];
    case 'year':
      return [String(p.y), p.y];
    case 'yearQuarter':
      return [`${p.y}-Q${q}`, p.y * 10 + q];
    case 'yearMonth':
      return [`${p.y}-${MONTH_SHORT[p.m - 1]}`, p.y * 100 + p.m];
    case 'yearMonthDay':
      return [`${p.y}-${pad(p.m)}-${pad(p.d)}`, p.y * 10_000 + p.m * 100 + p.d];
  }
}

// A cell's own item: its value, ranked by kind.
function plainItem(cell: PivotCell, col: number): PivotItem {
  const v = cell.v;
  const shown = cell.shown;
  if (typeof v === 'number')
    return { key: `n${v}`, rank: 1, order: v, label: v, fmt: { col }, shown };
  if (typeof v === 'boolean') return { key: `b${v}`, rank: 3, order: Number(v), label: v, shown };
  if (isError(v)) return { key: `e${v.e}`, rank: 4, order: v.e, label: v, shown };
  const text = v ?? '';
  return { key: `s${text}`, rank: 2, order: text.toLowerCase(), label: text, shown };
}

const grouped = (label: string, order: number): PivotItem => ({
  key: `g${label}`,
  rank: 0,
  order,
  label,
  made: 'rule',
});

/**
 * The item each cell of a group's column groups as. `numbers` are the column's numbers among the rows kept, which
 * size an interval grouping's buckets.
 */
export function itemMaker(
  group: PivotGroupSpec,
  numbers: readonly number[],
): (cell: PivotCell) => PivotItem {
  const g = group.grouping;
  if (!g) return (cell) => plainItem(cell, group.col);
  if (g.k === 'date')
    return (cell) => {
      if (typeof cell.v !== 'number') return plainItem(cell, group.col);
      const [label, order] = dateItem(cell.v, g.rule);
      return grouped(label, order);
    };
  if (g.k === 'custom') {
    const named = new Map<string, string>();
    for (const { name, items } of g.groups) for (const item of items) named.set(item, name);
    return (cell) => {
      const name = named.get(cell.shown);
      return name === undefined
        ? plainItem(cell, group.col)
        : { key: `s${name}`, rank: 2, order: name.toLowerCase(), label: name, made: 'custom' };
    };
  }
  // Number intervals: whole labels (`0 - 4`) when the size and every number are whole.
  const { size, start, end } = g;
  const whole = Number.isInteger(size) && numbers.every(Number.isInteger);
  const low = start ?? Math.floor(Math.min(...numbers) / size) * size;
  const buckets = end === undefined ? Infinity : Math.max(1, Math.ceil((end - low) / size));
  return (cell) => {
    const v = cell.v;
    if (typeof v !== 'number') return plainItem(cell, group.col);
    if (start !== undefined && v < start) return grouped(`< ${start}`, -1);
    if (end !== undefined && v > end) return grouped(`> ${end}`, buckets);
    const k = Math.min(Math.floor((v - low) / size), buckets - 1);
    const lo = low + k * size;
    const last = k === buckets - 1;
    const hi = last ? end! : whole ? lo + size - 1 : lo + size;
    return grouped(`${lo} - ${hi}`, k);
  };
}

/** Items in ascending order: grouped ones, numbers, text, booleans, errors. */
export function compareItems(a: PivotItem, b: PivotItem): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (typeof a.order === 'number' && typeof b.order === 'number') return a.order - b.order;
  return String(a.order).localeCompare(String(b.order));
}
