// The currency a locale writes money in (docs/specs/029-sheets/formulas.md "Text": DOLLAR, D44).
import { describe, expect, it } from 'vitest';
import { FALLBACK_CURRENCY, localeCurrency } from './locale-currency';

describe('localeCurrency', () => {
  it.each([
    ['en-US', 'USD'],
    ['en-GB', 'GBP'],
    ['en', 'USD'],
    ['de', 'EUR'],
    ['nl-NL', 'EUR'],
    ['fr-CH', 'CHF'],
    ['ja', 'JPY'],
    ['pt-BR', 'BRL'],
    ['zh-Hant', 'TWD'],
  ])('%s writes %s', (locale, code) => {
    expect(localeCurrency(locale)).toBe(code);
  });

  it.each(['en-AQ', '', 'not a locale!'])('writes US dollars for %j', (locale) => {
    expect(localeCurrency(locale)).toBe(FALLBACK_CURRENCY);
  });
});
