// Tests and intervals (docs/specs/029-sheets/formulas.md "Functions": Statistics): the chi-squared, F, t and z
// tests' p-values, and the confidence intervals CONFIDENCE, CONFIDENCE.T and MARGINOFERROR.
import type { EvalValue, Frame } from '../../engine/frame';
import { mean, sumOfSquaredDeviations } from '../descriptive';
import {
  fisherUpper,
  gammaUpper,
  invert,
  normalCdf,
  normalInverse,
  studentUpper,
} from '../distributions';
import { arrayArg, flatValues, fn, numArg, numFn, numbersOf, opt, type FnDef } from '../fn';
import { err, isError, type Scalar, type SheetError, type Value } from '../values';
import { OUT_OF_DOMAIN } from './distribution-args';

const sampleVariance = (ns: number[]): number => sumOfSquaredDeviations(ns) / (ns.length - 1);

// Two ranges read cell by cell, errors the answer.
function cells(a: EvalValue, b: EvalValue, f: Frame): [Scalar[], Scalar[]] | SheetError {
  const xs = flatValues(arrayArg(a, f));
  const ys = flatValues(arrayArg(b, f));
  for (const v of [...xs, ...ys]) if (isError(v)) return v;
  return [xs, ys];
}

// Observed against expected counts: Σ (o - e)² / e over the pairs of numbers, with (rows - 1)(columns - 1) degrees
// of freedom, or one fewer than the count for a single row or column.
function chiTest(args: EvalValue[], f: Frame): Value {
  const observed = arrayArg(args[0]!, f);
  const expected = arrayArg(args[1]!, f);
  const rows = observed.rows.length;
  const cols = observed.rows[0]?.length ?? 0;
  if (rows !== expected.rows.length || cols !== (expected.rows[0]?.length ?? 0))
    return err('#N/A', 'The ranges must be the same size');
  const read = cells(args[0]!, args[1]!, f);
  if (isError(read)) return read;
  const [os, es] = read;
  let stat = 0;
  for (let i = 0; i < os.length; i++) {
    const o = os[i];
    const e = es[i];
    if (typeof o !== 'number' || typeof e !== 'number') continue;
    if (e === 0) return err('#DIV/0!', 'An expected count is 0');
    stat += (o - e) ** 2 / e;
  }
  const df = rows > 1 && cols > 1 ? (rows - 1) * (cols - 1) : rows * cols - 1;
  if (df < 1) return OUT_OF_DOMAIN('At least two counts are needed');
  return gammaUpper(df / 2, stat / 2);
}

// Two-tailed: twice the smaller tail of the ratio of the sample variances; each sample needs two numbers and some
// spread (#VALUE! else, as LibreOffice answers).
function fTest(args: EvalValue[], f: Frame): Value {
  const a = numbersOf([args[0]!], f);
  if (isError(a)) return a;
  const b = numbersOf([args[1]!], f);
  if (isError(b)) return b;
  if (a.length < 2 || b.length < 2) return err('#VALUE!', 'Each sample needs two numbers');
  const va = sampleVariance(a);
  const vb = sampleVariance(b);
  if (va === 0 || vb === 0) return err('#VALUE!', 'A sample has no spread');
  const upper = fisherUpper(va / vb, a.length - 1, b.length - 1);
  return 2 * Math.min(upper, 1 - upper);
}

// The t statistic and its degrees of freedom: paired (type 1), pooled variance (2) or Welch's (3).
function tStatistic(xs: Scalar[], ys: Scalar[], type: number): [number, number] | SheetError {
  if (type === 1) {
    if (xs.length !== ys.length) return err('#N/A', 'Paired samples must be the same size');
    const d: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const y = ys[i];
      if (typeof x === 'number' && typeof y === 'number') d.push(x - y);
    }
    if (d.length < 2) return err('#DIV/0!', 'At least two pairs are needed');
    const sd = Math.sqrt(sampleVariance(d) / d.length);
    return sd === 0 ? err('#DIV/0!', 'The differences have no spread') : [mean(d) / sd, d.length - 1];
  }
  const a = xs.filter((x): x is number => typeof x === 'number');
  const b = ys.filter((y): y is number => typeof y === 'number');
  if (a.length < 2 || b.length < 2) return err('#DIV/0!', 'Each sample needs two numbers');
  const [na, nb] = [a.length, b.length];
  const [va, vb] = [sampleVariance(a), sampleVariance(b)];
  const diff = mean(a) - mean(b);
  if (type === 2) {
    const pooled = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
    const se = Math.sqrt(pooled * (1 / na + 1 / nb));
    return se === 0 ? err('#DIV/0!', 'The samples have no spread') : [diff / se, na + nb - 2];
  }
  const [sa, sb] = [va / na, vb / nb];
  if (sa + sb === 0) return err('#DIV/0!', 'The samples have no spread');
  const df = (sa + sb) ** 2 / (sa ** 2 / (na - 1) + sb ** 2 / (nb - 1));
  return [diff / Math.sqrt(sa + sb), df];
}

function tTest(args: EvalValue[], f: Frame): Value {
  const tails = numArg(args[2]!, f);
  if (isError(tails)) return tails;
  const type = numArg(args[3]!, f);
  if (isError(type)) return type;
  const k = Math.trunc(tails);
  const kind = Math.trunc(type);
  if (k !== 1 && k !== 2) return OUT_OF_DOMAIN('tails is 1 or 2');
  if (kind < 1 || kind > 3) return OUT_OF_DOMAIN('type is 1, 2 or 3');
  const read = cells(args[0]!, args[1]!, f);
  if (isError(read)) return read;
  const stat = tStatistic(read[0], read[1], kind);
  if (isError(stat)) return stat;
  return k * studentUpper(Math.abs(stat[0]), stat[1]);
}

// One-tailed: the chance a sample's mean lies above the data's, given value as the mean and the data's own standard
// deviation unless one is given.
function zTest(args: EvalValue[], f: Frame): Value {
  const ns = numbersOf([args[0]!], f);
  if (isError(ns)) return ns;
  const mu = numArg(args[1]!, f);
  if (isError(mu)) return mu;
  const given = opt<number | null>(args, 2, f, numArg, null);
  if (isError(given)) return given;
  if (given !== null && given <= 0) return OUT_OF_DOMAIN('The standard deviation must be above 0');
  if (ns.length === 0) return err('#N/A', 'No numbers to test');
  const sd = given ?? (ns.length < 2 ? 0 : Math.sqrt(sampleVariance(ns)));
  if (sd === 0) return err('#DIV/0!', 'The data has no spread');
  return 1 - normalCdf((mean(ns) - mu) / (sd / Math.sqrt(ns.length)));
}

// Half the width of a confidence interval: the two-sided critical value times σ / √n, n truncated.
function interval(alpha: number, sd: number, size: number, critical: (n: number) => number): Value {
  const n = Math.trunc(size);
  if (alpha <= 0 || alpha >= 1) return OUT_OF_DOMAIN('alpha must be between 0 and 1');
  if (sd <= 0) return OUT_OF_DOMAIN('The standard deviation must be above 0');
  if (n < 1) return OUT_OF_DOMAIN('The size must be at least 1');
  return (critical(n) * sd) / Math.sqrt(n);
}

const normalInterval = numFn(3, 3, ([a, s, n]) => interval(a!, s!, n!, () => -normalInverse(a! / 2)));

// Student's t needs two values: one leaves no degree of freedom.
function tInterval(alpha: number, sd: number, size: number): Value {
  if (Math.trunc(size) === 1) return err('#DIV/0!', 'At least two values are needed');
  return interval(alpha, sd, size, (n) =>
    invert((t) => studentUpper(t, n - 1), alpha / 2, false, 0, Infinity),
  );
}

export const TEST_FUNCTIONS: Record<string, FnDef> = {
  'CHISQ.TEST': fn(2, 2, chiTest),
  CHITEST: fn(2, 2, chiTest),
  'F.TEST': fn(2, 2, fTest),
  FTEST: fn(2, 2, fTest),
  'T.TEST': fn(4, 4, tTest),
  TTEST: fn(4, 4, tTest),
  'Z.TEST': fn(2, 3, zTest),
  ZTEST: fn(2, 3, zTest),
  CONFIDENCE: normalInterval,
  'CONFIDENCE.NORM': normalInterval,
  'CONFIDENCE.T': numFn(3, 3, ([a, s, n]) => tInterval(a!, s!, n!)),
  // Google's help: CONFIDENCE.T(1 - confidence, STDEV(range), COUNT(range)).
  MARGINOFERROR: fn(2, 2, (args, f) => {
    const ns = numbersOf([args[0]!], f);
    if (isError(ns)) return ns;
    const confidence = numArg(args[1]!, f);
    if (isError(confidence)) return confidence;
    if (ns.length < 2) return err('#DIV/0!', 'At least two values are needed');
    return tInterval(1 - confidence, Math.sqrt(sampleVariance(ns)), ns.length);
  }),
};
