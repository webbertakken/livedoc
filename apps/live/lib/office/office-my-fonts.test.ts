// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "The font menu" and "More fonts": My fonts, kept in this browser.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentFonts } from '@livedoc/document';
import { MY_FONTS_KEY, MyFonts, readMyFonts, writeMyFonts } from './office-my-fonts';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('My fonts', () => {
  it('starts as the catalogue menu families', () => {
    expect(readMyFonts()).toEqual(DocumentFonts.menu());
  });

  it('keeps what was written, in alphabetical order, each once', () => {
    writeMyFonts(['Rubik', 'Arial', 'Rubik', 'Lora']);
    expect(readMyFonts()).toEqual(['Arial', 'Lora', 'Rubik']);
  });

  it('gives the starting My fonts for storage it cannot read', () => {
    for (const stored of [
      '{oops',
      JSON.stringify({ a: 1 }),
      JSON.stringify([]),
      JSON.stringify([3]),
    ]) {
      localStorage.setItem(MY_FONTS_KEY, stored);
      expect(readMyFonts()).toEqual(DocumentFonts.menu());
    }
    localStorage.setItem(MY_FONTS_KEY, JSON.stringify(['Lora', 3]));
    expect(readMyFonts()).toEqual(['Lora']);
  });

  it('keeps nothing when storage is full, and says so', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    writeMyFonts(['Rubik']);
    expect(readMyFonts()).toEqual(DocumentFonts.menu());
    expect(log.mock.calls.flat().join(' ')).toContain('[office] my fonts not kept');
  });
});

describe('MyFonts', () => {
  it('adds a family missing and takes out one there, whatever its case', () => {
    expect(MyFonts.toggle(['Lora'], 'Rubik')).toEqual(['Lora', 'Rubik']);
    expect(MyFonts.toggle(['Lora', 'Rubik'], 'rubik')).toEqual(['Lora']);
  });

  it('says whether a family is held, whatever its case', () => {
    expect(MyFonts.has(['Lora'], 'LORA')).toBe(true);
    expect(MyFonts.has(['Lora'], 'Rubik')).toBe(false);
  });

  it('tells whether two lists hold the same families', () => {
    expect(MyFonts.same(['Lora', 'Arial'], ['Arial', 'Lora'])).toBe(true);
    expect(MyFonts.same(['Lora'], ['Lora', 'Arial'])).toBe(false);
    expect(MyFonts.same(['Lora'], ['Arial'])).toBe(false);
  });
});
