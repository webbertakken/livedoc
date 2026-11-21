import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';
import { WHAT_IF_DEPTH_MAX } from '../../engine/what-if';

// MULTIPLE.OPERATIONS (formulas.md "Functions": Lookup), beyond the oracle corpus' cases (oracle/cases/OpenFormula.json).
const errorOf = (formula: string, cells: Record<string, string> = {}) =>
  (calc(formula, cells) as { e?: string }).e;

// OpenFormula 1.4 Part 4 §6.14.10's example: B5 is worked out over a row cell (B3) and a column cell (B2).
const TABLE: Record<string, string> = {
  B2: '1',
  B3: '1',
  B4: '=B2+B3',
  B5: '=B2*B3+B4',
  C3: '1',
  C4: '2',
  C5: '3',
  C6: '4',
  D2: '1',
  E2: '2',
  F2: '3',
};
for (const r of [3, 4, 5, 6])
  for (const c of ['D', 'E', 'F'])
    TABLE[`${c}${r}`] = `=MULTIPLE.OPERATIONS($B$5, $B$3, $C${r}, $B$2, ${c}$2)`;

describe('MULTIPLE.OPERATIONS', () => {
  it("tabulates OpenFormula's example, the formulas between the cells worked out afresh", () => {
    const b = book(TABLE);
    const grid = [3, 4, 5, 6].map((r) => ['D', 'E', 'F'].map((c) => b.v(`${c}${r}`)));
    expect(grid).toEqual([
      [3, 5, 7],
      [5, 8, 11],
      [7, 11, 15],
      [9, 14, 19],
    ]);
    expect(b.v('B5')).toBe(3);
  });

  it('works out afresh when a cell it rests on changes', () => {
    const b = book(TABLE);
    expect(b.v('F6')).toBe(19);
    b.set('C6', '10');
    expect(b.v('F6')).toBe(43);
    b.set('B4', '=B2-B3');
    expect(b.v('F6')).toBe(23);
  });

  it('reads a swapped cell inside a range as its stand-in', () => {
    expect(
      calc('=MULTIPLE.OPERATIONS(A3, A1, B1)', { A1: '1', A2: '2', A3: '=SUM(A1:A2)', B1: '10' }),
    ).toBe(12);
  });

  it('answers a formula reading no swapped cell, and a cell holding no formula, as they stand', () => {
    expect(calc('=MULTIPLE.OPERATIONS(A2, B1, B2)', { A1: '4', A2: '=A1*2', B2: '7' })).toBe(8);
    expect(calc('=MULTIPLE.OPERATIONS(A1, A1, B2)', { A1: '4', B2: '7' })).toBe(4);
  });

  it('works each formula of the chain out once, however often it is read', () => {
    expect(
      calc('=MULTIPLE.OPERATIONS(A3, A1, B1)', { A1: '1', A2: '=A1*2', A3: '=A2+A2', B1: '5' }),
    ).toBe(20);
  });

  it('reads a cell retyped from a formula to a number as the number', () => {
    const b = book({
      A1: '1',
      A2: '=A1*2',
      A3: '=A2+1',
      B1: '5',
      C1: '=MULTIPLE.OPERATIONS(A3, A1, B1)',
    });
    expect(b.v('C1')).toBe(11);
    b.set('A2', '7');
    expect(b.v('C1')).toBe(8);
  });

  it('takes the first value of a spilling formula', () => {
    expect(
      calc('=MULTIPLE.OPERATIONS(A2, A1, B1)', { A1: '2', A2: '=SEQUENCE(2, 1, A1)', B1: '5' }),
    ).toBe(5);
  });

  it('nests: a swap inside the chain comes before the outer one', () => {
    const cells = {
      A1: '1',
      A2: '=A1*10',
      A3: '=MULTIPLE.OPERATIONS(A2, A1, B1)+A1',
      B1: '2',
      B2: '3',
    };
    expect(calc('=MULTIPLE.OPERATIONS(A3, A1, B2)', cells)).toBe(23);
  });

  it('refuses arguments that are not single cells, and a column cell without its replacement', () => {
    expect(errorOf('=MULTIPLE.OPERATIONS(A1:A2, B1, B2)')).toBe('#VALUE!');
    expect(errorOf('=MULTIPLE.OPERATIONS(A1, 5, B2)')).toBe('#VALUE!');
    expect(errorOf('=MULTIPLE.OPERATIONS(A1, B1, 5)')).toBe('#VALUE!');
    expect(errorOf('=MULTIPLE.OPERATIONS(A1, B1, B2, C1)')).toBe('#N/A');
  });

  it('names a chain that reads itself, and one deeper than the limit', () => {
    expect(
      errorOf('=MULTIPLE.OPERATIONS(A2, A1, B1)', { A1: '1', A2: '=IF(A1>1, A2, 0)', B1: '2' }),
    ).toBe('#REF!');
    const chain: Record<string, string> = { A1: '1', B1: '2' };
    for (let r = 2; r <= WHAT_IF_DEPTH_MAX + 2; r++) chain[`A${r}`] = `=A${r - 1}+1`;
    const deep = calc(`=MULTIPLE.OPERATIONS(A${WHAT_IF_DEPTH_MAX + 2}, A1, B1)`, chain, {
      rows: 300,
    });
    expect((deep as { e?: string }).e).toBe('#NUM!');
  });
});
