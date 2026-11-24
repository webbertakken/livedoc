// A spreadsheet cell's font (docs/specs/029-sheets/formatting.md "Font"): a family by name, as files write it, drawn
// through the document fonts' stacks; Arial where the cell sets none (D201). A Plan Sheet's cells name editor fonts by
// id, and one key holds either: a name shaped as an id is read as one.
import { DocumentFonts, FONTS, resolveFontStack } from '@livedoc/document';
import { isFontId, type Cell, type CellFormat, type FormatPatch } from '@livedoc/sheets';

export const SPREADSHEET_DEFAULT_FONT = 'Arial';

/** The family the toolbar's Font shows for a cell: its own, an editor font by its name, else Arial. */
export function cellFamilyOf(f: CellFormat | undefined): string {
  const ff = f?.ff;
  if (!ff) return SPREADSHEET_DEFAULT_FONT;
  if (!isFontId(ff)) return ff;
  return FONTS.find((font) => font.id === ff)?.label ?? SPREADSHEET_DEFAULT_FONT;
}

/** The format a chosen family sets: Arial, the default, is stored as none. */
export const cellFontPatch = (family: string): FormatPatch => ({
  ff: family.toLowerCase() === SPREADSHEET_DEFAULT_FONT.toLowerCase() ? null : family,
});

/** The families the cells name, once each in the order first seen, for those LiveDoc does not serve to load. */
export function cellFamilies(cells: Iterable<Cell>): string[] {
  const families = new Set<string>();
  for (const cell of cells) {
    const ff = cell.format?.ff;
    if (ff && !isFontId(ff)) families.add(ff);
  }
  return [...families];
}

/**
 * A cell's font as a CSS stack, for a Plan Sheet's cells and a spreadsheet's alike: an editor font by its stack (none
 * for one no longer offered, so the tab's font draws), a family by the document fonts' stack, none for no font.
 */
export function sheetFontStack(font: string | undefined): string | undefined {
  if (!font) return undefined;
  return isFontId(font) ? resolveFontStack(font) : DocumentFonts.stack(font);
}
