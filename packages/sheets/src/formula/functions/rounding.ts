// Rounding to a multiple (docs/specs/029-sheets/formulas.md "Functions": Math): Google's CEILING and FLOOR with
// two arguments, OpenFormula's with a third (D38), the .MATH and .PRECISE forms, ISO.CEILING, EVEN and ODD.
import { boolArg, fn, numArg, numFn, opt, type FnDef } from '../fn';
import { err, isError, type Value } from '../values';

const SIGNS_DIFFER = 'The factor must have the same sign as the value';

// To 15 significant digits, so CEILING(0.3, 0.1) is 0.3 rather than 0.30000000000000004.
function clean(x: number): number {
  return Number(x.toPrecision(15));
}

function steps(x: number, factor: number): number {
  return clean(x / factor);
}

// Google's CEILING and FLOOR: a negative factor turns the direction for a negative value (CEILING(-2.5, -1) is -3);
// a positive value with a negative factor is #NUM!.
function googleMultiple(x: number, factor: number, up: boolean): Value {
  if (factor === 0) return 0;
  if (x > 0 && factor < 0) return err('#NUM!', SIGNS_DIFFER);
  const q = steps(x, factor);
  return clean((up ? Math.ceil(q) : Math.floor(q)) * factor);
}

// OpenFormula's CEILING and FLOOR with a mode: value and factor of one sign; mode 0 rounds toward +∞ (CEILING) or
// −∞ (FLOOR), any other mode rounds a negative value away from zero (CEILING) or toward it (FLOOR).
function openFormulaMultiple(x: number, factor: number, mode: number, up: boolean): Value {
  if (factor === 0 || x === 0) return 0;
  if (Math.sign(x) !== Math.sign(factor)) return err('#NUM!', SIGNS_DIFFER);
  const size = Math.abs(factor);
  if (mode !== 0 && x < 0) {
    const q = steps(-x, size);
    return clean(-(up ? Math.ceil(q) : Math.floor(q)) * size);
  }
  const q = steps(x, size);
  return clean((up ? Math.ceil(q) : Math.floor(q)) * size);
}

function multipleFn(up: boolean): FnDef {
  return fn(1, 3, (args, f) => {
    const x = numArg(args[0]!, f);
    const factor = opt(args, 1, f, numArg, 1);
    if (isError(x)) return x;
    if (isError(factor)) return factor;
    if (args.length < 3) return googleMultiple(x, factor, up);
    const mode = opt(args, 2, f, numArg, 0);
    return isError(mode) ? mode : openFormulaMultiple(x, factor, mode, up);
  });
}

// To a multiple of the factor with its sign ignored, up or down.
function unsignedMultiple(x: number, factor: number, up: boolean): number {
  const size = Math.abs(factor);
  if (size === 0) return 0;
  const q = steps(x, size);
  return clean((up ? Math.ceil(q) : Math.floor(q)) * size);
}

// CEILING.MATH and FLOOR.MATH: a negative value goes toward zero (CEILING) or away (FLOOR) unless the mode says
// otherwise.
function mathFn(up: boolean): FnDef {
  return fn(1, 3, (args, f) => {
    const x = numArg(args[0]!, f);
    const factor = opt(args, 1, f, numArg, 1);
    const mode = opt(args, 2, f, boolArg, false);
    if (isError(x)) return x;
    if (isError(factor)) return factor;
    if (isError(mode)) return mode;
    return unsignedMultiple(x, factor, x < 0 && mode ? !up : up);
  });
}

function preciseFn(up: boolean): FnDef {
  return numFn(1, 2, ([x, factor = 1]) => unsignedMultiple(x!, factor, up));
}

// Away from zero to the next whole number of `step`s, offset: EVEN to 2, 4, ...; ODD to 1, 3, ....
function awayFromZero(x: number, odd: boolean): number {
  const size = Math.abs(x);
  const even = Math.ceil(clean(size / 2)) * 2;
  const out = odd ? (even - 1 >= size ? even - 1 : even + 1) : even;
  return x < 0 ? -out : out;
}

export const ROUNDING_FUNCTIONS: Record<string, FnDef> = {
  CEILING: multipleFn(true),
  FLOOR: multipleFn(false),
  'CEILING.MATH': mathFn(true),
  'FLOOR.MATH': mathFn(false),
  'CEILING.PRECISE': preciseFn(true),
  'FLOOR.PRECISE': preciseFn(false),
  'ISO.CEILING': preciseFn(true),
  EVEN: numFn(1, 1, ([x]) => awayFromZero(x!, false)),
  ODD: numFn(1, 1, ([x]) => awayFromZero(x!, true)),
  ISEVEN: numFn(1, 1, ([x]) => Math.trunc(x!) % 2 === 0),
  ISODD: numFn(1, 1, ([x]) => Math.trunc(x!) % 2 !== 0),
};
