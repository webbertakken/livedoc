// docs/specs/029-sheets/standard-mapping.md "Number formats in the file" (D90, D91): each format of the model as its
// code, and back by exact code; any other code Custom; a code TEXT cannot take unread.
import { describe, expect, it } from 'vitest';
import {
  formatCodeOf,
  formatFromCode,
  shortDateCode,
  type NumberFormat,
} from './number-format-code';

const GB = 'en-GB';

describe('shortDateCode', () => {
  it('is the locale’s short date as the grid draws it', () => {
    expect(shortDateCode('en-GB')).toBe('dd/mm/yyyy');
    expect(shortDateCode('en-US')).toBe('mm/dd/yyyy');
    expect(shortDateCode('de-DE')).toBe('dd.mm.yyyy');
    expect(shortDateCode('en-GB')).toBe('dd/mm/yyyy');
  });

  it('quotes a literal that is no separator, and falls back for a locale no runtime knows', () => {
    expect(shortDateCode('hu-HU')).toBe('yyyy. mm. dd.');
    expect(shortDateCode('bg-BG')).toBe('dd.mm.yyyy" г."');
    expect(shortDateCode('not a locale!')).toBe(shortDateCode('en'));
  });
});

describe('formatCodeOf', () => {
  it.each<[NumberFormat | undefined, string | null]>([
    [undefined, null],
    [{ nf: 'auto' }, null],
    [{ nf: 'auto', dp: 2 }, '0.00'],
    [{ nf: 'auto', dp: 0 }, '0'],
    [{ nf: 'number' }, '#,##0.00'],
    [{ nf: 'number', dp: 0 }, '#,##0'],
    [{ nf: 'percent', dp: 1 }, '0.0%'],
    [{ nf: 'scientific' }, '0.00E+00'],
    [{ nf: 'currency' }, '"£"#,##0.00'],
    [{ nf: 'currency', cur: '$', dp: 0 }, '"$"#,##0'],
    [
      { nf: 'accounting', cur: '€' },
      '_("€"* #,##0.00_);_("€"* \\(#,##0.00\\);_("€"* "-"??_);_(@_)',
    ],
    [{ nf: 'accounting', dp: 0 }, '_("£"* #,##0_);_("£"* \\(#,##0\\);_("£"* "-"_);_(@_)'],
    [{ nf: 'financial' }, '#,##0.00;(#,##0.00)'],
    [{ nf: 'financial', dp: 0 }, '#,##0;(#,##0)'],
    [{ nf: 'date' }, 'dd/mm/yyyy'],
    [{ nf: 'time' }, 'hh:mm:ss'],
    [{ nf: 'datetime' }, 'dd/mm/yyyy hh:mm'],
    [{ nf: 'duration' }, '[h]:mm:ss'],
    [{ nf: 'text' }, '@'],
    [{ nf: 'custom', nc: '0.0"kg"' }, '0.0"kg"'],
    [{ nf: 'custom' }, null],
  ])('writes %j as %j', (format, code) => {
    expect(formatCodeOf(format, GB)).toBe(code);
  });

  it('escapes a symbol holding a quote', () => {
    expect(formatCodeOf({ nf: 'currency', cur: 'a"b' }, GB)).toBe('\\a\\"\\b#,##0.00');
  });
});

describe('formatFromCode', () => {
  it('reads every format the model writes back as itself', () => {
    const formats: NumberFormat[] = [
      { nf: 'auto', dp: 3 },
      { nf: 'number', dp: 2 },
      { nf: 'percent', dp: 0 },
      { nf: 'scientific', dp: 4 },
      { nf: 'currency', cur: '$', dp: 2 },
      { nf: 'currency', cur: 'CHF', dp: 1 },
      { nf: 'accounting', cur: '£', dp: 2 },
      { nf: 'financial', dp: 2 },
      { nf: 'financial', dp: 0 },
      { nf: 'date' },
      { nf: 'time' },
      { nf: 'datetime' },
      { nf: 'duration' },
      { nf: 'text' },
      { nf: 'custom', nc: 'mmm yyyy' },
    ];
    for (const format of formats)
      expect(formatFromCode(formatCodeOf(format, 'en-US')!, 'en-US')).toEqual({ ok: true, format });
  });

  it('reads General and nothing as Automatic', () => {
    expect(formatFromCode('General', GB)).toEqual({ ok: true, format: undefined });
    expect(formatFromCode('general', GB)).toEqual({ ok: true, format: undefined });
    expect(formatFromCode('', GB)).toEqual({ ok: true, format: undefined });
  });

  it('reads a currency in Excel’s and LibreOffice’s other spellings (D91)', () => {
    const pound = { ok: true, format: { nf: 'currency', cur: '£', dp: 2 } };
    expect(formatFromCode('£#,##0.00', GB)).toEqual(pound);
    expect(formatFromCode('[$£-809]#,##0.00', GB)).toEqual(pound);
    expect(formatFromCode('[$£]#,##0.00', GB)).toEqual(pound);
    expect(formatFromCode('$#,##0', GB)).toEqual({
      ok: true,
      format: { nf: 'currency', cur: '$', dp: 0 },
    });
  });

  it('reads as Custom what the model cannot hold as a format of its own', () => {
    const custom = (nc: string) => ({ ok: true, format: { nf: 'custom', nc } });
    // A symbol the toolbar does not offer, more decimals than a cell takes, another date, more sections.
    expect(formatFromCode('"Kč"#,##0.00', GB)).toEqual(custom('"Kč"#,##0.00'));
    expect(formatFromCode('0.000000000000', GB)).toEqual(custom('0.000000000000'));
    expect(formatFromCode('mm/dd/yyyy', GB)).toEqual(custom('mm/dd/yyyy'));
    expect(formatFromCode('#,##0.00;[Red]-#,##0.00', GB)).toEqual(
      custom('#,##0.00;[Red]-#,##0.00'),
    );
    const accounting = '_("£"* #,##0.00_);_("£"* \\(#,##0.00\\);_("£"* "-"_);_(@_)';
    expect(formatFromCode(accounting, GB)).toEqual(custom(accounting));
    expect(formatFromCode('_("Kč"* #,##0_);x', GB)).toEqual(custom('_("Kč"* #,##0_);x'));
  });

  it('leaves unread a code TEXT cannot take', () => {
    expect(formatFromCode('0.00"', GB)).toEqual({ ok: false });
    expect(formatFromCode('0;0;0;0;0', GB)).toEqual({ ok: false });
  });

  // formatting.md "Number formats": Financial is its code with equal decimals both sides, else Custom.
  it('reads Financial only with the same decimals both sides', () => {
    expect(formatFromCode('#,##0.0;(#,##0.00)', GB)).toEqual({
      ok: true,
      format: { nf: 'custom', nc: '#,##0.0;(#,##0.00)' },
    });
  });
});
