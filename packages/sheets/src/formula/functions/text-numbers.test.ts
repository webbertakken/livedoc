// DOLLAR, FIXED, ROMAN and ARABIC beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Text"): other
// locales (D44), many places, every numeral ROMAN writes read back by ARABIC.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';
import { arabicValue, romanNumeral } from './text-numbers';

describe('DOLLAR and FIXED in a locale', () => {
  // Typed as each locale writes formulas (formulas.md "Locale").
  it.each([
    ['en-GB', '=DOLLAR(-1234.5)', '-£1,234.50'],
    ['en-US', '=DOLLAR(1234.5)', '$1,234.50'],
    ['de-DE', '=DOLLAR(1234,5)', '1.234,50\u00a0€'],
    ['ja-JP', '=DOLLAR(1234.5, 0)', '￥1,235'],
    ['nl', '=DOLLAR(2,5)', '€\u00a02,50'],
    ['xx', '=DOLLAR(2.5)', '$2.50'],
    ['de-DE', '=FIXED(1234,567; 1)', '1.234,6'],
    ['de-DE', '=FIXED(1234,567; 1; TRUE)', '1234,6'],
    ['en-GB', '=FIXED(2.5, 0)', '3'],
    ['en-GB', '=FIXED(-2.5, 0)', '-3'],
    ['en-GB', '=FIXED(-0.4, 0)', '0'],
    ['en-GB', '=FIXED(15, -1)', '20'],
  ])('%s %s', (locale, formula, text) => {
    expect(calc(formula, {}, { locale })).toBe(text);
  });

  it('writes up to 127 places, zeros past the hundredth by hand', () => {
    const text = calc('=FIXED(1, 127)') as string;
    expect(text).toBe(`1.${'0'.repeat(127)}`);
    expect(calc('=FIXED(1, 128)')).toMatchObject({ e: '#VALUE!' });
  });
});

describe('ROMAN and ARABIC', () => {
  it('reads back every numeral ROMAN writes, at every relaxation', () => {
    for (let mode = 0; mode <= 4; mode++)
      for (let n = 0; n <= 3999; n++) expect(arabicValue(romanNumeral(n, mode))).toBe(n);
  });

  it.each(['VX', 'IIIII', 'IL1', 'VV', 'MMMM', 'IIX'])('reads %s as no numeral', (text) => {
    expect(arabicValue(text)).toBeNull();
  });

  it.each([
    ['=ROMAN(4)', 'IV'],
    ['=ROMAN(3999)', 'MMMCMXCIX'],
    ['=ROMAN(1999, 4)', 'MIM'],
    ['=ARABIC("mmxxvi")', 2026],
  ])('%s', (formula, value) => {
    expect(calc(formula)).toBe(value);
  });

  it.each(['=ROMAN(1, -1)', '=ROMAN(4000)', '=ARABIC("X I")'])('%s is #VALUE!', (formula) => {
    expect(calc(formula)).toMatchObject({ e: '#VALUE!' });
  });
});

describe('an error in an argument', () => {
  it.each([
    '=DOLLAR(NA())',
    '=DOLLAR(1, NA())',
    '=FIXED(NA())',
    '=FIXED(1, NA())',
    '=FIXED(1, 2, NA())',
    '=ROMAN(NA())',
    '=ROMAN(1, NA())',
    '=ARABIC(NA())',
    '=REPLACEB(NA(), 1, 1, "x")',
  ])('%s passes it on', (formula) => {
    expect(calc(formula)).toMatchObject({ e: '#N/A' });
  });
});
