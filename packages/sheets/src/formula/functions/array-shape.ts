// The array functions that reshape (docs/specs/029-sheets/formulas.md "Functions": Arrays): pick rows and columns,
// stack arrays, lay an array out as one line, wrap a line into rows or columns. Values are moved, never changed.
import type { EvalValue, Frame } from '../../engine/frame';
import {
  MANY,
  arrayArg,
  arrayArgs,
  boolArg,
  flatScalars,
  flatValues,
  fn,
  intArg,
  numArg,
  opt,
  scalarArg,
  tooBig,
  type FnDef,
} from '../fn';
import {
  dims,
  err,
  isError,
  toNumber,
  type Scalar,
  type SheetError,
  type Value,
  type ValueArray,
} from '../values';

const MISSING = err('#N/A', 'No value here: the arrays are different sizes');

function transposed(rows: Value[][]): Value[][] {
  return (rows[0] ?? []).map((_, j) => rows.map((r) => r[j]!));
}

// CHOOSECOLS' and CHOOSEROWS' numbers: whole, from the end when negative, each array taken value by value.
function picks(args: EvalValue[], count: number, f: Frame, what: string): number[] | SheetError {
  const out: number[] = [];
  for (const s of flatScalars(args.slice(1), f)) {
    const n = toNumber(s);
    if (isError(n)) return n;
    const i = Math.trunc(n);
    if (i === 0 || Math.abs(i) > count) return err('#VALUE!', `There is no ${what} ${i}`);
    out.push(i > 0 ? i - 1 : count + i);
  }
  return out;
}

function chooseRows(rows: Value[][], args: EvalValue[], f: Frame, what: string): Value {
  const at = picks(args, rows.length, f, what);
  if (isError(at)) return at;
  if (tooBig(at.length, rows[0]!.length)) return err('#NUM!', 'The result is too large');
  return { rows: at.map((i) => rows[i]!) };
}

// Arrays side by side (HSTACK) or one under another (VSTACK, by rows), the short ones padded with #N/A.
function stacked(arrays: ValueArray[]): Value {
  const height = Math.max(...arrays.map((a) => dims(a).rows));
  const width = arrays.reduce((w, a) => w + dims(a).cols, 0);
  if (tooBig(height, width)) return err('#NUM!', 'The result is too large');
  const rows: Value[][] = [];
  for (let i = 0; i < height; i++)
    rows.push(arrays.flatMap((a) => a.rows[i] ?? new Array<Value>(dims(a).cols).fill(MISSING)));
  return { rows };
}

// TOCOL's and TOROW's ignore: 0 keeps every value, 1 drops empties, 2 errors, 3 both.
function lineOf(args: EvalValue[], f: Frame): Scalar[] | SheetError {
  const array = arrayArg(args[0]!, f);
  const ignore = opt(args, 1, f, intArg, 0);
  const byColumn = opt(args, 2, f, boolArg, false);
  if (isError(ignore)) return ignore;
  if (isError(byColumn)) return byColumn;
  if (ignore < 0 || ignore > 3) return err('#VALUE!', 'Ignore is 0, 1, 2 or 3');
  const values = flatValues(byColumn ? { rows: transposed(array.rows) } : array);
  const kept = values.filter((v) => !((ignore & 1 && v === null) || (ignore & 2 && isError(v))));
  if (tooBig(kept.length, 1)) return err('#NUM!', 'The result is too large');
  return kept.length ? kept : err('#N/A', 'Every value was ignored');
}

// WRAPROWS' and WRAPCOLS' rows of `count` values from one row or column, the last padded.
function wrapped(args: EvalValue[], f: Frame): Value[][] | SheetError {
  const range = arrayArg(args[0]!, f);
  const d = dims(range);
  if (d.rows > 1 && d.cols > 1) return err('#VALUE!', 'Only a single row or column can be wrapped');
  const count = numArg(args[1]!, f);
  if (isError(count)) return count;
  const n = Math.floor(count);
  if (n < 1) return err('#NUM!', 'Wrap count must be at least 1');
  const pad: Scalar = args[2] === undefined || args[2] === null ? MISSING : scalarArg(args[2], f);
  const values = flatValues(range);
  const lines = Math.ceil(values.length / n);
  if (tooBig(lines, n)) return err('#NUM!', 'The result is too large');
  return Array.from({ length: lines }, (_, i) =>
    Array.from({ length: n }, (_, j) => values[i * n + j] ?? pad),
  );
}

export const ARRAY_SHAPE_FUNCTIONS: Record<string, FnDef> = {
  CHOOSECOLS: fn(2, MANY, (args, f) => {
    const rows = transposed(arrayArg(args[0]!, f).rows);
    const out = chooseRows(rows, args, f, 'column');
    return isError(out) ? out : { rows: transposed((out as ValueArray).rows) };
  }),
  CHOOSEROWS: fn(2, MANY, (args, f) => chooseRows(arrayArg(args[0]!, f).rows, args, f, 'row')),
  HSTACK: fn(1, MANY, (args, f) => stacked(args.map((a) => arrayArg(a, f)))),
  VSTACK: fn(1, MANY, (args, f) => {
    const out = stacked(args.map((a) => ({ rows: transposed(arrayArg(a, f).rows) })));
    return isError(out) ? out : { rows: transposed((out as ValueArray).rows) };
  }),
  TOCOL: fn(1, 3, (args, f) => {
    const line = lineOf(args, f);
    return isError(line) ? line : { rows: line.map((v) => [v]) };
  }),
  TOROW: fn(1, 3, (args, f) => {
    const line = lineOf(args, f);
    return isError(line) ? line : { rows: [line] };
  }),
  WRAPROWS: fn(2, 3, (args, f) => {
    const rows = wrapped(args, f);
    return isError(rows) ? rows : { rows };
  }),
  WRAPCOLS: fn(2, 3, (args, f) => {
    const rows = wrapped(args, f);
    return isError(rows) ? rows : { rows: transposed(rows) };
  }),
  // Every value of every argument in one column: by argument, then row, then column; empties kept.
  FLATTEN: fn(1, MANY, (args, f) => {
    const values = flatScalars(args, f);
    if (tooBig(values.length, 1)) return err('#NUM!', 'The result is too large');
    return { rows: values.map((v) => [v]) };
  }),
};

for (const name of Object.keys(ARRAY_SHAPE_FUNCTIONS))
  ARRAY_SHAPE_FUNCTIONS[name] = arrayArgs(ARRAY_SHAPE_FUNCTIONS[name]!);
