import { describe, expect, it } from 'vitest';
import { MARK_FONT_FAMILIES, MARK_FONTS, MarkFonts } from './mark-fonts';

describe('MARK_FONTS', () => {
  it('holds the served families of the document fonts menu, in alphabetical order', () => {
    expect(MARK_FONTS).toEqual([
      'Amatic SC',
      'Caveat',
      'Comfortaa',
      'EB Garamond',
      'Lexend',
      'Lobster',
      'Lora',
      'Merriweather',
      'Montserrat',
      'Nunito',
      'Oswald',
      'Pacifico',
      'Playfair Display',
      'Roboto',
      'Roboto Mono',
      'Roboto Serif',
      'Spectral',
    ]);
  });

  it('serves each from its Fontsource package, Latin and Latin Extended, regular only', () => {
    expect(MARK_FONT_FAMILIES.find((each) => each.family === 'Playfair Display')).toEqual({
      family: 'Playfair Display',
      package: 'playfair-display',
      subsets: ['latin', 'latin-ext'],
      weights: [400],
    });
  });
});

describe('MarkFonts.of', () => {
  it('answers the catalogue spelling of a family named in any case', () => {
    expect(MarkFonts.of('lora')).toBe('Lora');
    expect(MarkFonts.of(' EB GARAMOND ')).toBe('EB Garamond');
  });

  it('answers null for a family the menu does not hold, or for none', () => {
    expect(MarkFonts.of('Arial')).toBeNull();
    expect(MarkFonts.of('Arimo')).toBeNull();
    expect(MarkFonts.of('')).toBeNull();
    expect(MarkFonts.of(null)).toBeNull();
    expect(MarkFonts.of(12)).toBeNull();
  });
});
