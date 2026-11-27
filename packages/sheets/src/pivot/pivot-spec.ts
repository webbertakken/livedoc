// A pivot table as its output is worked out (docs/specs/029-sheets/pivot-tables.md "The output"): its source as values
// and shown texts, and its groups, values and filters by the source column's place. The model's fields by column id
// resolve to these places before the output is worked out.
import type { FilterCondition } from '../sheet';
import type { Scalar } from '../formula/values';

export const PIVOT_SUMMARIES = [
  'SUM',
  'COUNTA',
  'COUNT',
  'COUNTUNIQUE',
  'AVERAGE',
  'MAX',
  'MIN',
  'MEDIAN',
  'PRODUCT',
  'STDEV',
  'STDEVP',
  'VAR',
  'VARP',
] as const;
export type PivotSummary = (typeof PIVOT_SUMMARIES)[number];

/** How a date groups, as Google's `dateTimeRule` types. */
export const PIVOT_DATE_RULES = [
  'second',
  'minute',
  'hour',
  'hourMinute',
  'hourMinuteAmPm',
  'dayOfWeek',
  'dayOfYear',
  'dayOfMonth',
  'dayMonth',
  'month',
  'quarter',
  'year',
  'yearQuarter',
  'yearMonth',
  'yearMonthDay',
] as const;
export type PivotDateRule = (typeof PIVOT_DATE_RULES)[number];

export type PivotGrouping =
  | { k: 'date'; rule: PivotDateRule }
  | { k: 'interval'; size: number; start?: number; end?: number }
  | { k: 'custom'; groups: readonly { name: string; items: readonly string[] }[] };

export type PivotGroupSpec = {
  /** The source column, by its place in the source. */
  col: number;
  desc?: boolean;
  /** Sort by a value (its place among the values), in a column item's total (its labels, outermost first) or the Grand Total. */
  sortBy?: { value: number; item?: readonly string[] };
  /** Whether the group's totals show (on when absent). */
  totals?: boolean;
  /** Repeat Row Labels (rows only). */
  repeat?: boolean;
  grouping?: PivotGrouping;
};

export type PivotShowAs = 'row' | 'column' | 'total';

export type PivotValueSpec = {
  col: number;
  summary: PivotSummary;
  showAs?: PivotShowAs;
  name?: string;
};

export type PivotFilterSpec = { col: number; cond: FilterCondition };

export type PivotSpec = {
  rows: readonly PivotGroupSpec[];
  columns: readonly PivotGroupSpec[];
  values: readonly PivotValueSpec[];
  filters?: readonly PivotFilterSpec[];
  /** Values as rows (Google's vertical layout); as columns when absent. */
  valuesAsRows?: boolean;
};

/** A source cell: its value and its text as shown. */
export type PivotCell = { v: Scalar; shown: string };

/** The source: its header's names, then its rows of cells. */
export type PivotSource = {
  header: readonly string[];
  rows: readonly (readonly PivotCell[])[];
};

/** How an output cell is shown: as a percentage, or in its source column's number format. */
export type PivotFormat = 'percent' | { col: number };

/** One output cell: its value (null blank), and its format when it takes one. */
export type PivotOutCell = { v: Scalar; fmt?: PivotFormat };

/** The output, row by row, every row as wide as the widest. */
export type PivotOutput = { rows: PivotOutCell[][]; width: number };
