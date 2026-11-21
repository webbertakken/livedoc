// Information functions (docs/specs/029-sheets/formulas.md "Functions": Information): what kind of value something
// is, never failing on an error it is asked about (ERROR.TYPE and N aside), and what a cell or the workbook is.
import { isAreas, isRef, type EvalValue, type Frame, type RangeRef } from '../../engine/frame';
import { localeDayFirst, parseDateText } from '../../dates';
import { formatShape } from '../../format-shape';
import { isEmail } from '../../text-checks';
import { arrayArgs, deref, fn, refArg, scalarFn, type FnDef } from '../fn';
import {
  type ErrorCode,
  err,
  isArray,
  isError,
  scalarOf,
  type Scalar,
  type SheetError,
} from '../values';
import { CELL } from './cell-info';

function is(test: (x: Scalar) => boolean): FnDef {
  return scalarFn(1, 1, ([x]) => test(x!));
}

// ERROR.TYPE's numbers, as Google Sheets gives them (formulas.md "Errors"): any error past #N/A is 8.
const ERROR_TYPE_NUMBERS: Record<ErrorCode, number> = {
  '#NULL!': 1,
  '#DIV/0!': 2,
  '#VALUE!': 3,
  '#REF!': 4,
  '#NAME?': 5,
  '#NUM!': 6,
  '#N/A': 7,
  '#ERROR!': 8,
};

// Whether a value reads as a date: text that reads as one in the workbook's locale, or a number drawn as a date
// (`drawnAsDate`: its cell's format shows a day). A number on its own, a truth, an error or nothing is no date.
function dateLike(x: Scalar, drawnAsDate: boolean, f: Frame): boolean {
  if (typeof x === 'string') return parseDateText(x, localeDayFirst(f.locale)) !== null;
  return typeof x === 'number' && drawnAsDate;
}

// ISDATE over a reference: every cell a date, each number by its own cell's format.
function rangeIsDates(r: RangeRef, f: Frame): boolean | SheetError {
  const values = deref({ ref: r }, f);
  const one = r.r1 === r.r2 && r.c1 === r.c2;
  // A range too large to read is its error, not a no; one cell holding an error is no date.
  if (!one && isError(values)) return values;
  const rows = isArray(values) ? values.rows : [[values]];
  for (let i = 0; i < rows.length; i++)
    for (let j = 0; j < rows[i]!.length; j++) {
      const at = { r: r.r1 + i, c: r.c1 + j };
      const drawn = formatShape(f.format(r.sheetId, at.r, at.c)).date;
      if (!dateLike(scalarOf(rows[i]![j]!), drawn, f)) return false;
    }
  return rows.length > 0;
}

function isDate(arg: EvalValue, f: Frame): boolean | SheetError {
  const r = refArg(arg);
  if (r) return rangeIsDates(r, f);
  if (isAreas(arg)) {
    for (const a of arg.areas) {
      const each = rangeIsDates(a, f);
      if (each !== true) return each;
    }
    return true;
  }
  // Anything else is a value worked out (no cell, so no format): a date only as text.
  const v = deref(arg, f);
  if (isArray(v)) return v.rows.every((row) => row.every((x) => dateLike(scalarOf(x), false, f)));
  return dateLike(v, false, f);
}

// INFO's answers about the environment (default, D58): one document open, recalculation automatic, and LiveDoc's own
// name for the system; where OpenFormula has no answer to give here (the directory, the origin, memory) #N/A.
const INFO_ANSWERS: Readonly<Record<string, string | number>> = {
  numfile: 1,
  recalc: 'Automatic',
  system: 'LiveDoc',
  osversion: 'LiveDoc',
  release: 'LiveDoc',
};
const INFO_UNKNOWN = new Set(['directory', 'origin', 'memavail', 'memused', 'totmem']);

export const INFO_FUNCTIONS: Record<string, FnDef> = {
  INFO: scalarFn(1, 1, ([x]) => {
    const key = typeof x === 'string' ? x.toLowerCase() : '';
    if (INFO_UNKNOWN.has(key)) return err('#N/A', 'Not known here');
    return INFO_ANSWERS[key] ?? err('#VALUE!', 'Not a kind of information INFO gives');
  }),
  // How many areas a reference holds: a union's parts, else 1; a value that is no reference is #VALUE!.
  AREAS: fn(1, 1, ([x]) => {
    if (isAreas(x!)) return x.areas.length;
    return isRef(x!) ? 1 : err('#VALUE!', 'AREAS takes a reference');
  }),
  ISBLANK: is((x) => x === null),
  ISNUMBER: is((x) => typeof x === 'number'),
  ISTEXT: is((x) => typeof x === 'string'),
  ISNONTEXT: is((x) => typeof x !== 'string'),
  ISLOGICAL: is((x) => typeof x === 'boolean'),
  ISERROR: is((x) => isError(x)),
  ISERR: is((x) => isError(x) && x.e !== '#N/A'),
  ISNA: is((x) => isError(x) && x.e === '#N/A'),
  ISREF: fn(1, 1, ([x]) => isRef(x!) || isAreas(x!)),
  ISDATE: arrayArgs(fn(1, 1, ([x], f) => isDate(x!, f))),
  ISEMAIL: is((x) => typeof x === 'string' && isEmail(x)),
  ISFORMULA: fn(1, 1, (args, f) => {
    const r = refArg(args[0]);
    if (!r) return err('#N/A', 'ISFORMULA needs a cell reference');
    return f.isFormula(r.sheetId, r.r1, r.c1);
  }),
  'ERROR.TYPE': scalarFn(1, 1, ([x]) =>
    isError(x!) ? ERROR_TYPE_NUMBERS[x.e] : err('#N/A', 'The value is not an error'),
  ),
  NA: fn(0, 0, () => err('#N/A')),
  N: scalarFn(1, 1, ([x]) => {
    if (typeof x === 'number') return x;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (isError(x!)) return x;
    return 0;
  }),
  TYPE: fn(1, 1, (args, f) => {
    const v = deref(args[0]!, f);
    if (isArray(v)) return 64;
    if (typeof v === 'number' || v === null) return 1;
    if (typeof v === 'string') return 2;
    if (typeof v === 'boolean') return 4;
    return 16;
  }),
  CELL,
  // The sheets a reference spans (one: references reach one sheet each), or the workbook's (OpenFormula 6.13.32).
  SHEETS: fn(0, 1, ([x], f) => {
    if (x === undefined) return f.sheetCount();
    if (isRef(x)) return 1;
    if (isAreas(x)) return new Set(x.areas.map((a) => a.sheetId)).size;
    return err('#VALUE!', 'SHEETS needs a reference');
  }),
};
