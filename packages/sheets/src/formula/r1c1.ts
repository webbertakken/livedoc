// R1C1 references as INDIRECT reads them with is_A1_notation FALSE (docs/specs/029-sheets/formulas.md "Functions":
// Lookup): `R2C3`, `R[-1]C[2]` counted from the formula's own cell, `RC` its own row and column, `R2` and `C3` a whole
// row and column, two of them joined by `:`, a sheet's name and `!` before.
import type { Frame, RangeRef } from '../engine/frame';
import { posToRange } from '../engine/refs';
import type { PosRef } from './stored';

type Part = { abs: number } | { rel: number };
type Corner = { r?: Part; c?: Part };

// One axis: `R`/`C` alone (relative 0), with a number (absolute, from 1), or with a bracketed offset.
const AXIS = String.raw`(?:(\d+)|\[(-?\d+)\])?`;
const CORNER = new RegExp(String.raw`^(?:R${AXIS})?(?:C${AXIS})?$`, 'i');

function corner(text: string): Corner | null {
  if (text === '' || !/^[RC]/i.test(text)) return null;
  const m = CORNER.exec(text);
  if (!m) return null;
  const hasR = /^R/i.test(text);
  const hasC = /C/i.test(text);
  const part = (abs: string | undefined, rel: string | undefined): Part =>
    abs !== undefined ? { abs: Number(abs) } : { rel: rel !== undefined ? Number(rel) : 0 };
  return {
    ...(hasR ? { r: part(m[1], m[2]) } : {}),
    ...(hasC ? { c: part(m[3], m[4]) } : {}),
  };
}

// A part as a position (from 0): absolute from 1, or an offset from the formula's own row or column.
function place(p: Part, own: number): number {
  return 'abs' in p ? p.abs - 1 : own + p.rel;
}

/** The range an R1C1 text names, from the formula's cell in `f`; null when it names none on the grid. */
export function r1c1Range(text: string, f: Frame): RangeRef | null {
  let rest = text.trim();
  let sheetId = f.sheetId;
  const bang = rest.lastIndexOf('!');
  if (bang >= 0) {
    const raw = rest.slice(0, bang);
    const title = /^'.*'$/.test(raw) ? raw.slice(1, -1).replace(/''/g, "'") : raw;
    const handle = f.ctx.byTitle(title);
    if (!handle) return null;
    sheetId = handle.id;
    rest = rest.slice(bang + 1);
  }
  const [a, b, extra] = rest.split(':');
  if (extra !== undefined) return null;
  const first = corner(a ?? '');
  const second = b === undefined ? first : corner(b);
  if (!first || !second) return null;
  // Both corners name rows, columns, or cells alike.
  if (!!first.r !== !!second.r || !!first.c !== !!second.c) return null;
  const pos: PosRef = { sheet: sheetId === f.sheetId ? null : { id: sheetId }, a: 15 };
  if (first.r && second.r) {
    pos.r1 = place(first.r, f.row);
    pos.r2 = place(second.r, f.row);
  }
  if (first.c && second.c) {
    pos.c1 = place(first.c, f.col);
    pos.c2 = place(second.c, f.col);
  }
  const grid = f.grid(sheetId);
  const out = [pos.r1, pos.r2].some((r) => r !== undefined && (r < 0 || r >= (grid?.rows ?? 0)));
  const outCol = [pos.c1, pos.c2].some((c) => c !== undefined && (c < 0 || c >= (grid?.cols ?? 0)));
  // A whole row or column runs as an A1 one does, to the filled edge.
  return out || outCol ? null : posToRange(pos, f);
}
