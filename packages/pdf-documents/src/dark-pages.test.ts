// docs/specs/035-pdf-documents/dark-pages.md "The recolouring", "Accessibility": lightness mirrored onto dark paper
// and ink, hue kept, contrast kept, photographs put back.
import { describe, expect, it } from 'vitest';
import { DARK_INK, DARK_PAPER, DarkPages } from './dark-pages';

const channel = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb: number): number =>
  0.2126 * channel((rgb >> 16) & 255) +
  0.7152 * channel((rgb >> 8) & 255) +
  0.0722 * channel(rgb & 255);
const contrast = (a: number, b: number): number => {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const grey = (v: number): number => (v << 16) | (v << 8) | v;
/** Within one step a channel. */
const near = (a: number, b: number): boolean =>
  [16, 8, 0].every((shift) => Math.abs(((a >> shift) & 255) - ((b >> shift) & 255)) <= 1);
const PAPER = DarkPages.colour(0xffffff);

function bitmap(pixels: readonly number[]): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((rgb, at) => rgba.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], at * 4));
  return rgba;
}
const rgbAt = (rgba: Uint8ClampedArray, pixel: number): number =>
  (rgba[pixel * 4]! << 16) | (rgba[pixel * 4 + 1]! << 8) | rgba[pixel * 4 + 2]!;

describe('Dark pages’ colours', () => {
  it('turns white paper into dark paper, and black text into ink', () => {
    // White has no hue to keep, so it lands on the dark paper's lightness as a neutral grey, a step from it.
    expect(near(DarkPages.colour(0xffffff), DARK_PAPER)).toBe(true);
    expect(DarkPages.colour(0x000000)).toBe(DARK_INK);
    expect(DarkPages.hex('#ffffff')).toBe('#1f1f1f');
  });

  it('keeps a colour’s hue: a red heading stays red', () => {
    const red = DarkPages.colour(0xc00000);
    expect(red >> 16).toBeGreaterThan(((red >> 8) & 255) * 2);
    expect(red >> 16).toBeGreaterThan((red & 255) * 2);
  });

  // "The curve keeps contrast": every grey at 4.5:1 or more on white stays at 4.5:1 or more on dark paper.
  it('keeps every grey that read at 4.5:1 on white at 4.5:1 or more on dark paper', () => {
    const readable = Array.from({ length: 256 }, (_, v) => grey(v)).filter(
      (g) => contrast(g, 0xffffff) >= 4.5,
    );
    expect(readable.length).toBeGreaterThan(100);
    for (const g of readable)
      expect(contrast(DarkPages.colour(g), DARK_PAPER)).toBeGreaterThanOrEqual(4.5);
    // "Limits": #767676 lands at 4.8:1, black at 12.8:1.
    expect(contrast(DarkPages.colour(0x767676), DARK_PAPER)).toBeCloseTo(4.8, 1);
    expect(contrast(DarkPages.colour(0x000000), DARK_PAPER)).toBeCloseTo(12.8, 0);
  });
});

describe('a bitmap shown dark', () => {
  it('mirrors every pixel but those of a photograph, which stay as drawn, alpha kept', () => {
    // Two rows of three: the middle column is a photograph.
    const drawn = bitmap([0xffffff, 0x336699, 0x000000, 0xffffff, 0x996633, 0x000000]);
    drawn[3] = 128;
    const dark = DarkPages.mirror(drawn, 3, [{ x0: 1, y0: 0, x1: 2, y1: 2 }]);
    expect([0, 2, 3, 5].map((pixel) => rgbAt(dark, pixel))).toEqual([
      PAPER,
      DARK_INK,
      PAPER,
      DARK_INK,
    ]);
    expect(rgbAt(dark, 1)).toBe(0x336699);
    expect(rgbAt(dark, 4)).toBe(0x996633);
    expect(dark[3]).toBe(128);
    // The bitmap drawn is left as it was.
    expect(rgbAt(drawn, 0)).toBe(0xffffff);
  });

  it('mirrors a whole bitmap where nothing is kept, a colour met again answered alike', () => {
    const dark = DarkPages.mirror(bitmap([0xffffff, 0x000000, 0xffffff, 0xffffff]), 2, []);
    expect([0, 1, 2, 3].map((pixel) => rgbAt(dark, pixel))).toEqual([
      PAPER,
      DARK_INK,
      PAPER,
      PAPER,
    ]);
  });
});

describe('a photograph', () => {
  it('shows at least 48 distinct colours; a chart’s bar or a logo shows fewer', () => {
    const photograph = bitmap(
      Array.from({ length: 64 }, (_, at) => ((at * 4) << 16) | (((at % 8) * 32) << 8)),
    );
    const bar = bitmap(Array.from({ length: 64 }, (_, at) => (at % 2 ? 0x3366cc : 0xffffff)));
    expect(DarkPages.isPhotograph(photograph)).toBe(true);
    expect(DarkPages.isPhotograph(bar)).toBe(false);
  });
});
