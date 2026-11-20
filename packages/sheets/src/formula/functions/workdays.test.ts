// Working days and EPOCHTODATE beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Date and
// time): their refusals and their bounds.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';

describe('working days', () => {
  it.each([
    ['=NETWORKDAYS.INTL(1, 10, 1/0)', '#DIV/0!'],
    ['=NETWORKDAYS.INTL(1, 10, "x")', '#VALUE!'],
    ['=NETWORKDAYS.INTL(1, 10, 0)', '#NUM!'],
    ['=NETWORKDAYS.INTL(1, 10, 1, {1, 1/0})', '#DIV/0!'],
    ['=NETWORKDAYS.INTL("x", 10)', '#VALUE!'],
    ['=NETWORKDAYS.INTL(1, "x")', '#VALUE!'],
    ['=NETWORKDAYS(1, 500000)', '#NUM!'],
    ['=WORKDAY.INTL(1, 5, 0)', '#NUM!'],
    ['=WORKDAY.INTL(1, 5, 1, {1/0})', '#DIV/0!'],
    ['=WORKDAY.INTL("x", 5)', '#VALUE!'],
    ['=WORKDAY.INTL(1, "x")', '#VALUE!'],
    ['=WORKDAY(1, 400000)', '#NUM!'],
    ['=WORKDAY(10, -100)', '#NUM!'],
  ])('%s is %s', (formula, code) => {
    expect(calc(formula)).toMatchObject({ e: code });
  });

  it('skips the weekend it is given, holidays ignoring text', () => {
    // 6 January 2025 is a Monday; with Sunday alone off, the fifth working day after it is Saturday the 11th.
    expect(calc('=WORKDAY.INTL(45663, 5, 11)')).toBe(45668);
    expect(calc('=NETWORKDAYS.INTL(45663, 45669, 11, {"x", 45664})')).toBe(5);
  });
});

describe('EPOCHTODATE', () => {
  it('refuses a unit past 3 and text, and counts a negative timestamp out', () => {
    expect(calc('=EPOCHTODATE(1, 4)')).toMatchObject({ e: '#NUM!' });
    expect(calc('=EPOCHTODATE("x")')).toMatchObject({ e: '#VALUE!' });
    expect(calc('=EPOCHTODATE(1, "x")')).toMatchObject({ e: '#VALUE!' });
    expect(calc('=EPOCHTODATE(-1)')).toMatchObject({ e: '#NUM!' });
  });
});
