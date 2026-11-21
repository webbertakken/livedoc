// A formula's text moved as a copy moves it (docs/specs/029-sheets/standard-mapping.md "Excel's grammar in detail"):
// an XLSX shared formula holds its text once, in the first cell of its block, and each other cell reads it moved by
// its distance. Relative parts move, absolute parts stay, and a part moved off the grid is `#REF!`, as a paste is.
import { refsOf, type A1Ref } from '../formula/ast';
import { parseFormula } from '../formula/parse';
import { a1Text } from './a1-text';
import { OPEN_FORMULA_LAST_COL, OPEN_FORMULA_LAST_ROW } from './open-formula';

function moved(ref: A1Ref, dr: number, dc: number): A1Ref | null {
  const out: A1Ref = { ...ref };
  const move = (at: number | undefined, by: number, abs: number, last: number) => {
    if (at === undefined) return { ok: true, at };
    const next = ref.a & abs ? at : at + by;
    return { ok: next >= 0 && next < last, at: next };
  };
  const parts = [
    ['r1', dr, 1, OPEN_FORMULA_LAST_ROW],
    ['c1', dc, 2, OPEN_FORMULA_LAST_COL],
    ['r2', dr, 4, OPEN_FORMULA_LAST_ROW],
    ['c2', dc, 8, OPEN_FORMULA_LAST_COL],
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
