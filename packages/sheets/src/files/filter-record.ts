// LiveDoc's record of a sheet's filter and filter views (docs/specs/029-sheets/standard-mapping.md "Filters in the
// file"): one JSON object beside the standard form, its fingerprint the standard form's (D293, D294), and the filter
// and views a file holds once the record is weighed against what the file says.
import {
  columnIndex,
  columnLetters,
  formatRange,
  parseRangeText,
  type GridRange,
} from '../address';
import { isFilterCondition } from '../filter';
import { standardLine } from './filter-standard';
import type {
  FileFilter,
  FileFilterColumn,
  FileFilterCondition,
  FileFilterView,
  StandardIn,
} from './file-filters';
import { validationFingerprint } from './validation-standard';

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
