// Counting and series (docs/specs/029-sheets/formulas.md "Functions": Math): COMBIN, COMBINA, FACTDOUBLE,
// MULTINOMIAL, SERIESSUM, SUMSQ, SQRTPI, and the special functions GAMMALN and ERFC.
import { MANY, arrayArg, flatValues, fn, numArg, numFn, numbersOf, type FnDef } from '../fn';
import { erfc, gammaLn } from '../special-functions';
import { err, isError, type Value } from '../values';

const TOO_LARGE = 'The result is too large';
const NEGATIVE = 'The value cannot be negative';

// n choose k, multiplied out in steps that stay whole; Infinity past the largest number.
function choose(n: number, k: number): number {
  const m = Math.min(k, n - k);
  let out = 1;
  for (let i = 1; i <= m; i++) out = (out * (n - m + i)) / i;
  return Math.round(out);
}

function finite(x: number): Value {
  return Number.isFinite(x) ? x : err('#NUM!', TOO_LARGE);
}

function positive(each: (x: number) => number): FnDef {
  return numFn(1, 1, ([x]) => (x! <= 0 ? err('#NUM!', 'The value must be above 0') : each(x!)));
}

export const COMBINATORICS_FUNCTIONS: Record<string, FnDef> = {
  COMBIN: numFn(2, 2, ([a, b]) => {
    const n = Math.trunc(a!);
    const k = Math.trunc(b!);
    if (n < 0 || k < 0 || k > n) return err('#NUM!', 'COMBIN needs 0 ≤ k ≤ n');
    return finite(choose(n, k));
  }),
  // With repetition: (n + k - 1) choose k. COMBINA(0, 0) is 0, as LibreOffice's.
  COMBINA: numFn(2, 2, ([a, b]) => {
    const n = Math.trunc(a!);
    const k = Math.trunc(b!);
    if (n < 0 || k < 0) return err('#NUM!', NEGATIVE);
    if (n === 0) return 0;
    return finite(choose(n + k - 1, k));
  }),
  FACTDOUBLE: numFn(1, 1, ([x]) => {
    const n = Math.trunc(x!);
    if (n < 0) return err('#NUM!', NEGATIVE);
    let out = 1;
    for (let i = n; i > 1; i -= 2) out *= i;
    return finite(out);
  }),
  // (Σn)! / Πn!, as a product of binomials so no factorial overflows on the way.
  MULTINOMIAL: fn(1, MANY, (args, f) => {
    const ns = numbersOf(args, f);
    if (isError(ns)) return ns;
    let total = 0;
    let out = 1;
    for (const x of ns) {
      const n = Math.trunc(x);
      if (n < 0) return err('#NUM!', NEGATIVE);
      total += n;
      out *= choose(total, n);
    }
    return finite(out);
  }),
  // Σ aᵢ·x^(n + i·m) over the coefficients in order.
  SERIESSUM: fn(4, 4, (args, f) => {
    const x = numArg(args[0]!, f);
    const n = numArg(args[1]!, f);
    const m = numArg(args[2]!, f);
    if (isError(x)) return x;
    if (isError(n)) return n;
    if (isError(m)) return m;
    let sum = 0;
    let i = 0;
    for (const a of flatValues(arrayArg(args[3]!, f))) {
      if (isError(a)) return a;
      if (typeof a !== 'number') return err('#VALUE!', 'The coefficients must be numbers');
      sum += a * x ** (n + i * m);
      i++;
    }
    return finite(sum);
  }),
  SUMSQ: fn(1, MANY, (args, f) => {
    const ns = numbersOf(args, f);
    return isError(ns) ? ns : finite(ns.reduce((s, x) => s + x * x, 0));
  }),
  SQRTPI: numFn(1, 1, ([x]) => (x! < 0 ? err('#NUM!', NEGATIVE) : Math.sqrt(x! * Math.PI))),
  GAMMALN: positive(gammaLn),
  'GAMMALN.PRECISE': positive(gammaLn),
  ERFC: numFn(1, 1, ([x]) => erfc(x!)),
  'ERFC.PRECISE': numFn(1, 1, ([x]) => erfc(x!)),
};
