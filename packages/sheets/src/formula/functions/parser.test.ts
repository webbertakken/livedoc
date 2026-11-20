// Parser functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Parser): TO_TEXT through
// its cell's format, the formats the TO_ functions give, CONVERT's errors and prefixes.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';
import { readTypedInput } from '../../typed-input';

function check(formula: string, value: unknown, cells: Record<string, string> = {}): void {
  const got = calc(formula, cells);
  if (typeof value === 'object' && value !== null) expect(got).toMatchObject(value);
  else expect(got).toBe(value);
}

describe('TO_TEXT', () => {
  it('writes a number as its cell shows it', () => {
    check('=TO_TEXT(A1)', '25.00%', { A1: '25%' });
    check('=TO_TEXT(A1:A2)', '0.5', { A1: '0.5', A2: '25%' });
  });
});

describe('the TO_ functions’ formats', () => {
  it.each([
    ['=TO_DATE(46000)', { nf: 'date', ifAutomatic: true }],
    ['=TO_DOLLARS(5)', { nf: 'currency', cur: '$', ifAutomatic: true }],
    ['=TO_PERCENT(0.5)', { nf: 'percent', ifAutomatic: true }],
  ])('%s is shown as %o', (formula, hint) => {
    const read = readTypedInput(formula, 'en-US', book({}).wb.ctxFor('sheet0xx'));
    expect(read.kind === 'value' && read.hint).toEqual(hint);
  });

  it('gives TO_PURE_NUMBER no format', () => {
    const read = readTypedInput('=TO_PURE_NUMBER(5)', 'en-US', book({}).wb.ctxFor('sheet0xx'));
    expect(read.kind === 'value' && read.hint).toBeFalsy();
  });
});

describe('CONVERT', () => {
  it.each([
    ['=CONVERT(1, "kim", "m")', '#N/A'],
    ['=CONVERT(1, "m", "kim")', '#N/A'],
    ['=CONVERT(1, "kibit", "kim")', '#N/A'],
    ['=CONVERT(NA(), "m", "ft")', '#N/A'],
    ['=CONVERT(1, NA(), "ft")', '#N/A'],
    ['=CONVERT(1, "m", NA())', '#N/A'],
  ])('%s is %s', (formula, e) => check(formula, { e }));

  it.each([
    ['=CONVERT(1, "mK", "K")', 0.001],
    ['=CONVERT(1, "toString", "m")', { e: '#N/A' }],
  ])('%s is %o', (formula, value) => check(formula, value));
});
