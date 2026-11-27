// What the Pivot Table Editor's controls do to a pivot table (docs/specs/029-sheets/pivot-tables.md "Pivot Table
// Editor", D611, D614), each giving a whole new pivot table to write: the source's columns it lists, a field added,
// removed or set, a new range, a filter's items and status, and the suggested pivot tables.
import { columnLetters } from '../address';
import {
  pivotWithout,
  type SheetPivot,
  type SheetPivotFilter,
  type SheetPivotGroup,
  type SheetPivotValue,
} from '../objects/sheet-pivot';
import type { RuleSource } from '../sheet';
import { compareItems, itemMaker } from './pivot-items';
import type { PivotBox } from './pivot-resolve';
import type { PivotSource } from './pivot-spec';

export type PivotArea = 'rows' | 'columns' | 'values' | 'filters';

/** A source column as the editor lists it: its id, its name, and whether a cell below its header holds a number. */
export type PivotColumn = { col: string; name: string; numbers: boolean };

/** The source as the editor reads it (Workbook.pivotSourceOf). */
export type PivotSourceRead = { box: PivotBox; source: PivotSource };

// The four lists, by their key on the pivot table.
type PivotLists = {
  rows: SheetPivotGroup[];
  columns: SheetPivotGroup[];
  values: SheetPivotValue[];
  filters: SheetPivotFilter[];
};

/** An entry of one of the four lists. */
export type PivotEntry<A extends PivotArea> = PivotLists[A][number];

/** A blank item, as the filter's list shows it. */
export const PIVOT_BLANK_ITEM = '(Blanks)';

/** The source's columns, by their header text; a blank header by its column's letter (`Column C`). */
export function pivotColumns(read: PivotSourceRead): PivotColumn[] {
  const { box, source } = read;
  return source.header.map((name, i) => ({
    col: box.sheet.layout.cols[box.c1 + i]!,
    name: name.trim() || `Column ${columnLetters(box.c1 + i)}`,
    numbers: source.rows.some((row) => typeof row[i]?.v === 'number'),
  }));
}

/** A column's items as the source shows them, in a group's order, a blank last as `(Blanks)`. */
export function pivotFilterItems(read: PivotSourceRead, col: string): string[] {
  const i = read.box.sheet.layout.cols.indexOf(col) - read.box.c1;
  if (i < 0 || i >= read.source.header.length) return [];
  const make = itemMaker({ col: i }, []);
  const seen = new Map<string, ReturnType<typeof make>>();
  let blank = false;
  for (const row of read.source.rows) {
    const cell = row[i]!;
    if (cell.shown === '') blank = true;
    else if (!seen.has(cell.shown)) seen.set(cell.shown, make(cell));
  }
  const items = [...seen].sort((a, b) => compareItems(a[1], b[1])).map(([shown]) => shown);
  return blank ? [...items, PIVOT_BLANK_ITEM] : items;
}

// A list set when it holds any, else left out.
function withList<A extends PivotArea>(
  pivot: SheetPivot,
  area: A,
  list: PivotLists[A],
): SheetPivot {
  const next: SheetPivot = { ...pivot };
  if (list.length) (next as Partial<PivotLists>)[area] = list;
  else delete next[area];
  return next;
}

const listOf = <A extends PivotArea>(pivot: SheetPivot, area: A): PivotLists[A] =>
  (pivot as Partial<PivotLists>)[area] ?? ([] as PivotLists[A]);

/** A column added at the end of a list: a group, a value by SUM or COUNTA (D611), or a filter showing everything. */
export function pivotAdd(pivot: SheetPivot, area: PivotArea, column: PivotColumn): SheetPivot {
  const { col } = column;
  if (area === 'values')
    return withList(pivot, area, [
      ...listOf(pivot, area),
      { col, summary: column.numbers ? 'SUM' : 'COUNTA' },
    ]);
  if (area === 'filters') return withList(pivot, area, [...listOf(pivot, area), { col, cond: {} }]);
  return withList(pivot, area, [...listOf(pivot, area), { col }]);
}

// A group's sort by the value at `gone` dropped, one by a later value moved down a place.
function sortAfter(group: SheetPivotGroup, gone: number): SheetPivotGroup {
  const by = group.sortBy;
  if (!by || by.value < gone) return group;
  const { sortBy: _by, ...rest } = group;
  return by.value === gone ? rest : { ...rest, sortBy: { ...by, value: by.value - 1 } };
}

/** The entry at `index` removed; a value's removal remaps the groups' sorts by value, as a deleted column's does. */
export function pivotRemove<A extends PivotArea>(
  pivot: SheetPivot,
  area: A,
  index: number,
): SheetPivot {
  const list = listOf(pivot, area);
  if (index < 0 || index >= list.length) return pivot;
  const next = withList(pivot, area, list.filter((_, i) => i !== index) as PivotLists[A]);
  if (area !== 'values') return next;
  const groups = (key: 'rows' | 'columns', p: SheetPivot) =>
    withList(
      p,
      key,
      listOf(p, key).map((g) => sortAfter(g, index)),
    );
  return groups('columns', groups('rows', next));
}

/** The entry at `index` set whole: what it leaves out is gone. */
export function pivotWithEntry<A extends PivotArea>(
  pivot: SheetPivot,
  area: A,
  index: number,
  entry: PivotEntry<A>,
): SheetPivot {
  const list = listOf(pivot, area);
  if (index < 0 || index >= list.length) return pivot;
  return withList(pivot, area, list.map((x, i) => (i === index ? entry : x)) as PivotLists[A]);
}

/** A new range: the fields of columns outside `cols` (the new range's column ids) dropped, as a deleted column's. */
export function pivotWithSource(
  pivot: SheetPivot,
  source: RuleSource,
  cols: readonly string[],
): SheetPivot {
  const keep = new Set(cols);
  const fields: { col?: string }[] = [
    ...(pivot.rows ?? []),
    ...(pivot.columns ?? []),
    ...(pivot.values ?? []),
    ...(pivot.filters ?? []),
  ];
  const gone = new Set(
    fields.flatMap((x) => (x.col === undefined || keep.has(x.col) ? [] : [x.col])),
  );
  return { ...pivotWithout(pivot, gone), source };
}

/** A filter's Status line. */
export function pivotFilterStatus(filter: SheetPivotFilter): string {
  if (filter.formula !== undefined) return 'Showing items by formula';
  const { values, ...rest } = filter.cond;
  if (Object.keys(rest).length) return 'Showing items by condition';
  if (!values) return 'Showing all items';
  return `Showing ${values.length} item${values.length === 1 ? '' : 's'}`;
}

/** A suggested pivot table: its name as it reads, and the fields it sets. */
export type PivotSuggestion = {
  label: string;
  rows: SheetPivotGroup[];
  values: SheetPivotValue[];
};

const SUGGESTIONS_MAX = 3;

/** Up to three: the first number column summed for each of the first text columns (D614). */
export function pivotSuggestions(columns: readonly PivotColumn[]): PivotSuggestion[] {
  const sum = columns.find((x) => x.numbers);
  if (!sum) return [];
  return columns
    .filter((x) => !x.numbers)
    .slice(0, SUGGESTIONS_MAX)
    .map((by) => ({
      label: `SUM of ${sum.name} for each ${by.name}`,
      rows: [{ col: by.col }],
      values: [{ col: sum.col, summary: 'SUM' }],
    }));
}
