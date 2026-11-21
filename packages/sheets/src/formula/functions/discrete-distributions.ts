// The discrete distributions (docs/specs/029-sheets/formulas.md "Functions": Statistics): binomial and its
// inverse, negative binomial, hypergeometric and Poisson. Counts are truncated to whole numbers.
import { betaRegularized, gammaUpper } from '../distributions';
import type { Frame } from '../../engine/frame';
import { numFn, type FnDef } from '../fn';
import { gammaLn } from '../special-functions';
import { type Value } from '../values';
import { OUT_OF_DOMAIN } from './distribution-args';

// ln C(n, k).
function chooseLn(n: number, k: number): number {
  return gammaLn(n + 1) - gammaLn(k + 1) - gammaLn(n - k + 1);
}

// k ln p, 0 where k is 0 whatever p (0⁰ is 1).
const powerLn = (k: number, p: number): number => (k === 0 ? 0 : k * Math.log(p));

function binomialPmf(k: number, n: number, p: number): number {
  return Math.exp(chooseLn(n, k) + powerLn(k, p) + powerLn(n - k, 1 - p));
}

function binomialCdf(k: number, n: number, p: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += binomialPmf(i, n, p);
  return Math.min(1, sum);
}

const BAD_PROBABILITY = OUT_OF_DOMAIN('The probability must be from 0 to 1');
const outside01 = (p: number): boolean => p < 0 || p > 1;

// Cumulative is needed, as Excel's and OpenFormula's.
const binomial = numFn(4, 4, ([s, t, p, c]) => {
  const k = Math.trunc(s!);
  const n = Math.trunc(t!);
  if (n < 0 || k < 0 || k > n) return OUT_OF_DOMAIN('The successes must be from 0 to the trials');
  if (outside01(p!)) return BAD_PROBABILITY;
  return c ? binomialCdf(k, n, p!) : binomialPmf(k, n, p!);
});

// The chance of s to s2 successes (s alone when s2 is left out).
const binomialRange = numFn(3, 4, ([t, p, a, b = a]) => {
  const n = Math.trunc(t!);
  const s = Math.trunc(a!);
  const s2 = Math.trunc(b!);
  if (s < 0 || s > s2 || s2 > n)
    return OUT_OF_DOMAIN('The successes must run from 0 to the trials');
  if (outside01(p!)) return BAD_PROBABILITY;
  let sum = 0;
  for (let k = s; k <= s2; k++) sum += binomialPmf(k, n, p!);
  return Math.min(1, sum);
});

// The least k whose cumulative binomial probability reaches alpha. Google and Excel take the probability and alpha
// strictly between 0 and 1; OpenFormula's CRITBINOM from 0 to 1 (Part 4 §6.18.19; the file's meaning).
const binomialInverse = (openFormulaName: boolean): FnDef =>
  numFn(3, 3, ([t, p, a], f) => {
    const n = Math.trunc(t!);
    if (n < 0) return OUT_OF_DOMAIN('The trials cannot be negative');
    const ends = openFormulaName && f.meaning === 'openformula';
    const refused = (x: number): boolean => outside01(x) || (!ends && (x === 0 || x === 1));
    if (refused(p!) || refused(a!)) return BAD_PROBABILITY;
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += binomialPmf(k, n, p!);
      if (sum >= a!) return k;
    }
    return n;
  });

// Failures before the s-th success: C(f + s - 1, f) pˢ (1 - p)^f; cumulative, I_p(s, f + 1). NEGBINOM.DIST gives
// the pmf when cumulative is left out; NEGBINOMDIST has no cumulative, as Excel's and OpenFormula's.
const negativeBinomial = (most: number): FnDef =>
  numFn(3, most, ([fails, succ, p, c = 0]) => {
    const f = Math.trunc(fails!);
    const s = Math.trunc(succ!);
    if (f < 0 || s < 1) return OUT_OF_DOMAIN('Failures from 0 and successes from 1 are needed');
    if (outside01(p!)) return BAD_PROBABILITY;
    if (c) return betaRegularized(p!, s, f + 1);
    return Math.exp(chooseLn(f + s - 1, f) + powerLn(s, p!) + powerLn(f, 1 - p!));
  });

// k successes in n draws from N holding K successes, without replacement; the pmf when cumulative is left out.
function hypergeometricPmf(k: number, n: number, K: number, N: number): number {
  return Math.exp(chooseLn(K, k) + chooseLn(N - K, n - k) - chooseLn(N, n));
}

// Google's pmf is COMBIN(K, k) COMBIN(N - K, n - k) / COMBIN(N, n), each COMBIN truncating its own arguments, so a
// fractional count truncates after the subtraction (measured). Excel truncates every argument first (Microsoft's
// help; the file's meaning); OpenFormula leaves the conversion to the application, so HYPGEOMDIST is Google's there
// and HYPGEOM.DIST Excel's.
function truncatesFirst(excelName: boolean, f: Frame): boolean {
  return f.meaning === 'ooxml' || (excelName && f.meaning === 'openformula');
}

const hypergeometric = (excelName: boolean): FnDef =>
  numFn(4, 5, ([a, b, c, d, cumulative = 0], f) => {
    const [k, n, K, N] = [a!, b!, c!, d!].map(Math.trunc) as [number, number, number, number];
    if (k < 0 || n < 0 || K < 0 || n > N || K > N || k > n || k > K || n - k > N - K)
      return OUT_OF_DOMAIN('The counts do not fit the population');
    if (!cumulative)
      return truncatesFirst(excelName, f)
        ? hypergeometricPmf(k, n, K, N)
        : Math.exp(
            chooseLn(K, k) + chooseLn(Math.trunc(d! - c!), Math.trunc(b! - a!)) - chooseLn(N, n),
          );
    let sum = 0;
    for (let i = Math.max(0, n - N + K); i <= k; i++) sum += hypergeometricPmf(i, n, K, N);
    return Math.min(1, sum);
  });

// POISSON is cumulative when that is left out, as OpenFormula's (D38); POISSON.DIST needs it, as Excel's. A mean of
// 0 puts everything at 0, as Google's (measured).
const poisson = (least: number): FnDef =>
  numFn(least, 3, ([x, m, c = 1]): Value => {
    const k = Math.trunc(x!);
    if (k < 0) return OUT_OF_DOMAIN('x cannot be negative');
    if (m! < 0) return OUT_OF_DOMAIN('The mean cannot be negative');
    if (m === 0) return c || k === 0 ? 1 : 0;
    return c ? gammaUpper(k + 1, m!) : Math.exp(k * Math.log(m!) - m! - gammaLn(k + 1));
  });

export const DISCRETE_DISTRIBUTION_FUNCTIONS: Record<string, FnDef> = {
  'BINOM.DIST': binomial,
  BINOMDIST: binomial,
  'BINOM.DIST.RANGE': binomialRange,
  'BINOM.INV': binomialInverse(false),
  CRITBINOM: binomialInverse(true),
  'NEGBINOM.DIST': negativeBinomial(4),
  NEGBINOMDIST: negativeBinomial(3),
  'HYPGEOM.DIST': hypergeometric(true),
  HYPGEOMDIST: hypergeometric(false),
  POISSON: poisson(2),
  'POISSON.DIST': poisson(3),
};
