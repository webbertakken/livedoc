// What a typed input becomes, formulas included (docs/specs/029-sheets/formulas.md "What a typed input becomes"):
// the one door every input goes through (the editor, a paste, an import, an agent).
import { compileFormula, renderFormula, type SheetsCtx } from './formula/stored';
import { capitalFunctionNames } from './formula/function-case';
import { formulaFromLocale, formulaSyntaxOf, formulaToLocale } from './formula/locale-syntax';
import type { ParseFailure } from './formula/parse';
import type { Node } from './formula/ast';
import { localeSeparators, readLiteralInput, type FormatHint } from './input';
import { numberText } from './formula/values';
import { FORMULA_MAX, INPUT_MAX } from './limits';
import type { CellInput, NumberFormatKind, StoredFormula } from './sheet';

export type TypedRead =
  | { kind: 'clear' }
  | { kind: 'value'; input: CellInput; hint?: FormatHint }
  | { kind: 'invalid'; reason: ParseFailure | 'input_too_long'; at: number };

export function readTypedInput(
  text: string,
  locale: string,
  ctx: SheetsCtx,
  asText = false,
): TypedRead {
  const max = ctx.inputMax ?? INPUT_MAX;
  if (text.length > max) return { kind: 'invalid', reason: 'input_too_long', at: max };
  if (!asText && text.startsWith('=')) {
    if (text.length > FORMULA_MAX) return { kind: 'invalid', reason: 'too_long', at: FORMULA_MAX };
    const compiled = compileTypedFormula(text, locale, ctx);
    if (!compiled.ok) return { kind: 'invalid', reason: compiled.reason, at: compiled.at };
    const hint = formulaHint(compiled.ast);
    return { kind: 'value', input: { f: compiled.formula }, ...(hint ? { hint } : {}) };
  }
  return readLiteralInput(text, locale, asText);
}

type TypedFormula = ReturnType<typeof compileFormula>;

/**
 * A formula (`=…`) as a person typed it in `locale`, stored: its separators read in the locale's syntax and its
 * functions' names in capitals (formulas.md "Locale").
 */
export function compileTypedFormula(text: string, locale: string, ctx: SheetsCtx): TypedFormula {
  const read = formulaFromLocale(text, formulaSyntaxOf(locale));
  if (!read.ok) return { ok: false, reason: 'unexpected_token', at: read.at };
  return compileFormula(capitalFunctionNames(read.text), ctx);
}

/** A stored formula as `locale` writes it, `=` first (formulas.md "Locale"). */
export function formulaAsTyped(stored: StoredFormula, ctx: SheetsCtx, locale: string): string {
  return formulaToLocale(renderFormula(stored, ctx), formulaSyntaxOf(locale));
}

// The format of what a formula's outermost function returns (docs/specs/029-sheets/formulas.md "What a typed input
// becomes"): `=TODAY()` drew as 46314. A whole number of days added to or taken from it (`=TODAY()+7`) keeps it; any
// other arithmetic (`=A1+7`, `=Due-TODAY()`, days left) and every other formula stay Automatic.
// TO_DATE, TO_DOLLARS and TO_PERCENT exist to give their value a format; TO_DOLLARS writes US dollars.
type FormulaFormat = { nf: NumberFormatKind; cur?: string };
const DATE: FormulaFormat = { nf: 'date' };
const FORMULA_FORMATS: Readonly<Record<string, FormulaFormat>> = {
  TODAY: DATE,
  DATE,
  DATEVALUE: DATE,
  EDATE: DATE,
  EOMONTH: DATE,
  WORKDAY: DATE,
  'WORKDAY.INTL': DATE,
  TO_DATE: DATE,
  COUPPCD: DATE,
  COUPNCD: DATE,
  EASTERSUNDAY: DATE,
  NOW: { nf: 'datetime' },
  EPOCHTODATE: { nf: 'datetime' },
  TIME: { nf: 'time' },
  TIMEVALUE: { nf: 'time' },
  TO_DOLLARS: { nf: 'currency', cur: '$' },
  TO_PERCENT: { nf: 'percent' },
};

function callFormat(node: Node): FormulaFormat | undefined {
  return node.k === 'call' ? FORMULA_FORMATS[node.name.toUpperCase()] : undefined;
}

function formulaHint(ast: Node): FormatHint | undefined {
  let format = callFormat(ast);
  if (!format && ast.k === 'bin' && (ast.op === '+' || ast.op === '-')) {
    if (ast.b.k === 'num') format = callFormat(ast.a);
    else if (ast.op === '+' && ast.a.k === 'num') format = callFormat(ast.b);
  }
  return format ? { ...format, ifAutomatic: true } : undefined;
}

// An input as the formula bar shows it, in `locale` (formulas.md "Locale"): a formula as A1 text in the locale's
// syntax, a number unformatted with the locale's decimal mark, a boolean in capitals.
export function inputAsText(input: CellInput | undefined, ctx: SheetsCtx, locale: string): string {
  if (!input) return '';
  if ('f' in input) return formulaAsTyped(input.f, ctx, locale);
  if ('n' in input) return numberText(input.n).replace('.', localeSeparators(locale).decimal);
  if ('b' in input) return input.b ? 'TRUE' : 'FALSE';
  // Text that would read as something else keeps a leading ' so editing it keeps it text.
  return input.s;
}
