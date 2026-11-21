// Array functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Arrays): the result budget,
// errors in every argument, least squares at its edges, and the spills a formula of single values makes.
import { describe, expect, it } from 'vitest';
import type { Frame } from '../../engine/frame';
import { maySpill } from '../../engine/spill-shape';
import { book, calc } from '../../testing/book';
import { parseFormula } from '../parse';
import type { Value } from '../values';
import { ARRAY_SHAPE_FUNCTIONS } from './array-shape';
import { MATRIX_FUNCTIONS } from './matrices';

function check(formula: string, value: unknown, cells: Record<string, string> = {}): void {
  const got = calc(formula, cells);
  if (typeof value === 'object' && value !== null) expect(got).toMatchObject(value);
  else expect(got).toBe(value);
}

// The whole array a formula at J20 spills.
function spill(formula: string, cells: Record<string, string> = {}): unknown {
  const b = book({ ...cells, J20: formula });
  return b.wb.formulaResult(b.sheets[0]!.id, 19, 9);
}

// A function worked out on values directly, for arrays larger than a test sheet holds.
function direct(def: (typeof ARRAY_SHAPE_FUNCTIONS)[string], ...args: Value[]): unknown {
  if (def.lazy) throw new Error('not a lazy function');
  return def.impl(args, {} as Frame);
}

function tree(formula: string) {
  const parsed = parseFormula(formula);
  if (!parsed.ok) throw new Error(formula);
  return parsed.ast;
}

const line = (n: number): Value => ({ rows: [Array.from({ length: n }, (_, i) => i)] });

describe('the result budget', () => {
  it.each([
    '=CHOOSEROWS(SEQUENCE(1, 50000), 1, 1, 1)',
    '=HSTACK(SEQUENCE(1, 60000), SEQUENCE(1, 60000))',
    '=VSTACK(SEQUENCE(60000), SEQUENCE(60000))',
    '=FLATTEN(SEQUENCE(300, 300), SEQUENCE(300, 300))',
    '=WRAPROWS({1, 2}, 100001)',
    '=MMULT(SEQUENCE(400), SEQUENCE(1, 400))',
  ])('%s is #NUM!', (formula) => check(formula, { e: '#NUM!' }));

  it('holds TOCOL and TOROW to it', () => {
    expect(direct(ARRAY_SHAPE_FUNCTIONS.TOCOL!, line(100001))).toMatchObject({ e: '#NUM!' });
    expect(direct(ARRAY_SHAPE_FUNCTIONS.TOROW!, line(100001))).toMatchObject({ e: '#NUM!' });
  });
});

describe('errors in the arguments', () => {
  it.each([
    ['=CHOOSECOLS({1, 2}, "x")', '#VALUE!'],
    ['=CHOOSEROWS({1; 2}, NA())', '#N/A'],
    ['=TOCOL({1, 2}, NA())', '#N/A'],
    ['=TOCOL({1, 2}, 0, NA())', '#N/A'],
    ['=TOROW(C1:D1, 1)', '#REF!'],
    ['=WRAPROWS({1, 2}, NA())', '#N/A'],
    ['=WRAPCOLS({1, 2}, 0.5)', '#NUM!'],
    ['=MMULT({1, NA()}, {1; 2})', '#N/A'],
    ['=MMULT({1, 2}, {1; NA()})', '#N/A'],
    ['=MMULT(1E200, 1E200)', '#NUM!'],
    ['=MDETERM({1, 2})', '#VALUE!'],
    ['=MINVERSE({1, 2})', '#VALUE!'],
    ['=MINVERSE(NA())', '#N/A'],
    ['=SUMXMY2(A1:B1, {1, 2})', '#N/A'],
    ['=SUMXMY2({1, 2}, A1:B1)', '#N/A'],
    ['=SUMX2PY2(1E200, 1E200)', '#NUM!'],
    ['=FREQUENCY({1, NA()}, 1)', '#N/A'],
    ['=FREQUENCY({1, 2}, NA())', '#N/A'],
  ])('%s is %s', (formula, e) => check(formula, { e }, { A1: '1', B1: '=NA()' }));

  it('reads an empty array as having nothing to pick, and no matrix', () => {
    expect(direct(MATRIX_FUNCTIONS.MDETERM!, { rows: [] })).toMatchObject({ e: '#VALUE!' });
    expect(direct(ARRAY_SHAPE_FUNCTIONS.CHOOSECOLS!, { rows: [] }, 1)).toMatchObject({
      e: '#VALUE!',
    });
  });
});

describe('reshaping', () => {
  it('pads a wrapped line with the value given, an error included', () => {
    expect(spill('=WRAPCOLS({1, 2, 3}, 2, NA())')).toMatchObject({
      rows: [
        [1, 3],
        [2, { e: '#N/A' }],
      ],
    });
  });

  it('takes column numbers from an array', () => {
    expect(spill('=CHOOSECOLS({1, 2, 3}, {3, 1})')).toEqual({ rows: [[3, 1]] });
  });

  it('keeps a repeated class at its first place', () => {
    expect(spill('=FREQUENCY({1, 2, 3}, {2; 2})')).toEqual({ rows: [[2], [0], [1]] });
  });
});

describe('least squares', () => {
  it.each([
    ['=LINEST({1, 2}, {1, 2}, NA())', '#N/A'],
    ['=LINEST({1, 2}, {1, 2}, TRUE, NA())', '#N/A'],
    ['=LINEST(NA())', '#N/A'],
    ['=LINEST({1, 2}, {1, NA()})', '#N/A'],
    ['=LINEST(1, {1, 2})', '#N/A'],
    ['=TREND({1, 2}, {1, 2}, NA())', '#N/A'],
    ['=TREND({1; 2; 4}, {1, 2; 2, 1; 3, 3}, {1, 2, 3})', '#REF!'],
    ['=GROWTH({1, 2}, {1, 2}, 2000)', '#NUM!'],
  ])('%s is %s', (formula, e) => check(formula, { e }));

  it('fits several x values along a row as it fits them down a column', () => {
    const along = calc('=TREND({1, 2, 4, 3}, {1, 2, 3, 4; 2, 1, 4, 3}, {5; 6})') as number;
    const down = calc('=TREND({1; 2; 4; 3}, {1, 2; 2, 1; 3, 4; 4, 3}, {5, 6})') as number;
    expect(along).toBeCloseTo(5.5, 9);
    expect(down).toBeCloseTo(along, 12);
  });

  it('fits a table of y against a table of x, answering in its shape', () => {
    const got = spill('=TREND({1, 2; 3, 4}, {1, 2; 3, 4}, {5, 6})') as { rows: number[][] };
    expect(got.rows[0]![0]).toBeCloseTo(5, 9);
    expect(got.rows[0]![1]).toBeCloseTo(6, 9);
    expect((spill('=TREND({1, 2; 3, 5})') as { rows: number[][] }).rows).toHaveLength(2);
  });

  it('gives no R² for a y that never changes', () => {
    expect(spill('=LINEST({5, 5, 5}, {1, 2, 3}, TRUE, TRUE)')).toMatchObject({
      rows: [
        [0, 5],
        [0, 0],
        [{ e: '#DIV/0!' }, 0],
        [{ e: '#NUM!' }, 1],
        [0, 0],
      ],
    });
  });
});

describe('the spill of a formula of single values', () => {
  it.each(['=MUNIT(2)', '=RANDARRAY(2)', '=HSTACK(1, 2)', '=MINVERSE(4)', '=TREND(1)'])(
    '%s may spill',
    (formula) => expect(maySpill(tree(formula), [])).toBe(true),
  );

  it('reads a cell MUNIT spills into', () => {
    expect(book({ A1: '=A2 + 1', A2: '', C1: '=MUNIT(2)' }).v('A1')).toBe(1);
    expect(book({ A1: '=D2 + 1', C1: '=MUNIT(2)' }).v('A1')).toBe(2);
  });

  it.each(['=MDETERM(A1:B2)', '=SUMXMY2(A1:A2, B1:B2)'])('%s never spills', (formula) =>
    expect(maySpill(tree(formula), [])).toBe(false),
  );
});
