// A reference written back as A1 text (docs/specs/029-sheets/standard-mapping.md "Formulas in the file's own syntax"):
// Google's syntax and Excel's share it, but for an open-ended range, which Excel cannot say, and a spill, which Excel
// writes as a function. Shared by the XLSX writer and the shared-formula reader, so both write a reference one way.
import { columnLetters } from '../address';
import type { A1Ref } from '../formula/ast';
import { quoteSheet } from '../formula/stored';
import { OPEN_FORMULA_LAST_COL, OPEN_FORMULA_LAST_ROW } from './open-formula';

/** The parts a reference is written from: as parsed, with the sheet name as it is to be written. */
export type A1Parts = Pick<A1Ref, 'r1' | 'c1' | 'r2' | 'c2' | 'a' | 'open'> & { sheet?: string };

function part(r: number | undefined, c: number | undefined, absR: boolean, absC: boolean): string {
  const col = c === undefined ? '' : `${absC ? '$' : ''}${columnLetters(c)}`;
  const row = r === undefined ? '' : `${absR ? '$' : ''}${r + 1}`;
  return `${col}${row}`;
}

// Excel reads a sheet named like an R1C1 reference (`R2C3`, `R`, `C4`) as one unless it is quoted.
const R1C1_LIKE = /^(?:R\d*(?:C\d*)?|C\d*)$/i;

/** A sheet's name as a reference's prefix: quoted where Google's or Excel's grammar would misread it bare. */
export function sheetPrefix(title: string): string {
  const quoted = quoteSheet(title);
  return quoted === title && R1C1_LIKE.test(title) ? `'${title}'!` : `${quoted}!`;
}

/**
 * A reference as A1 text. `closed` writes an open-ended range (`A2:A`) to the standards' last row or column, as a
 * file must; without it the range stays open, as Google writes it.
 */
export function a1Text(ref: A1Parts, closed: boolean): string {
  const prefix = ref.sheet === undefined ? '' : sheetPrefix(ref.sheet);
  const first = part(ref.r1, ref.c1, !!(ref.a & 1), !!(ref.a & 2));
  const twoParts = ref.r2 !== undefined || ref.c2 !== undefined || ref.open !== undefined;
  if (!twoParts) return `${prefix}${first}`;
  const r2 = closed && ref.open === 'r' ? OPEN_FORMULA_LAST_ROW - 1 : ref.r2;
  const c2 = closed && ref.open === 'c' ? OPEN_FORMULA_LAST_COL - 1 : ref.c2;
  return `${prefix}${first}:${part(r2, c2, !!(ref.a & 4), !!(ref.a & 8))}`;
}
