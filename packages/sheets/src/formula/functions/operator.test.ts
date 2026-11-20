// formulas.md "Function catalogue", Operator: each operator by name; the oracle holds their answers, these the edges.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';

const CELLS = { A1: '=1/0', A2: 'x' };

describe('the Operator functions', () => {
  it('lift over arrays as their operators do', () => {
    const b = book({ A1: '=ADD({1, 2}, 10)' });
    expect([b.v('A1'), b.v('B1')]).toEqual([11, 12]);
  });

  it.each([
    ['=ISBETWEEN(A1, 1, 2)', '#DIV/0!'],
    ['=ISBETWEEN(1, A1, 2)', '#DIV/0!'],
    ['=ISBETWEEN(1, 0, 2, A2)', '#VALUE!'],
    ['=ISBETWEEN(1, 0, 2, TRUE, A2)', '#VALUE!'],
    ['=CONCAT(A1, "a")', '#DIV/0!'],
    ['=CONCAT(REPT("a", 6000), REPT("b", 6000))', '#VALUE!'],
    ['=ADD(1)', '#N/A'],
  ])('%s is %s', (f, e) => {
    expect(calc(f, CELLS)).toMatchObject({ e });
  });

  it('compares text and numbers as the comparison operators do', () => {
    expect(calc('=ISBETWEEN("b", "a", "c")')).toBe(true);
    expect(calc('=ISBETWEEN(5, 1, 5, TRUE, FALSE)')).toBe(false);
  });
});
