// docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting": Size.
import { describe, expect, it } from 'vitest';
import {
  clampFontSize,
  fontSizeLabel,
  FONT_SIZE_STEPS,
  parseFontSizeText,
} from './office-font-size';

describe('parseFontSizeText', () => {
  it('reads a number from 1 to 400, to a tenth, with or without pt', () => {
    expect(parseFontSizeText('11')).toBe(11);
    expect(parseFontSizeText(' 10.5 pt ')).toBe(10.5);
    expect(parseFontSizeText('10,26')).toBe(10.3);
    expect(parseFontSizeText('1')).toBe(1);
    expect(parseFontSizeText('400')).toBe(400);
  });

  it('refuses anything else', () => {
    for (const text of ['', '0', '0.04', '401', 'big', '-3', '1e2', '12px'])
      expect(parseFontSizeText(text), text).toBeNull();
  });
});

describe('clampFontSize', () => {
  it('keeps a size within 1 to 400, to a tenth', () => {
    expect(clampFontSize(0)).toBe(1);
    expect(clampFontSize(900)).toBe(400);
    expect(clampFontSize(10.55)).toBe(10.6);
  });
});

describe('fontSizeLabel', () => {
  it('shows the size, blank when mixed', () => {
    expect(fontSizeLabel(11)).toBe('11');
    expect(fontSizeLabel(10.5)).toBe('10.5');
    expect(fontSizeLabel(null)).toBe('');
  });

  it('offers Google’s steps', () => {
    expect(FONT_SIZE_STEPS).toEqual([6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96]);
  });
});
