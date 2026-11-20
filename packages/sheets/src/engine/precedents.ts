// The cells a formula reads by its single-cell references alone, before it is worked out (docs/specs/029-sheets/
// formulas.md "Recalculation"): so a read settles them first, deepest first, on an explicit stack, and each link of a
// long chain is worked out once. Ranges, and references found only while working out (INDIRECT, OFFSET, a spill's
// `#`, a sheet named by a title it no longer has), are left to the evaluator, which reaches them itself: walking a
// range's cells up front cost more than the restarts it saves (measured, perf.test.ts).
import { cellKey, type Sheet, type StoredFormula } from '../sheet';

/** The ids (`sheetId|rowId:colId`) of the formula cells a stored formula names one by one, in the order it names them. */
export function formulaPrecedents(
  formula: StoredFormula,
  sheetId: string,
  sheetOf: (id: string) => Sheet | undefined,
): string[] {
  const out: string[] = [];
  for (const ref of formula.r) {
    // One cell of a sheet by id already names its cell by ids: no positions to look up.
    if (ref.st !== undefined || ref.spill || ref.open || !ref.r1 || !ref.c1) continue;
    if (ref.r2 !== undefined || ref.c2 !== undefined) continue;
    const id = ref.s ?? sheetId;
    const key = cellKey(ref.r1, ref.c1);
    const input = sheetOf(id)?.cells.get(key)?.input;
    if (input && 'f' in input) out.push(`${id}|${key}`);
  }
  return out;
}
