// A formula's text rewritten reference by reference: moved as a copy moves it (docs/specs/029-sheets/standard-mapping.md "Excel's grammar in detail"):
// an XLSX shared formula holds its text once, in the first cell of its block, and each other cell reads it moved by
// its distance. Relative parts move, absolute parts stay, and a part moved off the grid is `#REF!`, as a paste is.
import { refsOf, type A1Ref } from '../formula/ast';
import { parseFormula } from '../formula/parse';
import { a1Text, FILE_LAST_COL, FILE_LAST_ROW, type A1Parts } from './a1-text';

function moved(ref: A1Ref, dr: number, dc: number): A1Ref | null {
  const out: A1Ref = { ...ref };
  const move = (at: number | undefined, by: number, abs: number, last: number) => {
    if (at === undefined) return { ok: true, at };
    const next = ref.a & abs ? at : at + by;
    return { ok: next >= 0 && next < last, at: next };
  };
  const parts = [
    ['r1', dr, 1, FILE_LAST_ROW],
    ['c1', dc, 2, FILE_LAST_COL],
    ['r2', dr, 4, FILE_LAST_ROW],
    ['c2', dc, 8, FILE_LAST_COL],
  ] as const;
  for (const [key, by, abs, last] of parts) {
    const next = move(ref[key], by, abs, last);
    if (!next.ok) return null;
    if (next.at !== undefined) out[key] = next.at;
  }
  return out;
}

/** The formula (Google's syntax, with its `=`) moved `dr` rows and `dc` columns; unchanged when it does not parse. */
export function shiftFormulaText(formula: string, dr: number, dc: number): string {
  const parsed = parseFormula(formula);
  if (!parsed.ok || (dr === 0 && dc === 0)) return formula;
  let out = '';
  let at = 0;
  for (const ref of refsOf(parsed.ast)) {
    const next = moved(ref, dr, dc);
    out += formula.slice(at, ref.start);
    out += next ? `${a1Text(next, false)}${ref.spill ? '#' : ''}` : '#REF!';
    at = ref.end;
  }
  return out + formula.slice(at);
}

// A range to the standards' last row or column as the open range it was written from: from the first row or column,
// the whole column or row.
function reopened(ref: A1Ref): A1Parts | null {
  const toLastRow = ref.r2 === FILE_LAST_ROW - 1 && ref.r1 !== undefined && ref.c1 !== undefined;
  const toLastCol = ref.c2 === FILE_LAST_COL - 1 && ref.c1 !== undefined && ref.r1 !== undefined;
  if (toLastRow === toLastCol) return null;
  const { r2, c2, ...rest } = ref;
  if (toLastRow) {
    if (ref.r1 === 0) return { sheet: ref.sheet, c1: ref.c1, c2, a: ref.a };
    return { ...rest, c2, open: 'r' };
  }
  if (ref.c1 === 0) return { sheet: ref.sheet, r1: ref.r1, r2, a: ref.a };
  return { ...rest, r2, open: 'c' };
}

/**
 * A formula read from a file (Google's syntax, with its `=`) with each range to the standards' last row or column
 * open again (`A2:A1048576` is `A2:A`, `A1:A1048576` is `A:A`), as Google's grid, smaller than the standards',
 * reads it (standard-mapping.md "Formulas in the file's own syntax").
 */
export function reopenRanges(formula: string): string {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return formula;
  let out = '';
  let at = 0;
  for (const ref of refsOf(parsed.ast)) {
    const open = reopened(ref);
    if (!open) continue;
    out += formula.slice(at, ref.start) + a1Text(open, false);
    at = ref.end;
  }
  return out + formula.slice(at);
}
