import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';
import { maySpill } from '../../engine/spill-shape';
import type { EvalValue, Frame } from '../../engine/frame';
import { parseFormula } from '../parse';
import type { FnDef } from '../fn';
import { LAMBDA_FUNCTIONS } from './lambdas';

// formulas.md "LAMBDA and LET"; the oracle holds Google's documented answers (Logical and Array).
const DATA = { A1: '1', A2: '2', A3: '3', B1: '10', B2: '20', B3: '30', C1: 'x' };

const v = (formula: string) => calc(formula, DATA);
const why = (formula: string) => (v(formula) as { why?: string }).why;

describe('LAMBDA', () => {
  it('is called with values in brackets after it, and again on what it gives', () => {
    expect(v('=LAMBDA(x, x*2)(5)')).toBe(10);
    expect(v('=LAMBDA(x, LAMBDA(y, x+y))(1)(2)')).toBe(3);
    expect(v('=LAMBDA(5)()')).toBe(5);
  });

  it('takes a range as a range', () => {
    expect(v('=LAMBDA(r, ROWS(r))(A1:A3)')).toBe(3);
  });

  it('reads an empty value as empty', () => {
    expect(v('=LAMBDA(x, ISBLANK(x))(D9)')).toBe(true);
    expect(v('=LAMBDA(x, y, y)(1, )')).toBe(null);
  });

  it('counts its values as Google words it', () => {
    expect(v('=LAMBDA(x, x)(1, 2)')).toMatchObject({ e: '#N/A' });
    expect(why('=LAMBDA(x, x)(1, 2)')).toBe(
      'Wrong number of arguments to LAMBDA. Expected 1 argument, but got 2 arguments.',
    );
    expect(why('=LAMBDA(x, y, x)(1)')).toBe(
      'Wrong number of arguments to LAMBDA. Expected 2 arguments, but got 1 argument.',
    );
  });

  it('is #VALUE! uncalled, in a cell or where a value goes (D68)', () => {
    expect(v('=LAMBDA(x, x)')).toMatchObject({ e: '#VALUE!' });
    expect(v('=SUM(LAMBDA(x, x))')).toMatchObject({ e: '#VALUE!' });
    expect(v('=LAMBDA(x, x)+1')).toMatchObject({ e: '#VALUE!' });
    expect(why('=LAMBDA(x, x)')).toBe("The LAMBDA wasn't called with its values.");
  });

  it('refuses a name that is not one (D68)', () => {
    expect(why('=LAMBDA(A1, A1+1)(3)')).toBe('Argument 1 of function LAMBDA is not a valid name.');
    expect(why('=LAMBDA(x, x, x)(1, 2)')).toBe(
      'Argument 2 of function LAMBDA is not a valid name.',
    );
    expect(why('=LAMBDA(3, x+1)(3)')).toBe('Argument 1 of function LAMBDA is not a valid name.');
  });

  it('calls only a LAMBDA', () => {
    expect(why('=SUM(1)(2)')).toBe('Only a LAMBDA can be called with values');
    expect(v('=NA()(2)')).toMatchObject({ e: '#N/A' });
  });
});

describe('LET', () => {
  it('names values left to right, each worked out once', () => {
    expect(v('=LET(x, 1, y, x+1, x+y)')).toBe(3);
    expect(v('=LET(x, 1, y, LET(z, 2, x+z), x+y)')).toBe(4);
  });

  it('hides a function name only when calling a LAMBDA', () => {
    expect(v('=LET(sum, 3, SUM(sum, 1))')).toBe(4);
    expect(v('=LET(double, LAMBDA(n, n*2), double(21))')).toBe(42);
  });

  it('keeps a name declared later unknown', () => {
    expect(v('=LET(y, x, x, 1, y)')).toMatchObject({ e: '#NAME?' });
  });

  it('refuses a name that is not one and an even count', () => {
    expect(why('=LET(A1, 1, A1)')).toBe('Argument 1 of function LET is not a valid name.');
    expect(why('=LET(x, 1, 2, 3, x)')).toBe('Argument 3 of function LET is not a valid name.');
    expect(why('=LET(x, 1, y, 2)')).toBe('LET takes pairs of a name and a value, then a formula');
  });

  it('binds an empty value', () => {
    expect(v('=LET(x, , ISBLANK(x))')).toBe(true);
  });
});

function spill(formula: string, cells: string[]): unknown[] {
  const b = book({ ...DATA, G1: formula }, { arrays: 'google' });
  return cells.map((c) => b.v(c));
}

describe('the helpers', () => {
  it('MAP refuses arrays of other sizes and keeps a step error in place', () => {
    expect(why('=MAP(A1:A3, A1:A2, LAMBDA(x, y, x))')).toBe(
      'Array arguments to MAP are of different size.',
    );
    expect(spill('=MAP(A1:A3, LAMBDA(x, 1/(x-2)))', ['G1', 'G2', 'G3'])).toMatchObject([
      -1,
      { e: '#DIV/0!' },
      1,
    ]);
  });

  it('wants a LAMBDA last', () => {
    for (const f of [
      '=MAP(A1:A3, 3)',
      '=REDUCE(0, A1:A3, 3)',
      '=BYCOL(A1:A3, 3)',
      '=MAKEARRAY(1, 1, 3)',
    ])
      expect(why(f)).toBe('Argument must be a LAMBDA.');
  });

  it('wants one value a step', () => {
    expect(why('=BYROW(A1:B1, LAMBDA(row, row))')).toBe(
      'Single value expected. Nested array results are not supported.',
    );
    expect(spill('=BYROW(A1:B2, LAMBDA(row, INDEX(row, 1, 2)))', ['G1', 'G2'])).toEqual([10, 20]);
  });

  it('gives a REDUCE accumulator that is an array, or an error it is handed', () => {
    expect(spill('=REDUCE({0}, A1:A2, LAMBDA(acc, x, {acc; x}))', ['G1', 'G2', 'G3'])).toEqual([
      0, 1, 2,
    ]);
    expect(v('=REDUCE(7, FILTER(A1:A3, A1:A3>5), LAMBDA(acc, x, acc+x))')).toMatchObject({
      e: '#N/A',
    });
  });

  it('SCAN keeps a step that is an array as an error', () => {
    expect(spill('=SCAN(0, A1:A2, LAMBDA(acc, x, {x, x}))', ['G1', 'G2'])).toMatchObject([
      { e: '#VALUE!' },
      { e: '#VALUE!' },
    ]);
    expect(v('=SCAN(0, A1:A2, 7)')).toMatchObject({ e: '#VALUE!' });
  });

  it('BYCOL gives a range of each column', () => {
    expect(spill('=BYCOL(A1:B3, LAMBDA(c, COLUMN(c)))', ['G1', 'H1'])).toEqual([1, 2]);
  });

  it('MAKEARRAY truncates its counts and refuses fewer than one or too many', () => {
    expect(spill('=MAKEARRAY(2.9, 1.5, LAMBDA(r, c, r*10+c))', ['G1', 'G2', 'H1'])).toEqual([
      11,
      21,
      null,
    ]);
    expect(v('=MAKEARRAY(0, 2, LAMBDA(r, c, r))')).toMatchObject({ e: '#VALUE!' });
    expect(v('=MAKEARRAY(5000, 5000, LAMBDA(r, c, r))')).toMatchObject({ e: '#NUM!' });
    expect(v('=MAKEARRAY("a", 1, LAMBDA(r, c, r))')).toMatchObject({ e: '#VALUE!' });
    expect(v('=MAKEARRAY(1, "a", LAMBDA(r, c, r))')).toMatchObject({ e: '#VALUE!' });
  });
});

describe('a LAMBDA call may spill', () => {
  const spills = (text: string) => {
    const parsed = parseFormula(text);
    if (!parsed.ok) throw new Error(text);
    return maySpill(parsed.ast, []);
  };

  it('when its LAMBDA or a value may', () => {
    expect(spills('=LAMBDA(n, SEQUENCE(n))(3)')).toBe(true);
    expect(spills('=LAMBDA(r, r)(A1:A3)')).toBe(true);
    expect(spills('=LAMBDA(x, x)(1, )')).toBe(false);
  });
});

describe('the helpers over arrays', () => {
  it('BYROW and BYCOL group an array literal', () => {
    expect(spill('=BYROW({1, 2; 3, 4}, LAMBDA(r, PRODUCT(r)))', ['G1', 'G2'])).toEqual([2, 12]);
    expect(spill('=BYCOL({1, 2; 3, 4}, LAMBDA(c, SUM(c)))', ['G1', 'H1'])).toEqual([4, 6]);
  });

  it('reads a one-value array a step gives as its value', () => {
    expect(spill('=MAP(A1:A2, LAMBDA(x, {x*3}))', ['G1', 'G2'])).toEqual([3, 6]);
  });

  it('calls a LET name with an empty value', () => {
    expect(v('=LET(f, LAMBDA(x, y, ISBLANK(y)), f(1, ))')).toBe(true);
  });
});

describe('the helpers past the budget (D68)', () => {
  const spent = { spend: () => false } as unknown as Frame;
  const impl = (name: string) => (LAMBDA_FUNCTIONS[name] as Extract<FnDef, { lazy?: false }>).impl;
  const id = { lambda: { params: ['a', 'b'], apply: ([a]: readonly EvalValue[]) => a! } };

  it('give #NUM! before applying', () => {
    expect(impl('MAKEARRAY')([1, 1, id], spent)).toMatchObject({ e: '#NUM!' });
    expect(impl('REDUCE')([0, { rows: [[1]] }, id], spent)).toMatchObject({
      e: '#NUM!',
    });
  });
});
