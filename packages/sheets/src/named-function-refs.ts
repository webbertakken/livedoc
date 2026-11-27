// The references of a named function's definition (docs/specs/029-sheets/formulas.md "Named functions", D301): kept as
// a formula's are, by sheet, row and column ids, each naming its sheet and absolute, so the definition reads the same
// cells whichever sheet calls it. Shown sheet-qualified; shrunk by deletions through the path formulas use.
import type { SheetsCtx } from './formula/stored';
import type { NamedFunction } from './named-functions';
import type { SheetLayout, StoredFormula, StoredRef } from './sheet';
import { shrinkFormulasReading } from './store';
import { compileTypedFormula, formulaAsTyped } from './typed-input';
import type { LayoutChange } from './store-layout';

// Every part absolute: 1 the first row, 2 the first column, 4 the second row, 8 the second column.
const ABSOLUTE = 15;

// The sheet no reference names: rendering against it writes every reference with its sheet.
const NO_SHEET = { id: '', title: '', layout: { rows: [], cols: [] } };

/** The definition as a stored formula: its template (the body without its `=`) and its references. */
export function definitionOf(fn: NamedFunction): StoredFormula {
  return { t: fn.body.startsWith('=') ? fn.body.slice(1) : fn.body, r: [...(fn.refs ?? [])] };
}

// `fn` with `formula` as its definition, as stored.
function defined(fn: NamedFunction, formula: StoredFormula): NamedFunction {
  const { refs: _was, ...rest } = fn;
  return { ...rest, body: `=${formula.t}`, ...(formula.r.length ? { refs: formula.r } : {}) };
}

/**
 * `fn` defined as `formula`, compiled on sheet `ownId`: a reference naming no sheet names that one, and every
 * reference is absolute.
 */
export function withDefinition(
  fn: NamedFunction,
  formula: StoredFormula,
  ownId: string,
): NamedFunction {
  const refs = formula.r.map((ref): StoredRef => ({
    ...ref,
    ...(ref.s === undefined && ref.st === undefined ? { s: ownId } : {}),
    a: ABSOLUTE,
  }));
  return defined(fn, { t: formula.t, r: refs });
}

/**
 * The definition as `locale` writes it, `=` first, each reference with its sheet (`Sheet1!$A$1`); a dead one
 * `#REF!`.
 */
export function definitionText(fn: NamedFunction, ctx: SheetsCtx, locale = 'en-GB'): string {
  return formulaAsTyped(definitionOf(fn), { ...ctx, own: NO_SHEET }, locale);
}

/**
 * `fn` defined as `typed` reads in `locale` on the sheet `ctx` is of; `fn` with `typed` as its body when it cannot
 * be read, so the rules say so (namedFunctionProblem).
 */
export function withTypedDefinition(
  fn: NamedFunction,
  typed: string,
  ctx: SheetsCtx,
  locale: string,
): NamedFunction {
  const text = typed.trim();
  const compiled = compileTypedFormula(text.startsWith('=') ? text : `=${text}`, locale, ctx);
  return compiled.ok ? withDefinition(fn, compiled.formula, ctx.own.id) : { ...fn, body: text };
}

/**
 * The functions after `changes` land on sheet `targetId`, laid out as `before`: each range of a definition with a
 * corner in deleted rows or columns shrinks to what is left, as other sheets' formulas' ranges do. Null when none
 * changed.
 */
export function shrinkNamedFunctions(
  targetId: string,
  before: SheetLayout,
  changes: readonly LayoutChange[],
  list: readonly NamedFunction[],
): NamedFunction[] | null {
  const formulas = new Map<number, StoredFormula>();
  list.forEach((fn, i) => {
    if (fn.refs?.length) formulas.set(i, definitionOf(fn));
  });
  const changed = shrinkFormulasReading(targetId, before, changes, formulas);
  if (changed.size === 0) return null;
  return list.map((fn, i) => (changed.has(i) ? defined(fn, formulas.get(i)!) : fn));
}
