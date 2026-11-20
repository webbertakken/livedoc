// Whether two answers agree (docs/specs/029-sheets/formulas.md "The oracle"): numbers to a relative tolerance, text and
// booleans exactly, errors by their code (a LibreOffice error text by being an error), empty and "" alike.
import {
  ORACLE_TOLERANCE,
  ORACLE_ZERO_FLOOR,
  OracleCorpus,
  type OracleCase,
  type OracleSource,
  type OracleValue,
} from './corpus';

function sameNumber(a: number, b: number, tol: number): boolean {
  const gap = Math.abs(a - b);
  return gap <= ORACLE_ZERO_FLOOR || gap <= tol * Math.max(Math.abs(a), Math.abs(b));
}

const blank = (v: OracleValue) => v === null || v === '';

export function sameValue(a: OracleValue, b: OracleValue, tol = ORACLE_TOLERANCE): boolean {
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  if (typeof a === 'number' && typeof b === 'number') return sameNumber(a, b, tol);
  if (typeof a === 'object' && typeof b === 'object') {
    if (OracleCorpus.isLibreOfficeError(a) || OracleCorpus.isLibreOfficeError(b)) return true;
    return a.e === b.e;
  }
  return a === b;
}

export function sameBlock(a: OracleValue[][], b: OracleValue[][], tol = ORACLE_TOLERANCE): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) => row.length === b[i]!.length && row.every((v, j) => sameValue(v, b[i]![j]!, tol)),
  );
}

export function showBlock(block: OracleValue[][]): string {
  return JSON.stringify(block.length === 1 && block[0]!.length === 1 ? block[0]![0] : block);
}

/**
 * The answer a case holds to and where it came from: a cited one, else its authority's, else LibreOffice's (provisional
 * for a Google case), unless the case names LibreOffice as answering differently.
 */
export type HeldAnswer = { source: OracleSource; answer: OracleValue[][]; provisional: boolean };

export function heldAnswer(
  x: OracleCase,
  answers: Partial<Record<'google' | 'libreoffice', OracleValue[][]>>,
): HeldAnswer | null {
  if (x.expect) return { source: 'cited', answer: x.expect, provisional: false };
  if (x.authority === 'google' && answers.google)
    return { source: 'google', answer: answers.google, provisional: false };
  if (answers.libreoffice && !x.differs?.libreoffice) {
    // OpenFormula is LibreOffice's own language: its answer is the authority's, never provisional.
    const provisional = x.authority === 'google';
    return { source: 'libreoffice', answer: answers.libreoffice, provisional };
  }
  return null;
}

/** Every pair of sources that answer a case differently without the case naming the difference. */
export function unnamedDifferences(
  x: OracleCase,
  answers: Partial<Record<'google' | 'libreoffice', OracleValue[][]>>,
): string[] {
  const given: [OracleSource, OracleValue[][]][] = [];
  if (x.expect) given.push(['cited', x.expect]);
  if (answers.google) given.push(['google', answers.google]);
  if (answers.libreoffice) given.push(['libreoffice', answers.libreoffice]);
  const out: string[] = [];
  for (let i = 0; i < given.length; i++)
    for (let j = i + 1; j < given.length; j++) {
      const [s, a] = given[i]!;
      const [t, b] = given[j]!;
      if (sameBlock(a, b, x.tol)) continue;
      // A difference is named by the source that differs from the case's authority.
      if (x.differs?.[s] || x.differs?.[t]) continue;
      out.push(`${x.id}: ${s}=${showBlock(a)} ${t}=${showBlock(b)}`);
    }
  return out;
}
