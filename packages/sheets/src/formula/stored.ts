// Formulas as stored: references point at row and column ids (and
// other sheets at their id), so inserting, moving and sorting rows never rewrites a cell, and a write sent before
// someone else's layout change still lands where its writer meant. People see and type A1; this file converts.
import { columnLetters } from '../address';
import { AST_SHAPES_MAX } from '../limits';
import { layoutIndex } from '../layout';
import type { SheetLayout, StoredFormula, StoredRef } from '../sheet';
import type { A1Ref, Node } from './ast';
import type { NamedFunctionDef } from '../named-functions';
import { parseFormula, type ParseFailure } from './parse';
import { declaredNamesOf, namesOf, refsOf, tableRefsOf } from './ast';
import {
  tableAt,
  tableColumnNames,
  tableFormulaName,
  type CellText,
  type SheetTable,
} from '../tables/table';
import {
  formatTableRef,
  tableAreaCols,
  tableAreaRows,
  TableArea,
  type TableSpec,
} from '../tables/table-ref';
import { tokenize } from './tokens';

// `text`: a cell's text as entered, for a table's column names (none: every column is `Column N`).
export type SheetHandle = { id: string; title: string; layout: SheetLayout; text?: CellText };

// Where a formula lives and the sheets it can name (the tab's).
export type SheetsCtx = {
  own: SheetHandle;
  byTitle(title: string): SheetHandle | undefined;
  byId(id: string): SheetHandle | undefined;
  // A named range by name, as the formula's sheet reads it (formulas.md "Named ranges"); null when it reads none.
  name?(name: string): PosRef | null;
  // A named function by name (formulas.md "Named functions"): the spreadsheet's, null when it has none of that name.
  fn?(name: string): NamedFunctionDef | null;
  // A table by name as formulas write it (formulas.md "Table references"): the formula's own sheet's, else the first
  // other sheet's; null when none has it.
  table?(name: string): { sheet: SheetHandle; table: SheetTable } | null;
  // The formula's own cell (positions), when known: a table reference naming no table (`[@Amount]`) reads the table
  // holding it.
  here?: { r: number; c: number };
  // The characters a typed input may hold: the sheet's kind's (SheetLimits), a Plan Sheet's by default.
  inputMax?: number;
};

// A reference as positions in its target sheet. `sheet` null is the formula's own sheet.
export type PosRef = {
  sheet: { id: string } | { title: string } | null;
  r1?: number;
  c1?: number;
  r2?: number;
  c2?: number;
  a: number;
  open?: 'r' | 'c';
  spill?: true;
};

const REF_ERROR = '#REF!';

function sheetNeedsQuotes(title: string): boolean {
  return !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(title) || /^[A-Za-z]{1,4}[0-9]+$/.test(title);
}

export function quoteSheet(title: string): string {
  return sheetNeedsQuotes(title) ? `'${title.replace(/'/g, "''")}'` : title;
}

function targetOf(ref: { sheet: PosRef['sheet'] }, ctx: SheetsCtx): SheetHandle | undefined {
  if (ref.sheet === null) return ctx.own;
  if ('id' in ref.sheet) return ctx.byId(ref.sheet.id);
  return ctx.byTitle(ref.sheet.title);
}

// An A1 reference's position parts on the sheet it names (each a reader resolves its own way).
export function posRefOf(ref: A1Ref, sheet: PosRef['sheet']): PosRef {
  const out: PosRef = { sheet, a: ref.a };
  if (ref.r1 !== undefined) out.r1 = ref.r1;
  if (ref.c1 !== undefined) out.c1 = ref.c1;
  if (ref.r2 !== undefined) out.r2 = ref.r2;
  if (ref.c2 !== undefined) out.c2 = ref.c2;
  if (ref.open) out.open = ref.open;
  if (ref.spill) out.spill = true;
  return out;
}

function a1ToPos(ref: A1Ref, ctx: SheetsCtx): PosRef {
  let sheet: PosRef['sheet'] = null;
  if (ref.sheet !== undefined) {
    const h = ctx.byTitle(ref.sheet);
    sheet = h ? (h.id === ctx.own.id ? null : { id: h.id }) : { title: ref.sheet };
  }
  return posRefOf(ref, sheet);
}

// Positions to ids in the target's layout; null when a part lies past the grid (it becomes #REF!).
function encodeRef(pos: PosRef, ctx: SheetsCtx): StoredRef | null {
  const out: StoredRef = {};
  if (pos.a) out.a = pos.a;
  if (pos.open) out.open = pos.open;
  if (pos.spill) out.spill = true;
  if (pos.sheet && 'title' in pos.sheet) {
    out.st = pos.sheet.title;
    out.p = [pos.r1 ?? -1, pos.c1 ?? -1, pos.r2 ?? -1, pos.c2 ?? -1];
    if ([pos.r1, pos.c1, pos.r2, pos.c2].some((v) => v !== undefined && v < 0)) return null;
    return out;
  }
  const target = targetOf(pos, ctx);
  if (!target) return null;
  if (pos.sheet) out.s = pos.sheet.id;
  const { rows, cols } = target.layout;
  const pick = (list: string[], v: number | undefined): string | undefined | null =>
    v === undefined ? undefined : v >= 0 && v < list.length ? list[v]! : null;
  const r1 = pick(rows, pos.r1);
  const c1 = pick(cols, pos.c1);
  const r2 = pick(rows, pos.r2);
  const c2 = pick(cols, pos.c2);
  if (r1 === null || c1 === null || r2 === null || c2 === null) return null;
  if (r1 !== undefined) out.r1 = r1;
  if (c1 !== undefined) out.c1 = c1;
  if (r2 !== undefined) out.r2 = r2;
  if (c2 !== undefined) out.c2 = c2;
  return out;
}

// Ids to positions in the target's current layout; null when the reference reads #REF! (its sheet is gone or a
// cell it names was deleted). A range with one corner gone is null too: deleting rows shrinks ranges in the
// write itself (store.ts), so a stored range never keeps a dead corner on its own sheet.
export function resolveRef(ref: StoredRef, ctx: SheetsCtx, row?: number): PosRef | null {
  if (ref.t !== undefined) return resolveTableRef(ref, ctx, row);
  const base = {
    a: ref.a ?? 0,
    ...(ref.open ? { open: ref.open } : {}),
    ...(ref.spill ? { spill: true as const } : {}),
  };
  if (ref.st !== undefined) {
    const p = ref.p ?? [-1, -1, -1, -1];
    const h = ctx.byTitle(ref.st);
    const out: PosRef = { sheet: h ? { id: h.id } : { title: ref.st }, ...base };
    if (p[0] >= 0) out.r1 = p[0];
    if (p[1] >= 0) out.c1 = p[1];
    if (p[2] >= 0) out.r2 = p[2];
    if (p[3] >= 0) out.c2 = p[3];
    return out;
  }
  const sheet = ref.s === undefined || ref.s === ctx.own.id ? null : { id: ref.s };
  const target = sheet ? ctx.byId(sheet.id) : ctx.own;
  if (!target) return null;
  const ix = layoutIndex(target.layout);
  const out: PosRef = { sheet, ...base };
  const parts: [keyof PosRef, string | undefined, ReadonlyMap<string, number>][] = [
    ['r1', ref.r1, ix.rowPos],
    ['c1', ref.c1, ix.colPos],
    ['r2', ref.r2, ix.rowPos],
    ['c2', ref.c2, ix.colPos],
  ];
  for (const [key, id, map] of parts) {
    if (id === undefined) continue;
    const pos = map.get(id);
    if (pos === undefined) return null;
    (out as Record<string, unknown>)[key] = pos;
  }
  return out;
}

// The sheet and table a table reference reads, or null when either is gone.
function tableHome(
  ref: StoredRef,
  ctx: SheetsCtx,
): { sheet: SheetHandle; table: SheetTable } | null {
  const sheet = ref.s === undefined || ref.s === ctx.own.id ? ctx.own : ctx.byId(ref.s);
  const table = sheet?.layout.tables?.find((t) => t.id === ref.t);
  return sheet && table ? { sheet, table } : null;
}

// A table reference's cells (formulas.md "Table references"), absolute; `row` the formula's own, for this row.
// Null when it reads none (#REF!, or #VALUE! for this row off the table's data rows).
function resolveTableRef(ref: StoredRef, ctx: SheetsCtx, row?: number): PosRef | null {
  const home = tableHome(ref, ctx);
  if (!home) return null;
  const { layout } = home.sheet;
  const area = ref.ta ?? TableArea.data;
  const rows = tableAreaRows(layout, home.table, area, row);
  const cols = tableAreaCols(layout, home.table, ref.tc1, ref.tc2);
  if (!rows || !cols) return null;
  const sheet = home.sheet.id === ctx.own.id ? null : { id: home.sheet.id };
  if (rows.r1 === rows.r2 && cols.c1 === cols.c2 && area === TableArea.thisRow)
    return { sheet, r1: rows.r1, c1: cols.c1, a: 3 };
  return { sheet, r1: rows.r1, c1: cols.c1, r2: rows.r2, c2: cols.c2, a: 15 };
}

/** Why a table reference reads no cells: this row off the table's data rows is #VALUE!, anything else #REF!. */
export function tableRefError(ref: StoredRef, ctx: SheetsCtx): '#VALUE!' | '#REF!' {
  return ref.ta === TableArea.thisRow && tableHome(ref, ctx) ? '#VALUE!' : '#REF!';
}

/**
 * A table reference as typed to its stored form, by the table's and its columns' ids; `at` the formula's cell, for
 * a reference naming no table (`[@Amount]`). Null when no table or column of those names is there.
 */
export function encodeTableSpec(
  spec: TableSpec,
  ctx: SheetsCtx,
  at?: { r: number; c: number },
): StoredRef | null {
  let home: { sheet: SheetHandle; table: SheetTable } | null = null;
  if (spec.table !== null) home = ctx.table?.(spec.table) ?? null;
  else if (at) {
    const table = tableAt(ctx.own.layout, at.r, at.c);
    home = table && { sheet: ctx.own, table };
  }
  if (!home) return null;
  const out: StoredRef = { t: home.table.id };
  if (home.sheet.id !== ctx.own.id) out.s = home.sheet.id;
  if (spec.area !== TableArea.data) out.ta = spec.area;
  if (!spec.cols) return out;
  const { layout } = home.sheet;
  const names = tableColumnNames(layout, home.table, home.sheet.text ?? (() => undefined));
  const first = tableAreaCols(layout, home.table)!.c1;
  const idOf = (name: string) => {
    const i = names.findIndex((n) => n.toLowerCase() === name.toLowerCase());
    return i < 0 ? undefined : layout.cols[first + i];
  };
  const c1 = idOf(spec.cols[0]);
  const c2 = idOf(spec.cols[1]);
  if (c1 === undefined || c2 === undefined) return null;
  out.tc1 = c1;
  if (c2 !== c1) out.tc2 = c2;
  return out;
}

// A table reference's text from the table's and its columns' names now; null when the table or a column is gone.
function formatStoredTableRef(ref: StoredRef, ctx: SheetsCtx): string | null {
  const home = tableHome(ref, ctx);
  if (!home) return null;
  const { layout } = home.sheet;
  const name = tableFormulaName(home.table.name);
  const area = ref.ta ?? TableArea.data;
  if (ref.tc1 === undefined) return formatTableRef(name, null, area);
  const cols = tableAreaCols(layout, home.table, ref.tc1, ref.tc2);
  if (!cols) return null;
  const all = tableAreaCols(layout, home.table)!;
  const names = tableColumnNames(layout, home.table, home.sheet.text ?? (() => undefined));
  const ix = layoutIndex(layout);
  const nameOf = (id: string) => names[ix.colPos.get(id)! - all.c1]!;
  return formatTableRef(name, [nameOf(ref.tc1), nameOf(ref.tc2 ?? ref.tc1)], area);
}

function partText(r: number | undefined, c: number | undefined, absR: boolean, absC: boolean) {
  return `${c === undefined ? '' : `${absC ? '$' : ''}${columnLetters(c)}`}${
    r === undefined ? '' : `${absR ? '$' : ''}${r + 1}`
  }`;
}

export function formatPosRef(pos: PosRef, ctx: SheetsCtx): string {
  let prefix = '';
  if (pos.sheet) {
    const title = 'title' in pos.sheet ? pos.sheet.title : ctx.byId(pos.sheet.id)?.title;
    if (title === undefined) return REF_ERROR;
    prefix = `${quoteSheet(title)}!`;
  }
  const a = pos.a;
  const first = partText(pos.r1, pos.c1, !!(a & 1), !!(a & 2));
  let text = first;
  const hasSecond = pos.r2 !== undefined || pos.c2 !== undefined;
  if (hasSecond) text += `:${partText(pos.r2, pos.c2, !!(a & 4), !!(a & 8))}`;
  return `${prefix}${text}${pos.spill ? '#' : ''}`;
}

type CompileResult =
  { ok: true; formula: StoredFormula; ast: Node } | { ok: false; reason: ParseFailure; at: number };

// A typed formula (`=...`) to its stored form, against the tab's sheets.
// A table's name alone (`=ROWS(Sales)`), its data rows: each name in a tree a table of the workbook has, but a LET or
// LAMBDA name.
function tableNamesOf(ast: Node, ctx: SheetsCtx) {
  if (!ctx.table) return [];
  const declared = declaredNamesOf(ast);
  return namesOf(ast)
    .filter((x) => !declared.has(x.v) && ctx.table!(x.v))
    .map((x) => ({
      start: x.start,
      end: x.end,
      spec: { table: x.v, cols: null, area: TableArea.data },
    }));
}

export function compileFormula(text: string, ctx: SheetsCtx): CompileResult {
  const parsed = parseFormula(text);
  if (!parsed.ok) return parsed;
  const refs = [
    ...refsOf(parsed.ast).map((ref) => ({ start: ref.start, end: ref.end, ref })),
    ...tableRefsOf(parsed.ast).map((x) => ({ start: x.start, end: x.end, spec: x.spec })),
    ...tableNamesOf(parsed.ast, ctx),
  ].sort((x, y) => x.start - y.start);
  const body = text.startsWith('=') ? 1 : 0;
  let t = '';
  let at = body;
  const r: StoredRef[] = [];
  for (const item of refs) {
    t += text.slice(at, item.start);
    // A table reference naming no table there is kept as typed, read by name when one is.
    const stored =
      'spec' in item
        ? encodeTableSpec(item.spec, ctx, ctx.here)
        : encodeRef(a1ToPos(item.ref, ctx), ctx);
    if (stored) {
      t += `@${r.length}`;
      r.push(stored);
    } else {
      t += 'spec' in item ? text.slice(item.start, item.end) : REF_ERROR;
    }
    at = item.end;
  }
  t += text.slice(at);
  return { ok: true, formula: { t, r }, ast: parsed.ast };
}

// The formula as A1 text (with its `=`) from the current layouts and titles.
export function renderFormula(stored: StoredFormula, ctx: SheetsCtx): string {
  let out = '=';
  for (const tok of tokenize(stored.t, 0, true)) {
    if (tok.k === 'stored') {
      const ref = stored.r[Number(tok.v)];
      if (ref?.t !== undefined) {
        out += formatStoredTableRef(ref, ctx) ?? REF_ERROR;
        continue;
      }
      const pos = ref ? resolveRef(ref, ctx) : null;
      out += pos ? formatPosRef(pos, ctx) : REF_ERROR;
    } else {
      out += stored.t.slice(tok.start, tok.end);
    }
  }
  return out;
}

/** Whether a stored formula keeps a table reference as typed: one naming no table there when it was read. */
export function readsUnknownTable(stored: StoredFormula): boolean {
  return tokenize(stored.t, 0, true).some((tok) => tok.k === 'table');
}

// Trees by template text: a formula's shape (docs/specs/029-sheets/performance.md "Held in memory"). Formulas of
// one shape share one tree, as a reference is only its `@n` there; the oldest shape goes past AST_SHAPES_MAX.
const AST_BY_SHAPE = new Map<string, Node | null>();

// The template's tree, parsed once per shape (trees are never mutated). Null when the template cannot be read (only
// a hand-made or corrupted one): it evaluates to #ERROR!.
export function storedAst(stored: StoredFormula): Node | null {
  let ast = AST_BY_SHAPE.get(stored.t);
  if (ast === undefined) {
    const parsed = parseFormula(stored.t, true);
    ast = parsed.ok ? parsed.ast : null;
    if (AST_BY_SHAPE.size >= AST_SHAPES_MAX) AST_BY_SHAPE.delete(AST_BY_SHAPE.keys().next().value!);
    AST_BY_SHAPE.set(stored.t, ast);
  }
  return ast;
}

// Rewrite each reference of a formula; `fn` returns the new reference, or null for #REF!. Returns the same object
// when nothing changed.
/**
 * A reference to another sheet carried by that sheet's title, its parts as positions: a sheet copied into another
 * workbook reads the sheet of that name there (Copy To, spreadsheet.md D184). Null when it reads #REF! here.
 */
export function refByTitle(ref: StoredRef, ctx: SheetsCtx): StoredRef | null {
  const pos = resolveRef(ref, ctx);
  if (!pos) return null;
  return encodeRef({ ...pos, sheet: { title: ctx.byId(ref.s!)!.title } }, ctx);
}

export function mapFormulaRefs(
  stored: StoredFormula,
  fn: (ref: StoredRef) => StoredRef | null,
): StoredFormula {
  let changed = false;
  const kept: (StoredRef | null)[] = stored.r.map((ref) => {
    const next = fn(ref);
    if (next !== ref) changed = true;
    return next;
  });
  if (!changed) return stored;
  // Rebuild the template: dead references become #REF!, live ones are renumbered.
  let t = '';
  const r: StoredRef[] = [];
  for (const tok of tokenize(stored.t, 0, true)) {
    if (tok.k === 'stored') {
      const ref = kept[Number(tok.v)];
      if (ref) {
        t += `@${r.length}`;
        r.push(ref);
      } else {
        t += REF_ERROR;
      }
    } else {
      t += stored.t.slice(tok.start, tok.end);
    }
  }
  return { t, r };
}

// A formula copied `dr` rows and `dc` columns away (copy-paste, fill, Ctrl+Enter): relative parts move, absolute
// parts stay, and a part moved off the grid is #REF!. `from` resolves the source; `to` encodes at the destination
// (another sheet, when pasted there).
export function shiftForCopy(
  stored: StoredFormula,
  dr: number,
  dc: number,
  from: SheetsCtx,
  to: SheetsCtx = from,
): StoredFormula {
  return mapFormulaRefs(stored, (ref) => {
    // A table reference reads the same table wherever the formula goes.
    if (ref.t !== undefined) {
      const { s: _s, ...rest } = ref;
      const s = ref.s ?? from.own.id;
      if (s === to.own.id) return ref.s === undefined ? ref : rest;
      return ref.s === undefined ? { ...rest, s } : ref;
    }
    const pos = resolveRef(ref, from);
    if (!pos) return null;
    const a = pos.a;
    const moved: PosRef = { ...pos };
    if (moved.r1 !== undefined && !(a & 1)) moved.r1 += dr;
    if (moved.c1 !== undefined && !(a & 2)) moved.c1 += dc;
    if (moved.r2 !== undefined && !(a & 4)) moved.r2 += dr;
    if (moved.c2 !== undefined && !(a & 8)) moved.c2 += dc;
    // The source's own sheet is the destination's own sheet.
    if (moved.sheet && 'id' in moved.sheet && moved.sheet.id === to.own.id) moved.sheet = null;
    const encoded = encodeRef(moved, to);
    return encoded ?? null;
  });
}

// Whether a formula reads any reference into `sheetId` (its own sheet when the formula is there).
export function formulaReadsSheet(stored: StoredFormula, ownId: string, sheetId: string): boolean {
  return stored.r.some((ref) => (ref.s ?? (ref.st === undefined ? ownId : undefined)) === sheetId);
}
