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

// A calculated field's summary: one of the summaries, each column name in its formula reading that summary over the
// cell's rows, or Custom, each name reading the rows' values as an array (pivot-tables.md "The output", D600).
export type PivotCalcSummary = PivotSummary | 'CUSTOM';

/** A value: a source column summarised, or a calculated field (`formula`, over the source's column names). */
export type PivotValueSpec =
  | { col: number; summary: PivotSummary; showAs?: PivotShowAs; name?: string; formula?: undefined }
  | {
      formula: string;
      summary: PivotCalcSummary;
      showAs?: PivotShowAs;
      name?: string;
      col?: undefined;
    };

/** A filter by values or a condition, or by a formula over the source's column names, true to keep a row. */
export type PivotFilterSpec =
  | { col: number; cond: FilterCondition; formula?: undefined }
  | { col: number; formula: string; cond?: undefined };

/** What a pivot table's formulas are worked out by (the engine's, pivot-calc.ts). */
export type PivotCalc = {
  /** A calculated field over source `rows`. */
  field(formula: string, summary: PivotCalcSummary, rows: readonly number[]): Scalar;
  /** Whether a filter's formula holds for source row `row`. */
  holds(formula: string, row: number): boolean;
};

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
/**
 * What GETPIVOTDATA reads of an output (formulas.md "Lookup"): each value's name and its source column's; the groups'
 * headers; and each value cell, by its place in the output, with the groups' items it summarises, outermost first (a
 * total names fewer, the Grand Total none).
 */
export type PivotIndex = {
  values: readonly { name: string; col?: string }[];
  keys: readonly string[];
  cells: readonly {
    v: number;
    pairs: readonly (readonly [string, string])[];
    r: number;
    c: number;
  }[];
};

/** The output's header rows (above the values) and label columns (left of them), its headers to a screen reader. */
export type PivotHead = { rows: number; cols: number };

/** The output, row by row, every row as wide as the widest, what GETPIVOTDATA reads of it, and its headers. */
export type PivotOutput = {
  rows: PivotOutCell[][];
  width: number;
  index: PivotIndex;
  head: PivotHead;
};
