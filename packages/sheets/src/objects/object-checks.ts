// The checks every kind of sheet object's validation shares (sheet-objects.ts, sheet-pivot.ts): plain records with only
// their own keys, numbers within bounds, short text, and ranges by axis ids.
import { isAxisId } from '../ids';
import type { IdRange } from '../sheet';

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export const onlyKeys = (x: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(x).every((k) => keys.includes(k));

export const inRange = (n: unknown, lo: number, hi: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

export const textUpTo = (x: unknown, max: number) =>
  x === undefined || (typeof x === 'string' && x.length <= max);

export function isIdRange(x: unknown): x is IdRange {
  return (
    isRecord(x) && onlyKeys(x, ['r1', 'c1', 'r2', 'c2']) && [x.r1, x.c1, x.r2, x.c2].every(isAxisId)
  );
}
