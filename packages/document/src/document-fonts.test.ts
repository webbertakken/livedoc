// docs/specs/004-interface-design/fonts.md "Document fonts".
import { describe, expect, it } from 'vitest';
import { DOCUMENT_DEFAULT_FONT, DOCUMENT_FONTS, DocumentFonts } from './document-fonts';

describe('DOCUMENT_FONTS', () => {
  it('names each family once, and every stand-in is a served family', () => {
    const names = DOCUMENT_FONTS.map((f) => f.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const font of DOCUMENT_FONTS) {
      if (font.standIn) expect(DocumentFonts.find(font.standIn)?.served, font.name).toBeDefined();
      expect(font.served !== undefined && font.standIn !== undefined, font.name).toBe(false);
    }
  });

  it('serves each family from its Fontsource package, regular first', () => {
    for (const font of DocumentFonts.served()) {
      expect(font.served.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(font.served.styles[0]).toBe('400-normal');
    }
    expect(DocumentFonts.find('Playfair Display')?.served?.id).toBe('playfair-display');
  });

  it('stands metric-compatible families in for the ones files name', () => {
    expect(DocumentFonts.drawnIn('Arial')).toBe('Arimo');
    expect(DocumentFonts.drawnIn('times new roman')).toBe('Tinos');
    expect(DocumentFonts.drawnIn('Courier New')).toBe('Cousine');
    expect(DocumentFonts.drawnIn('Calibri')).toBe('Carlito');
    expect(DocumentFonts.drawnIn('Cambria')).toBe('Caladea');
    expect(DocumentFonts.drawnIn('Georgia')).toBe('Gelasio');
    expect(DocumentFonts.drawnIn('Lora')).toBe('Lora');
    expect(DocumentFonts.drawnIn('Verdana')).toBeUndefined();
    expect(DocumentFonts.drawnIn('Wingdings')).toBeUndefined();
  });
});

describe('DocumentFonts.stack', () => {
  it('draws a served family in its own faces, another itself then its stand-in, then the generic family', () => {
    expect(DocumentFonts.stack('Arial')).toBe('"Arial", "LiveDoc Arimo", sans-serif');
    expect(DocumentFonts.stack('Courier New')).toBe('"Courier New", "LiveDoc Cousine", monospace');
    expect(DocumentFonts.stack('lora')).toBe('"LiveDoc Lora", serif');
    expect(DocumentFonts.stack('Verdana')).toBe('"Verdana", sans-serif');
  });

  it('falls back to the default family for one it does not know, or none', () => {
    expect(DocumentFonts.stack('Wingdings')).toBe(
      '"Wingdings", "Arial", "LiveDoc Arimo", sans-serif',
    );
    expect(DocumentFonts.stack('  ')).toBe(
      `"${DOCUMENT_DEFAULT_FONT}", "Arial", "LiveDoc Arimo", sans-serif`,
    );
  });

  it('keeps quotes and backslashes out of the stack', () => {
    expect(DocumentFonts.stack('Odd"Font\\')).toBe(
      '"OddFont", "Arial", "LiveDoc Arimo", sans-serif',
    );
  });
});

describe('DocumentFonts.menu', () => {
  it("lists Google's default menu, alphabetically", () => {
    expect(DocumentFonts.menu()).toEqual([
      'Amatic SC',
      'Arial',
      'Caveat',
      'Comfortaa',
      'Comic Sans MS',
      'Courier New',
      'EB Garamond',
      'Georgia',
      'Impact',
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
      'Times New Roman',
      'Trebuchet MS',
      'Verdana',
    ]);
  });
});
