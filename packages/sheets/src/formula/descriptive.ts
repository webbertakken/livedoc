// The arithmetic of descriptive statistics the spreadsheet functions share (docs/specs/029-sheets/formulas.md
// "Functions": Statistics): means, sums of squared deviations, percentiles and percentage ranks of plain numbers.

export function mean(ns: readonly number[]): number {
  let s = 0;
  for (const n of ns) s += n;
  return s / ns.length;
}

/** Σ (n - mean)², worked about the mean so large values keep their digits. */
export function sumOfSquaredDeviations(ns: readonly number[]): number {
  const m = mean(ns);
  let s = 0;
  for (const n of ns) s += (n - m) ** 2;
  return s;
}

/** The numbers in ascending order, a copy. */
export function ascending(ns: readonly number[]): number[] {
  return [...ns].sort((a, b) => a - b);
}

/** The value at fraction k (0 to 1) of sorted numbers, between the nearest two (Excel's PERCENTILE.INC). */
export function percentileInclusive(sorted: readonly number[], k: number): number {
  const pos = (sorted.length - 1) * k;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The value at fraction k of sorted numbers counted from 1 to n over n + 1; null outside them (PERCENTILE.EXC). */
export function percentileExclusive(sorted: readonly number[], k: number): number | null {
  const rank = k * (sorted.length + 1);
  if (rank < 1 || rank > sorted.length) return null;
  const lo = Math.floor(rank);
  const below = sorted[lo - 1]!;
  return lo === sorted.length ? below : below + (sorted[lo]! - below) * (rank - lo);
}

/**
 * Where v falls among sorted numbers, from 0 to 1 (inclusive: the least is 0, the greatest 1) or between them
 * (exclusive: positions 1 to n over n + 1), between two neighbours by straight line; v lies within the numbers.
 */
export function percentRank(sorted: readonly number[], v: number, inclusive: boolean): number {
  const n = sorted.length;
  if (n === 1) return 1;
  // How many numbers lie below v, and whether v is one of them.
  let below = 0;
  while (sorted[below]! < v) below++;
  const at = below + (sorted[below] === v ? 0 : -1);
  const fraction = sorted[below] === v ? 0 : (v - sorted[at]!) / (sorted[below]! - sorted[at]!);
  const position = at + fraction;
  return inclusive ? position / (n - 1) : (position + 1) / (n + 1);
}

/** x rounded to `digits` significant digits; 0 stays 0. */
export function roundSignificant(x: number, digits: number): number {
  if (x === 0) return 0;
  const scale = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(x))));
  return Math.round(x * scale) / scale;
}
