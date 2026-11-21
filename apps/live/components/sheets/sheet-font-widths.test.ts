import { describe, expect, it } from 'vitest';
import { FONTS } from '@livedoc/document';
import { MEASURED_FONTS } from '@livedoc/sheets';

// docs/specs/004-interface-design/fonts.md "In a Sheet": a Sheet breaks its lines by each font's own widths, from a
// table `pnpm --filter @livedoc/live fonts:advances` writes. A font with no table is measured in the system face,
// wider than it draws, with nothing at runtime to notice.
describe("the Sheet's font widths", () => {
  it('hold every font the editor offers, and no other', () => {
    expect([...MEASURED_FONTS].sort()).toEqual(FONTS.map((font) => font.id).sort());
  });
});
