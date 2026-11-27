// docs/specs/029-sheets/pivot-tables.md "The output" (D379): each evidence case's output, worked out here, is the
// output Google Sheets worked out for it (corpus/google/pivot-answers.json, made by CORPUS_SOURCE=google-pivots from
// corpus/pivot-cases.ts), both as the output alone and as the engine lays it into a sheet. Cases whose fields are
// formulas (calculated fields, custom summaries, custom formula filters, D600) are worked out by the engine alone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isoFromSerial } from '../dates';
import type { FilterCondition } from '../sheet';
import {
  GETPIVOTDATA_PROBES,
  PIVOT_CASES,
  PIVOT_SOURCE_HEADER,
  PIVOT_SOURCE_ROWS,
} from '../../corpus/pivot-cases';
import { pivotOutput } from './pivot-output';
import { book } from '../testing/book';
import { isError } from '../formula/values';
import type {
  SheetPivot,
  SheetPivotFilter,
  SheetPivotGroup,
  SheetPivotValue,
} from '../objects/sheet-pivot';
import type {
  PivotDateRule,
  PivotFilterSpec,
  PivotGroupSpec,
  PivotGrouping,
  PivotSource,
  PivotSpec,
  PivotSummary,
  PivotValueSpec,
} from './pivot-spec';

const ANSWERS = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'corpus', 'google', 'pivot-answers.json'),
    'utf8',
  ),
) as Record<string, unknown[][]>;

const WITH_FORMULAS = new Set(['Calculated field', 'Custom summary', 'Filter by formula']);

// The Sheets API's names for what LiveDoc names otherwise.
const DATE_RULES: Record<string, PivotDateRule> = {
  SECOND: 'second',
  MINUTE: 'minute',
  HOUR: 'hour',
  HOUR_MINUTE: 'hourMinute',
  HOUR_MINUTE_AMPM: 'hourMinuteAmPm',
  DAY_OF_WEEK: 'dayOfWeek',
  DAY_OF_YEAR: 'dayOfYear',
  DAY_OF_MONTH: 'dayOfMonth',
  DAY_MONTH: 'dayMonth',
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
  YEAR_QUARTER: 'yearQuarter',
  YEAR_MONTH: 'yearMonth',
  YEAR_MONTH_DAY: 'yearMonthDay',
};
const SHOW_AS = {
  PERCENT_OF_ROW_TOTAL: 'row',
  PERCENT_OF_COLUMN_TOTAL: 'column',
  PERCENT_OF_GRAND_TOTAL: 'total',
} as const;
const CONDITIONS: Record<string, FilterCondition['op']> = {
  NUMBER_GREATER: 'gt',
  TEXT_CONTAINS: 'contains',
};

type ApiGroup = {
  sourceColumnOffset: number;
  showTotals?: boolean;
  sortOrder?: string;
  repeatHeadings?: boolean;
  valueBucket?: { valuesIndex: number; buckets: { stringValue: string }[] };
  groupRule?: {
    dateTimeRule?: { type: string };
    histogramRule?: { interval: number; start?: number; end?: number };
    manualRule?: {
      groups: { groupName: { stringValue: string }; items: { stringValue: string }[] }[];
    };
  };
};

function grouping(rule: ApiGroup['groupRule']): PivotGrouping | undefined {
  if (rule?.dateTimeRule) return { k: 'date', rule: DATE_RULES[rule.dateTimeRule.type]! };
  if (rule?.histogramRule) {
    const { interval, start, end } = rule.histogramRule;
    return { k: 'interval', size: interval, start, end };
  }
  if (rule?.manualRule)
    return {
      k: 'custom',
      groups: rule.manualRule.groups.map((g) => ({
        name: g.groupName.stringValue,
        items: g.items.map((i) => i.stringValue),
      })),
    };
  return undefined;
}

const group = (g: ApiGroup): PivotGroupSpec => ({
  col: g.sourceColumnOffset,
  ...(g.sortOrder === 'DESCENDING' ? { desc: true } : {}),
  ...(g.showTotals === false ? { totals: false } : {}),
  ...(g.repeatHeadings ? { repeat: true } : {}),
  ...(g.valueBucket
    ? {
        sortBy: {
          value: g.valueBucket.valuesIndex,
          ...(g.valueBucket.buckets.length
            ? { item: g.valueBucket.buckets.map((b) => b.stringValue) }
            : {}),
        },
      }
    : {}),
  ...(grouping(g.groupRule) ? { grouping: grouping(g.groupRule)! } : {}),
});

function specOf(pivot: Record<string, unknown>): PivotSpec {
  const values = (pivot.values ?? []) as {
    summarizeFunction: string;
    sourceColumnOffset: number;
    calculatedDisplayType?: keyof typeof SHOW_AS;
    name?: string;
    formula?: string;
  }[];
  const filters = (pivot.filterSpecs ?? []) as {
    columnOffsetIndex: number;
    filterCriteria: {
      visibleValues?: string[];
      condition?: { type: string; values: { userEnteredValue: string }[] };
    };
  }[];
  return {
    rows: ((pivot.rows ?? []) as ApiGroup[]).map(group),
    columns: ((pivot.columns ?? []) as ApiGroup[]).map(group),
    values: values.map((v): PivotValueSpec =>
      v.formula
        ? { formula: v.formula, summary: v.summarizeFunction as PivotSummary, name: v.name! }
        : {
            col: v.sourceColumnOffset,
            summary: v.summarizeFunction as PivotSummary,
            ...(v.calculatedDisplayType ? { showAs: SHOW_AS[v.calculatedDisplayType] } : {}),
          },
    ),
    filters: filters.map(({ columnOffsetIndex, filterCriteria: f }): PivotFilterSpec => {
      if (f.condition?.type === 'CUSTOM_FORMULA')
        return { col: columnOffsetIndex, formula: f.condition.values[0]!.userEnteredValue };
      return {
        col: columnOffsetIndex,
        cond: f.condition
          ? { op: CONDITIONS[f.condition.type]!, a: f.condition.values[0]!.userEnteredValue }
          : { values: f.visibleValues! },
      };
    }),
    ...(pivot.valueLayout === 'VERTICAL' ? { valuesAsRows: true } : {}),
  };
}

const SOURCE: PivotSource = {
  header: PIVOT_SOURCE_HEADER,
  rows: PIVOT_SOURCE_ROWS.map((row) =>
    row.map((v, c) => ({
      v,
      shown: v === null ? '' : c === 2 ? isoFromSerial(v as number) : String(v),
    })),
  ),
};

// An output as Google answers it: blank as '', each row without its trailing blanks.
function asGoogle(rows: { v: unknown }[][]): unknown[][] {
  return rows.map((cells) => {
    const out = cells.map((c) => (c.v === null ? '' : c.v));
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  });
}

// Google's error answers read `#VALUE! (why)`; an error is compared by its code, as the words are each engine's own.
const asAnswer = (v: unknown, g: unknown) =>
  isError(v) && typeof g === 'string' && g.startsWith('#') ? [v.e, g.split(' ')[0]] : [v, g];

function close(ours: unknown[][], google: unknown[][]): void {
  expect(ours.length).toBe(google.length);
  ours.forEach((row, r) => {
    expect(row.length, `row ${r}`).toBe(google[r]!.length);
    row.forEach((v, c) => {
      const g = google[r]![c];
      if (typeof g === 'number' && typeof v === 'number')
        expect(Math.abs(v - g) / Math.max(1, Math.abs(g)), `${r},${c}`).toBeLessThan(1e-12);
      else {
        const [a, b] = asAnswer(v, g);
        expect(a, `${r},${c}`).toEqual(b);
      }
    });
  });
}

describe('pivotOutput against Google Sheets', () => {
  const cases = PIVOT_CASES.filter(({ title }) => ANSWERS[title] && !WITH_FORMULAS.has(title));
  it('covers every case Google made but those with formulas', () => {
    expect(cases.length).toBe(Object.keys(ANSWERS).length - WITH_FORMULAS.size);
  });
  it.each(cases.map((c) => [c.title, c.pivot] as const))(
    'lays out "%s" as Google does',
    (title, pivot) => {
      close(asGoogle(pivotOutput(SOURCE, specOf(pivot)).rows), ANSWERS[title]!);
    },
  );
});

// The source as a sheet (Sales, the dates formatted as dates), each case a sheet of its own titled as Google's, its
// pivot table that sheet's object by column id, and the GETPIVOTDATA probes, one a row, on Probes.
function casesInTheGrid() {
  const data: Record<string, string> = {};
  const letter = (c: number) => String.fromCharCode(65 + c);
  PIVOT_SOURCE_HEADER.forEach((v, c) => (data[`${letter(c)}1`] = v));
  PIVOT_SOURCE_ROWS.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== null)
        data[`${letter(c)}${r + 2}`] = c === 2 ? isoFromSerial(v as number) : String(v);
    }),
  );
  const probes = Object.fromEntries(GETPIVOTDATA_PROBES.map((p, i) => [`A${i + 1}`, p]));
  const b = book(
    {
      Sales: data,
      ...Object.fromEntries(PIVOT_CASES.map(({ title }) => [title, {}])),
      Probes: probes,
    },
    { rows: 50, cols: 30, locale: 'en-US', arrays: 'google' },
  );
  const sales = b.sheets[0]!;
  const id = (col: number) => sales.layout.cols[col]!;
  const group = ({ col, ...g }: PivotGroupSpec): SheetPivotGroup => ({
    col: id(col),
    ...(g.desc ? { desc: true } : {}),
    ...(g.totals === false ? { totals: false } : {}),
    ...(g.repeat ? { repeat: true } : {}),
    ...(g.sortBy
      ? {
          sortBy: { value: g.sortBy.value, ...(g.sortBy.item ? { item: [...g.sortBy.item] } : {}) },
        }
      : {}),
    ...(g.grouping ? { grouping: g.grouping } : {}),
  });
  PIVOT_CASES.forEach(({ pivot }, i) => {
    const spec = specOf(pivot);
    const report = b.sheets[i + 1]!;
    const object: SheetPivot = {
      id: 'pivot01',
      kind: 'pivot',
      at: { r: report.layout.rows[0]!, c: report.layout.cols[0]! },
      source: {
        r1: sales.layout.rows[0]!,
        c1: id(0),
        r2: sales.layout.rows[PIVOT_SOURCE_ROWS.length]!,
        c2: id(5),
        s: sales.id,
      },
      rows: spec.rows.map(group),
      columns: spec.columns.map(group),
      values: spec.values.map((v): SheetPivotValue =>
        v.formula === undefined ? { ...v, col: id(v.col) } : { ...v, name: v.name! },
      ),
      filters: (spec.filters ?? []).map((f): SheetPivotFilter =>
        f.formula === undefined
          ? { col: id(f.col), cond: f.cond }
          : { col: id(f.col), formula: f.formula },
      ),
      ...(spec.valuesAsRows ? { valuesAsRows: true } : {}),
    };
    const next = { ...report, layout: { ...report.layout, objects: [object] } };
    b.sheets[i + 1] = next;
    b.wb.updateSheet(next);
  });
  const grid = (title: string) => {
    const sheet = b.sheets.find((x) => x.title === title)!;
    const { rows, cols } = b.wb.shownExtent(sheet.id);
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ v: b.wb.value(sheet.id, r, c) })),
    );
  };
  return { ...b, grid };
}

describe('pivot tables in the grid against Google Sheets', () => {
  const cases = PIVOT_CASES.filter(({ title }) => ANSWERS[title]);
  const made = casesInTheGrid();
  it('covers every case Google made', () => {
    expect(cases.length).toBe(Object.keys(ANSWERS).length);
  });
  it.each(cases.map((c) => [c.title] as const))(
    'lays out "%s" in a sheet as Google does',
    (title) => {
      close(asGoogle(made.grid(title)), ANSWERS[title]!);
    },
  );
});

const PROBED = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'corpus', 'google', 'getpivotdata-answers.json'),
    'utf8',
  ),
) as Record<string, unknown>;

describe('GETPIVOTDATA against Google Sheets', () => {
  const made = casesInTheGrid();
  it('covers every probe Google answered', () => {
    expect(Object.keys(PROBED)).toEqual([...GETPIVOTDATA_PROBES]);
  });
  it.each(GETPIVOTDATA_PROBES.map((p, i) => [p, i] as const))(
    'answers %s as Google does',
    (probe, i) => {
      const ours = made.v(`A${i + 1}`, 'Probes');
      close([[ours]], [[PROBED[probe]]]);
      // GETPIVOTDATA's own refusals in Google's words.
      const answer = PROBED[probe];
      if (isError(ours) && ours.e === '#REF!') expect(`${ours.e} (${ours.why})`).toBe(answer);
    },
  );
});
