// Special functions the spreadsheet functions share (docs/specs/029-sheets/formulas.md "Functions": Math, and
// Statistical's distributions): the log-gamma function and the error functions, to about 15 significant digits.

// Lanczos's approximation with g = 7 and nine coefficients (Godfrey's), accurate to about 1e-15 for x ≥ 0.5.
const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0. */
export function gammaLn(x: number): number {
  // Γ(x) = Γ(x + 1) / x keeps the series in its accurate range below 0.5.
  if (x < 0.5) return gammaLn(x + 1) - Math.log(x);
  const z = x - 1;
  let sum = LANCZOS[0]!;
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i]! / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

// Below this the Maclaurin series of erf converges fast and loses little to cancellation; from it on, the continued
// fraction of erfc does.
const ERF_SERIES_MAX = 2;
const SERIES_TERMS_MAX = 100;
const FRACTION_TERMS_MAX = 300;
const CONVERGED = 1e-17;

// erf(x) = 2/√π · Σ (-1)ⁿ x²ⁿ⁺¹ / (n! (2n + 1)).
function erfSeries(x: number): number {
  let term = x;
  let sum = x;
  const x2 = x * x;
  for (let n = 1; n < SERIES_TERMS_MAX; n++) {
    term *= -x2 / n;
    const next = term / (2 * n + 1);
    sum += next;
    if (Math.abs(next) < CONVERGED * Math.abs(sum)) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

// erfc(x) = e^(-x²)/√π · 1/(x + (1/2)/(x + 1/(x + (3/2)/(x + ...)))), worked by Lentz's method. From x ≥ 2 on
// every partial denominator is at least x, so none comes near zero and Lentz's guard against it is not needed.
function erfcFraction(x: number): number {
  let f = x;
  let c = x;
  let d = 0;
  for (let n = 1; n < FRACTION_TERMS_MAX; n++) {
    const a = n / 2;
    d = 1 / (x + a * d);
    c = x + a / c;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < CONVERGED) break;
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}

/** The complementary error function, 1 - erf(x). */
export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  return x < ERF_SERIES_MAX ? 1 - erfSeries(x) : erfcFraction(x);
}

/** The error function. */
export function erf(x: number): number {
  if (Math.abs(x) < ERF_SERIES_MAX) return erfSeries(x);
  return x > 0 ? 1 - erfcFraction(x) : erfcFraction(-x) - 1;
}
