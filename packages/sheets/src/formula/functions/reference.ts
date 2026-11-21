// ADDRESS, SHEET and FORMULATEXT (docs/specs/029-sheets/formulas.md "Functions": Lookup): a reference written as
// text, a sheet's place, a cell's formula.
import { formatA1 } from '../../address';
import { isAreas } from '../../engine/frame';
import { boolArg, fn, intArg, opt, refArg, scalarArg, textArg, type FnDef } from '../fn';
import { quoteSheet } from '../stored';
import { err, isError } from '../values';

// ADDRESS's absolute_relative_mode: which of the row and the column are absolute.
const MODES: Record<number, { row: boolean; col: boolean }> = {
  1: { row: true, col: true },
  2: { row: true, col: false },
  3: { row: false, col: true },
  4: { row: false, col: false },
};

export const REFERENCE_FUNCTIONS: Record<string, FnDef> = {
  ADDRESS: fn(2, 5, (args, f) => {
    const row = intArg(args[0]!, f);
    const col = intArg(args[1]!, f);
    const mode = opt(args, 2, f, intArg, 1);
    const a1 = opt(args, 3, f, boolArg, true);
    const sheet = opt(args, 4, f, textArg, '');
    if (isError(row)) return row;
    if (isError(col)) return col;
    if (isError(mode)) return mode;
    if (isError(a1)) return a1;
    if (isError(sheet)) return sheet;
    const abs = MODES[mode];
    if (!abs) return err('#VALUE!', 'The mode is 1, 2, 3 or 4');
    if (row < 1 || col < 1) return err('#VALUE!', 'Rows and columns are counted from 1');
    const at = a1
      ? formatA1(row - 1, col - 1, abs)
      : `R${abs.row ? row : `[${row}]`}C${abs.col ? col : `[${col}]`}`;
    if (sheet === '') return at;
    // OpenFormula joins an A1 address to its sheet with a dot (Part 4 §6.14.2), Google with "!" (the file's meaning).
    const joiner = a1 && f.meaning === 'openformula' ? '.' : '!';
    return `${quoteSheet(sheet)}${joiner}${at}`;
  }),
  // A sheet's place among the workbook's sheets from 1: a reference's sheet, a sheet named by text, or its own.
  SHEET: fn(0, 1, ([x], f) => {
    if (x === undefined) return f.sheetNumber(f.sheetId);
    const r = refArg(x) ?? (isAreas(x) ? x.areas[0] : undefined);
    if (r) return f.sheetNumber(r.sheetId);
    const name = scalarArg(x, f);
    if (isError(name)) return name;
    const handle = typeof name === 'string' ? f.ctx.byTitle(name) : undefined;
    return handle ? f.sheetNumber(handle.id) : err('#N/A', `There is no sheet "${String(name)}"`);
  }),
  FORMULATEXT: fn(1, 1, ([x], f) => {
    const r = refArg(x);
    if (!r) return err('#N/A', 'FORMULATEXT needs a cell reference');
    // Noted, not read: the formula hears when the cell is retyped, and its own cell is no loop.
    f.noteRange({ sheetId: r.sheetId, r1: r.r1, c1: r.c1, r2: r.r1, c2: r.c1 });
    return f.formulaText(r.sheetId, r.r1, r.c1) ?? err('#N/A', 'The cell holds no formula');
  }),
};
