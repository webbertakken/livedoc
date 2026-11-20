// formulas.md "Recalculation": the engine holds its cells by number, found by sheet and position.
import { describe, expect, it } from 'vitest';
import { CellNumbers, grownInt32, NO_CELL } from './cell-numbers';

describe('CellNumbers', () => {
  it('gives each cell one number, from 1, and finds it again by sheet and position', () => {
    const nos = new CellNumbers();
    const one = nos.sheetNo('one');
    const two = nos.sheetNo('two');
    expect(nos.sheetNo('one')).toBe(one);
    const a = nos.intern(one, 0, 0);
    const b = nos.intern(two, 0, 0);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(nos.intern(one, 0, 0)).toBe(a);
    expect(nos.find(two, 0, 0)).toBe(b);
    expect(nos.find(one, 5, 5)).toBe(NO_CELL);
    expect([nos.sheetIdOf(b), nos.sheetNoOf(b), nos.rowOf(b), nos.colOf(b)]).toEqual([
      'two',
      two,
      0,
      0,
    ]);
    expect(nos.size).toBe(3);
  });

  it('keeps every number as its table grows', () => {
    const nos = new CellNumbers();
    const sheet = nos.sheetNo('s');
    for (let r = 0; r < 5_000; r++) nos.intern(sheet, r, r % 7);
    for (let r = 0; r < 5_000; r++) expect(nos.find(sheet, r, r % 7)).toBe(r + 1);
    expect(nos.find(sheet, 5_000, 0)).toBe(NO_CELL);
  });
});

describe('grownInt32', () => {
  it('keeps an array with room, and doubles one without, keeping what it held', () => {
    const arr = new Int32Array([1, 2]);
    expect(grownInt32(arr, 1)).toBe(arr);
    const grown = grownInt32(arr, 5);
    expect([...grown]).toEqual([1, 2, 0, 0, 0, 0, 0, 0]);
  });
});
