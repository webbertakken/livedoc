// The operators on single values (docs/specs/029-sheets/formulas.md "Operators"): what `+`, `&`, `=` and the rest
// give for two scalars, and `-`, `+` and `%` for one. The evaluator lifts them over arrays; the Operator functions
// (`ADD`, `EQ`, `UMINUS`, ...) are the same operators by name, so both answer alike.
import { TEXT_RESULT_MAX } from '../limits';
import type { BinaryOp } from './ast';
import {
  compareScalars,
  err,
  isError,
  toNumber,
  toText,
  type Scalar,
  type SheetError,
  type Value,
} from './values';

export type UnaryOperator = 'neg' | 'pos' | 'pct';

/** A text result, or #VALUE! past what a cell holds (TEXT_RESULT_MAX). */
export function boundedText(text: string): Value {
  return text.length > TEXT_RESULT_MAX
    ? err('#VALUE!', 'The text is longer than a cell holds')
    : text;
}

/**
 * x to the power y, as Google works it: 0 to a negative power is #NUM!, and a negative number's odd root is negative
 * ((-8)^(1/3) is -2); any other fractional power of a negative number is #NUM!.
 */
export function power(x: number, y: number): number | SheetError {
  if (x === 0 && y < 0) return err('#NUM!', 'Zero has no negative power');
  if (x >= 0 || Number.isInteger(y)) return x ** y;
  const root = 1 / y;
  const odd = Math.round(root);
  if (Math.abs(root - odd) > ODD_ROOT_TOLERANCE || odd % 2 === 0)
    return err('#NUM!', 'A negative number has no such root');
  return -((-x) ** y);
}

// How near 1/y must be to an odd whole number for y to be its root, as 1/3 is only near a third.
const ODD_ROOT_TOLERANCE = 1e-10;

/** `a op b`, text read and numbers written in `locale` (formulas.md "Locale"). */
export function binaryOperation(op: BinaryOp, a: Scalar, b: Scalar, locale: string): Value {
  if (isError(a)) return a;
  if (isError(b)) return b;
  if (op === '&') {
    const x = toText(a, locale);
    const y = toText(b, locale);
    if (isError(x)) return x;
    if (isError(y)) return y;
    return boundedText(x + y);
  }
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    const c = compareScalars(a, b);
    switch (op) {
      case '=':
        return c === 0;
      case '<>':
        return c !== 0;
      case '<':
        return c < 0;
      case '>':
        return c > 0;
      case '<=':
        return c <= 0;
      default:
        return c >= 0;
    }
  }
  const x = toNumber(a, locale);
  const y = toNumber(b, locale);
  if (typeof x !== 'number') return x;
  if (typeof y !== 'number') return y;
  let r: number;
  switch (op) {
    case '+':
      r = x + y;
      break;
    case '-':
      r = x - y;
      break;
    case '*':
      r = x * y;
      break;
    case '/':
      if (y === 0) return err('#DIV/0!');
      r = x / y;
      break;
    default: {
      const p = power(x, y);
      if (isError(p)) return p;
      r = p;
    }
  }
  if (!Number.isFinite(r)) return err('#NUM!');
  // Full precision is kept; comparisons and display read 15 significant digits (compareScalars, numberText), so
  // 0.1 + 0.2 = 0.3 is TRUE without compounding rounding through a chain of operations.
  return r;
}

export function unaryOperation(kind: UnaryOperator, x: Scalar, locale: string): Value {
  if (kind === 'pos') return x;
  const n = toNumber(x, locale);
  if (typeof n !== 'number') return n;
  return kind === 'neg' ? -n : n / 100;
}
