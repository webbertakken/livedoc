// Functions of paired data (docs/specs/029-sheets/formulas.md "Functions": Statistics): correlation, covariance,
// the least-squares line through (x, y) with its forecast and standard error, and PROB over values and probabilities.
import type { EvalValue, Frame } from '../../engine/frame';
import { mean } from '../descriptive';
import { arrayArg, flatValues, fn, numArg, opt, type FnDef } from '../fn';
import { err, isError, type SheetError, type Value } from '../values';

// The sums a pair statistic needs: the count, the means, and the sums of products of deviations.
type Moments = { n: number; mx: number; my: number; sxx: number; syy: number; sxy: number };

// data_y and data_x read pair by pair: both the same size, an error in either the answer, a pair kept only where both
// are numbers (text, booleans and empty cells are skipped); no pair at all is #VALUE!, as LibreOffice answers.
function pairs(yArg: EvalValue, xArg: EvalValue, f: Frame): Moments | SheetError {
  const ys = flatValues(arrayArg(yArg, f));
  const xs = flatValues(arrayArg(xArg, f));
  if (ys.length !== xs.length) return err('#N/A', 'The ranges must be the same size');
  const kept: [number, number][] = [];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    const x = xs[i];
    if (isError(y)) return y;
    if (isError(x)) return x;
    if (typeof x === 'number' && typeof y === 'number') kept.push([x, y]);
  }
  if (kept.length === 0) return err('#VALUE!', 'No pair of numbers');
  const mx = mean(kept.map(([x]) => x));
  const my = mean(kept.map(([, y]) => y));
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of kept) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  return { n: kept.length, mx, my, sxx, syy, sxy };
}

function overPairs(each: (m: Moments) => Value): FnDef {
  return fn(2, 2, (args, f) => {
    const m = pairs(args[0]!, args[1]!, f);
    return isError(m) ? m : each(m);
  });
}

const FLAT_X = err('#DIV/0!', 'Every x value is the same');

function correlation(m: Moments): number | SheetError {
  if (m.sxx === 0 || m.syy === 0) return err('#DIV/0!', 'Every value of one range is the same');
  return m.sxy / Math.sqrt(m.sxx * m.syy);
}

function slope(m: Moments): number | SheetError {
  return m.sxx === 0 ? FLAT_X : m.sxy / m.sxx;
}

function intercept(m: Moments): number | SheetError {
  return m.sxx === 0 ? FLAT_X : m.my - (m.sxy / m.sxx) * m.mx;
}

const correl = overPairs(correlation);
const covariancePopulation = overPairs((m) => m.sxy / m.n);
const forecast = fn(3, 3, (args, f) => {
  const x = numArg(args[0]!, f);
  if (isError(x)) return x;
  const m = pairs(args[1]!, args[2]!, f);
  if (isError(m)) return m;
  const b = intercept(m);
  return isError(b) ? b : b + (m.sxy / m.sxx) * x;
});

// The probabilities must each be from 0 to 1 and add up to 1 (to within 1e-7, LibreOffice's tolerance); limits given
// high to low are swapped.
const PROBABILITY_SUM_TOLERANCE = 1e-7;

function probability(args: EvalValue[], f: Frame): Value {
  const values = flatValues(arrayArg(args[0]!, f));
  const ps = flatValues(arrayArg(args[1]!, f));
  if (values.length !== ps.length) return err('#N/A', 'The ranges must be the same size');
  const low = numArg(args[2]!, f);
  if (isError(low)) return low;
  const high = opt(args, 3, f, numArg, low);
  if (isError(high)) return high;
  const [lo, hi] = low <= high ? [low, high] : [high, low];
  let total = 0;
  let within = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const p = ps[i];
    if (isError(v)) return v;
    if (isError(p)) return p;
    if (typeof v !== 'number' || typeof p !== 'number')
      return err('#VALUE!', 'Every value and probability must be a number');
    if (p < 0 || p > 1) return err('#VALUE!', 'Each probability must be from 0 to 1');
    total += p;
    if (v >= lo && v <= hi) within += p;
  }
  if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE)
    return err('#VALUE!', 'The probabilities must add up to 1');
  return within;
}

export const PAIRED_FUNCTIONS: Record<string, FnDef> = {
  CORREL: correl,
  PEARSON: correl,
  RSQ: overPairs((m) => {
    const r = correlation(m);
    return isError(r) ? r : r * r;
  }),
  COVAR: covariancePopulation,
  'COVARIANCE.P': covariancePopulation,
  'COVARIANCE.S': overPairs((m) =>
    m.n < 2 ? err('#DIV/0!', 'At least two pairs are needed') : m.sxy / (m.n - 1),
  ),
  SLOPE: overPairs(slope),
  INTERCEPT: overPairs(intercept),
  // Three pairs at least, as LibreOffice asks (#VALUE! below that); y may be flat, x may not.
  STEYX: overPairs((m) => {
    if (m.n < 3) return err('#VALUE!', 'At least three pairs are needed');
    if (m.sxx === 0) return FLAT_X;
    // A perfect fit can leave a residual a rounding below 0.
    return Math.sqrt(Math.max(0, m.syy - (m.sxy * m.sxy) / m.sxx) / (m.n - 2));
  }),
  FORECAST: forecast,
  'FORECAST.LINEAR': forecast,
  PROB: fn(3, 4, probability),
};
