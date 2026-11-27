// data-tools.md "Remove Duplicates", "Trim Whitespace": the range a tool takes, the dialog's columns and the words.
import { describe, expect, it } from 'vitest';
import type { Grid } from '@livedoc/sheets';
import {
  cleanUpRange,
  cryptoRandom,
  duplicateColumns,
  duplicatesRemovedLine,
  selectedRangeLine,
  whitespaceTrimmedLine,
} from './clean-up';

const grid: Grid = {
  rows: 10,
  cols: 5,
  hiddenRow: () => false,
  hiddenCol: () => false,
  filled: (r, c) => r < 3 && c < 2,
  mergeAt: () => null,
};

describe('clean-up', () => {
  it('takes the selection, or the block around a single cell', () => {
    const range = { r1: 0, c1: 0, r2: 4, c2: 0 };
    expect(cleanUpRange(range, grid)).toBe(range);
    expect(cleanUpRange({ r1: 1, c1: 1, r2: 1, c2: 1 }, grid)).toEqual({
      r1: 0,
      c1: 0,
      r2: 2,
      c2: 1,
    });
    expect(selectedRangeLine({ r1: 0, c1: 0, r2: 9, c2: 2 })).toBe('Selected range: A1:C10');
  });

  it('names columns by letter, with a header row by letter and header', () => {
    const range = { r1: 0, c1: 0, r2: 3, c2: 1 };
    const header = (c: number) => (c === 0 ? ' Name ' : '');
    expect(duplicateColumns(range, false, header).map((c) => c.label)).toEqual([
      'Column A',
      'Column B',
    ]);
    expect(duplicateColumns(range, true, header).map((c) => c.label)).toEqual([
      'Column A - Name',
      'Column B',
    ]);
  });

  it('says what was found, singular and plural', () => {
    expect(duplicatesRemovedLine(0, 4)).toBe('No duplicate rows found.');
    expect(duplicatesRemovedLine(1, 1)).toBe(
      '1 duplicate row found and removed. 1 unique row remains.',
    );
    expect(duplicatesRemovedLine(3, 7)).toBe(
      '3 duplicate rows found and removed. 7 unique rows remain.',
    );
    expect(whitespaceTrimmedLine(0)).toBe('No whitespace to trim');
    expect(whitespaceTrimmedLine(1)).toBe('1 cell trimmed');
    expect(whitespaceTrimmedLine(3)).toBe('3 cells trimmed');
  });

  it('draws in [0, 1)', () => {
    const x = cryptoRandom();
    expect(x >= 0 && x < 1).toBe(true);
  });
});
