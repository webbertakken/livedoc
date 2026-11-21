// FILTER, SORT and SORTN beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Arrays): their
// refusals, OOXML's forms (D38) and SORTN's ties at the edges.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';

const T = { A1: 'b', B1: '2', A2: 'a', B2: '1', A3: 'c', B3: '2', C1: '9', C2: '8', C3: '7' };

// A formula's whole result at J20, its spill too.
function whole(formula: string) {
  const b = book({ ...T, J20: formula });
  return b.wb.formulaResult(b.sheets[0]!.id, 19, 9);
}

describe('SORT', () => {
  it('refuses a key it cannot sort by', () => {
    expect(calc('=SORT(A1:B3, 0, TRUE)', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORT(A1:B3, C1:C2, TRUE)', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORT(A1:B3, 1, "x")', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORT(A1:B3, "x", TRUE)', T)).toMatchObject({ e: '#VALUE!' });
  });

  it('reads four arguments as OOXML’s, refusing an order but 1 or -1 and a row or column past the range', () => {
    expect(whole('=SORT(A1:B3, 2, -1, FALSE)')).toEqual({
      rows: [
        ['b', 2],
        ['c', 2],
        ['a', 1],
      ],
    });
    expect(calc('=SORT(A1:B3, 1, 2, FALSE)', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORT(A1:B3, 3, 1, FALSE)', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORT(A1:B3, 4, 1, TRUE)', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORT(A1:B3, "x", 1, TRUE)', T)).toMatchObject({ e: '#VALUE!' });
  });
});

describe('SORTN', () => {
  it('refuses n below 1 and a ties mode past 3', () => {
    expect(calc('=SORTN(A1:B3, 0)', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORTN(A1:B3, 1, 4)', T)).toMatchObject({ e: '#NUM!' });
    expect(calc('=SORTN(A1:B3, "x")', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORTN(A1:B3, 1, "x")', T)).toMatchObject({ e: '#VALUE!' });
    expect(calc('=SORTN(A1:B3, 1, 0, 5, TRUE)', T)).toMatchObject({ e: '#REF!' });
  });

  it('gives what there is when n is past the rows, ties or not', () => {
    expect(whole('=SORTN(A1:A3, 5)')).toEqual({ rows: [['a'], ['b'], ['c']] });
    expect(whole('=SORTN(A1:A3, 5, 1)')).toEqual({ rows: [['a'], ['b'], ['c']] });
    expect(whole('=SORTN(B1:B3, 5, 2)')).toEqual({ rows: [[1], [2]] });
    expect(whole('=SORTN(A1:B3, 1, 1, 2, FALSE)')).toEqual({
      rows: [
        ['b', 2],
        ['c', 2],
      ],
    });
  });
});

describe('FILTER', () => {
  it('gives OOXML’s if_empty in a file’s meaning only after one condition longer than one', () => {
    expect(calc('=FILTER(A1:A3, B1:B3>5, "none")', T, { meaning: 'ooxml' })).toBe('none');
    expect(calc('=FILTER(A1:A3, B1:B3>5, "none")', T)).toMatchObject({ e: '#N/A' });
    // A one-cell condition and a one-cell value are two conditions, as Google reads them.
    expect(calc('=FILTER(A1, B1>5, TRUE)', T)).toMatchObject({ e: '#N/A' });
  });
});
