// References as rectangles: a resolved reference, or one
// typed as A1 text (INDIRECT), to the positions it reads on its sheet.
import type { A1Ref } from '../formula/ast';
import { posRefOf, type PosRef } from '../formula/stored';
import { err, isColumnValues, type SheetError } from '../formula/values';
import { isRef, type EvalValue, type Frame, type RangeRef } from './frame';

// A resolved reference as a rectangle on its sheet: whole columns and rows, and open ends, run to the filled
// extent (never the whole grid), so `SUM(A:A)` reads only rows that hold something.
export function posToRange(pos: PosRef, f: Frame): RangeRef | null {
  let sheetId = f.sheetId;
  if (pos.sheet) {
    if (!('id' in pos.sheet)) return null;
    sheetId = pos.sheet.id;
  }
  const grid = f.grid(sheetId);
  if (!grid) return null;
  // The filled extent is a scan of the sheet's cells, so it is read only for whole and open ranges.
  const needsExtent = pos.r1 === undefined || pos.c1 === undefined || pos.open !== undefined;
  const ext = needsExtent ? f.extent(sheetId) : { rows: 0, cols: 0 };
  let { r1, c1, r2, c2 } = pos;
  if (r1 === undefined) {
    r1 = 0;
    r2 = Math.max(0, ext.rows - 1);
  }
  if (c1 === undefined) {
    c1 = 0;
    c2 = Math.max(0, ext.cols - 1);
  }
  if (pos.open === 'r') r2 = Math.max(r1, ext.rows - 1);
  if (pos.open === 'c') c2 = Math.max(c1, ext.cols - 1);
  // A whole or open range depends on its whole height (or width), not just the filled part it reads, so a value
  // typed below the filled rows still reaches it. Noting the full span costs the same as a short one.
  const wholeRows = pos.r1 === undefined || pos.open === 'r';
  const wholeCols = pos.c1 === undefined || pos.open === 'c';
  if (wholeRows || wholeCols) {
    f.noteRange({
      sheetId,
      r1: wholeRows ? (pos.r1 ?? 0) : Math.min(r1, r2 ?? r1),
      c1: wholeCols ? (pos.c1 ?? 0) : Math.min(c1, c2 ?? c1),
      r2: wholeRows ? grid.rows - 1 : Math.max(r1, r2 ?? r1),
      c2: wholeCols ? grid.cols - 1 : Math.max(c1, c2 ?? c1),
    });
  }
  if (r2 === undefined) r2 = r1;
  if (c2 === undefined) c2 = c1;
  const range = {
    sheetId,
    r1: Math.min(r1, r2),
    c1: Math.min(c1, c2),
    r2: Math.min(Math.max(r1, r2), grid.rows - 1),
    c2: Math.min(Math.max(c1, c2), grid.cols - 1),
  };
  if (pos.spill && range.r1 === range.r2 && range.c1 === range.c2) {
    return f.spillOf(sheetId, range.r1, range.c1) ?? range;
  }
  return range;
}

export function a1ToPos(ref: A1Ref, f: Frame): PosRef | null {
  let sheet: PosRef['sheet'] = null;
  if (ref.sheet !== undefined) {
    const h = f.ctx.byTitle(ref.sheet);
    if (!h) return null;
    sheet = h.id === f.sheetId ? null : { id: h.id };
  }
  return posRefOf(ref, sheet);
}

// A frame whose ranges and arrays are taken whole (formulas.md "Arrays and spills").
export function arrayFrame(f: Frame): Frame {
  return f.arrays ? f : { ...f, arrays: true };
}

const NO_INTERSECTION = 'An array value could not be found';

// A range where one value goes, outside an array context (formulas.md "Arrays and spills"): the one cell of it in the
// formula's row (a range one column wide) or column (one row high); none is #VALUE!. Anything else is as it was.
// A pivot table's column read as values (pivot-calc.ts) is a range to Google: where one value goes, its first.
export function implicit(v: EvalValue, f: Frame): EvalValue {
  if (f.arrays) return v;
  if (isColumnValues(v)) return v.rows[0]?.[0] ?? null;
  return intersected(v, f);
}

/** A range met by the formula's own row or column, also in an array context; any other value as it is. */
export function intersected(v: EvalValue, f: Frame): EvalValue {
  if (!isRef(v)) return v;
  const r = v.ref;
  if (r.r1 === r.r2 && r.c1 === r.c2) return v;
  if (r.c1 === r.c2 && f.row >= r.r1 && f.row <= r.r2)
    return { ref: { sheetId: r.sheetId, r1: f.row, c1: r.c1, r2: f.row, c2: r.c1 } };
  if (r.r1 === r.r2 && f.col >= r.c1 && f.col <= r.c2)
    return { ref: { sheetId: r.sheetId, r1: r.r1, c1: f.col, r2: r.r1, c2: f.col } };
  return err('#VALUE!', NO_INTERSECTION);
}

// A value that must be one rectangle (an operand of `:` or the intersection), or the error to give instead.
export function rectangleOf(v: EvalValue): RangeRef | SheetError {
  if (isRef(v)) return v.ref;
  if (typeof v === 'object' && v !== null && 'e' in v) return v;
  return err('#VALUE!', 'A reference was expected here');
}
