// A sheet's filter and filter views as a file holds them (docs/specs/029-sheets/standard-mapping.md "Filters in the
// file"): each column by its place with its condition and the standard column the formats write (filter-standard.ts),
// LiveDoc's record beside them with the standard form's fingerprint (D293, D294), and the filter and views a sheet
// makes of a file's. Each format's reader and writer maps this (xlsx-filters.ts, ods-filters.ts).
import {
  columnIndex,
  columnLetters,
  formatRange,
  parseRangeText,
  type GridRange,
} from '../address';
import { isFilterCondition } from '../filter';
import {
  FILTER_VIEW_TITLE_MAX,
  FILTER_VIEWS_MAX,
  type FilterViewSortKey,
  type SheetFilterView,
} from '../filter-views';
import { compileFormula, renderFormula, type SheetsCtx } from '../formula/stored';
import { makeAxisIds, type Rand } from '../ids';
import { idRangeOf } from '../layout';
import type { FilterCondition, SheetFilter, SheetLayout } from '../sheet';
import {
  conditionOfStandard,
  standardColumnOf,
  standardLine,
  type StandardColumn,
} from './filter-standard';
import { validationFingerprint } from './validation-standard';
import type { FileLoss } from './workbook-file';

/** A condition as a file's record holds it: a Custom Formula Is as its formula's text. */
export type FileFilterCondition = Omit<FilterCondition, 'fx'> & { fx?: string };

/**
 * One filtered column: its place in the sheet, its condition (written; read from LiveDoc's record) and its standard
 * column (written when it has one; read from the file's own form).
 */
export type FileFilterColumn = { c: number; cond?: FileFilterCondition; std?: StandardColumn };

/** The sheet's filter: its range (header row first), its columns and the rows under its header hidden by hand. */
export type FileFilter = { range: GridRange; cols: FileFilterColumn[]; hidden?: number[] };

/** A filter view: its name, its id (an XLSX `guid`'s, D479), range, columns and sort. */
export type FileFilterView = {
  name: string;
  key?: string;
  range: GridRange;
  cols: FileFilterColumn[];
  sort?: { c: number; desc?: true }[];
};

/** How a format holds a standard column, as its reader reads it back: null when it cannot hold it. */
export type StandardIn = (std: StandardColumn) => StandardColumn | null;

// ------------------------------------------------------------------------------------------------ the model's to file

type Placed = { range: GridRange; colPos: ReadonlyMap<string, number> };

function columnsOf(
  conds: Readonly<Record<string, FilterCondition>>,
  placed: Placed,
  ctx: SheetsCtx,
  dates: { locale: string; today: number },
): FileFilterColumn[] {
  const out: FileFilterColumn[] = [];
  for (const [col, cond] of Object.entries(conds)) {
    const c = placed.colPos.get(col);
    if (c === undefined || c < placed.range.c1 || c > placed.range.c2) continue;
    const { fx, ...rest } = cond;
    const written: FileFilterCondition = fx ? { ...rest, fx: renderFormula(fx, ctx) } : rest;
    const std = standardColumnOf(cond, dates.locale, dates.today);
    out.push({ c, cond: written, ...(std ? { std } : {}) });
  }
  return out.sort((a, b) => a.c - b.c);
}

/**
 * A sheet's filter and filter views as a file holds them; `hidden` the rows the sheet hides by hand, `ctx` renders a
 * Custom Formula Is, dates count from `today`. A filter or view whose cells are gone is left out.
 */
export function fileFiltersOf(
  layout: SheetLayout,
  hidden: ReadonlySet<string>,
  ctx: SheetsCtx,
  dates: { locale: string; today: number },
): { filter?: FileFilter; filterViews?: FileFilterView[] } {
  const rowPos = new Map(layout.rows.map((id, i) => [id, i]));
  const colPos = new Map(layout.cols.map((id, i) => [id, i]));
  const rangeOf = (x: { r1: string; c1: string; r2: string; c2: string }): GridRange | null => {
    const r1 = rowPos.get(x.r1);
    const c1 = colPos.get(x.c1);
    const r2 = rowPos.get(x.r2);
    const c2 = colPos.get(x.c2);
    if (r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) return null;
    return { r1, c1, r2, c2 };
  };
  const out: { filter?: FileFilter; filterViews?: FileFilterView[] } = {};
  const f = layout.filter;
  const range = f && rangeOf(f);
  if (f && range) {
    const cols = columnsOf(f.conds, { range, colPos }, ctx, dates);
    const byHand: number[] = [];
    for (let r = range.r1 + 1; r <= range.r2; r++) if (hidden.has(layout.rows[r]!)) byHand.push(r);
    out.filter = { range, cols, ...(byHand.length ? { hidden: byHand } : {}) };
  }
  const views = (layout.filterViews ?? []).flatMap((v): FileFilterView[] => {
    const at = rangeOf(v);
    if (!at) return [];
    const sort = (v.sort ?? []).flatMap((k) => {
      const c = colPos.get(k.c);
      return c === undefined ? [] : [{ c, ...(k.desc ? { desc: true as const } : {}) }];
    });
    return [
      {
        name: v.title,
        key: v.id,
        range: at,
        cols: columnsOf(v.conds, { range: at, colPos }, ctx, dates),
        ...(sort.length ? { sort } : {}),
      },
    ];
  });
  if (views.length) out.filterViews = views;
  return out;
}

// ------------------------------------------------------------------------------------------------ LiveDoc's record

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const condsText = (cols: readonly FileFilterColumn[]) =>
  Object.fromEntries(cols.flatMap((x) => (x.cond ? [[columnLetters(x.c), x.cond]] : [])));

/** LiveDoc's record of a sheet's filter and views: one JSON object, ranges as A1 text, columns by letter. */
export function filterRecordText(
  filter: FileFilter | undefined,
  views: readonly FileFilterView[] = [],
): string {
  return JSON.stringify({
    ...(filter
      ? {
          filter: {
            range: formatRange(filter.range),
            conds: condsText(filter.cols),
            ...(filter.hidden?.length ? { hidden: filter.hidden.map((r) => r + 1) } : {}),
          },
        }
      : {}),
    ...(views.length
      ? {
          views: views.map((v) => ({
            name: v.name,
            range: formatRange(v.range),
            conds: condsText(v.cols),
            ...(v.sort?.length
              ? {
                  sort: v.sort.map((k) => ({
                    c: columnLetters(k.c),
                    ...(k.desc ? { desc: true } : {}),
                  })),
                }
              : {}),
          })),
        }
      : {}),
  });
}

/** The record read back: the filter's and each view's columns with their conditions, in the file's order. */
export type FilterRecord = {
  filter?: { range: GridRange; conds: Map<number, FileFilterCondition>; hidden: number[] };
  views: {
    name: string;
    range: GridRange;
    conds: Map<number, FileFilterCondition>;
    sort?: { c: number; desc?: true }[];
  }[];
};

// A recorded condition: what a write would keep (its formula as text).
function recordedCondition(v: unknown): FileFilterCondition | null {
  if (!isRecord(v)) return null;
  const { fx, ...rest } = v;
  if (fx !== undefined && (typeof fx !== 'string' || rest.op !== 'formula')) return null;
  if (rest.op === 'formula') {
    if (fx === undefined) return null;
    const probe = { ...rest, op: undefined };
    return isFilterCondition(probe) ? { ...rest, fx } : null;
  }
  return isFilterCondition(rest) ? (rest as FileFilterCondition) : null;
}

function recordedConds(v: unknown, range: GridRange): Map<number, FileFilterCondition> | null {
  if (!isRecord(v)) return null;
  const out = new Map<number, FileFilterCondition>();
  for (const [letters, raw] of Object.entries(v)) {
    const c = columnIndex(letters);
    const cond = recordedCondition(raw);
    if (c < range.c1 || c > range.c2 || !cond) return null;
    out.set(c, cond);
  }
  return out;
}

function recordedSort(v: unknown): { c: number; desc?: true }[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return null;
  const keys = v.map((k) => {
    if (!isRecord(k) || typeof k.c !== 'string' || (k.desc !== undefined && k.desc !== true))
      return null;
    const c = columnIndex(k.c);
    return c < 0 ? null : { c, ...(k.desc ? { desc: true as const } : {}) };
  });
  return keys.every((k) => k !== null) ? keys : null;
}

/** LiveDoc's record read back; null when it is not one. */
export function readFilterRecord(text: string): FilterRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const out: FilterRecord = { views: [] };
  if (raw.filter !== undefined) {
    const f = raw.filter;
    const range = isRecord(f) && typeof f.range === 'string' ? parseRangeText(f.range) : null;
    const conds = range && isRecord(f) ? recordedConds(f.conds, range) : null;
    const hidden = isRecord(f) ? (f.hidden ?? []) : null;
    if (!range || !conds || !Array.isArray(hidden)) return null;
    if (!hidden.every((r) => Number.isInteger(r) && r > range.r1 + 1 && r <= range.r2 + 1))
      return null;
    out.filter = { range, conds, hidden: hidden.map((r: number) => r - 1) };
  }
  if (raw.views !== undefined) {
    if (!Array.isArray(raw.views)) return null;
    for (const v of raw.views) {
      if (!isRecord(v) || typeof v.name !== 'string' || typeof v.range !== 'string') return null;
      const range = parseRangeText(v.range);
      const conds = range && recordedConds(v.conds, range);
      const sort = recordedSort(v.sort);
      if (!range || !conds || sort === null) return null;
      out.views.push({ name: v.name, range, conds, ...(sort ? { sort } : {}) });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the fingerprint

// Each column's line: its standard column as the format holds it; a column a file holds in a form LiveDoc cannot
// read (no condition, no standard column) says so, so another app's change to it is seen.
const columnLines = (cols: readonly FileFilterColumn[], held: StandardIn) =>
  cols.flatMap((x) => {
    if (!x.std) return x.cond ? [] : [`${x.c} unread`];
    const std = held(x.std);
    return std ? [standardLine(x.c, std)] : [];
  });

/**
 * The fingerprint of a standard form (`held` how the format holds each column): the filter's range and each column's
 * line, then each view's the same with its sort.
 */
export function filterFingerprint(
  filter: Pick<FileFilter, 'range' | 'cols'> | undefined,
  views: readonly Pick<FileFilterView, 'range' | 'cols' | 'sort'>[],
  held: StandardIn,
): string {
  const lines: string[] = [];
  if (filter) lines.push(`filter ${formatRange(filter.range)}`, ...columnLines(filter.cols, held));
  for (const v of views)
    lines.push(
      `view ${formatRange(v.range)}`,
      ...columnLines(v.cols, held),
      ...(v.sort ?? []).map((k) => `sort ${k.c}${k.desc ? ' desc' : ''}`),
    );
  return validationFingerprint(lines);
}

/** A standard form read with LiveDoc's record beside it: the record's conditions while its fingerprint holds. */
export function filtersFound(
  standard: { filter?: FileFilter; views: FileFilterView[] },
  record: { text: string; fingerprint: string | undefined } | undefined,
  held: StandardIn,
): { filter?: FileFilter; views: FileFilterView[]; changed: boolean } {
  if (!record) return { ...standard, changed: false };
  const read = readFilterRecord(record.text);
  const holds =
    read !== null &&
    record.fingerprint === filterFingerprint(standard.filter, standard.views, held) &&
    // A filter the format could not hold beside a table (XLSX) is the record's alone.
    (standard.filter === undefined || read.filter !== undefined) &&
    read.views.length === standard.views.length;
  if (!holds) return { ...standard, changed: true };
  const withConds = (
    cols: readonly FileFilterColumn[],
    conds: ReadonlyMap<number, FileFilterCondition>,
  ): FileFilterColumn[] => {
    const std = new Map(cols.map((x) => [x.c, x.std]));
    return [...conds].map(([c, cond]) => {
      const s = std.get(c);
      return { c, cond, ...(s ? { std: s } : {}) };
    });
  };
  const filter = read.filter && {
    range: standard.filter?.range ?? read.filter.range,
    cols: withConds(standard.filter?.cols ?? [], read.filter.conds),
    ...(read.filter.hidden.length ? { hidden: read.filter.hidden } : {}),
  };
  const views = standard.views.map((v, i) => {
    const r = read.views[i]!;
    return {
      ...v,
      name: v.name || r.name,
      cols: withConds(v.cols, r.conds),
      ...(r.sort ? { sort: r.sort } : {}),
    };
  });
  return { ...(filter ? { filter } : {}), views, changed: false };
}

// ------------------------------------------------------------------------------------------------ the file's to model

type Making = { sheet: string; rand: Rand; losses: FileLoss[]; ctx: SheetsCtx };

// A column's condition as the sheet holds it: the record's, else the standard column's; null when it has none.
function conditionOf(x: FileFilterColumn, ctx: SheetsCtx): FilterCondition | null {
  const cond = x.cond;
  if (!cond) return x.std ? conditionOfStandard(x.std) : null;
  if (cond.fx === undefined) return isFilterCondition(cond) ? cond : null;
  const compiled = compileFormula(cond.fx, ctx);
  if (!compiled.ok) return null;
  const made = { ...cond, fx: compiled.formula };
  return isFilterCondition(made) ? made : null;
}

// Each column's condition by column id; a column LiveDoc cannot read is named at its header (`filter_unread`).
function condsOf(
  cols: readonly FileFilterColumn[],
  range: GridRange,
  layout: SheetLayout,
  making: Making,
): Record<string, FilterCondition> {
  const out: Record<string, FilterCondition> = {};
  for (const x of cols) {
    const id = layout.cols[x.c];
    const cond = id === undefined ? null : conditionOf(x, making.ctx);
    if (id === undefined || !cond) {
      making.losses.push({ k: 'filter_unread', sheet: making.sheet, r: range.r1, c: x.c });
      continue;
    }
    out[id] = cond;
  }
  return out;
}

const onGrid = (g: GridRange, layout: SheetLayout): GridRange | null =>
  g.r1 >= layout.rows.length || g.c1 >= layout.cols.length
    ? null
    : {
        ...g,
        r2: Math.min(g.r2, layout.rows.length - 1),
        c2: Math.min(g.c2, layout.cols.length - 1),
      };

/**
 * The filter and filter views a file's sheet makes on its grid: each range cut to the grid, each column's condition
 * the record's or the standard column's; views past 50 left out and named (`filter_view_unread`).
 */
export function filtersFromFile(
  file: { filter?: FileFilter; filterViews?: FileFilterView[] },
  layout: SheetLayout,
  making: Making,
): { filter?: SheetFilter; filterViews?: SheetFilterView[] } {
  const out: { filter?: SheetFilter; filterViews?: SheetFilterView[] } = {};
  const f = file.filter;
  const range = f && onGrid(f.range, layout);
  if (f && range) {
    const ids = idRangeOf(layout, range.r1, range.c1, range.r2, range.c2)!;
    out.filter = { ...ids, conds: condsOf(f.cols, range, layout, making) };
  } else if (f)
    // A filter starting past the grid the workbook's limits leave is named at its first cell.
    making.losses.push({ k: 'filter_unread', sheet: making.sheet, r: f.range.r1, c: f.range.c1 });
  const views: SheetFilterView[] = [];
  const taken = new Set<string>();
  for (const v of file.filterViews ?? []) {
    if (views.length === FILTER_VIEWS_MAX) {
      making.losses.push({ k: 'filter_view_unread', sheet: making.sheet, name: v.name });
      continue;
    }
    const at = onGrid(v.range, layout);
    if (!at) {
      making.losses.push({ k: 'filter_view_unread', sheet: making.sheet, name: v.name });
      continue;
    }
    const [id] = makeAxisIds(1, making.rand, taken);
    taken.add(id!);
    const sort: FilterViewSortKey[] = (v.sort ?? []).flatMap((k) => {
      const c = layout.cols[k.c];
      return c === undefined ? [] : [{ c, ...(k.desc ? { desc: true as const } : {}) }];
    });
    const title = v.name.trim() === '' ? `Filter ${views.length + 1}` : v.name;
    views.push({
      id: id!,
      title: title.slice(0, FILTER_VIEW_TITLE_MAX),
      ...idRangeOf(layout, at.r1, at.c1, at.r2, at.c2)!,
      conds: condsOf(v.cols, at, layout, making),
      ...(sort.length ? { sort } : {}),
    });
  }
  if (views.length) out.filterViews = views;
  return out;
}
