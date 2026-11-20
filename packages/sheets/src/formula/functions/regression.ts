// The least-squares array functions (docs/specs/029-sheets/formulas.md "Functions": Arrays): LINEST and TREND fit
// y = m₁x₁ + … + mₖxₖ + b, LOGEST and GROWTH fit y = b·m₁^x₁ ⋯ mₖ^xₖ (a line through ln y).
import type { EvalValue, Frame } from '../../engine/frame';
import { arrayArgs, boolArg, finite, fn, opt, type FnDef } from '../fn';
import { Matrices } from '../matrix';
import { err, isError, type SheetError, type Value } from '../values';
import { matrixArg } from './matrices';

// Known values laid out as observations: one row of k x values per y.
type Known = {
  y: number[];
  x: number[][];
  // How y runs, which is how new x values are read: down a column, along a row, or a whole table (one x).
  along: 'column' | 'row' | 'table';
  // The rows and columns of y, the shape of TREND's and GROWTH's answers at the known x values.
  shape: [number, number];
};

type Fit = {
  // m₁ … mₖ, and b (0 when it is not fitted).
  slopes: number[];
  intercept: number;
  withIntercept: boolean;
  known: Known;
  // Each slope's variance, and b's, over the residual variance.
  slopeFactors: number[];
  interceptFactor: number;
  // The sums of squares: about y's mean when b is fitted (else about 0), and of the residuals.
  total: number;
  residual: number;
};

// A residual sum of squares this small beside the total is rounding, not a residual: the fit is exact. Rounding
// leaves about 1e-32 of the total; 1e-20 is far below any residual a real fit has.
export const EXACT_FIT_TOLERANCE = 1e-20;

const N_A = err('#N/A', 'No statistic here');
const MISMATCH = err('#REF!', 'The known x values must match the known y values');

function counting(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => i * cols + j + 1),
  );
}

function transpose(m: number[][]): number[][] {
  return Matrices.transpose(m);
}

// The known values as observations: y down a column takes x's columns as variables, along a row x's rows; a table
// of y takes an x table of the same shape, one variable.
function knownArgs(args: EvalValue[], f: Frame, logs: boolean): Known | SheetError {
  const ys = matrixArg(args[0]!, f);
  if (isError(ys)) return ys;
  const rows = ys.length;
  const cols = ys[0]!.length;
  const xs =
    args[1] === undefined || args[1] === null ? counting(rows, cols) : matrixArg(args[1], f);
  if (isError(xs)) return xs;
  let y = ys.flat();
  if (logs) {
    if (y.some((v) => v <= 0)) return err('#NUM!', 'Every known y must be above 0');
    y = y.map(Math.log);
  }
  const shape: [number, number] = [rows, cols];
  if (cols === 1 && xs.length === rows) return { y, x: xs, along: 'column', shape };
  if (rows === 1 && xs[0]!.length === cols) return { y, x: transpose(xs), along: 'row', shape };
  if (xs.length === rows && xs[0]!.length === cols)
    return { y, x: xs.flat().map((v) => [v]), along: 'table', shape };
  return MISMATCH;
}

function fitted(args: EvalValue[], f: Frame, logs: boolean, interceptAt: number): Fit | SheetError {
  const known = knownArgs(args, f, logs);
  if (isError(known)) return known;
  const withIntercept = opt(args, interceptAt, f, boolArg, true);
  if (isError(withIntercept)) return withIntercept;
  // Fitting b, the values are centred on their means: the slopes come out of the centred values, b out of the means.
  const k = known.x[0]!.length;
  const n = known.y.length;
  const mean = (values: number[]) => (withIntercept ? values.reduce((s, v) => s + v, 0) / n : 0);
  const xMeans = Array.from({ length: k }, (_, j) => mean(known.x.map((row) => row[j]!)));
  const yMean = mean(known.y);
  const y = known.y.map((v) => v - yMean);
  const squares = Matrices.leastSquares(
    known.x.map((row) => row.map((v, j) => v - xMeans[j]!)),
    y,
  );
  if (!squares) return err('#NUM!', 'The known x values are collinear: no single fit');
  const slopes = [...squares.coefficients];
  const gram = squares.inverseGram;
  const total = y.reduce((s, v) => s + v * v, 0);
  let interceptFactor = 1 / n;
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) interceptFactor += xMeans[i]! * gram[i]![j]! * xMeans[j]!;
  return {
    slopes,
    intercept: yMean - slopes.reduce((s, m, j) => s + m * xMeans[j]!, 0),
    withIntercept,
    known,
    slopeFactors: slopes.map((_, j) => gram[j]![j]!),
    interceptFactor,
    total,
    residual: squares.residualSquares <= EXACT_FIT_TOLERANCE * total ? 0 : squares.residualSquares,
  };
}

// LINEST's and LOGEST's statistics under the coefficients (Excel's layout, which Google's help describes): standard
// errors; R² and the standard error of y; F and the degrees of freedom; the regression and residual sums of squares.
// An exact fit has no residual: its errors are 0 and its F is #N/A, as LibreOffice gives them.
function statistics(fit: Fit, firstRow: Value[]): Value[][] {
  const { slopes, total, residual } = fit;
  const k = slopes.length;
  const df = fit.known.y.length - k - (fit.withIntercept ? 1 : 0);
  const regression = total - residual;
  const variance = residual === 0 ? 0 : residual / df;
  const errorOf = (factor: number) => Math.sqrt(variance * factor);
  const errors: Value[] = [...fit.slopeFactors].reverse().map(errorOf);
  errors.push(fit.withIntercept ? errorOf(fit.interceptFactor) : N_A);
  const pad = (row: Value[]) => [...row, ...new Array<Value>(k + 1 - row.length).fill(N_A)];
  const exact = err('#N/A', 'An exact fit has no F statistic');
  return [
    firstRow,
    errors,
    pad([total === 0 ? err('#DIV/0!') : regression / total, Math.sqrt(variance)]),
    pad([residual === 0 ? exact : regression / k / variance, df]),
    pad([regression, residual]),
  ];
}

// LINEST and LOGEST: the coefficients mₖ … m₁ then b (as e^ for LOGEST), with the statistics when verbose.
function estimate(logs: boolean): FnDef {
  return fn(1, 4, (args, f) => {
    const fit = fitted(args, f, logs, 2);
    if (isError(fit)) return fit;
    const verbose = opt(args, 3, f, boolArg, false);
    if (isError(verbose)) return verbose;
    const raw = [...fit.slopes].reverse().concat(fit.intercept);
    const firstRow: Value[] = raw.map((c) => finite(logs ? Math.exp(c) : c));
    if (!verbose) return { rows: [firstRow] };
    return { rows: statistics(fit, firstRow) };
  });
}

// New x values as observations, and the shape their answers take: one variable keeps the new values' shape; several
// read a row (y down a column) or a column (y along a row) per observation.
function newPoints(
  args: EvalValue[],
  f: Frame,
  fit: Fit,
): { points: number[][]; shape: [number, number] } | SheetError {
  const k = fit.slopes.length;
  if (args[2] === undefined || args[2] === null) {
    return { points: fit.known.x, shape: fit.known.shape };
  }
  const xs = matrixArg(args[2], f);
  if (isError(xs)) return xs;
  if (k === 1) return { points: xs.flat().map((v) => [v]), shape: [xs.length, xs[0]!.length] };
  if (fit.known.along === 'column' && xs[0]!.length === k)
    return { points: xs, shape: [xs.length, 1] };
  if (fit.known.along === 'row' && xs.length === k)
    return { points: transpose(xs), shape: [1, xs[0]!.length] };
  return MISMATCH;
}

// TREND and GROWTH: the fitted line's (or curve's) values at new x values, the known ones by default.
function predict(logs: boolean): FnDef {
  return fn(1, 4, (args, f) => {
    const fit = fitted(args, f, logs, 3);
    if (isError(fit)) return fit;
    const at = newPoints(args, f, fit);
    if (isError(at)) return at;
    const values = at.points.map((p) => {
      const line = p.reduce((s, x, j) => s + x * fit.slopes[j]!, fit.intercept);
      return finite(logs ? Math.exp(line) : line);
    });
    const [rows, cols] = at.shape;
    return { rows: Array.from({ length: rows }, (_, i) => values.slice(i * cols, (i + 1) * cols)) };
  });
}

export const REGRESSION_FUNCTIONS: Record<string, FnDef> = {
  LINEST: estimate(false),
  LOGEST: estimate(true),
  TREND: predict(false),
  GROWTH: predict(true),
};

for (const name of Object.keys(REGRESSION_FUNCTIONS))
  REGRESSION_FUNCTIONS[name] = arrayArgs(REGRESSION_FUNCTIONS[name]!);
