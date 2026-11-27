// Tables as a file holds them (docs/specs/029-sheets/standard-mapping.md "Tables in the file"): each table with its
// cells by position and its columns by name; the standard form each format's apps read (a table part, a database
// range), LiveDoc's exact record beside it with the standard form's fingerprint (D293, D294), and which of a file's
// tables LiveDoc holds. Each format's reader and writer maps this (xlsx-tables.ts, ods-tables.ts).
import { formatRange, parseRangeText, type GridRange } from '../address';
import { makeAxisIds, type Rand } from '../ids';
import { idRangeOf } from '../layout';
import { sameName } from '../range-names';
import { dropdownOptionsOk } from '../rules/rule-shape';
import type { DropdownOption, SheetLayout } from '../sheet';
import {
  isSheetTable,
  sameTableName,
  TABLE_COLUMN_TYPES,
  tableBox,
  tableColumnNames,
  tableFormulaName,
  tableNameProblem,
  tableOverlaps,
  TABLES_MAX,
  type CellText,
  type SheetTable,
  type TableColumnType,
} from '../tables/table';
import { validationFingerprint } from './validation-standard';
import type { FileLoss } from './workbook-file';

/** One table in a file: its cells, its column names in place order (D443), its typed columns by name. */
export type FileTable = {
  name: string;
  range: GridRange;
  columns: string[];
  types?: Record<string, TableColumnType>;
  // A Dropdown column's options, by its name.
  opts?: Record<string, DropdownOption[]>;
  total?: true;
};

/** A sheet's tables as a file holds them, in order; one whose cells are gone is left out. */
export function fileTablesOf(layout: SheetLayout, text: CellText): FileTable[] | undefined {
  const out: FileTable[] = [];
  for (const table of layout.tables ?? []) {
    const p = tableBox(layout, table);
    if (!p) continue;
    const columns = tableColumnNames(layout, table, text);
    const nameOf = new Map(columns.map((name, i) => [layout.cols[p.c1 + i]!, name]));
    const byName = <T>(byCol: Record<string, T> | undefined) => {
      const entries = Object.entries(byCol ?? {}).flatMap(([c, v]): [string, T][] => {
        const name = nameOf.get(c);
        return name === undefined ? [] : [[name, v]];
      });
      return entries.length ? Object.fromEntries(entries) : undefined;
    };
    const types = byName(table.types);
    const opts = byName(table.opts);
    out.push({
      name: table.name,
      range: p,
      columns,
      ...(types ? { types } : {}),
      ...(opts ? { opts } : {}),
      ...(table.total ? { total: true as const } : {}),
    });
  }
  return out.length ? out : undefined;
}

/** LiveDoc's record of a sheet's tables: each table but its columns, and (ODF) the formulas that read them by cell. */
export type TableRecord = {
  tables: Omit<FileTable, 'columns'>[];
  refs?: Record<string, string>;
};

/** The record's text: one JSON object, ranges as A1 text. */
export function tableRecordText(
  tables: readonly FileTable[],
  refs?: Readonly<Record<string, string>>,
): string {
  const recorded = tables.map((t) => ({
    name: t.name,
    range: formatRange(t.range),
    ...(t.types ? { types: t.types } : {}),
    ...(t.opts ? { opts: t.opts } : {}),
    ...(t.total ? { total: true } : {}),
  }));
  return JSON.stringify({
    tables: recorded,
    ...(refs && Object.keys(refs).length ? { refs } : {}),
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// One recorded table, or null when it is not one.
function recordedOf(raw: unknown): TableRecord['tables'][number] | null {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.range !== 'string') return null;
  const range = parseRangeText(raw.range);
  if (!range) return null;
  const out: TableRecord['tables'][number] = { name: raw.name, range };
  if (raw.types !== undefined) {
    if (!isRecord(raw.types)) return null;
    const ok = Object.values(raw.types).every((t) =>
      TABLE_COLUMN_TYPES.includes(t as TableColumnType),
    );
    if (!ok) return null;
    out.types = raw.types as Record<string, TableColumnType>;
  }
  if (raw.opts !== undefined) {
    if (!isRecord(raw.opts) || !Object.values(raw.opts).every(dropdownOptionsOk)) return null;
    out.opts = raw.opts as Record<string, DropdownOption[]>;
  }
  if (raw.total !== undefined) {
    if (raw.total !== true) return null;
    out.total = true;
  }
  return out;
}

/** LiveDoc's record read back; null when it is not one. */
export function readTableRecord(text: string): TableRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || !Array.isArray(raw.tables) || raw.tables.length > TABLES_MAX) return null;
  const tables = raw.tables.map(recordedOf);
  if (tables.some((t) => t === null)) return null;
  const out: TableRecord = { tables: tables as TableRecord['tables'] };
  if (raw.refs === undefined) return out;
  if (!isRecord(raw.refs)) return null;
  const refs = Object.entries(raw.refs);
  if (refs.some(([at, f]) => typeof f !== 'string' || !parseRangeText(at))) return null;
  out.refs = raw.refs as Record<string, string>;
  return out;
}

/**
 * The fingerprint of a standard form: each table's formula name and range, a line, then (ODF) each recorded formula
 * cell's line as written.
 */
export const tableFingerprint = (
  tables: readonly { name: string; range: GridRange }[],
  refs: readonly string[] = [],
): string =>
  validationFingerprint([
    ...tables.map((t) => `${tableFormulaName(t.name)} ${formatRange(t.range)}`),
    ...refs,
  ]);

/** What a format's reader found of a sheet's tables: their standard form, and LiveDoc's record beside it. */
export type TablesFound = {
  standard: FileTable[];
  record?: { text: string; fingerprint: string | undefined };
  // A recorded formula cell's line (ODF) as the file holds it now; null when it holds no formula there.
  refLine?: (a1: string) => string | null;
};

/**
 * A sheet's tables from what its file held: LiveDoc's record while its fingerprint is the standard form's as read,
 * its columns the standard form's; else the standard form, columns None (D447), `changed` when a record was dropped
 * (`tables_changed`, D294). `refs` the recorded formulas (ODF) to restore by cell.
 */
export function tablesFound(found: TablesFound): {
  tables: FileTable[];
  refs?: Record<string, string>;
  changed: boolean;
} {
  const record = found.record && readTableRecord(found.record.text);
  if (record && record.tables.length === found.standard.length) {
    const cells = Object.keys(record.refs ?? {});
    const lines = cells.map((at) => found.refLine?.(at) ?? null);
    const now = lines.every((l) => l !== null) ? tableFingerprint(found.standard, lines) : null;
    if (now !== null && now === found.record!.fingerprint)
      return {
        tables: record.tables.map((t, i) => ({ ...t, columns: found.standard[i]!.columns })),
        ...(record.refs ? { refs: record.refs } : {}),
        changed: false,
      };
  }
  return { tables: found.standard, changed: found.record !== undefined };
}

/** A table a file's standard form holds, as its reader finds it. */
export type TableCandidate = { name: string; range: GridRange; header: boolean; total: boolean };

/**
 * Which of a file's tables (by sheet, in order) LiveDoc holds: one with a header row and a data row, of a name the
 * rules take, free of the workbook's named ranges (`names`) and the tables before it, overlapping none before it on
 * its sheet, within a sheet's 50; any other stays the file's own (standard-mapping.md "Tables in the file").
 */
export function heldTables(
  sheets: readonly (readonly TableCandidate[])[],
  names: readonly string[],
): boolean[][] {
  const taken: string[] = [];
  return sheets.map((list) => {
    const held: GridRange[] = [];
    return list.map((t) => {
      const g = t.range;
      const rows = g.r2 - g.r1 + 1;
      const ok =
        t.header &&
        rows >= (t.total ? 3 : 2) &&
        held.length < TABLES_MAX &&
        tableNameProblem(t.name, { rows: [], cols: [] }) === null &&
        !taken.some((n) => sameTableName(n, t.name)) &&
        !names.some((n) => sameName(n, tableFormulaName(t.name))) &&
        !held.some((h) => h.r1 <= g.r2 && g.r1 <= h.r2 && h.c1 <= g.c2 && g.c1 <= h.c2);
      if (ok) {
        held.push(g);
        taken.push(t.name);
      }
      return ok;
    });
  });
}

/** What a sheet's tables are made with: its id maker, the read's losses, its header text, the other sheets. */
export type TablesMaking = {
  sheet: string;
  rand: Rand;
  losses: FileLoss[];
  text: CellText;
  others: readonly SheetLayout[];
};

/**
 * A file's tables made on a sheet's grid, in order, checked as a write is: one the grid cannot hold (cut off it,
 * overlapping, past 50, a name taken) is left as plain cells and named (`table_unread`).
 */
export function tablesFromFile(
  list: readonly FileTable[] | undefined,
  layout: SheetLayout,
  making: TablesMaking,
): SheetTable[] | undefined {
  const out: SheetTable[] = [];
  const ids = new Set<string>();
  for (const t of list ?? []) {
    const made = madeTable(t, { ...layout, tables: out }, ids, making);
    const on: SheetLayout = { ...layout, tables: [...out, ...(made ? [made] : [])] };
    if (
      !made ||
      out.length >= TABLES_MAX ||
      !isSheetTable(made, made.id, on) ||
      tableOverlaps(on, made) ||
      tableNameProblem(made.name, on, { except: made.id, others: making.others }) !== null
    ) {
      making.losses.push({ k: 'table_unread', sheet: making.sheet, name: t.name });
      continue;
    }
    ids.add(made.id);
    out.push(made);
  }
  return out.length ? out : undefined;
}

// A file's table on the grid, its typed columns by id; null when its cells are off the grid.
function madeTable(
  t: FileTable,
  on: SheetLayout,
  taken: ReadonlySet<string>,
  making: TablesMaking,
): SheetTable | null {
  const g = t.range;
  const box =
    g.r2 < on.rows.length && g.c2 < on.cols.length && idRangeOf(on, g.r1, g.c1, g.r2, g.c2);
  if (!box) return null;
  const [id] = makeAxisIds(1, making.rand, taken);
  const table: SheetTable = {
    id: id!,
    name: t.name,
    ...box,
    ...(t.total ? { total: true as const } : {}),
  };
  const types: Record<string, TableColumnType> = {};
  const opts: Record<string, DropdownOption[]> = {};
  tableColumnNames(on, table, making.text).forEach((name, i) => {
    const col = on.cols[g.c1 + i]!;
    const type = t.types?.[name];
    if (type) types[col] = type;
    const options = t.opts?.[name];
    if (type === 'dropdown' && options) opts[col] = options;
  });
  if (Object.keys(types).length) table.types = types;
  if (Object.keys(opts).length) table.opts = opts;
  return table;
}
