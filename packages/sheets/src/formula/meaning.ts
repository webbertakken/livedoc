// A spreadsheet's meaning (docs/specs/029-sheets/formulas.md "Function catalogue", the file's meaning): whose answer
// a formula Google and the file's own standard both accept but answer differently gives. A spreadsheet made in LiveDoc
// has Google's; one opened from a file, the standard of its format: OOXML's for `.xlsx`, OpenFormula's for ODF.
import { callsOf, hasChainedPower } from './ast';
import { parseFormula } from './parse';

/** The name a power of a power stands under among the functions answering differently. */
export const CHAINED_POWER = '^';

export const FORMULA_MEANINGS = ['google', 'ooxml', 'openformula'] as const;
export type FormulaMeaning = (typeof FORMULA_MEANINGS)[number];

/** A file's meaning: a standard's, never Google's. */
export type FileMeaning = Exclude<FormulaMeaning, 'google'>;
export const FILE_MEANINGS: readonly FileMeaning[] = ['ooxml', 'openformula'];

/**
 * The functions whose answer differs from Google's, and the meanings it differs in: formulas.md's table "Both accept,
 * answered differently". A function listed in both meanings answers alike in them (`SORT`'s -1 is descending in
 * either), so two meanings answer a function differently exactly when one lists it and the other does not. `^` stands
 * for a power of a power written without brackets (`2^3^2`), which Google groups from the right.
 */
export const MEANING_FUNCTIONS: Readonly<Record<string, readonly FileMeaning[]>> = {
  [CHAINED_POWER]: ['ooxml', 'openformula'],
  ADDRESS: ['openformula'],
  ARABIC: ['openformula'],
  CEILING: ['openformula'],
  CELL: ['openformula'],
  CUMIPMT: ['ooxml'],
  CUMPRINC: ['ooxml'],
  DECIMAL: ['openformula'],
  DEVSQ: ['openformula'],
  DOLLARDE: ['openformula'],
  DOLLARFR: ['openformula'],
  'F.DIST': ['openformula'],
  FLOOR: ['openformula'],
  LEN: ['openformula'],
  MAXA: ['openformula'],
  PERCENTRANK: ['ooxml', 'openformula'],
  PERMUTATIONA: ['ooxml', 'openformula'],
  ROMAN: ['openformula'],
  SORT: ['ooxml', 'openformula'],
  'STDEV.P': ['ooxml', 'openformula'],
  STDEVP: ['ooxml', 'openformula'],
  STDEVPA: ['ooxml', 'openformula'],
  SUMPRODUCT: ['ooxml'],
  'VAR.P': ['ooxml', 'openformula'],
  VARP: ['ooxml', 'openformula'],
  VARPA: ['ooxml', 'openformula'],
  YEARFRAC: ['openformula'],
};

const listedIn = (name: string, meaning: FormulaMeaning): boolean =>
  meaning !== 'google' && (MEANING_FUNCTIONS[name]?.includes(meaning) ?? false);

/** Whether a function (upper case) may answer differently in two meanings. */
export function answersDiffer(name: string, a: FormulaMeaning, b: FormulaMeaning): boolean {
  return listedIn(name, a) !== listedIn(name, b);
}

/** The functions a formula calls that may answer differently in two meanings (upper case, sorted); none unparsed. */
export function functionsAnsweringDifferently(
  formula: string,
  a: FormulaMeaning,
  b: FormulaMeaning,
): string[] {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return [];
  const names = callsOf(parsed.ast);
  if (hasChainedPower(parsed.ast)) names.add(CHAINED_POWER);
  return [...names].filter((name) => answersDiffer(name, a, b)).sort();
}

/** How many of the formulas may answer differently in two meanings, and the functions why (sorted). */
export function formulasAnsweringDifferently(
  formulas: Iterable<string>,
  a: FormulaMeaning,
  b: FormulaMeaning,
): { count: number; functions: string[] } {
  let count = 0;
  const functions = new Set<string>();
  for (const formula of formulas) {
    const names = functionsAnsweringDifferently(formula, a, b);
    if (names.length === 0) continue;
    count++;
    for (const name of names) functions.add(name);
  }
  return { count, functions: [...functions].sort() };
}
