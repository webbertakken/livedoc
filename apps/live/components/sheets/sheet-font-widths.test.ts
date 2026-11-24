import { describe, expect, it } from 'vitest';
import { DOCUMENT_FONTS, DocumentFonts, FONTS } from '@livedoc/document';
import { MEASURED_FONTS, measuredFont } from '@livedoc/sheets';

// docs/specs/004-interface-design/fonts.md "In a Sheet": a Sheet breaks its lines by each font's own widths, from a
// table `pnpm --filter @livedoc/live fonts:advances` writes. A font with no table is measured as another, whatever it
// draws as, with nothing at runtime to notice.
describe("the Sheet's font widths", () => {
  it('hold every font the editor offers and every served document family, and no other', () => {
    expect([...MEASURED_FONTS].sort()).toEqual(
      [...FONTS.map((font) => font.id), ...DocumentFonts.served().map((font) => font.name)].sort(),
    );
  });

  it('measure each document family as it draws: itself, its stand-in, else Arimo (formatting.md D202)', () => {
    for (const font of DOCUMENT_FONTS)
      expect(measuredFont(font.name)).toBe(DocumentFonts.drawnIn(font.name) ?? 'Arimo');
  });
});
