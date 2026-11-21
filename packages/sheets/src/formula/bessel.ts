// Bessel functions of whole order (docs/specs/029-sheets/formulas.md "Functions": Engineering). J comes from
// Miller's backward recurrence, normalised by J₀ + 2ΣJ₂ₖ = 1; Y from Neumann's series over those J; I from its
// power series; K from its integral ∫₀^∞ e^(−x cosh t) cosh(nt) dt by the trapezoid rule, which converges fast for it.

const EULER_GAMMA = 0.5772156649015329;
// Past this many terms of the recurrence the leading term of the large-x expansion is used instead.
const RECURRENCE_TERMS_MAX = 2_000_000;
const RESCALE_ABOVE = 1e250;

// Where to start the recurrence: far enough above both the order and x that the terms there are negligible.
function startOrder(top: number, x: number): number {
  const reach = Math.max(top, Math.ceil(x));
  const start = reach + 30 + Math.ceil(4 * Math.sqrt(reach));
  return start + (start % 2);
}

/** J₀(x) … J_m(x) for x > 0 (m is where the recurrence started), or null where x is too large for it. */
function besselJSequence(x: number, top: number): number[] | null {
  const start = startOrder(top, x);
  if (start > RECURRENCE_TERMS_MAX) return null;
  const j = new Array<number>(start + 2).fill(0);
  j[start] = 1;
  for (let k = start; k >= 1; k--) {
    j[k - 1] = ((2 * k) / x) * j[k]! - j[k + 1]!;
    if (Math.abs(j[k - 1]!) > RESCALE_ABOVE)
      for (let i = k - 1; i <= start; i++) j[i] = j[i]! / RESCALE_ABOVE;
  }
  let norm = j[0]!;
  for (let k = 2; k <= start; k += 2) norm += 2 * j[k]!;
  return j.map((v) => v / norm);
}

// The leading term of the large-x expansion: √(2/(πx)) cos or sin of x − nπ/2 − π/4.
function farField(n: number, x: number, sine: boolean): number {
  const phase = x - (n * Math.PI) / 2 - Math.PI / 4;
  return Math.sqrt(2 / (Math.PI * x)) * (sine ? Math.sin(phase) : Math.cos(phase));
}

/** Jₙ(x), n ≥ 0 whole. */
export function besselJ(n: number, x: number): number {
  if (x === 0) return n === 0 ? 1 : 0;
  const sign = x < 0 && n % 2 === 1 ? -1 : 1;
  const ax = Math.abs(x);
  const j = besselJSequence(ax, n);
  return sign * (j ? j[n]! : farField(n, ax, false));
}

/** Yₙ(x), n ≥ 0 whole, x > 0. */
export function besselY(n: number, x: number): number {
  const j = besselJSequence(x, 1);
  if (!j) return farField(n, x, true);
  const log = Math.log(x / 2) + EULER_GAMMA;
  let s0 = 0;
  let s1 = 0;
  for (let k = 1; 2 * k + 1 < j.length; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    s0 += (sign * j[2 * k]!) / k;
    s1 += (sign * (j[2 * k - 1]! - j[2 * k + 1]!)) / (2 * k);
  }
  let below = (2 / Math.PI) * log * j[0]! - (4 / Math.PI) * s0;
  let y = -(2 / Math.PI) * (j[0]! / x - log * j[1]!) + (4 / Math.PI) * s1;
  if (n === 0) return below;
  for (let k = 1; k < n; k++) [below, y] = [y, ((2 * k) / x) * y - below];
  return y;
}

const SERIES_TERMS_MAX = 10_000;
const CONVERGED = 1e-17;

/** Iₙ(x), n ≥ 0 whole: Σ (x/2)^(n+2k) / (k! (n+k)!). */
export function besselI(n: number, x: number): number {
  const half = x / 2;
  let term = 1;
  for (let k = 1; k <= n; k++) term *= half / k;
  let sum = term;
  for (let k = 1; k < SERIES_TERMS_MAX && term !== 0; k++) {
    term *= (half * half) / (k * (n + k));
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * CONVERGED) break;
  }
  return sum;
}

const STEP = 0.02;
const NEGLIGIBLE = 1e-18;

/** Kₙ(x), n ≥ 0 whole, x > 0. */
export function besselK(n: number, x: number): number {
  let sum = Math.exp(-x) / 2;
  for (let i = 1; ; i++) {
    const t = i * STEP;
    const term = Math.exp(n * t - x * Math.cosh(t)) / 2 + Math.exp(-n * t - x * Math.cosh(t)) / 2;
    sum += term;
    // Past the peak the terms only fall.
    if (term < sum * NEGLIGIBLE && x * Math.sinh(t) > n) break;
  }
  return sum * STEP;
}
