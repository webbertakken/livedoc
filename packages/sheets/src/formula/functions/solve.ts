// Root finding for the finance functions (RATE, IRR, YIELD): where a cash flow's value crosses zero.

/** Newton's method from `guess`, up to 100 steps; null when it does not settle. */
export function solve(f: (x: number) => number, guess: number): number | null {
  let x = guess;
  for (let i = 0; i < 100; i++) {
    const y = f(x);
    if (Math.abs(y) < 1e-10) return x;
    const h = 1e-7 * Math.max(1, Math.abs(x));
    const d = (f(x + h) - y) / h;
    if (d === 0 || !Number.isFinite(d)) return null;
    const next = x - y / d;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - x) < 1e-12) return next;
    x = next;
  }
  return null;
}

/**
 * Bisection on a falling function between `low` and a `high` doubled until it brackets the root, to the last bit;
 * null when no bracket is found.
 */
export function bisectFalling(f: (x: number) => number, low: number, high: number): number | null {
  let hi = high;
  for (let i = 0; f(hi) > 0; i++) {
    if (i === 60) return null;
    hi *= 2;
  }
  let lo = low;
  if (f(lo) < 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
