// formatting.md "Number formats": Custom Currencies' list, its search and each currency's formats (D195).
import { describe, expect, it } from 'vitest';
import { formatCodeDraw } from '@livedoc/sheets';
import { currencyFormats, currencyList, currencyMatches } from './custom-currency';

describe('currencyList', () => {
  it('names every currency the browser knows in the locale, with its code and symbol, by name', () => {
    const list = currencyList('en-GB');
    expect(list.length).toBe(Intl.supportedValuesOf('currency').length);
    expect(list.find((c) => c.code === 'EUR')).toEqual({ code: 'EUR', name: 'Euro', symbol: '€' });
    const names = list.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-GB')));
    expect(currencyList('en-GB')).toBe(list);
    expect(currencyList('de-DE').find((c) => c.code === 'USD')?.name).toBe('US-Dollar');
  });
});

describe('currencyMatches', () => {
  it('matches a name, a code or a symbol, any case, and all for no query', () => {
    const list = currencyList('en-GB');
    expect(currencyMatches(list, '  ')).toBe(list);
    expect(currencyMatches(list, 'eur').map((c) => c.code)).toContain('EUR');
    expect(currencyMatches(list, 'yen').map((c) => c.code)).toContain('JPY');
    expect(currencyMatches(list, '€').map((c) => c.code)).toContain('EUR');
    expect(currencyMatches(list, 'zzzz')).toEqual([]);
  });
});

describe('currencyFormats', () => {
  it('places the symbol before or after, with two decimals or none (D195)', () => {
    const codes = currencyFormats('€').map((f) => f.code);
    expect(codes).toEqual(['"€"#,##0.00', '"€"#,##0', '#,##0.00"€"', '#,##0"€"']);
    expect(codes.map((code) => formatCodeDraw(1000.12, code).text)).toEqual([
      '€1,000.12',
      '€1,000',
      '1,000.12€',
      '1,000€',
    ]);
  });

  it('escapes a symbol holding a quote', () => {
    expect(currencyFormats('a"b')[0]!.code).toBe('\\a\\"\\b#,##0.00');
  });
});
