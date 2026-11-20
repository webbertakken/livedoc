// The cells a formula reads by its single-cell references alone, before it is worked out (docs/specs/029-sheets/
// formulas.md "Recalculation"): so a read settles them first, deepest first, on an explicit stack, and each link of a
// long chain is worked out once. Ranges, and references found only while working out (INDIRECT, OFFSET, a spill's
// `#`, a sheet named by a title it no longer has), are left to the evaluator, which reaches them itself: walking a
// range's cells up front cost more than the restarts it saves (measured, perf.test.ts).
import { layoutIndex } from '../layout';
import { cellKey, type Sheet, type StoredFormula } from '../sheet';

/** A formula cell a formula names, by its sheet and position. */
export type Precedent = { sheet: Sheet; r: number; c: number };

/** The formula cells a stored formula names one by one, in the order it names them. */
export function formulaPrecedents(
  formula: StoredFormula,
  sheetId: string,
  sheetOf: (id: string) => Sheet | undefined,
): Precedent[] {
  const out: Precedent[] = [];
  for (const ref of formula.r) {
    // One cell of a sheet by id already names its cell by ids: its position is a lookup away.
    if (ref.st !== undefined || ref.spill || ref.open || !ref.r1 || !ref.c1) continue;
    if (ref.r2 !== undefined || ref.c2 !== undefined) continue;
    const sheet = sheetOf(ref.s ?? sheetId);
    const input = sheet?.cells.get(cellKey(ref.r1, ref.c1))?.input;
    if (!sheet || !input || !('f' in input)) continue;
    const ix = layoutIndex(sheet.layout);
    const r = ix.rowPos.get(ref.r1);
    const c = ix.colPos.get(ref.c1);
    if (r !== undefined && c !== undefined) out.push({ sheet, r, c });
  }
  return out;
}
