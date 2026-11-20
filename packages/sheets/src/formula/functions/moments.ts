// The shape of a sample (docs/specs/029-sheets/formulas.md "Functions": Statistics): other means (GEOMEAN, HARMEAN,
// TRIMMEAN, AVERAGE.WEIGHTED), skewness and kurtosis, and the transforms STANDARDIZE, FISHER and FISHERINV.
import type { EvalValue, Frame } from '../../engine/frame';
import { ascending, mean, sumOfSquaredDeviations } from '../descriptive';
import { MANY, arrayArg, flatValues, fn, numArg, numFn, numbersOf, type FnDef } from '../fn';
import { err, isError, type Value } from '../values';

const NONE = 'No numbers to work on';

function overNumbers(each: (ns: number[]) => Value): FnDef {
  return fn(1, MANY, (args, f) => {
    const ns = numbersOf(args, f);
    return isError(ns) ? ns : each(ns);
  });
}

// Σ ((n - mean) / spread)^power over the numbers.
function standardisedSum(ns: number[], spread: number, power: number): number {
  const m = mean(ns);
  let s = 0;
  for (const n of ns) s += ((n - m) / spread) ** power;
  return s;
}

const FLAT = err('#DIV/0!', 'Every number is the same');

// A sample's skewness, n / ((n - 1)(n - 2)) · Σ z³ with the sample's spread; the population's, Σ z³ / n with its own.
function skewness(ns: number[], sample: boolean): Value {
  const n = ns.length;
  if (n < (sample ? 3 : 2)) return err('#DIV/0!', `At least ${sample ? 3 : 2} numbers are needed`);
  const spread = Math.sqrt(sumOfSquaredDeviations(ns) / (sample ? n - 1 : n));
  if (spread === 0) return FLAT;
  const cubes = standardisedSum(ns, spread, 3);
  return sample ? (n / ((n - 1) * (n - 2))) * cubes : cubes / n;
}

// Excess kurtosis of a sample, as Excel and OpenFormula define it; it needs four numbers.
function kurtosis(ns: number[]): Value {
  const n = ns.length;
  if (n < 4) return err('#DIV/0!', 'At least 4 numbers are needed');
  const spread = Math.sqrt(sumOfSquaredDeviations(ns) / (n - 1));
  if (spread === 0) return FLAT;
  const d = (n - 2) * (n - 3);
  return ((n * (n + 1)) / ((n - 1) * d)) * standardisedSum(ns, spread, 4) - (3 * (n - 1) ** 2) / d;
}

// The values and weights of AVERAGE.WEIGHTED, pair by pair: each pair of ranges the same size, a value counted where
// it and its weight are both numbers; a negative weight is #NUM!, no positive one #DIV/0! (default, D56).
function weightedAverage(args: EvalValue[], f: Frame): Value {
  if (args.length % 2 !== 0) return err('#N/A', 'Each value needs its weight');
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < args.length; i += 2) {
    const values = flatValues(arrayArg(args[i]!, f));
    const ws = flatValues(arrayArg(args[i + 1]!, f));
    if (values.length !== ws.length)
      return err('#VALUE!', 'Values and weights must be the same size');
    for (let j = 0; j < values.length; j++) {
      const v = values[j];
      const w = ws[j];
      if (isError(v)) return v;
      if (isError(w)) return w;
      if (typeof v !== 'number' || typeof w !== 'number') continue;
      if (w < 0) return err('#NUM!', 'A weight cannot be negative');
      sum += v * w;
      weights += w;
    }
  }
  return weights === 0 ? err('#DIV/0!', 'At least one weight must be positive') : sum / weights;
}

function trimmedMean(data: number[], proportion: number): Value {
  if (proportion < 0 || proportion >= 1)
    return err('#NUM!', 'The proportion must be from 0 to below 1');
  if (data.length === 0) return err('#NUM!', NONE);
  // As many from each end as half the proportion's share, rounded down to a whole pair.
  const cut = Math.floor(Math.floor(proportion * data.length) / 2);
  return mean(ascending(data).slice(cut, data.length - cut));
}

export const MOMENT_FUNCTIONS: Record<string, FnDef> = {
  // A zero makes the product 0; a negative number has no real root of every order.
  GEOMEAN: overNumbers((ns) => {
    if (ns.length === 0) return err('#NUM!', NONE);
    if (ns.some((n) => n < 0)) return err('#NUM!', 'GEOMEAN takes no negative numbers');
    if (ns.includes(0)) return 0;
    let logs = 0;
    for (const n of ns) logs += Math.log(n);
    return Math.exp(logs / ns.length);
  }),
  HARMEAN: overNumbers((ns) => {
    if (ns.length === 0) return err('#NUM!', NONE);
    if (ns.some((n) => n <= 0)) return err('#NUM!', 'HARMEAN takes only numbers above 0');
    let s = 0;
    for (const n of ns) s += 1 / n;
    return ns.length / s;
  }),
  KURT: overNumbers(kurtosis),
  SKEW: overNumbers((ns) => skewness(ns, true)),
  'SKEW.P': overNumbers((ns) => skewness(ns, false)),
  TRIMMEAN: fn(2, 2, (args, f) => {
    const ns = numbersOf([args[0]!], f);
    if (isError(ns)) return ns;
    const p = numArg(args[1]!, f);
    return isError(p) ? p : trimmedMean(ns, p);
  }),
  'AVERAGE.WEIGHTED': fn(2, MANY, weightedAverage),
  // A spread of 0 divides by zero; a negative one is no spread (LibreOffice's answers).
  STANDARDIZE: numFn(3, 3, ([x, m, sd]) => {
    if (sd! < 0) return err('#NUM!', 'The standard deviation cannot be negative');
    if (sd === 0) return err('#DIV/0!');
    return (x! - m!) / sd!;
  }),
  FISHER: numFn(1, 1, ([x]) =>
    Math.abs(x!) >= 1 ? err('#NUM!', 'FISHER takes values between -1 and 1') : Math.atanh(x!),
  ),
  FISHERINV: numFn(1, 1, ([y]) => Math.tanh(y!)),
};
