import { describe, expect, it } from 'vitest';
import { maySpill } from '../engine/spill-shape';
import { book } from '../testing/book';
import { parseFormula } from './parse';

// formulas.md "Arrays and spills": a function that reads some arguments whole lifts over a single-value one (D67).
const DATA = {
  A1: '1',
  A2: '2',
  A3: '3',
  B1: '10',
  B2: '20',
  B3: '30',
};

function column(formula: string, rows = 3): unknown[] {
  const b = book({ ...DATA, G1: formula }, { arrays: 'google' });
  return Array.from({ length: rows }, (_, i) => b.v(`G${i + 1}`));
}

describe('lifted parameters', () => {
  it('looks up each key of a range inside ARRAYFORMULA', () => {
    expect(column('=ARRAYFORMULA(VLOOKUP(A1:A3, A1:B3, 2, FALSE))')).toEqual([10, 20, 30]);
  });

  it('sums by each criterion of a range', () => {
    expect(column('=ARRAYFORMULA(SUMIF(A1:A3, ">="&A1:A3, B1:B3))')).toEqual([60, 50, 30]);
  });

  it('lifts over an array literal', () => {
    const b = book({ ...DATA, G1: '=ARRAYFORMULA(LARGE(B1:B3, {1, 2}))' }, { arrays: 'google' });
    expect([b.v('G1'), b.v('H1')]).toEqual([30, 20]);
  });

  it('keeps a single cell as one call', () => {
    expect(column('=ARRAYFORMULA(VLOOKUP(A2, A1:B3, 2, FALSE))', 2)).toEqual([20, null]);
  });

  it('intersects outside an array context', () => {
    expect(column('=VLOOKUP(A1:A3, A1:B3, 2, FALSE)', 2)).toEqual([10, null]);
  });

  it('gives SUMIFS one value (D67)', () => {
    expect(column('=ARRAYFORMULA(SUMIFS(B1:B3, A1:A3, A1:A3))', 2)).toEqual([10, null]);
  });

  it('never lifts over a union of references', () => {
    expect(column('=ARRAYFORMULA(COUNTIF(A1:A3, (A1, A2)))', 1)[0]).toMatchObject({ e: '#VALUE!' });
  });
});

describe('a lifted call may spill', () => {
  const spills = (text: string) => {
    const parsed = parseFormula(text);
    if (!parsed.ok) throw new Error(text);
    return maySpill(parsed.ast, []);
  };

  it('when its lifted argument is a range', () => {
    expect(spills('=SUMIF(A1:A3, A1:A3)')).toBe(true);
  });

  it('not when its lifted argument is one value or left out', () => {
    expect(spills('=SUMIF(A1:A3, 1)')).toBe(false);
    expect(spills('=SUMIF(A1:A3, )')).toBe(false);
    expect(spills('=LARGE(A1:A3)')).toBe(false);
  });
});
