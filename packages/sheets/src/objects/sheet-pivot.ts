// A pivot table as its sheet keeps it (docs/specs/029-sheets/pivot-tables.md "The model", D378, D601): one of the
// sheet's objects, its place a cell by ids, its source a range of any sheet by ids, and its groups, values and filters
// by their source column's id. What a deletion does to one, on its own sheet or on its source's.
import { isAxisId, isSheetId } from '../ids';
import { INPUT_MAX, SHEET_ROWS_MAX } from '../limits';
import { isFilterCondition } from '../filter';
import { PIVOT_DATE_RULES, PIVOT_SUMMARIES } from '../pivot/pivot-spec';
import type { PivotGrouping, PivotShowAs, PivotSummary } from '../pivot/pivot-spec';
import type { FilterCondition, RuleSource, SheetLayout } from '../sheet';
import { applyLayoutChange, shrinkRange, type LayoutChange } from '../store-layout';
import { inRange, isIdRange, isRecord, onlyKeys, textUpTo } from './object-checks';

export type SheetPivotGroup = {
  col: string;
  desc?: true;
  // Sort by a value (its place among the values), in a column item's total (its labels, outermost first) or the Grand
  // Total.
  sortBy?: { value: number; item?: string[] };
  // Show Totals, on unless false.
  totals?: false;
  repeat?: true;
  grouping?: PivotGrouping;
};

export type SheetPivotValue = {
  col: string;
  summary: PivotSummary;
  showAs?: PivotShowAs;
  name?: string;
};

// A filter by values (`cond.values`) or by one condition of Filter by Condition's list.
export type SheetPivotFilter = { col: string; cond: FilterCondition };

export type SheetPivot = {
  id: string;
  kind: 'pivot';
  // The cell its output starts at.
  at: { r: string; c: string };
  // Its source range: on its own sheet when `s` and `st` are absent; absent when every cell of it was deleted.
  source?: RuleSource;
  rows?: SheetPivotGroup[];
  columns?: SheetPivotGroup[];
  values?: SheetPivotValue[];
  filters?: SheetPivotFilter[];
  // Values as rows; as columns when absent.
  valuesAsRows?: true;
};

export const PIVOT_GROUPS_MAX = 20;
export const PIVOT_VALUES_MAX = 40;
export const PIVOT_FILTERS_MAX = 40;
export const PIVOT_NAME_MAX = 200;

const PIVOT_KEYS = [
  'id',
  'kind',
  'at',
  'source',
  'rows',
  'columns',
  'values',
  'filters',
  'valuesAsRows',
] as const;
const SHOW_AS: readonly unknown[] = ['row', 'column', 'total'];

const isText = (x: unknown) => typeof x === 'string' && x.length <= INPUT_MAX;
const listOf = (x: unknown, max: number, item: (v: unknown) => boolean) =>
  Array.isArray(x) && x.length <= max && x.every(item);
const optionalList = (x: unknown, max: number, item: (v: unknown) => boolean) =>
  x === undefined || (Array.isArray(x) && x.length > 0 && listOf(x, max, item));

function isGrouping(x: unknown): x is PivotGrouping {
  if (!isRecord(x)) return false;
  if (x.k === 'date')
    return onlyKeys(x, ['k', 'rule']) && (PIVOT_DATE_RULES as readonly unknown[]).includes(x.rule);
  if (x.k === 'interval') {
    const finite = (n: unknown) =>
      n === undefined || inRange(n, -Number.MAX_VALUE, Number.MAX_VALUE);
    return (
      onlyKeys(x, ['k', 'size', 'start', 'end']) &&
      inRange(x.size, Number.MIN_VALUE, Number.MAX_VALUE) &&
      finite(x.start) &&
      finite(x.end) &&
      (x.start === undefined || x.end === undefined || (x.start as number) < (x.end as number))
    );
  }
  return (
    x.k === 'custom' &&
    onlyKeys(x, ['k', 'groups']) &&
    listOf(
      x.groups,
      SHEET_ROWS_MAX,
      (g) =>
        isRecord(g) &&
        onlyKeys(g, ['name', 'items']) &&
        typeof g.name === 'string' &&
        g.name.length > 0 &&
        g.name.length <= PIVOT_NAME_MAX &&
        listOf(g.items, SHEET_ROWS_MAX, isText),
    )
  );
}

function isGroup(x: unknown, values: number): x is SheetPivotGroup {
  if (!isRecord(x) || !onlyKeys(x, ['col', 'desc', 'sortBy', 'totals', 'repeat', 'grouping']))
    return false;
  const { sortBy } = x;
  return (
    isAxisId(x.col) &&
    (x.desc === undefined || x.desc === true) &&
    (x.totals === undefined || x.totals === false) &&
    (x.repeat === undefined || x.repeat === true) &&
    (x.grouping === undefined || isGrouping(x.grouping)) &&
    (sortBy === undefined ||
      (isRecord(sortBy) &&
        onlyKeys(sortBy, ['value', 'item']) &&
        Number.isInteger(sortBy.value) &&
        inRange(sortBy.value, 0, values - 1) &&
        optionalList(sortBy.item, PIVOT_GROUPS_MAX, isText)))
  );
}

function isValue(x: unknown): x is SheetPivotValue {
  return (
    isRecord(x) &&
    onlyKeys(x, ['col', 'summary', 'showAs', 'name']) &&
    isAxisId(x.col) &&
    (PIVOT_SUMMARIES as readonly unknown[]).includes(x.summary) &&
    (x.showAs === undefined || SHOW_AS.includes(x.showAs)) &&
    (x.name === undefined || (typeof x.name === 'string' && x.name.length > 0)) &&
    textUpTo(x.name, PIVOT_NAME_MAX)
  );
}

// A filter by values or by a condition; custom formulas and colours are not a pivot table's (yet).
function isFilter(x: unknown): x is SheetPivotFilter {
  return (
    isRecord(x) &&
    onlyKeys(x, ['col', 'cond']) &&
    isAxisId(x.col) &&
    isRecord(x.cond) &&
    x.cond.op !== 'formula' &&
    x.cond.colour === undefined &&
    isFilterCondition(x.cond)
  );
}

function isSource(x: unknown): x is RuleSource {
  if (!isRecord(x) || !onlyKeys(x, ['r1', 'c1', 'r2', 'c2', 's', 'st'])) return false;
  const { s, st, ...corners } = x;
  if (s !== undefined && st !== undefined) return false;
  return (
    isIdRange(corners) &&
    (s === undefined || isSheetId(s)) &&
    (st === undefined || (typeof st === 'string' && st.length > 0 && st.length <= PIVOT_NAME_MAX))
  );
}

/** Whether a record (its id and kind already checked) is a pivot table, whole and within its bounds. */
export function isSheetPivot(x: Record<string, unknown>): boolean {
  const at = x.at;
  const values = Array.isArray(x.values) ? x.values.length : 0;
  return (
    onlyKeys(x, PIVOT_KEYS) &&
    isRecord(at) &&
    onlyKeys(at, ['r', 'c']) &&
    isAxisId(at.r) &&
    isAxisId(at.c) &&
    (x.source === undefined || isSource(x.source)) &&
    optionalList(x.rows, PIVOT_GROUPS_MAX, (g) => isGroup(g, values)) &&
    optionalList(x.columns, PIVOT_GROUPS_MAX, (g) => isGroup(g, values)) &&
    optionalList(x.values, PIVOT_VALUES_MAX, isValue) &&
    optionalList(x.filters, PIVOT_FILTERS_MAX, isFilter) &&
    (x.valuesAsRows === undefined || x.valuesAsRows === true)
  );
}

// A list set when it holds any, else left out.
const some = <T>(key: string, list: T[] | undefined) => (list?.length ? { [key]: list } : {});

/**
 * The pivot table without the fields of the columns `gone` (D378): its groups, values and filters on them dropped; a
 * group sorted by a dropped value sorts by its items again, one by a value after it by that value's new place.
 */
export function pivotWithout(pivot: SheetPivot, gone: ReadonlySet<string>): SheetPivot {
  const fields = [pivot.rows, pivot.columns, pivot.values, pivot.filters];
  if (!fields.some((list) => list?.some((x) => gone.has(x.col)))) return pivot;
  const place = new Map<number, number>();
  const values = (pivot.values ?? []).filter((v, i) => {
    if (gone.has(v.col)) return false;
    place.set(i, place.size);
    return true;
  });
  const groups = (list: SheetPivotGroup[] | undefined) =>
    list
      ?.filter((g) => !gone.has(g.col))
      .map((g) => {
        if (!g.sortBy) return g;
        const { sortBy, ...rest } = g;
        const to = place.get(sortBy.value);
        return to === undefined ? rest : { ...rest, sortBy: { ...sortBy, value: to } };
      });
  const { rows: _rows, columns: _columns, values: _values, filters: _filters, ...rest } = pivot;
  return {
    ...rest,
    ...some('rows', groups(pivot.rows)),
    ...some('columns', groups(pivot.columns)),
    ...some('values', values),
    ...some(
      'filters',
      pivot.filters?.filter((f) => !gone.has(f.col)),
    ),
  };
}

// The pivot table with its source shrunk by the rows and columns gone from the sheet laid out as `before`, and the
// fields of gone columns dropped; the source left out when none of it is left.
function pivotSourceAfter(
  pivot: SheetPivot,
  before: SheetLayout,
  goneRows: ReadonlySet<string>,
  goneCols: ReadonlySet<string>,
): SheetPivot {
  const source = pivot.source;
  if (!source) return pivot;
  const range = shrinkRange(source, before, goneRows, goneCols);
  const kept = pivotWithout(pivot, goneCols);
  const same =
    range &&
    range.r1 === source.r1 &&
    range.r2 === source.r2 &&
    range.c1 === source.c1 &&
    range.c2 === source.c2;
  if (same) return kept;
  if (range) return { ...kept, source: { ...source, ...range } };
  const { source: _gone, ...left } = kept;
  return left;
}

/**
 * The pivot table after rows or columns of its own sheet, laid out as `before`, are deleted (D601): gone with its
 * anchor's row or column; its source shrunk when it is on this sheet (another sheet's is that sheet's to shrink,
 * shrinkPivotSourcesOf).
 */
export function pivotAfterDelete(
  pivot: SheetPivot,
  before: SheetLayout,
  goneRows: ReadonlySet<string>,
  goneCols: ReadonlySet<string>,
): SheetPivot | null {
  if (goneRows.has(pivot.at.r) || goneCols.has(pivot.at.c)) return null;
  const own = pivot.source && pivot.source.s === undefined && pivot.source.st === undefined;
  return own ? pivotSourceAfter(pivot, before, goneRows, goneCols) : pivot;
}

/**
 * The layout changes a reader sheet's pivot tables need when `changes` land on sheet `targetId`, laid out as
 * `before`: each pivot table reading that sheet has its source shrunk and its gone columns' fields dropped, as a
 * formula's range into it shrinks (D601). Linear in the reader's objects.
 */
export function shrinkPivotSourcesOf(
  targetId: string,
  before: SheetLayout,
  changes: readonly LayoutChange[],
  reader: SheetLayout,
): LayoutChange[] {
  const reading = (reader.objects ?? []).filter(
    (x): x is SheetPivot => x.kind === 'pivot' && x.source?.s === targetId,
  );
  if (!reading.length) return [];
  const now = new Map(reading.map((x) => [x.id, x]));
  let layout = before;
  for (const ch of changes) {
    const was = layout;
    layout = applyLayoutChange(layout, ch);
    if ((ch.k !== 'deleteRows' && ch.k !== 'deleteCols') || layout === was) continue;
    const had = new Set(ch.k === 'deleteRows' ? was.rows : was.cols);
    const gone = new Set(ch.ids.filter((id) => had.has(id)));
    const none = new Set<string>();
    const [goneRows, goneCols] = ch.k === 'deleteRows' ? [gone, none] : [none, gone];
    for (const [id, pivot] of now) now.set(id, pivotSourceAfter(pivot, was, goneRows, goneCols));
  }
  return reading.flatMap((x): LayoutChange[] => {
    const next = now.get(x.id)!;
    return next === x ? [] : [{ k: 'object', id: x.id, object: next }];
  });
}
