// The operators on single values (docs/specs/029-sheets/formulas.md "Operators"): what `+`, `&`, `=` and the rest
// give for two scalars, and `-`, `+` and `%` for one. The evaluator lifts them over arrays; the Operator functions
// (`ADD`, `EQ`, `UMINUS`, ...) are the same operators by name, so both answer alike.
import { TEXT_RESULT_MAX } from '../limits';
import type { BinaryOp } from './ast';
import { compareScalars, err, isError, toNumber, toText, type Scalar, type Value } from './values';

export type UnaryOperator = 'neg' | 'pos' | 'pct';

/** A text result, or #VALUE! past what a cell holds (TEXT_RESULT_MAX). */
export function boundedText(text: string): Value {
  return text.length > TEXT_RESULT_MAX
    ? err('#VALUE!', 'The text is longer than a cell holds')
    : text;
}

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
    default:
      if (x === 0 && y < 0) return err('#DIV/0!');
      r = x ** y;
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
