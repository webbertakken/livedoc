// CELL(info_type, [reference]) (docs/specs/029-sheets/formulas.md "Functions": Information): Google's info types, with
// OpenFormula's wider definition where Google's is narrower (D38): the reference may be left out (the formula's own
// cell), and OpenFormula's "format", "parentheses", "filename" and "protect" answer too.
import { formatA1 } from '../../address';
import type { Frame, RangeRef } from '../../engine/frame';
import { formatShape } from '../../format-shape';
import { quoteSheet } from '../stored';
import { isAreas } from '../../engine/frame';
import { fn, refArg, scalarArg, type FnDef } from '../fn';
import { err, isError, scalarOf, type Value } from '../values';

// A column's width in characters (ECMA-376 Part 1, 18.3.1.13 "col"): the pixels past a 5-pixel padding over the width
// of the widest digit, 7 pixels in the default font, to the nearest whole character, as Google gives it (measured).
export const CELL_WIDTH_PADDING_PX = 5;
export const CELL_DIGIT_WIDTH_PX = 7;

// CELL "prefix": the character a cell's horizontal alignment gives, none for the default.
const PREFIX = { l: "'", r: '"', c: '^' } as const;

/**
 * What CELL answers of the top-left cell of `r`. Its contents and type read its value (the formula's own cell is a
 * loop then); `own` cell's format and place are read without its value.
 */
function cellInfo(type: string, r: RangeRef, own: boolean, f: Frame): Value {
  const read = () => scalarOf(f.cell(r.sheetId, r.r1, r.c1));
  // A format is read after its cell, so the formula hears when the cell changes (its format with it).
  const format = () => {
    if (!own) read();
    return f.format(r.sheetId, r.r1, r.c1);
  };
  const shape = () => formatShape(format());
  switch (type) {
    case 'address': {
      const at = formatA1(r.r1, r.c1, { row: true, col: true });
      if (r.sheetId === f.sheetId) return at;
      return `${quoteSheet(f.ctx.byId(r.sheetId)?.title ?? '')}!${at}`;
    }
    case 'col':
      return r.c1 + 1;
    case 'row':
      return r.r1 + 1;
    case 'sheet': {
      // OpenFormula's is the sheet's number (Part 4 §6.13.3), Google's its name (the file's meaning).
      const title = f.ctx.byId(r.sheetId)?.title;
      if (title === undefined) return err('#REF!');
      return f.meaning === 'openformula' ? f.sheetNumber(r.sheetId) : title;
    }
    case 'contents':
      return read();
    case 'type': {
      const v = read();
      return v === null ? 'b' : typeof v === 'string' ? 'l' : 'v';
    }
    case 'color':
      return shape().coloured ? 1 : 0;
    case 'parentheses':
      return shape().bracketed ? 1 : 0;
    case 'format':
      return shape().code;
    case 'prefix': {
      const ha = format()?.ha;
      return ha ? PREFIX[ha] : '';
    }
    case 'width': {
      const px = f.colWidth(r.sheetId, r.c1);
      return Math.max(0, Math.round((px - CELL_WIDTH_PADDING_PX) / CELL_DIGIT_WIDTH_PX));
    }
    // A LiveDoc document is no file: OpenFormula's answer for a file never saved (default).
    case 'filename':
      return '';
    // 1 under any protection, a warning one too (data-tools.md "Protected ranges", D42).
    case 'protect':
      return f.isProtected(r.sheetId, r.r1, r.c1) ? 1 : 0;
    default:
      return err('#VALUE!', `"${type}" is not something CELL can tell`);
  }
}

export const CELL: FnDef = fn(1, 2, ([type, ref], f) => {
  const t = scalarArg(type!, f);
  if (typeof t !== 'string') return err('#VALUE!', 'CELL needs the kind of information as text');
  let r: RangeRef | null;
  if (ref === undefined) r = { sheetId: f.sheetId, r1: f.row, c1: f.col, r2: f.row, c2: f.col };
  else r = refArg(ref) ?? (isAreas(ref) ? (ref.areas[0] ?? null) : null);
  if (!r)
    return ref !== undefined && isError(ref) ? ref : err('#N/A', 'CELL needs a cell reference');
  const own = r.sheetId === f.sheetId && r.r1 === f.row && r.c1 === f.col;
  return cellInfo(t.toLowerCase(), r, own, f);
});
