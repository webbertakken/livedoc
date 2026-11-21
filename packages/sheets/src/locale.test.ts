// A spreadsheet's locale and time zone (docs/specs/029-sheets/formulas.md "Locale"): typing, showing and working out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zonedMs } from './dates';
import { Workbook } from './engine/workbook';
import { capitalFunctionNames } from './formula/function-case';
import { plainNumber, toNumber, toText } from './formula/values';
import { book, makeSheets } from './testing/book';
import { compileTypedFormula, formulaAsTyped, inputAsText, readTypedInput } from './typed-input';

const DE = 'de-DE';

describe('a formula typed in a locale', () => {
  const sheets = makeSheets({ S: {} });
  const ctx = new Workbook({ sheets, locale: DE }).ctxFor(sheets[0]!.id);

  it('is stored in the one syntax, function names in capitals (D80)', () => {
    const typed = compileTypedFormula('=round(1,5;0)+sum({1\\2})', DE, ctx);
    expect(typed.ok && typed.formula.t).toBe('ROUND(1.5,0)+SUM({1,2})');
    const en = readTypedInput('=sum(A1, 1.5)', 'en-GB', ctx);
    expect(en.kind === 'value' && en.input).toMatchObject({ f: { t: 'SUM(@0, 1.5)' } });
  });

  it('is refused where the locale cannot read it, at the place', () => {
    expect(readTypedInput('=SUM(1,2,3)', DE, ctx)).toEqual({
      kind: 'invalid',
      reason: 'unexpected_token',
      at: 8,
    });
  });

  it('is shown in the locale, and so is a number', () => {
    const typed = compileTypedFormula('=ROUND(1,5;0)', DE, ctx);
    if (!typed.ok) throw new Error('unread');
    expect(formulaAsTyped(typed.formula, ctx, DE)).toBe('=ROUND(1,5;0)');
    expect(formulaAsTyped(typed.formula, ctx, 'en-US')).toBe('=ROUND(1.5,0)');
    expect(inputAsText({ f: typed.formula }, ctx, DE)).toBe('=ROUND(1,5;0)');
    expect(inputAsText({ n: 1234.5 }, ctx, DE)).toBe('1234,5');
    expect(inputAsText({ n: 1234.5 }, ctx, 'en-US')).toBe('1234.5');
  });
});

describe('capitalFunctionNames', () => {
  it('capitalises known functions only, keeping every place', () => {
    expect(capitalFunctionNames('=sum (a1) + foo(1) + iferror(x, 1) + sum')).toBe(
      '=SUM (a1) + foo(1) + IFERROR(x, 1) + sum',
    );
    expect(capitalFunctionNames('plain')).toBe('plain');
  });
});

describe('text and numbers in a locale', () => {
  it('reads text with the locale’s decimal mark, no grouping', () => {
    expect(plainNumber('1,5', DE)).toBe(1.5);
    expect(plainNumber('1.5', DE)).toBeNull();
    expect(plainNumber('1,5', 'en-US')).toBeNull();
    expect(toNumber('12,5%', DE)).toBe(0.125);
    expect(toNumber('12.5%', DE)).toMatchObject({ e: '#VALUE!' });
  });

  it('writes a number with the locale’s decimal mark', () => {
    expect(toText(1.5, DE)).toBe('1,5');
    expect(toText(1.5, 'en-US')).toBe('1.5');
  });

  it('works formulas out in the locale', () => {
    const b = book(
      {
        A1: '1,5',
        A2: '="2,5"*2',
        A3: '=A1&""',
        A4: '=COUNTIF(A1:A2;">1,4")',
        A5: '=VALUE("1.234,5")',
      },
      { locale: DE },
    );
    expect(b.v('A1')).toBe(1.5);
    expect(b.v('A2')).toBe(5);
    expect(b.v('A3')).toBe('1,5');
    expect(b.v('A4')).toBe(2);
    expect(b.v('A5')).toBe(1234.5);
  });

  it('gives FORMULATEXT in the locale’s syntax', () => {
    const b = book({ A1: '=ROUND(1,5;0)', A2: '=FORMULATEXT(A1)' }, { locale: DE });
    expect(b.v('A2')).toBe('=ROUND(1,5;0)');
  });
});

describe('a spreadsheet’s time zone', () => {
  afterEach(() => vi.useRealTimers());

  it('moves an instant to a zone’s wall clock, an unknown zone as UTC (D81)', () => {
    const noon = Date.UTC(2026, 10, 20, 12, 0, 0, 250);
    expect(zonedMs(noon, 'UTC')).toBe(noon);
    expect(zonedMs(noon, 'Europe/Amsterdam')).toBe(Date.UTC(2026, 10, 20, 13, 0, 0, 250));
    expect(zonedMs(noon, 'America/New_York')).toBe(Date.UTC(2026, 10, 20, 7, 0, 0, 250));
    expect(zonedMs(noon, 'Not/AZone')).toBe(noon);
    expect(zonedMs(Date.UTC(1969, 11, 31, 23, 0, 0, 0) - 750, 'UTC')).toBe(
      Date.UTC(1969, 11, 31, 23, 0, 0, 0) - 750,
    );
  });

  it('is what NOW and TODAY read', () => {
    vi.useFakeTimers();
    // 23:30 in UTC is already the next day in Tokyo.
    vi.setSystemTime(Date.UTC(2026, 10, 20, 23, 30));
    const sheets = makeSheets({ S: { A1: '=TODAY()', A2: '=NOW()' } });
    const tokyo = new Workbook({ sheets, locale: 'en-GB', timeZone: 'Asia/Tokyo' });
    const utc = new Workbook({ sheets, locale: 'en-GB', timeZone: 'UTC' });
    expect(tokyo.timeZone).toBe('Asia/Tokyo');
    expect(tokyo.value(sheets[0]!.id, 0, 0)).toBe(46347);
    expect(utc.value(sheets[0]!.id, 0, 0)).toBe(46346);
    expect(utc.value(sheets[0]!.id, 1, 0)).toBeCloseTo(46346 + 23.5 / 24, 9);
  });
});
