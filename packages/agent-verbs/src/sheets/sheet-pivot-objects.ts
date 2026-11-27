// A spreadsheet's pivot tables for an agent (docs/specs/029-sheets/pivot-tables.md "The model", sheet-store.md "Built
// for agents in a spreadsheet"): change_sheet's pivot becomes one of the sheet's pivot tables, a layout write that sets
// it whole (a new one, or in the place of the one `replace` names), clear_pivots the writes that take them off, and
// read_sheet the pivot tables by their columns' names in A1. Pure, over the workbook as it stands.
import {
  columnLetters,
  formatA1,
  formatRange,
  layoutIndex,
  makeAxisIds,
  parseRangeText,
  pivotColumns,
  posRangeOf,
  quoteSheet,
  sourceFromText,
  type PivotCalcSummary,
  type PivotColumn,
  type PivotDateRule,
  type PivotGrouping,
  type PivotShowAs,
  type PivotSummary,
  type Rand,
  type GridRange,
  isError,
  type SheetLayout,
  type SheetPivot,
  type SheetPivotFilter,
  type SheetPivotGroup,
  type SheetPivotValue,
  type SheetWrite,
  type Workbook,
} from '@livedoc/sheets';
import type { SheetRefusal } from './sheet-state';

/** A group's grouping: a date rule by name, number intervals, or custom groups of items as the source shows them. */
export type PivotGroupingArg =
  | PivotDateRule
  | { size: number; start?: number; end?: number }
  | { groups: { name: string; items: string[] }[] };

export type PivotGroupArg =
  | string
  | {
      column: string;
      order?: 'asc' | 'desc';
      sortBy?: string;
      totals?: boolean;
      repeat?: boolean;
      grouping?: PivotGroupingArg;
    };

export type PivotValueArg =
  | { column: string; summarise?: PivotSummary; showAs?: PivotShowAs; name?: string }
  | { formula: string; name: string; summarise?: PivotCalcSummary; showAs?: PivotShowAs };

export type PivotFilterArg =
  { column: string; show: string[] } | { column: string; formula: string };

export type SheetPivotChange = {
  op: 'pivot';
  range: string;
  at?: string;
  rows?: PivotGroupArg[];
  columns?: PivotGroupArg[];
  values?: PivotValueArg[];
  filters?: PivotFilterArg[];
  valuesAsRows?: boolean;
  replace?: string;
};

const refuse = (code: string, message: string): SheetRefusal => ({ ok: false, code, message });

const pivots = (layout: SheetLayout): SheetPivot[] =>
  (layout.objects ?? []).filter((x): x is SheetPivot => x.kind === 'pivot');

function noPivot(layout: SheetLayout, id: string): SheetRefusal {
  return refuse(
    'pivot_not_found',
    `No pivot table "${id}" on this sheet. Its pivot tables: ${
      pivots(layout)
        .map((x) => x.id)
        .join(', ') || 'none'
    } (read_sheet lists them).`,
  );
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// A column of the source by its header's name, else by its letter ("C").
function columnOf(columns: readonly PivotColumn[], letters: readonly string[], name: string) {
  const i = columns.findIndex((x) => same(x.name, name));
  if (i >= 0) return columns[i]!;
  const j = letters.findIndex((x) => same(x, name));
  return j >= 0 ? columns[j] : undefined;
}

// The name a value's output labels it by (pivot-tables.md "The output", "Labels").
function valueLabel(v: SheetPivotValue, nameOf: (col: string) => string): string {
  if (v.formula !== undefined) return v.name;
  return v.name ?? `${v.summary} of ${nameOf(v.col)}`;
}

// The model's grouping for an agent's, or why the output cannot use it (pivot-tables.md "Agents", D620).
function groupingOf(arg: PivotGroupingArg): PivotGrouping | string {
  if (typeof arg === 'string') return { k: 'date', rule: arg };
  if ('size' in arg) {
    if (!(arg.size > 0)) return `its size is ${arg.size}; a size is above 0.`;
    if (arg.start !== undefined && arg.end !== undefined && arg.start >= arg.end)
      return `its start ${arg.start} is not below its end ${arg.end}.`;
    return {
      k: 'interval',
      size: arg.size,
      ...(arg.start !== undefined ? { start: arg.start } : {}),
      ...(arg.end !== undefined ? { end: arg.end } : {}),
    };
  }
  const names = new Set<string>();
  const items = new Set<string>();
  for (const g of arg.groups) {
    if (!g.name || g.items.length === 0) return 'each custom group has a name and items.';
    const name = g.name.toLowerCase();
    if (names.has(name)) return `two custom groups are named "${g.name}".`;
    names.add(name);
    for (const item of g.items) {
      if (items.has(item)) return `"${item}" is in two custom groups.`;
      items.add(item);
    }
  }
  return { k: 'custom', groups: arg.groups };
}

// A model grouping as an agent gives it.
function groupingArg(g: PivotGrouping): PivotGroupingArg {
  if (g.k === 'date') return g.rule;
  if (g.k === 'custom')
    return { groups: g.groups.map((x) => ({ name: x.name, items: [...x.items] })) };
  return {
    size: g.size,
    ...(g.start !== undefined ? { start: g.start } : {}),
    ...(g.end !== undefined ? { end: g.end } : {}),
  };
}

/** The layout write a `pivot` change makes, its id and the line saying what it did; refused with what to fix. */
export function buildPivotChange(
  wb: Workbook,
  sheetId: string,
  change: SheetPivotChange,
  rand: Rand,
): { ok: true; writes: SheetWrite[]; line: string } | SheetRefusal {
  const sheet = wb.sheet(sheetId)!;
  const { layout } = sheet;
  if (change.replace !== undefined && !pivots(layout).some((x) => x.id === change.replace))
    return noPivot(layout, change.replace);
  const source = sourceFromText(wb.ctxFor(sheetId), change.range);
  if (!source)
    return refuse(
      'range_invalid',
      `"${change.range}" is not a range of this spreadsheet ("A1:D20", or "Data!A1:D20" on another sheet).`,
    );
  const at = change.at === undefined ? null : parseRangeText(change.at);
  if (
    change.at !== undefined &&
    (!at || at.r1 >= layout.rows.length || at.c1 >= layout.cols.length)
  )
    return refuse('range_invalid', `"${change.at}" is not a cell of this sheet ("H1").`);
  // By default a column clear of the source when it is on this sheet, else A1.
  const own = source.s === undefined && source.st === undefined;
  const box = own ? posRangeOf(layout, source)! : null;
  const cell = at
    ? { r: at.r1, c: at.c1 }
    : box
      ? { r: box.r1, c: Math.min(box.c2 + 2, layout.cols.length - 1) }
      : { r: 0, c: 0 };
  const base: SheetPivot = {
    id: 'pending',
    kind: 'pivot',
    at: { r: layout.rows[cell.r]!, c: layout.cols[cell.c]! },
    source,
  };
  const read = wb.pivotSourceOf(sheetId, base)!;
  const columns = pivotColumns(read);
  if (read.source.rows.length === 0)
    return refuse(
      'range_invalid',
      'A pivot table reads a header row and at least one row of data.',
    );
  const letters = columns.map((_, i) => columnLetters(read.box.c1 + i));
  const names = columns.map((x) => `"${x.name}"`).join(', ');
  const unknown = (name: string) =>
    refuse('column_not_found', `No column "${name}" in ${change.range}. Its columns: ${names}.`);

  const values: SheetPivotValue[] = [];
  for (const v of change.values ?? []) {
    if ('formula' in v) {
      if (!v.formula.startsWith('='))
        return refuse(
          'formula_invalid',
          `A calculated field's formula starts with "=": ${v.formula}.`,
        );
      values.push({
        formula: v.formula,
        name: v.name,
        summary: v.summarise ?? 'SUM',
        ...(v.showAs ? { showAs: v.showAs } : {}),
      });
      continue;
    }
    const col = columnOf(columns, letters, v.column);
    if (!col) return unknown(v.column);
    values.push({
      col: col.col,
      summary: v.summarise ?? (col.numbers ? 'SUM' : 'COUNTA'),
      ...(v.showAs ? { showAs: v.showAs } : {}),
      ...(v.name ? { name: v.name } : {}),
    });
  }
  const nameOf = (col: string) => columns.find((x) => x.col === col)!.name;
  const labels = values.map((v) => valueLabel(v, nameOf));

  const groups = (list: PivotGroupArg[] | undefined): SheetPivotGroup[] | SheetRefusal => {
    const out: SheetPivotGroup[] = [];
    for (const g of list ?? []) {
      const arg = typeof g === 'string' ? { column: g } : g;
      const col = columnOf(columns, letters, arg.column);
      if (!col) return unknown(arg.column);
      let sortBy: SheetPivotGroup['sortBy'];
      if (arg.sortBy !== undefined) {
        const i = labels.findIndex((x) => same(x, arg.sortBy!));
        if (i < 0)
          return refuse(
            'write_invalid',
            `sortBy names a value by its label: ${labels.map((x) => `"${x}"`).join(', ') || 'none yet'}.`,
          );
        sortBy = { value: i };
      }
      const grouping = arg.grouping === undefined ? undefined : groupingOf(arg.grouping);
      if (typeof grouping === 'string')
        return refuse('write_invalid', `Grouping ${col.name}: ${grouping}`);
      out.push({
        col: col.col,
        ...(arg.order === 'desc' ? { desc: true as const } : {}),
        ...(sortBy ? { sortBy } : {}),
        ...(arg.totals === false ? { totals: false as const } : {}),
        ...(arg.repeat ? { repeat: true as const } : {}),
        ...(grouping ? { grouping } : {}),
      });
    }
    return out;
  };
  const rows = groups(change.rows);
  if (!Array.isArray(rows)) return rows;
  const cols = groups(change.columns);
  if (!Array.isArray(cols)) return cols;

  const filters: SheetPivotFilter[] = [];
  for (const f of change.filters ?? []) {
    const col = columnOf(columns, letters, f.column);
    if (!col) return unknown(f.column);
    filters.push(
      'formula' in f
        ? { col: col.col, formula: f.formula }
        : { col: col.col, cond: { values: f.show } },
    );
  }

  const id = change.replace ?? makeAxisIds(1, rand, new Set(pivots(layout).map((x) => x.id)))[0]!;
  const object: SheetPivot = {
    ...base,
    id,
    ...(rows.length ? { rows } : {}),
    ...(cols.length ? { columns: cols } : {}),
    ...(values.length ? { values } : {}),
    ...(filters.length ? { filters } : {}),
    ...(change.valuesAsRows ? { valuesAsRows: true as const } : {}),
  };
  const what = [
    rows.length ? `rows ${rows.map((g) => nameOf(g.col)).join(', ')}` : '',
    cols.length ? `columns ${cols.map((g) => nameOf(g.col)).join(', ')}` : '',
    labels.length ? `values ${labels.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return {
    ok: true,
    writes: [{ kind: 'layout', changes: [{ k: 'object', id, object }] }],
    line: `pivot table ${id} of ${change.range} at ${formatA1(cell.r, cell.c)}${
      change.replace ? ` (in place of ${change.replace})` : ''
    }${what ? `: ${what}` : ' (no fields yet)'}`,
  };
}

/** The write taking off the pivot table of `id`, or every one (no id); refused for an id the sheet does not hold. */
export function pivotsClearWrite(
  layout: SheetLayout,
  id: string | undefined,
): { ok: true; write: SheetWrite | null; count: number } | SheetRefusal {
  const all = pivots(layout);
  if (id !== undefined && !all.some((x) => x.id === id)) return noPivot(layout, id);
  const gone = id === undefined ? all : all.filter((x) => x.id === id);
  return {
    ok: true,
    count: gone.length,
    write: gone.length
      ? {
          kind: 'layout',
          changes: gone.map((x) => ({ k: 'object' as const, id: x.id, object: null })),
        }
      : null,
  };
}

// Whether a pivot table's output landed: more than its anchor, or an anchor showing a value (never an error: blocked).
function landed(wb: Workbook, sheetId: string, g: GridRange): boolean {
  if (g.r2 > g.r1 || g.c2 > g.c1) return true;
  const v = wb.value(sheetId, g.r1, g.c1);
  return v !== null && !isError(v);
}

type PivotGroupRead = {
  column: string;
  order?: 'desc';
  sortBy?: string;
  totals?: false;
  repeat?: true;
  grouping?: PivotGroupingArg;
};

/** A pivot table as read_sheet answers it: in A1, its fields by their columns' names. */
export type PivotRead = {
  id: string;
  at: string;
  range: string | null;
  output: string | null;
  rows?: PivotGroupRead[];
  columns?: Omit<PivotGroupRead, 'repeat'>[];
  values?: {
    column?: string;
    formula?: string;
    summarise: PivotCalcSummary;
    label: string;
    showAs?: PivotShowAs;
  }[];
  filters?: { column: string; show?: string[]; condition?: true; formula?: string }[];
  valuesAsRows?: true;
};

export function pivotsRead(wb: Workbook, sheetId: string): PivotRead[] {
  const { layout } = wb.sheet(sheetId)!;
  const ix = layoutIndex(layout);
  return pivots(layout).flatMap((x) => {
    const r = ix.rowPos.get(x.at.r);
    const c = ix.colPos.get(x.at.c);
    if (r === undefined || c === undefined) return [];
    const read = x.source ? wb.pivotSourceOf(sheetId, x) : null;
    const columns = read ? pivotColumns(read) : [];
    const nameOf = (col: string) => columns.find((y) => y.col === col)?.name ?? col;
    const labels = (x.values ?? []).map((v) => valueLabel(v, nameOf));
    const p = read ? posRangeOf(read.box.sheet.layout, x.source!) : null;
    const range = p
      ? `${read!.box.sheet.id === sheetId ? '' : `${quoteSheet(read!.box.sheet.title)}!`}${formatRange(p)}`
      : null;
    const out = wb.pivotOutputAt(sheetId, r, c);
    const group = (g: SheetPivotGroup) => ({
      column: nameOf(g.col),
      ...(g.desc ? { order: 'desc' as const } : {}),
      ...(g.sortBy ? { sortBy: labels[g.sortBy.value]! } : {}),
      ...(g.totals === false ? { totals: false as const } : {}),
      ...(g.repeat ? { repeat: true as const } : {}),
      ...(g.grouping ? { grouping: groupingArg(g.grouping) } : {}),
    });
    return [
      {
        id: x.id,
        at: formatA1(r, c),
        range,
        output: out && landed(wb, sheetId, out.rect) ? formatRange(out.rect) : null,
        ...(x.rows?.length ? { rows: x.rows.map(group) } : {}),
        ...(x.columns?.length ? { columns: x.columns.map(group) } : {}),
        ...(x.values?.length
          ? {
              values: x.values.map((v, i) => ({
                ...(v.formula === undefined ? { column: nameOf(v.col) } : { formula: v.formula }),
                summarise: v.summary,
                label: labels[i]!,
                ...(v.showAs ? { showAs: v.showAs } : {}),
              })),
            }
          : {}),
        ...(x.filters?.length
          ? {
              filters: x.filters.map((f) =>
                f.formula !== undefined
                  ? { column: nameOf(f.col), formula: f.formula }
                  : Object.keys(f.cond).every((k) => k === 'values')
                    ? { column: nameOf(f.col), ...(f.cond.values ? { show: f.cond.values } : {}) }
                    : { column: nameOf(f.col), condition: true as const },
              ),
            }
          : {}),
        ...(x.valuesAsRows ? { valuesAsRows: true as const } : {}),
      },
    ];
  });
}
