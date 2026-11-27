// Tables (docs/specs/029-sheets/data-tools.md "Tables"): a range with a name, a header row, a type per column and a
// look, kept by row and column ids as a named range is. Its first row is the header row, its last the total row when
// it has one, the rows between its data rows (at least one). Names are unique among the workbook's tables and named
// ranges, compared as formulas write them: case aside, a space read as an underscore.
import { isAxisId } from '../ids';
import { layoutIndex, posRangeOf } from '../layout';
import { CELL_LIKE, sameName } from '../range-names';
import { dropdownOptionsOk } from '../rules/rule-shape';
import type { DropdownOption, IdRange, SheetLayout } from '../sheet';

/** A column's type; a column with none is None (data-tools.md "Tables"). */
export type TableColumnType =
  | 'text'
  | 'number'
  | 'percent'
  | 'currency'
  | 'date'
  | 'time'
  | 'dateTime'
  | 'dropdown'
  | 'checkbox';

export const TABLE_COLUMN_TYPES: readonly TableColumnType[] = [
  'text',
  'number',
  'percent',
  'currency',
  'date',
  'time',
  'dateTime',
  'dropdown',
  'checkbox',
];

export type SheetTable = IdRange & {
  id: string;
  // As given: letters, digits, underscores and spaces.
  name: string;
  // Each typed column's type by column id; a column absent is None.
  types?: Record<string, TableColumnType>;
  // A Dropdown column's options, by column id.
  opts?: Record<string, DropdownOption[]>;
  // Its last row is its total row.
  total?: true;
  // The alternating colours banding that draws it, by id (D382).
  band?: string;
};

/** The most tables a sheet holds (D380) and a table name's length (Google's). */
export const TABLES_MAX = 50;
export const TABLE_NAME_MAX = 255;

const NAME_SHAPE = /^[A-Za-z_][A-Za-z0-9_ ]*$/;

/** A table's name as formulas write it: a space as an underscore. */
export function tableFormulaName(name: string): string {
  return name.trim().replace(/ /g, '_');
}

/** Whether two table names, or a table's and a named range's, are one name to a formula. */
export function sameTableName(a: string, b: string): boolean {
  return sameName(tableFormulaName(a), tableFormulaName(b));
}

export const TABLE_NAME_TAKEN = 'Another table or named range is called that';

/**
 * Why `name` cannot name a table on `layout`, or null when it can: `others` are the workbook's other sheets' layouts,
 * `except` the id of the table being renamed.
 */
export function tableNameProblem(
  name: string,
  layout: SheetLayout,
  opts: { except?: string; others?: readonly SheetLayout[] } = {},
): string | null {
  const n = name.trim();
  if (n.length === 0 || n.length > TABLE_NAME_MAX || !NAME_SHAPE.test(n))
    return 'Table names start with a letter or _, then letters, digits, _ or spaces';
  const formula = tableFormulaName(n);
  if (/^(true|false)$/i.test(formula)) return 'TRUE and FALSE cannot be names';
  if (CELL_LIKE.test(formula)) return 'That reads as a cell reference';
  const taken = (l: SheetLayout) =>
    (l.tables ?? []).some((t) => t.id !== opts.except && sameTableName(t.name, n)) ||
    (l.names ?? []).some((x) => sameName(x.name, formula));
  if (taken(layout) || opts.others?.some(taken)) return TABLE_NAME_TAKEN;
  return null;
}

/** The first free `TableN` among the workbook's layouts. */
export function nextTableName(layouts: readonly SheetLayout[]): string {
  for (let n = 1; ; n++) {
    const name = `Table${n}`;
    if (!layouts.some((l) => tableNameProblem(name, l) === TABLE_NAME_TAKEN)) return name;
  }
}

/** A table's cells as positions, or null when a corner is gone. */
export function tableBox(layout: SheetLayout, table: IdRange) {
  return posRangeOf(layout, table);
}

/** The table holding a cell, or null. */
export function tableAt(layout: SheetLayout, r: number, c: number): SheetTable | null {
  for (const t of layout.tables ?? []) {
    const p = tableBox(layout, t);
    if (p && r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2) return t;
  }
  return null;
}

/** A cell's text as entered, for a header's name: undefined for an empty cell or a formula. */
export type CellText = (r: string, c: string) => string | undefined;

/**
 * A table's column names in place order (D383): each header's text as entered, trimmed; a blank or formula header
 * `Column N`; a name an earlier column has, case aside, numbered from 2 until free, as Excel's.
 */
export function tableColumnNames(layout: SheetLayout, table: SheetTable, text: CellText): string[] {
  const p = tableBox(layout, table);
  if (!p) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let c = p.c1; c <= p.c2; c++) {
    const raw = text(table.r1, layout.cols[c]!)?.trim();
    const base = raw ? raw : `Column ${c - p.c1 + 1}`;
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base}${n}`;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** Whether a table overlaps another of the layout's (one with another id). */
export function tableOverlaps(layout: SheetLayout, table: IdRange & { id: string }): boolean {
  const p = tableBox(layout, table);
  return (layout.tables ?? []).some((x) => {
    const q = x.id === table.id ? null : tableBox(layout, x);
    return !!p && !!q && p.r1 <= q.r2 && q.r1 <= p.r2 && p.c1 <= q.c2 && q.c1 <= p.c2;
  });
}

const KEYS = new Set(['id', 'name', 'r1', 'c1', 'r2', 'c2', 'types', 'opts', 'total', 'band']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether `v` is a table a write may store on this layout, with the id it names (the sheet's own rules only). */
export function isSheetTable(v: unknown, id: string, layout: SheetLayout): v is SheetTable {
  if (!isRecord(v) || v.id !== id || !isAxisId(id)) return false;
  if (!Object.keys(v).every((k) => KEYS.has(k))) return false;
  if (typeof v.name !== 'string' || tableNameProblem(v.name, layout, { except: id }) !== null)
    return false;
  const ix = layoutIndex(layout);
  const on = (axis: ReadonlyMap<string, number>, x: unknown) => isAxisId(x) && axis.has(x);
  if (![v.r1, v.r2].every((x) => on(ix.rowPos, x)) || ![v.c1, v.c2].every((x) => on(ix.colPos, x)))
    return false;
  const p = tableBox(layout, v as IdRange)!;
  // A header row and a data row, and a total row besides when it has one.
  if (p.r2 - p.r1 < (v.total === true ? 2 : 1)) return false;
  const inside = (c: string) => {
    const at = ix.colPos.get(c);
    return at !== undefined && at >= p.c1 && at <= p.c2;
  };
  if (v.types !== undefined) {
    if (!isRecord(v.types)) return false;
    for (const [c, type] of Object.entries(v.types))
      if (!inside(c) || !TABLE_COLUMN_TYPES.includes(type as TableColumnType)) return false;
  }
  if (v.opts !== undefined) {
    if (!isRecord(v.opts)) return false;
    const types: Record<string, unknown> = v.types ?? {};
    for (const [c, opts] of Object.entries(v.opts))
      if (types[c] !== 'dropdown' || !dropdownOptionsOk(opts)) return false;
  }
  return (v.total === undefined || v.total === true) && (v.band === undefined || isAxisId(v.band));
}
