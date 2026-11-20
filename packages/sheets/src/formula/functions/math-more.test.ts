// Math functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Math): OpenFormula's
// CEILING and FLOOR with a mode (D38), overflow, bases at their edges, COUNTUNIQUE (D45), MUNIT and RANDARRAY.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';

function check(formula: string, value: unknown, cells: Record<string, string> = {}): void {
  const got = calc(formula, cells);
  if (typeof value === 'object' && value !== null) expect(got).toMatchObject(value);
  else expect(got).toBe(value);
}

describe('CEILING and FLOOR with a mode', () => {
  it.each([
    ['=CEILING(-2.5, -1, 0)', -2],
    ['=CEILING(-2.5, -1, 1)', -3],
    ['=FLOOR(-2.5, -1, 0)', -3],
    ['=FLOOR(-2.5, -1, 1)', -2],
    ['=CEILING(0.3, 0.1, 0)', 0.3],
    ['=CEILING(0, 1, 1)', 0],
    ['=FLOOR(2.5, 0, 1)', 0],
    ['=CEILING(2.5, -1, 0)', { e: '#NUM!' }],
    ['=CEILING(2.5, 1, NA())', { e: '#N/A' }],
    ['=CEILING(NA())', { e: '#N/A' }],
    ['=CEILING(1, NA())', { e: '#N/A' }],
    ['=CEILING.MATH(NA())', { e: '#N/A' }],
    ['=CEILING.MATH(1, NA())', { e: '#N/A' }],
    ['=CEILING.MATH(1, 1, NA())', { e: '#N/A' }],
  ])('%s', (formula, value) => check(formula, value));
});

describe('numbers past the largest', () => {
  it.each([
    '=COMBIN(2000, 1000)',
    '=COMBINA(2000, 1000)',
    '=FACTDOUBLE(400)',
    '=MULTINOMIAL(600, 600)',
    '=SUMSQ(1E200, 1E200)',
    '=SERIESSUM(1E200, 2, 1, {1})',
    '=SINH(1000)',
  ])('%s is #NUM!', (formula) => check(formula, { e: '#NUM!' }));

  it.each([
    ['=SERIESSUM(2, 0, 1, {1, "a"})', { e: '#VALUE!' }],
    ['=SERIESSUM(2, 0, 1, {1, NA()})', { e: '#N/A' }],
    ['=SERIESSUM(NA(), 0, 1, 1)', { e: '#N/A' }],
    ['=SERIESSUM(2, NA(), 1, 1)', { e: '#N/A' }],
    ['=SERIESSUM(2, 0, NA(), 1)', { e: '#N/A' }],
    ['=MULTINOMIAL(NA())', { e: '#N/A' }],
    ['=SUMSQ(NA())', { e: '#N/A' }],
    ['=COMBINA(3, -1)', { e: '#NUM!' }],
    ['=COMBINA(0, 3)', 0],
  ])('%s', (formula, value) => check(formula, value));
});

describe('BASE and DECIMAL', () => {
  it.each([
    ['=BASE(9007199254740991, 36)', '2GOSA7PA2GV'],
    ['=BASE(9007199254740992, 2)', { e: '#NUM!' }],
    ['=BASE(5, 2, 256)', { e: '#NUM!' }],
    ['=BASE(5, 2, -1)', { e: '#NUM!' }],
    ['=BASE(NA(), 2)', { e: '#N/A' }],
    ['=BASE(5, NA())', { e: '#N/A' }],
    ['=BASE(5, 2, NA())', { e: '#N/A' }],
    ['=DECIMAL("2GOSA7PA2GV", 36)', 9007199254740991],
    ['=DECIMAL("0x1F", 10)', { e: '#NUM!' }],
    ['=DECIMAL("1.5", 10)', { e: '#NUM!' }],
    ['=DECIMAL(REPT("1", 256), 2)', { e: '#NUM!' }],
    ['=DECIMAL("1", 37)', { e: '#NUM!' }],
    ['=DECIMAL(NA(), 2)', { e: '#N/A' }],
    ['=DECIMAL("1", NA())', { e: '#N/A' }],
  ])('%s', (formula, value) => check(formula, value));
});

describe('COUNTUNIQUE', () => {
  it.each([
    ['=COUNTUNIQUE(A1:A6)', 4],
    ['=COUNTUNIQUE(1, "1", TRUE, "TRUE")', 4],
    ['=COUNTUNIQUE(NA(), NA(), 1/0)', 2],
    ['=COUNTUNIQUE("", B1)', 0],
  ])('%s', (formula, value) =>
    check(formula, value, { A1: 'a', A2: 'A', A3: 'a', A4: '1', A5: "'1", A6: '' }),
  );
});

describe('MUNIT and RANDARRAY', () => {
  it('refuses a matrix past the result budget', () => {
    check('=MUNIT(400)', { e: '#NUM!' });
    check('=MUNIT(NA())', { e: '#N/A' });
  });

  it('fills a block with the random source, volatile', () => {
    const b = book({ J20: '=RANDARRAY(2, 3)' }, { rand: () => 0.25 });
    expect(b.wb.formulaResult(b.sheets[0]!.id, 19, 9)).toEqual({
      rows: [
        [0.25, 0.25, 0.25],
        [0.25, 0.25, 0.25],
      ],
    });
    expect(calc('=RANDARRAY()', {}, { rand: () => 0.5 })).toBe(0.5);
  });

  it.each([
    ['=RANDARRAY(0, 1)', { e: '#VALUE!' }],
    ['=RANDARRAY(1000, 1000)', { e: '#NUM!' }],
    ['=RANDARRAY(NA())', { e: '#N/A' }],
    ['=RANDARRAY(1, NA())', { e: '#N/A' }],
  ])('%s', (formula, value) => check(formula, value));
});

describe('the complex functions', () => {
  it.each([
    ['=IMPOWER("x", 2)', { e: '#NUM!' }],
    ['=IMPOWER("i", "x")', { e: '#VALUE!' }],
    ['=IMSQRT("x")', { e: '#NUM!' }],
    ['=IMSQRT({"-4", "4"})', '2i'],
  ])('%s', (formula, value) => check(formula, value));
});
