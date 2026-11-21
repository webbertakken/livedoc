// Calling a LAMBDA (formulas.md "LAMBDA and LET"): its count of names checked, each call counted against the
// recalculation budget, as a read is.
import { isLambda, type EvalValue, type Frame, type Lambda } from '../engine/frame';
import { err, type SheetError } from './values';

const plural = (n: number) => `${n} argument${n === 1 ? '' : 's'}`;

// Google's words for a LAMBDA given another count of values than it has names.
export function wrongCount(lambda: Lambda, given: number): SheetError | null {
  if (lambda.params.length === given) return null;
  return err(
    '#N/A',
    `Wrong number of arguments to LAMBDA. Expected ${plural(lambda.params.length)}, but got ${plural(given)}.`,
  );
}

export const NOT_A_LAMBDA = 'Argument must be a LAMBDA.';
export const TOO_MANY_CALLS = 'This sheet is too large to recalculate at once';

// The LAMBDA a helper is handed, or the error it gives instead.
export function lambdaArg(v: EvalValue, names: number): Lambda | SheetError {
  if (!isLambda(v)) return err('#VALUE!', NOT_A_LAMBDA);
  return wrongCount(v.lambda, names) ?? v.lambda;
}

// Spend `calls` applications from the budget before making them; false once it is spent.
export function budgetCalls(f: Frame, calls: number): SheetError | null {
  return f.spend(calls) ? null : err('#NUM!', TOO_MANY_CALLS);
}

// A LAMBDA called with values, as `LAMBDA(x, x*2)(5)` or a LET name's `double(5)`.
export function callLambda(lambda: Lambda, values: EvalValue[], f: Frame): EvalValue {
  return wrongCount(lambda, values.length) ?? budgetCalls(f, 1) ?? lambda.apply(values);
}
