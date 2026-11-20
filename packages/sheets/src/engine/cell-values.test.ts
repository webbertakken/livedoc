// formulas.md "Recalculation": worked-out values held by cell number in typed columns.
import { describe, expect, it } from 'vitest';
import { err, type Value } from '../formula/values';
import { CellValues } from './cell-values';

describe('CellValues', () => {
  it('gives back every kind of value as it was set', () => {
    const vals = new CellValues();
    const kept: Value[] = [1.5, -0, true, false, null, 'text', err('#N/A'), { rows: [[1, 2]] }];
    kept.forEach((v, i) => vals.set(i + 1, v));
    kept.forEach((v, i) => expect(vals.get(i + 1)).toEqual(v));
    expect(vals.get(99)).toBeUndefined();
    expect(vals.get(100_000)).toBeUndefined();
    expect(vals.has(100_000)).toBe(false);
  });

  it('forgets a value, and a value set over text drops the text', () => {
    const vals = new CellValues();
    vals.set(3, 'text');
    vals.set(3, 7);
    expect(vals.get(3)).toBe(7);
    vals.set(4, 'more');
    expect(vals.delete(4)).toBe(true);
    expect(vals.delete(4)).toBe(false);
    expect(vals.has(4)).toBe(false);
    expect(vals.get(4)).toBeUndefined();
  });

  it('grows to any cell number', () => {
    const vals = new CellValues();
    vals.set(5_000, 2);
    vals.set(10, 'x');
    expect(vals.get(5_000)).toBe(2);
    expect(vals.get(10)).toBe('x');
  });
});
