import { describe, expect, it } from 'vitest';
import {
  addSortKey,
  removeSortKey,
  sortRangeColumns,
  sortRangeStart,
  sortRangeTitle,
} from './sort-range';

// docs/specs/029-sheets/data-tools.md "Sort" (Advanced Range Sorting Options).
const range = { r1: 0, c1: 1, r2: 9, c2: 3 };

describe('sortRangeTitle', () => {
  it('names the range from its first cell to its last', () => {
    expect(sortRangeTitle(range)).toBe('Sort range from B1 to D10');
  });

  it('names a one-cell range by its cell', () => {
    expect(sortRangeTitle({ r1: 4, c1: 0, r2: 4, c2: 0 })).toBe('Sort range from A5 to A5');
  });
});

describe('sortRangeColumns', () => {
  it('offers each column of the range by its letter', () => {
    expect(sortRangeColumns(range, false, () => 'Name')).toEqual([
      { col: 1, label: 'Column B' },
      { col: 2, label: 'Column C' },
      { col: 3, label: 'Column D' },
    ]);
  });

  it('offers a header row by its headers, a blank one by its letter', () => {
    const heads: Record<number, string> = { 1: 'Name', 2: '  ', 3: 'Age' };
    expect(sortRangeColumns(range, true, (c) => heads[c] ?? '')).toEqual([
      { col: 1, label: 'Name' },
      { col: 2, label: 'Column C' },
      { col: 3, label: 'Age' },
    ]);
  });
});

describe('sortRangeStart', () => {
  it('sorts by the active column A to Z', () => {
    expect(sortRangeStart(range, { r: 3, c: 2 })).toEqual([{ col: 2, ascending: true }]);
  });

  it('starts at the first column of the range when the active cell is outside it', () => {
    expect(sortRangeStart(range, { r: 3, c: 7 })).toEqual([{ col: 1, ascending: true }]);
  });
});

describe('addSortKey', () => {
  it('adds the first column not yet sorted by, A to Z', () => {
    expect(addSortKey([{ col: 1, ascending: false }], range)).toEqual([
      { col: 1, ascending: false },
      { col: 2, ascending: true },
    ]);
  });

  it('adds the first column again once every column is a key', () => {
    const keys = [1, 2, 3].map((col) => ({ col, ascending: true }));
    expect(addSortKey(keys, range).at(-1)).toEqual({ col: 1, ascending: true });
  });
});

describe('removeSortKey', () => {
  it('removes the key at its place, keeping the first', () => {
    const keys = [1, 2, 3].map((col) => ({ col, ascending: true }));
    expect(removeSortKey(keys, 1)).toEqual([keys[0], keys[2]]);
    expect(removeSortKey(keys, 0)).toBe(keys);
  });
});
