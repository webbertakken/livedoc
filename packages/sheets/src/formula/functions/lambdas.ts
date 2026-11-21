// LAMBDA, LET and the helpers that apply a LAMBDA over arrays (docs/specs/029-sheets/formulas.md "LAMBDA and LET").
// LAMBDA and LET are lazy: their names are read as written, never worked out.
import { isRef, type EvalValue, type Frame, type Lambda } from '../../engine/frame';
import { MANY, arrayArg, deref, intArg, lazyFn, tooBig, type FnDef } from '../fn';
import { budgetCalls, lambdaArg } from '../lambda';
import {
  dims,
  err,
  isArray,
  isError,
  scalarOf,
  type SheetError,
  type Value,
  type ValueArray,
} from '../values';

const NESTED = 'Single value expected. Nested array results are not supported.';

const notAName = (fn: string, at: number) =>
  err('#VALUE!', `Argument ${at} of function ${fn} is not a valid name.`);

// A function taking a LAMBDA among its arguments.
function helper(min: number, max: number, impl: (args: EvalValue[], f: Frame) => EvalValue): FnDef {
  return { min, max, lambdas: true, impl };
}

// A step's value, which must be one value (a one-cell array is its value).
function single(v: EvalValue, f: Frame): Value {
  const x = deref(v, f);
  if (!isArray(x)) return x;
  const d = dims(x);
  return d.rows === 1 && d.cols === 1 ? scalarOf(x) : err('#VALUE!', NESTED);
}

// An array of `rows` × `cols` steps, each counted against the recalculation budget first.
function grid(
  rows: number,
  cols: number,
  f: Frame,
  step: (i: number, j: number) => EvalValue,
): Value {
  const spent = budgetCalls(f, rows * cols);
  if (spent) return spent;
  const out: Value[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: Value[] = [];
    for (let j = 0; j < cols; j++) row.push(single(step(i, j), f));
    out.push(row);
  }
  return { rows: out };
}

// Each row (or column) of a range as a range, else of an array as an array.
function lines(source: EvalValue, byRow: boolean, f: Frame): EvalValue[] {
  if (isRef(source)) {
    const r = source.ref;
    const count = byRow ? r.r2 - r.r1 + 1 : r.c2 - r.c1 + 1;
    return Array.from({ length: count }, (_, k) => ({
      ref: byRow ? { ...r, r1: r.r1 + k, r2: r.r1 + k } : { ...r, c1: r.c1 + k, c2: r.c1 + k },
    }));
  }
  const a = arrayArg(source, f);
  const d = dims(a);
  return byRow
    ? a.rows.map((row) => ({ rows: [row] }))
    : Array.from({ length: d.cols }, (_, j) => ({ rows: a.rows.map((row) => [row[j]!]) }));
}

function byLine(byRow: boolean): FnDef {
  return helper(2, 2, (args, f) => {
    const lambda = lambdaArg(args[1]!, 1);
    if (isError(lambda)) return lambda;
    const each = lines(args[0]!, byRow, f);
    return byRow
      ? grid(each.length, 1, f, (i) => lambda.apply([each[i]!]))
      : grid(1, each.length, f, (_, j) => lambda.apply([each[j]!]));
  });
}

// REDUCE and SCAN: the accumulator carried through every value of the array, row by row; each step's accumulator in
// the array's shape.
function accumulate(
  args: EvalValue[],
  f: Frame,
): { initial: Value; steps: Value[][] } | SheetError {
  const lambda = lambdaArg(args[2]!, 2);
  if (isError(lambda)) return lambda;
  const array = arrayArg(args[1]!, f);
  const spent = budgetCalls(f, array.rows.length * dims(array).cols);
  if (spent) return spent;
  const initial = deref(args[0]!, f);
  let acc = initial;
  const steps = array.rows.map((row) =>
    row.map((x) => {
      acc = deref(lambda.apply([acc, x]), f);
      return acc;
    }),
  );
  return { initial, steps };
}

function makeArray(rows: number, cols: number, lambda: Lambda, f: Frame): Value {
  if (rows < 1 || cols < 1)
    return err('#VALUE!', 'MAKEARRAY needs at least one row and one column');
  if (tooBig(rows, cols)) return err('#NUM!', 'The result is too large');
  return grid(rows, cols, f, (i, j) => lambda.apply([i + 1, j + 1]));
}

export const LAMBDA_FUNCTIONS: Record<string, FnDef> = {
  LAMBDA: lazyFn(1, MANY, (args) => {
    const names = args.slice(0, -1).map((a) => a.identifier);
    const bad = names.findIndex((n, i) => n === null || names.indexOf(n) !== i);
    if (bad >= 0) return notAName('LAMBDA', bad + 1);
    const params = names as string[];
    const body = args[args.length - 1]!;
    return {
      lambda: {
        params,
        apply: (values) => body.within(new Map(params.map((p, i) => [p, values[i]!]))),
      },
    };
  }),
  LET: lazyFn(3, MANY, (args) => {
    if (args.length % 2 === 0)
      return err('#N/A', 'LET takes pairs of a name and a value, then a formula');
    const names = new Map<string, EvalValue>();
    for (let i = 0; i < args.length - 1; i += 2) {
      const name = args[i]!.identifier;
      if (name === null) return notAName('LET', i + 1);
      names.set(name, args[i + 1]!.within(names));
    }
    return args[args.length - 1]!.within(names);
  }),
  MAP: helper(2, MANY, (args, f) => {
    const lambda = lambdaArg(args[args.length - 1]!, args.length - 1);
    if (isError(lambda)) return lambda;
    const arrays: ValueArray[] = args.slice(0, -1).map((a) => arrayArg(a, f));
    const d = dims(arrays[0]!);
    if (arrays.some((a) => dims(a).rows !== d.rows || dims(a).cols !== d.cols))
      return err('#VALUE!', 'Array arguments to MAP are of different size.');
    return grid(d.rows, d.cols, f, (i, j) => lambda.apply(arrays.map((a) => a.rows[i]![j]!)));
  }),
  REDUCE: helper(3, 3, (args, f) => {
    const run = accumulate(args, f);
    if (isError(run)) return run;
    // The last accumulator; over no values, the initial one.
    return run.steps.flat().reduce<Value>((_, acc) => acc, run.initial);
  }),
  SCAN: helper(3, 3, (args, f) => {
    const run = accumulate(args, f);
    if (isError(run)) return run;
    return { rows: run.steps.map((row) => row.map((acc) => single(acc, f))) };
  }),
  BYROW: byLine(true),
  BYCOL: byLine(false),
  MAKEARRAY: helper(3, 3, (args, f) => {
    const rows = intArg(args[0]!, f);
    if (isError(rows)) return rows;
    const cols = intArg(args[1]!, f);
    if (isError(cols)) return cols;
    const lambda = lambdaArg(args[2]!, 2);
    return isError(lambda) ? lambda : makeArray(rows, cols, lambda, f);
  }),
};
