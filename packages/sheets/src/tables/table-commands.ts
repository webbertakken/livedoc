// Convert to Table (docs/specs/029-sheets/data-tools.md "Tables"): the selection, or the data around the active cell,
// made a table at once with its banding, its columns' types guessed (D441); refused, with a named reason, over another
// table, a merge, a banding reaching outside it, or past a sheet's tables.
import { TABLE_OVERLAPS_FILTER } from './table-filter';
import { groupViewsGone } from '../group-by-view';
import type { Workbook } from '../engine/workbook';
import { makeAxisIds } from '../ids';
import { idRangeOf, layoutIndex, posRangeOf } from '../layout';
import { newBanding } from '../rules/bandings';
import { currentRegion, type Grid } from '../selection';
import {
  cellKey,
  splitCellKey,
  type DropdownOption,
  type NumberFormatKind,
  type Sheet,
  type StoredRef,
} from '../sheet';
import { DROPDOWN_OPTION_MAX, DROPDOWN_OPTIONS_MAX } from '../limits';
import type { GridRange } from '../address';
import type { CellChange, SheetWrite } from '../store';
import { cellText } from '../engine/sheets-ctx';
import { compileFormula, mapFormulaRefs, tableRefAsRange } from '../formula/stored';
import { protectionsAt } from '../protection';
import { formatTableRef, TableArea } from './table-ref';
import type { LayoutChange } from '../store-layout';
import {
  nextTableName,
  tableAt,
  tableColumnNames,
  tableFormulaName,
  TABLES_MAX,
  type SheetTable,
  type TableColumnType,
} from './table';

export type TableRefusal = 'overlap' | 'merge' | 'banding' | 'full' | 'filter';

/** What Convert to Table says when it cannot make one (data-tools.md "Tables"). */
export const TABLE_REFUSAL_COPY: Readonly<Record<TableRefusal, string>> = {
  overlap: "Tables can't overlap",
  merge: 'Unmerge cells before making a table',
  banding: "Alternating colours can't overlap",
  full: `A sheet holds up to ${TABLES_MAX} tables`,
  filter: TABLE_OVERLAPS_FILTER,
};

export type ConvertToTable =
  | { readonly ok: true; readonly write: SheetWrite; readonly table: SheetTable }
  | { readonly ok: false; readonly reason: TableRefusal };

const meets = (a: GridRange, b: GridRange) =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
const inside = (a: GridRange, b: GridRange) =>
  a.r1 >= b.r1 && a.r2 <= b.r2 && a.c1 >= b.c1 && a.c2 <= b.c2;

const NUMBER_TYPES: Partial<Record<NumberFormatKind, TableColumnType>> = {
  percent: 'percent',
  currency: 'currency',
  accounting: 'currency',
  financial: 'currency',
  date: 'date',
  time: 'time',
  duration: 'time',
  datetime: 'dateTime',
};

// A data cell's type as it holds now: a tick box's for TRUE or FALSE, its number format's for a number; null for an
// empty cell or an error, which say nothing.
function cellType(wb: Workbook, sheet: Sheet, r: number, c: number): TableColumnType | null {
  const v = wb.value(sheet.id, r, c);
  if (v === null || v === '' || v === undefined) return null;
  if (typeof v === 'boolean') return 'checkbox';
  if (typeof v === 'string') return 'text';
  if (typeof v !== 'number') return null;
  const key = cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!);
  const nf = sheet.cells.get(key)?.format?.nf;
  return (nf && NUMBER_TYPES[nf]) ?? 'number';
}

/** Each column's guessed type by column id (D441): one every filled data cell has, else Text; none filled, None. */
export function guessColumnTypes(
  wb: Workbook,
  sheet: Sheet,
  box: GridRange,
): Record<string, TableColumnType> {
  const out: Record<string, TableColumnType> = {};
  for (let c = box.c1; c <= box.c2; c++) {
    let type: TableColumnType | null = null;
    for (let r = box.r1 + 1; r <= box.r2; r++) {
      const here = cellType(wb, sheet, r, c);
      if (here === null) continue;
      if (type !== null && here !== type) {
        type = 'text';
        break;
      }
      type = here;
    }
    if (type) out[sheet.layout.cols[c]!] = type;
  }
  return out;
}

/** The table Convert to Table makes over the selection `sel`, as one write, or why it cannot. */
export function convertToTable(
  wb: Workbook,
  sheetId: string,
  sel: GridRange,
  grid: Grid,
  rand: () => number = Math.random,
): ConvertToTable | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { layout } = sheet;
  const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
  const box = { ...(single ? currentRegion({ r: sel.r1, c: sel.c1 }, grid) : sel) };
  // A header and at least one data row.
  if (box.r2 === box.r1) box.r2 = Math.min(box.r1 + 1, layout.rows.length - 1);
  if (box.r2 === box.r1) return null;
  const at = (x: Parameters<typeof posRangeOf>[1]) => posRangeOf(layout, x);
  const tables = layout.tables ?? [];
  if (tables.length >= TABLES_MAX) return { ok: false, reason: 'full' };
  if (
    tables.some((t) => {
      const p = at(t);
      return !!p && meets(p, box);
    })
  )
    return { ok: false, reason: 'overlap' };
  // The sheet's filter may be over exactly the new table, its conditions becoming the table's filter, and nowhere
  // else on it (D481).
  const filter = layout.filter && at(layout.filter);
  const exact =
    !!filter &&
    filter.r1 === box.r1 &&
    filter.c1 === box.c1 &&
    filter.r2 === box.r2 &&
    filter.c2 === box.c2;
  if (filter && meets(filter, box) && !exact) return { ok: false, reason: 'filter' };
  if (
    (layout.merges ?? []).some((m) => {
      const p = at(m);
      return !!p && meets(p, box);
    })
  )
    return { ok: false, reason: 'merge' };
  const bands = (layout.bands ?? []).filter((b) => {
    const p = at(b);
    return !!p && meets(p, box);
  });
  if (bands.some((b) => !inside(at(b)!, box))) return { ok: false, reason: 'banding' };
  const ids = idRangeOf(layout, box.r1, box.c1, box.r2, box.c2)!;
  const [tableId] = makeAxisIds(1, rand, new Set(tables.map((t) => t.id)));
  const [bandId] = makeAxisIds(1, rand, new Set((layout.bands ?? []).map((b) => b.id)));
  const types = guessColumnTypes(wb, sheet, box);
  const table: SheetTable = {
    id: tableId!,
    name: nextTableName(wb.sheetList().map((s) => s.layout)),
    ...ids,
    ...(Object.keys(types).length ? { types } : {}),
    band: bandId!,
    // Its own filter on, as Excel's (D481).
    filter: exact ? { ...layout.filter!.conds } : {},
  };
  const changes: LayoutChange[] = [
    ...(exact ? [{ k: 'filter', filter: null } satisfies LayoutChange] : []),
    ...bands.map((b): LayoutChange => ({ k: 'band', id: b.id, band: null })),
    { k: 'band', id: bandId!, band: newBanding(bandId!, ids) },
    { k: 'table', id: table.id, table },
  ];
  return { ok: true, write: { kind: 'layout', changes }, table };
}

export const TOTAL_ROW_NO_ROOM = 'Make room below the table for its total row';

// The column types a total row sums (D445).
const SUMMED: ReadonlySet<TableColumnType> = new Set(['number', 'percent', 'currency']);

/**
 * Total Row switched on or off (data-tools.md "Tables", D445): on, the row below joins the table as its total row,
 * `Total` in its first column and `SUBTOTAL(109, Table1[Column])` under each number column, its banding's footer on;
 * off, that row is a data row again, its cells kept. On is refused while the row below holds anything, is another
 * table's or a protected range's, or is past the grid.
 */
export function totalRowWrite(
  wb: Workbook,
  sheetId: string,
  tableId: string,
  on: boolean,
): { ok: true; write: SheetWrite } | { ok: false; reason: string } | null {
  const sheet = wb.sheet(sheetId);
  const table = sheet?.layout.tables?.find((t) => t.id === tableId);
  const p = table && sheet && posRangeOf(sheet.layout, table);
  if (!sheet || !table || !p || !!table.total === on) return null;
  const { layout } = sheet;
  const band = table.band ? layout.bands?.find((b) => b.id === table.band) : undefined;
  if (!on) {
    const { total: _t, ...rest } = table;
    const changes: LayoutChange[] = [{ k: 'table', id: table.id, table: rest }];
    if (band) {
      const { footer: _f, ...plain } = band;
      changes.push({ k: 'band', id: band.id, band: plain });
    }
    return { ok: true, write: { kind: 'layout', changes } };
  }
  const below = layout.rows[p.r2 + 1];
  const free = (c: number) =>
    !sheet.cells.has(cellKey(below!, layout.cols[c]!)) &&
    !tableAt(layout, p.r2 + 1, c) &&
    !protectionsAt(layout, p.r2 + 1, c).some((x) => x.range);
  if (below === undefined) return { ok: false, reason: TOTAL_ROW_NO_ROOM };
  for (let c = p.c1; c <= p.c2; c++) if (!free(c)) return { ok: false, reason: TOTAL_ROW_NO_ROOM };
  const grown: SheetTable = { ...table, r2: below, total: true };
  const ctx = wb.ctxFor(sheetId);
  const names = tableColumnNames(layout, table, (r, c) => cellText(sheet, r, c));
  const cells: CellChange[] = [{ r: below, c: layout.cols[p.c1]!, i: { s: 'Total' } }];
  for (let c = p.c1 + 1; c <= p.c2; c++) {
    const col = layout.cols[c]!;
    const type = table.types?.[col];
    if (!type || !SUMMED.has(type)) continue;
    const ref = formatTableRef(
      tableFormulaName(table.name),
      [names[c - p.c1]!, names[c - p.c1]!],
      TableArea.data,
    );
    const compiled = compileFormula(`=SUBTOTAL(109, ${ref})`, ctx);
    if (compiled.ok) cells.push({ r: below, c: col, i: { f: compiled.formula } });
  }
  const changes: LayoutChange[] = [{ k: 'table', id: table.id, table: grown }];
  if (band) changes.push({ k: 'band', id: band.id, band: { ...band, r2: below, footer: true } });
  return { ok: true, write: { kind: 'layout', changes, cells } };
}

/**
 * Convert to Range (data-tools.md "Tables"): the table goes, its cells and banding kept, and every formula of the
 * workbook reading it reads the same cells as plain absolute ranges; the writes, one a sheet, make one change.
 */
export function convertToRangeWrites(
  wb: Workbook,
  sheetId: string,
  tableId: string,
): { sheetId: string; write: SheetWrite }[] | null {
  const home = wb.sheet(sheetId);
  if (!home?.layout.tables?.some((t) => t.id === tableId)) return null;
  const reads = (ref: StoredRef, ownId: string) =>
    ref.t === tableId && (ref.s ?? ownId) === sheetId;
  const out: { sheetId: string; write: SheetWrite }[] = [];
  for (const sheet of wb.sheetList()) {
    const ctx = wb.ctxFor(sheet.id);
    const ix = layoutIndex(sheet.layout);
    const cells: CellChange[] = [];
    for (const [key, cell] of sheet.cells) {
      const input = cell.input;
      if (!input || !('f' in input) || !input.f.r.some((ref) => reads(ref, sheet.id))) continue;
      const { r, c } = splitCellKey(key);
      const row = ix.rowPos.get(r);
      const f = mapFormulaRefs(input.f, (ref) =>
        reads(ref, sheet.id) ? tableRefAsRange(ref, ctx, row) : ref,
      );
      cells.push({ r, c, i: { f } });
    }
    if (sheet.id === sheetId)
      out.unshift({
        sheetId,
        write: {
          kind: 'layout',
          // Its group by views go with it (D499).
          changes: [
            { k: 'table', id: tableId, table: null },
            ...groupViewsGone(home.layout, tableId),
          ],
          cells,
        },
      });
    else if (cells.length) out.push({ sheetId: sheet.id, write: { kind: 'cells', cells } });
  }
  return out;
}

const TYPE_FORMATS: Partial<Record<TableColumnType, NumberFormatKind>> = {
  number: 'number',
  percent: 'percent',
  currency: 'currency',
  date: 'date',
  time: 'time',
  dateTime: 'datetime',
};

// A column's values from row `r1` to `r2` as a dropdown's options: as they read, once each (case aside), in order.
function valuesAsOptions(wb: Workbook, sheetId: string, r1: number, r2: number, c: number) {
  const options: DropdownOption[] = [];
  const seen = new Set<string>();
  for (let r = r1; r <= r2 && options.length < DROPDOWN_OPTIONS_MAX; r++) {
    const v = wb.value(sheetId, r, c);
    const text =
      v === null || typeof v === 'object' ? '' : String(v).trim().slice(0, DROPDOWN_OPTION_MAX);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    options.push({ v: text });
  }
  return options;
}

/**
 * A Dropdown column's options as Edit Column Type opens them (data-tools.md "Tables" "Column menu"): its own, else its
 * data cells' values as they read (D449). Empty for a column not in the table.
 */
export function tableColumnOptions(
  wb: Workbook,
  sheetId: string,
  tableId: string,
  colId: string,
): DropdownOption[] {
  const sheet = wb.sheet(sheetId);
  const table = sheet?.layout.tables?.find((t) => t.id === tableId);
  const p = table && sheet && posRangeOf(sheet.layout, table);
  const c = sheet && layoutIndex(sheet.layout).colPos.get(colId);
  if (!table || !p || c === undefined || c < p.c1 || c > p.c2) return [];
  const own = table.opts?.[colId];
  if (own?.length) return own;
  return valuesAsOptions(wb, sheetId, p.r1 + 1, table.total ? p.r2 - 1 : p.r2, c);
}

/**
 * A column's type set (data-tools.md "Tables"): the table's types, and its data cells' number format for a Number,
 * Percent, Currency, Date, Time or Date Time column; a Dropdown's options those given (the column menu's form), else
 * the column's values as they read, once each, in their order (D449). One write.
 */
export function columnTypeWrite(
  wb: Workbook,
  sheetId: string,
  tableId: string,
  colId: string,
  type: TableColumnType | null,
  given?: readonly DropdownOption[],
): SheetWrite | null {
  const sheet = wb.sheet(sheetId);
  const table = sheet?.layout.tables?.find((t) => t.id === tableId);
  const p = table && sheet && posRangeOf(sheet.layout, table);
  const c = sheet && layoutIndex(sheet.layout).colPos.get(colId);
  if (!sheet || !table || !p || c === undefined || c < p.c1 || c > p.c2) return null;
  const { layout } = sheet;
  const { [colId]: _t, ...types } = table.types ?? {};
  const { [colId]: _o, ...opts } = table.opts ?? {};
  const { types: _types, opts: _opts, ...rest } = table;
  const nextTypes = type ? { ...types, [colId]: type } : types;
  const lastData = table.total ? p.r2 - 1 : p.r2;
  const options: DropdownOption[] =
    type !== 'dropdown'
      ? []
      : given
        ? [...given]
        : valuesAsOptions(wb, sheetId, p.r1 + 1, lastData, c);
  const nextOpts = options.length ? { ...opts, [colId]: options } : opts;
  const next: SheetTable = {
    ...rest,
    ...(Object.keys(nextTypes).length ? { types: nextTypes } : {}),
    ...(Object.keys(nextOpts).length ? { opts: nextOpts } : {}),
  };
  const nf = type ? TYPE_FORMATS[type] : undefined;
  const cells: CellChange[] = [];
  if (nf)
    for (let r = p.r1 + 1; r <= lastData; r++)
      cells.push({ r: layout.rows[r]!, c: colId, f: { nf } });
  return {
    kind: 'layout',
    changes: [{ k: 'table', id: table.id, table: next }],
    ...(cells.length ? { cells } : {}),
  };
}
