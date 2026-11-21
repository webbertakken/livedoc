// How the distribution functions read their arguments (docs/specs/029-sheets/formulas.md "Functions": Statistics):
// degrees of freedom truncated to whole numbers from 1 to 10^10, probabilities strictly or inclusively between 0 and
// 1, and positive parameters; each refusal is #NUM!.
import { err, type SheetError } from '../values';

// Google's help: degrees of freedom "may not exceed 10^10".
export const DEGREES_OF_FREEDOM_MAX = 1e10;

export const OUT_OF_DOMAIN = (what: string): SheetError => err('#NUM!', what);

/** Degrees of freedom: truncated, from 1 to 10^10. */
export function degrees(x: number): number | SheetError {
  const n = Math.trunc(x);
  return n < 1 || n > DEGREES_OF_FREEDOM_MAX
    ? OUT_OF_DOMAIN('Degrees of freedom must be from 1 to 10^10')
    : n;
}

/** A probability strictly between 0 and 1, as Google asks of an inverse over the whole line (NORM.INV, T.INV). */
export function openProbability(p: number): number | SheetError {
  return p <= 0 || p >= 1 ? OUT_OF_DOMAIN('The probability must be between 0 and 1') : p;
}

// An inverse over [0, ∞) answers at the end whose x is 0 and refuses the other, whose x is infinite (Google's,
// measured): a lower tail's probability from 0 to below 1, an upper tail's from above 0 to 1.
const NO_PROBABILITY = OUT_OF_DOMAIN(
  'The probability must be from 0 to below 1, or above 0 to 1 for an upper tail',
);

/** A lower tail's probability, from 0 (whose x is 0) to below 1. */
export function lowerTailProbability(p: number): number | SheetError {
  return p < 0 || p >= 1 ? NO_PROBABILITY : p;
}

/** An upper tail's probability, from above 0 to 1 (whose x is 0). */
export function upperTailProbability(p: number): number | SheetError {
  return p <= 0 || p > 1 ? NO_PROBABILITY : p;
}

/** A parameter that must be above 0 (a scale, a shape, a standard deviation). */
export function positive(x: number, name: string): number | SheetError {
  return x > 0 ? x : OUT_OF_DOMAIN(`${name} must be above 0`);
}
