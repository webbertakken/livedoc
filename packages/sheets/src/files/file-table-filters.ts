// A table's own filter as a file holds it (docs/specs/029-sheets/standard-mapping.md "Tables in the file", "Filters
// in the file", D481): its columns by place as the sheet's filter's are (file-filters.ts), on while the standard form
// shows it (an XLSX table part's `autoFilter`, an ODF database range's filter buttons); in LiveDoc's tables record each
// filtered column's condition by its column letter, as the filters record's, and each one's standard line in the
// record's fingerprint.
import { columnIndex, columnLetters, type GridRange } from '../address';
import type { SheetsCtx } from '../formula/stored';
import type { SheetLayout } from '../sheet';
import type { SheetTable } from '../tables/table';
import { tableFilterBox } from '../tables/table-filter';
import {
  fileFilterColumnsOf,
  filterCondsOf,
  type FileFilterColumn,
  type FileFilterCondition,
  type FilterMaking,
  type StandardIn,
} from './file-filters';
import { filterColumnLines, recordedCondition } from './filter-record';

/** A table's filter as a file holds it (its columns, none filtered an empty list); undefined while off. */
export function fileTableFilterOf(
  layout: SheetLayout,
  table: SheetTable,
  ctx: SheetsCtx,
  dates: { locale: string; today: number },
): FileFilterColumn[] | undefined {
  const range = table.filter && tableFilterBox(layout, table);
  if (!range) return undefined;
  const colPos = new Map(layout.cols.map((id, i) => [id, i]));
  return fileFilterColumnsOf(table.filter!, { range, colPos }, ctx, dates);
}

/** The record's `filter` of a table: each filtered column's condition by its letter; undefined while off. */
export function recordedTableFilter(t: {
  filter?: FileFilterColumn[];
}): Record<string, FileFilterCondition> | undefined {
  if (!t.filter) return undefined;
  return Object.fromEntries(
    t.filter.flatMap((x) => (x.cond ? [[columnLetters(x.c), x.cond]] : [])),
  );
}

/** A recorded table's `filter` read back (`range` the table's): undefined when absent, null when it is not one. */
export function readRecordedTableFilter(
  raw: unknown,
  range: GridRange,
): Record<string, FileFilterCondition> | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, FileFilterCondition> = {};
  for (const [letters, v] of Object.entries(raw)) {
    const c = columnIndex(letters);
    const cond = recordedCondition(v);
    if (!cond || c < range.c1 || c > range.c2) return null;
    out[letters] = cond;
  }
  return out;
}

/** A table's filter's lines of the tables record's fingerprint: each filtered column's, as the format holds it. */
export const tableFilterLines = (t: { filter?: FileFilterColumn[] }, held: StandardIn): string[] =>
  t.filter ? filterColumnLines(t.filter, held) : [];

/**
 * A table's filter with the record's conditions beside the standard form's columns, its standard columns kept; off
 * while the standard form has it off.
 */
export function tableFilterWithRecord(
  standard: { filter?: FileFilterColumn[] },
  recorded: Readonly<Record<string, FileFilterCondition>> | undefined,
): FileFilterColumn[] | undefined {
  if (!standard.filter) return undefined;
  if (!recorded) return standard.filter;
  const std = new Map(standard.filter.map((x) => [x.c, x.std]));
  return Object.entries(recorded).map(([letters, cond]) => {
    const c = columnIndex(letters);
    const s = std.get(c);
    return { c, cond, ...(s ? { std: s } : {}) };
  });
}

/**
 * A sheet's tables with their filters' conditions from the file's tables (by name, as made): each column's the
 * record's or the standard column's, one LiveDoc cannot read named (`filter_unread`).
 */
export function tableFiltersFromFile(
  file: readonly { name: string; filter?: FileFilterColumn[] }[] | undefined,
  layout: SheetLayout,
  making: FilterMaking,
): SheetTable[] | undefined {
  const tables = layout.tables;
  if (!tables) return tables;
  return tables.map((t) => {
    const cols = t.filter && file?.find((f) => f.name === t.name)?.filter;
    const range = cols && tableFilterBox(layout, t);
    return range ? { ...t, filter: filterCondsOf(cols, range, layout, making) } : t;
  });
}
