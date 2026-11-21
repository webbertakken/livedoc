// Trigonometric and hyperbolic functions (docs/specs/029-sheets/formulas.md "Functions": Math), angles in radians.
// A value outside a function's domain is #NUM!, as LibreOffice and Excel have it; a pole at 0 (COT(0)) divides by
// zero, #DIV/0!, as Google gives it.
import { numFn, type FnDef } from '../fn';
import { err, type Value } from '../values';

const OUTSIDE = 'The value is outside what this function takes';

// One number in, one out; NaN or an infinity (a pole) is #NUM!.
function trigFn(each: (x: number) => number): FnDef {
  return numFn(1, 1, ([x]) => finiteOr(each(x!)));
}

// One number in, one out, 0 a pole.
function reciprocalFn(each: (x: number) => number): FnDef {
  return numFn(1, 1, ([x]) =>
    x === 0 ? err('#DIV/0!', 'This divides by zero at 0') : finiteOr(1 / each(x!)),
  );
}

function finiteOr(y: number): Value {
  return Number.isFinite(y) ? y : err('#NUM!', OUTSIDE);
}

export const TRIG_FUNCTIONS: Record<string, FnDef> = {
  SIN: trigFn(Math.sin),
  COS: trigFn(Math.cos),
  TAN: trigFn(Math.tan),
  COT: reciprocalFn(Math.tan),
  SEC: trigFn((x) => 1 / Math.cos(x)),
  CSC: reciprocalFn(Math.sin),
  ASIN: trigFn(Math.asin),
  ACOS: trigFn(Math.acos),
  ATAN: trigFn(Math.atan),
  ACOT: trigFn((x) => Math.PI / 2 - Math.atan(x)),
  // ATAN2(x, y): the angle of the point (x, y), x first as the spreadsheets have it; (0, 0) has none, #DIV/0!, as
  // Google gives it (OpenFormula leaves it to the application).
  ATAN2: numFn(2, 2, ([x, y]) =>
    x === 0 && y === 0 ? err('#DIV/0!', 'The point (0, 0) has no angle') : Math.atan2(y!, x!),
  ),
  SINH: trigFn(Math.sinh),
  COSH: trigFn(Math.cosh),
  TANH: trigFn(Math.tanh),
  COTH: reciprocalFn(Math.tanh),
  SECH: trigFn((x) => 1 / Math.cosh(x)),
  CSCH: reciprocalFn(Math.sinh),
  ASINH: trigFn(Math.asinh),
  ACOSH: trigFn(Math.acosh),
  ATANH: trigFn((x) => (Math.abs(x) >= 1 ? NaN : Math.atanh(x))),
  ACOTH: trigFn((x) => (Math.abs(x) <= 1 ? NaN : 0.5 * Math.log((x + 1) / (x - 1)))),
  DEGREES: trigFn((x) => (x * 180) / Math.PI),
  RADIANS: trigFn((x) => (x * Math.PI) / 180),
};
