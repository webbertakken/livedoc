// The oracle corpus (docs/specs/029-sheets/formulas.md "The oracle"): cases by category, each a formula over its
// category's fixture, and the answers each source gives them. Pure: reading files is the caller's.
import { ERROR_CODES } from '../formula/values';

/** A value as the corpus writes it: a cell's number, text or boolean, an error by its code, or empty. */
export type OracleValue = number | string | boolean | null | { e: string };

/**
 * Where an answer comes from: made by a script from Google Sheets or LibreOffice, or `cited`: written in the case
 * (`expect`) from where a source documents it (OpenFormula Part 4's test cases, Google's help pages), with `cite`.
 */
export type OracleSource = 'google' | 'libreoffice' | 'cited';

/** Whose meaning a case holds to: the catalogue's Authority (Google, else OpenFormula). */
export type OracleAuthority = 'google' | 'openformula';

export type OracleCase = {
  // `<NAME>.<n>` for a function's case, `<topic>.<n>` for the language's.
  id: string;
  // The formula as typed in Google Sheets, `=` first.
  f: string;
  // The block its answer fills: one cell unless it spills.
  rows: number;
  cols: number;
  authority: OracleAuthority;
  // Relative tolerance for numbers, when looser than ORACLE_TOLERANCE (with `note` saying why).
  tol?: number;
  // An answer a source documents, and where (`OpenFormula Part 4 §6.16.43`, a Google help page's address).
  expect?: OracleValue[][];
  cite?: string;
  // A source that answers differently, and why; any other difference between sources fails.
  differs?: Partial<Record<OracleSource, string>>;
  // What the case shows: the spec rule it holds, by its section.
  note?: string;
};

export type OracleCategory = {
  category: string;
  // Rows of values placed on sheet `Data` from A1.
  data: OracleValue[][];
  cases: OracleCase[];
};

/** One source's answers for one category: a case's id to the rows of its block. */
export type OracleAnswers = {
  source: Exclude<OracleSource, 'cited'>;
  category: string;
  // Who answered, and when (`LibreOffice 24.2.7.2`, `2026-11-20`).
  by: string;
  made: string;
  answers: Record<string, OracleValue[][]>;
};

// Numbers agree to one part in a billion; a case may loosen it to one in a million. Below the floor two numbers are
// both zero, as floating point leaves them (SIN(PI()) is 1.2e-16).
export const ORACLE_TOLERANCE = 1e-9;
export const ORACLE_TOLERANCE_LOOSEST = 1e-6;
export const ORACLE_ZERO_FLOOR = 1e-15;
// The corpus runs as Google's default locale, in UTC, at a fixed now (a Friday noon, 2026-11-20).
export const ORACLE_LOCALE = 'en-US';
export const ORACLE_NOW = 46346.5;
// Sheet names in the corpus' workbook.
export const ORACLE_DATA_SHEET = 'Data';
export const ORACLE_CASES_SHEET = 'Cases';
// The Data sheet's grid: room around the fixture for references past it.
export const ORACLE_DATA_ROWS_MIN = 100;
export const ORACLE_DATA_COLS_MIN = 26;
// A block's own cell: column B, its id in column A.
export const ORACLE_FORMULA_COL = 1;

/** Where each case's block sits on `Cases`: its first row, blocks a blank row apart. */
export type OracleBlock = { id: string; r: number; c: number; rows: number; cols: number };

export const OracleLayout = {
  blocks(category: OracleCategory): OracleBlock[] {
    let r = 0;
    return category.cases.map((x) => {
      const block = { id: x.id, r, c: ORACLE_FORMULA_COL, rows: x.rows, cols: x.cols };
      r += x.rows + 1;
      return block;
    });
  },

  /** The Cases sheet's grid: every block, a blank row and column around them. */
  size(category: OracleCategory): { rows: number; cols: number } {
    const blocks = OracleLayout.blocks(category);
    const last = blocks.at(-1);
    return {
      rows: last ? last.r + last.rows + 1 : 1,
      cols: ORACLE_FORMULA_COL + Math.max(1, ...blocks.map((b) => b.cols)) + 1,
    };
  },
} as const;

const ID = /^[A-Za-z0-9_.]+\.[0-9]+$/;
const ERRORS: readonly string[] = ERROR_CODES;
// LibreOffice's own error texts (`Err:502`) have no code in Google's set; they match an error of any code.
const LIBREOFFICE_ERROR = /^Err:\d{3}$/;

function isOracleValue(v: unknown): v is OracleValue {
  if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) return true;
  if (typeof v !== 'object' || Object.keys(v).length !== 1) return false;
  const e = (v as { e?: unknown }).e;
  return (
    typeof e === 'string' && (ERRORS.includes(e) || e === '#NULL!' || LIBREOFFICE_ERROR.test(e))
  );
}

function isBlock(v: unknown): v is OracleValue[][] {
  return Array.isArray(v) && v.every((row) => Array.isArray(row) && row.every(isOracleValue));
}

function caseProblems(x: Record<string, unknown>, at: string): string[] {
  const out: string[] = [];
  if (typeof x.id !== 'string' || !ID.test(x.id)) out.push(`${at}: id must read NAME.n`);
  if (typeof x.f !== 'string' || !x.f.startsWith('=')) out.push(`${at}: f must be a formula`);
  for (const k of ['rows', 'cols'] as const) {
    const n = x[k];
    if (n !== undefined && (!Number.isInteger(n) || (n as number) < 1))
      out.push(`${at}: ${k} must be a whole number from 1`);
  }
  if (x.authority !== undefined && x.authority !== 'google' && x.authority !== 'openformula')
    out.push(`${at}: authority must be google or openformula`);
  const tol = x.tol;
  if (tol !== undefined) {
    if (typeof tol !== 'number' || tol <= ORACLE_TOLERANCE || tol > ORACLE_TOLERANCE_LOOSEST)
      out.push(`${at}: tol must loosen the tolerance, at most to ${ORACLE_TOLERANCE_LOOSEST}`);
    if (typeof x.note !== 'string') out.push(`${at}: a loosened tol says why in note`);
  }
  if (x.expect !== undefined && !isBlock(x.expect))
    out.push(`${at}: expect must be rows of values`);
  if ((x.expect === undefined) !== (typeof x.cite !== 'string'))
    out.push(`${at}: an answer written in the case cites where it is documented`);
  return out;
}

export type CategoryRead =
  { ok: true; category: OracleCategory } | { ok: false; problems: string[] };

export const OracleCorpus = {
  /** A category file's JSON, checked: each case with its block's size and authority filled in. */
  readCategory(json: unknown): CategoryRead {
    const raw = json as Record<string, unknown> | null;
    if (!raw || typeof raw.category !== 'string' || !Array.isArray(raw.cases))
      return { ok: false, problems: ['a category has a name and cases'] };
    const data = raw.data ?? [];
    const problems: string[] = isBlock(data) ? [] : ['data must be rows of values'];
    const seen = new Set<string>();
    const cases: OracleCase[] = [];
    raw.cases.forEach((c: unknown, i) => {
      const x = (c ?? {}) as Record<string, unknown>;
      const at = typeof x.id === 'string' ? x.id : `case ${i + 1}`;
      problems.push(...caseProblems(x, at));
      if (typeof x.id === 'string') {
        if (seen.has(x.id)) problems.push(`${at}: id used twice`);
        seen.add(x.id);
      }
      cases.push({
        ...(x as OracleCase),
        rows: (x.rows as number | undefined) ?? 1,
        cols: (x.cols as number | undefined) ?? 1,
        authority: (x.authority as OracleAuthority | undefined) ?? 'google',
      });
    });
    if (problems.length > 0) return { ok: false, problems };
    return { ok: true, category: { category: raw.category, data: data as OracleValue[][], cases } };
  },

  /** An answer file's JSON, or null when it is not one. */
  readAnswers(json: unknown): OracleAnswers | null {
    const raw = json as Record<string, unknown> | null;
    if (!raw || (raw.source !== 'google' && raw.source !== 'libreoffice')) return null;
    if (typeof raw.category !== 'string' || typeof raw.by !== 'string') return null;
    if (typeof raw.made !== 'string' || typeof raw.answers !== 'object' || !raw.answers)
      return null;
    const answers = raw.answers as Record<string, unknown>;
    if (!Object.values(answers).every(isBlock)) return null;
    return raw as OracleAnswers;
  },

  isLibreOfficeError(v: OracleValue): boolean {
    return typeof v === 'object' && v !== null && LIBREOFFICE_ERROR.test(v.e);
  },
} as const;
