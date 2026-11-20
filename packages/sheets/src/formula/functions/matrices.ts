// The array functions of matrices and paired values (docs/specs/029-sheets/formulas.md "Functions": Arrays): MMULT,
// MDETERM, MINVERSE, the sums of paired squares, and FREQUENCY.
import type { EvalValue, Frame } from '../../engine/frame';
import {
  arrayArg,
  arrayArgs,
  finite,
  flatScalars,
  flatValues,
  fn,
  tooBig,
  type FnDef,
} from '../fn';
import { Matrices } from '../matrix';
import { err, isError, type Scalar, type SheetError, type Value } from '../values';

const NOT_A_NUMBER = err('#VALUE!', 'Every value of a matrix must be a number');

/** An argument as a matrix: every value a number, else its first error or #VALUE!. */
export function matrixArg(v: EvalValue, f: Frame): number[][] | SheetError {
  const rows = arrayArg(v, f).rows;
  if (rows.length === 0) return NOT_A_NUMBER;
  for (const row of rows)
    for (const x of row) {
      if (isError(x)) return x;
      if (typeof x !== 'number') return NOT_A_NUMBER;
    }
  return rows as number[][];
}

function squareArg(v: EvalValue, f: Frame): number[][] | SheetError {
  const m = matrixArg(v, f);
  if (isError(m)) return m;
  return m.length === m[0]!.length ? m : err('#VALUE!', 'The matrix must be square');
}

// The pairs of SUMX2MY2, SUMX2PY2 and SUMXMY2: both values numbers; any other pair is left out.
function pairsFn(each: (x: number, y: number) => number): FnDef {
  return fn(2, 2, (args, f) => {
    const xs = flatValues(arrayArg(args[0]!, f));
    const ys = flatValues(arrayArg(args[1]!, f));
    if (xs.length !== ys.length) return err('#VALUE!', 'The arrays must have as many values');
    let sum = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      const y = ys[i]!;
      if (isError(x)) return x;
      if (isError(y)) return y;
      if (typeof x === 'number' && typeof y === 'number') sum += each(x, y);
    }
    return finite(sum);
  });
}

function numbersIn(values: Scalar[]): number[] | SheetError {
  const out: number[] = [];
  for (const v of values) {
    if (isError(v)) return v;
    if (typeof v === 'number') out.push(v);
  }
  return out;
}

// How many values fall in each class: above the next smaller class, up to this one; the last row counts the values
// above every class. Classes keep their order; a class repeated counts once, at its first place.
function frequency(data: number[], classes: number[]): Value {
  const order = classes.map((c, i) => ({ c, i })).sort((a, b) => a.c - b.c || a.i - b.i);
  const counts = new Array<number>(classes.length + 1).fill(0);
  for (const x of data) {
    const at = order.find((o) => x <= o.c);
    counts[at ? at.i : classes.length]!++;
  }
  return { rows: counts.map((n) => [n]) };
}

export const MATRIX_FUNCTIONS: Record<string, FnDef> = {
  MMULT: fn(2, 2, (args, f) => {
    const a = matrixArg(args[0]!, f);
    const b = matrixArg(args[1]!, f);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (a[0]!.length !== b.length)
      return err('#VALUE!', "The first matrix's columns must match the second's rows");
    if (tooBig(a.length, b[0]!.length)) return err('#NUM!', 'The result is too large');
    const rows: Value[][] = Matrices.multiply(a, b).map((row) => row.map((x) => finite(x)));
    return { rows };
  }),
  MDETERM: fn(1, 1, (args, f) => {
    const m = squareArg(args[0]!, f);
    return isError(m) ? m : finite(Matrices.determinant(m));
  }),
  MINVERSE: fn(1, 1, (args, f) => {
    const m = squareArg(args[0]!, f);
    if (isError(m)) return m;
    const inverse = Matrices.inverse(m);
    if (!inverse) return err('#NUM!', 'The matrix is singular: it has no inverse');
    return { rows: inverse.map((row) => row.map((x) => finite(x))) };
  }),
  SUMX2MY2: pairsFn((x, y) => x * x - y * y),
  SUMX2PY2: pairsFn((x, y) => x * x + y * y),
  SUMXMY2: pairsFn((x, y) => (x - y) ** 2),
  FREQUENCY: fn(2, 2, (args, f) => {
    const data = numbersIn(flatScalars([args[0]!], f));
    const classes = numbersIn(flatScalars([args[1]!], f));
    if (isError(data)) return data;
    if (isError(classes)) return classes;
    return frequency(data, classes);
  }),
};

for (const name of Object.keys(MATRIX_FUNCTIONS))
  MATRIX_FUNCTIONS[name] = arrayArgs(MATRIX_FUNCTIONS[name]!);
