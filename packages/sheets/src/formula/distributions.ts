// The probability distributions the spreadsheet functions share (docs/specs/029-sheets/formulas.md "Functions":
// Statistics): the normal and its inverse, the gamma function, the regularized incomplete gamma and beta functions,
// and a root finder that inverts any of them. Each tail is worked out on its own so a small one keeps its digits.
import { erfc, gammaLn } from './special-functions';

const SQRT_2PI = Math.sqrt(2 * Math.PI);

export function normalPdf(z: number): number {
  return Math.exp((-z * z) / 2) / SQRT_2PI;
}

/** P(Z ≤ z) for the standard normal. */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

// Wichura's AS 241 (PPND16), rational approximations good to about 1e-16, for the centre and the two tails.
const CENTRE_A = [
  3.387132872796366608, 133.14166789178437745, 1971.5909503065514427, 13731.693765509461125,
  45921.953931549871457, 67265.770927008700853, 33430.575583588128105, 2509.0809287301226727,
];
const CENTRE_B = [
  1, 42.313330701600911252, 687.1870074920579083, 5394.1960214247511077, 21213.794301586595867,
  39307.89580009271061, 28729.085735721942674, 5226.495278852545925,
];
const NEAR_A = [
  1.42343711074968357734, 4.6303378461565452959, 5.7694972214606914055, 3.64784832476320460504,
  1.27045825245236838258, 0.24178072517745061177, 0.0227238449892691845833, 7.7454501427834140764e-4,
];
const NEAR_B = [
  1, 2.05319162663775882187, 1.6763848301838038494, 0.68976733498510000455, 0.14810397642748007459,
  0.0151986665636164571966, 5.475938084995344946e-4, 1.05075007164441684324e-9,
];
const FAR_A = [
  6.6579046435011037772, 5.4637849111641143699, 1.7848265399172913358, 0.29656057182850489123,
  0.026532189526576123093, 0.0012426609473880784386, 2.71155556874348757815e-5,
  2.01033439929228813265e-7,
];
const FAR_B = [
  1, 0.59983220655588793769, 0.13692988092273580531, 0.0148753612908506148525,
  7.868691311456132591e-4, 1.8463183175100546818e-5, 1.4215117583164458887e-7,
  2.04426310338993978564e-15,
];

function polynomial(coefficients: readonly number[], r: number): number {
  let out = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) out = out * r + coefficients[i]!;
  return out;
}

/** The z with P(Z ≤ z) = p, for 0 < p < 1. */
export function normalInverse(p: number): number {
  const q = p - 0.5;
  let z: number;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    z = (q * polynomial(CENTRE_A, r)) / polynomial(CENTRE_B, r);
  } else {
    let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
    if (r <= 5) {
      r -= 1.6;
      z = polynomial(NEAR_A, r) / polynomial(NEAR_B, r);
    } else {
      r -= 5;
      z = polynomial(FAR_A, r) / polynomial(FAR_B, r);
    }
    if (q < 0) z = -z;
  }
  // One Newton step against the normal itself polishes the last digits.
  const tail = q < 0 ? normalCdf(z) - p : 1 - p - normalCdf(-z);
  return z - tail / normalPdf(z);
}

/** Γ(x): exact for whole numbers to 170, by reflection below 0.5; NaN at 0 and the negative whole numbers. */
export function gamma(x: number): number {
  if (Number.isInteger(x)) {
    if (x <= 0) return Number.NaN;
    let out = 1;
    for (let i = 2; i < x; i++) out *= i;
    return out;
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  return Math.exp(gammaLn(x));
}

const ITERATIONS_MAX = 1000;
const CONVERGED = 1e-16;
const TINY = 1e-300;

// x^a e^(-x) / Γ(a), the factor both gamma tails share.
function gammaFactor(a: number, x: number): number {
  return Math.exp(a * Math.log(x) - x - gammaLn(a));
}

// P(a, x) by its series, for x < a + 1.
function lowerGammaSeries(a: number, x: number): number {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < ITERATIONS_MAX; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * CONVERGED) break;
  }
  return sum * gammaFactor(a, x);
}

// Q(a, x) by its continued fraction (Lentz's method), for x ≥ a + 1.
function upperGammaFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let n = 1; n < ITERATIONS_MAX; n++) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < CONVERGED) break;
  }
  return h * gammaFactor(a, x);
}

/** The regularized lower incomplete gamma function P(a, x), for a > 0 and x ≥ 0. */
export function gammaLower(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? lowerGammaSeries(a, x) : 1 - upperGammaFraction(a, x);
}

/** The regularized upper incomplete gamma function Q(a, x) = 1 - P(a, x). */
export function gammaUpper(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - lowerGammaSeries(a, x) : upperGammaFraction(a, x);
}

// The continued fraction of the incomplete beta function (Lentz's method), for x below (a + 1) / (a + b + 2).
function betaFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < ITERATIONS_MAX; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < CONVERGED) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b), for a, b > 0 and 0 ≤ x ≤ 1. */
export function betaRegularized(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    gammaLn(a + b) - gammaLn(a) - gammaLn(b) + a * Math.log(x) + b * Math.log1p(-x),
  );
  if (x < (a + 1) / (a + b + 2)) return (factor * betaFraction(x, a, b)) / a;
  return 1 - (factor * betaFraction(1 - x, b, a)) / b;
}

/** Student's t with v degrees of freedom: the chance of exceeding t ≥ 0. */
export function studentUpper(t: number, v: number): number {
  return 0.5 * betaRegularized(v / (v + t * t), v / 2, 0.5);
}

/** F(d1, d2): the chance of falling below x ≥ 0, and of exceeding it. */
export function fisherLower(x: number, d1: number, d2: number): number {
  return betaRegularized((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
}

export function fisherUpper(x: number, d1: number, d2: number): number {
  return betaRegularized(d2 / (d2 + d1 * x), d2 / 2, d1 / 2);
}

/** ln B(a, b). */
export function betaLn(a: number, b: number): number {
  return gammaLn(a) + gammaLn(b) - gammaLn(a + b);
}

const BRACKET_STEPS_MAX = 2000;
const BISECTIONS_MAX = 200;

/**
 * The x ≥ `from` where an increasing function reaches `target`, found by bracketing upward from `from` and halving.
 * `rising` is the distribution's lower tail; the caller gives its upper tail instead (falling) when the target is
 * nearer 1, so neither ever subtracts from 1. `to` closes the bracket where the support ends (Infinity if never).
 */
export function invert(
  tail: (x: number) => number,
  target: number,
  rising: boolean,
  from: number,
  to: number,
): number {
  const below = (x: number): boolean => (rising ? tail(x) < target : tail(x) > target);
  let lo = from;
  let hi = Number.isFinite(to) ? to : Math.max(1, from + 1);
  for (let i = 0; i < BRACKET_STEPS_MAX && !Number.isFinite(to) && below(hi); i++) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < BISECTIONS_MAX; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (below(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
