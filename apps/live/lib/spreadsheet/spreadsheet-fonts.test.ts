import { describe, expect, it } from 'vitest';
import { DocumentFonts, resolveFontStack } from '@livedoc/document';
import type { Cell } from '@livedoc/sheets';
import {
  SPREADSHEET_DEFAULT_FONT,
  cellFamilies,
  cellFamilyOf,
  cellFontPatch,
  sheetFontStack,
} from './spreadsheet-fonts';

const cell = (ff?: string): Cell => (ff ? { format: { ff } } : {});

// docs/specs/029-sheets/formatting.md "Font": a spreadsheet cell's font is a family by name, Arial where it sets none.
describe('a spreadsheet cell’s font', () => {
  it('shows the cell’s family, an editor font by its name, else Arial (D201)', () => {
    expect(SPREADSHEET_DEFAULT_FONT).toBe('Arial');
    expect(cellFamilyOf(undefined)).toBe('Arial');
    expect(cellFamilyOf({})).toBe('Arial');
    // formatting.md "Themes": a cell setting none shows the theme's font, and choosing it sets none.
    expect(cellFamilyOf(undefined, 'Roboto')).toBe('Roboto');
    expect(cellFontPatch('roboto', 'Roboto')).toEqual({ ff: null });
    expect(cellFontPatch('Arial', 'Roboto')).toEqual({ ff: 'Arial' });
    expect(cellFamilyOf({ ff: 'Roboto Mono' })).toBe('Roboto Mono');
    expect(cellFamilyOf({ ff: 'space-grotesk' })).toBe('Space Grotesk');
    expect(cellFamilyOf({ ff: 'gone' })).toBe('Arial');
  });

  it('stores Arial, the default, as none', () => {
    expect(cellFontPatch('Lora')).toEqual({ ff: 'Lora' });
    expect(cellFontPatch('Arial')).toEqual({ ff: null });
    expect(cellFontPatch('arial')).toEqual({ ff: null });
  });

  it('lists the families the cells name, once each, never an editor font', () => {
    expect(
      cellFamilies([cell('Bitter'), cell(), cell('inter'), cell('Bitter'), cell('Lora')]),
    ).toEqual(['Bitter', 'Lora']);
  });

  it('draws an editor font by its stack, a family by the catalogue’s, none by the tab’s', () => {
    expect(sheetFontStack(undefined)).toBeUndefined();
    expect(sheetFontStack('lora')).toBe(resolveFontStack('lora'));
    expect(sheetFontStack('gone')).toBeUndefined();
    expect(sheetFontStack('Roboto Mono')).toBe(DocumentFonts.stack('Roboto Mono'));
    expect(sheetFontStack('Arial')).toBe(DocumentFonts.stack('Arial'));
  });
});
