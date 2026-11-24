// formatting.md "Number formats": the Custom Number Formats dialog's start, preview and examples (D193).
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_FORMAT_EXAMPLES,
  CUSTOM_FORMAT_SAMPLE,
  customFormatPreview,
  customFormatStart,
} from './custom-number-format';

describe('customFormatStart', () => {
  it('starts from the cell’s code, its format’s when not Custom, else the default', () => {
    expect(customFormatStart({ nf: 'custom', nc: '0.0"kg"' }, 'en-GB')).toBe('0.0"kg"');
    expect(customFormatStart({ nf: 'percent', dp: 1 }, 'en-GB')).toBe('0.0%');
    expect(customFormatStart(undefined, 'en-GB')).toBe('#,##0.00');
    expect(customFormatStart({ nf: 'auto' }, 'en-GB')).toBe('#,##0.00');
  });
});

describe('customFormatPreview', () => {
  it('draws the cell’s number or text in the code, with its colour', () => {
    expect(customFormatPreview(-3, '0;[Red](0)')).toEqual({
      ok: true,
      text: '(3)',
      colour: '#FF0000',
    });
    expect(customFormatPreview('ab', '"<"@">"')).toEqual({ ok: true, text: '<ab>' });
  });

  it('draws the sample for an empty cell, a truth value or an error', () => {
    for (const value of [null, true, { e: '#N/A' as const }])
      expect(customFormatPreview(value, '0.0')).toEqual({ ok: true, text: '1234.5' });
    expect(CUSTOM_FORMAT_SAMPLE).toBe(1234.5);
  });

  it('says why a code cannot be read', () => {
    expect(customFormatPreview(1, '[Red0')).toEqual({ ok: false, problem: '`[` is not closed' });
  });
});

describe('CUSTOM_FORMAT_EXAMPLES', () => {
  it('holds Google’s examples, each one a code that reads (D193)', () => {
    expect(CUSTOM_FORMAT_EXAMPLES).toHaveLength(14);
    for (const code of CUSTOM_FORMAT_EXAMPLES)
      expect(customFormatPreview(1, code).ok, code).toBe(true);
    expect(customFormatPreview(CUSTOM_FORMAT_SAMPLE, CUSTOM_FORMAT_EXAMPLES[9]!)).toEqual({
      ok: true,
      text: '1.2K',
    });
  });
});
