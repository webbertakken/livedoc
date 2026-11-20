// The page's paper (docs/specs/034-text-documents/editing-surface.md "The page in the dark scheme"): white in the light
// scheme, dark in the dark one. A document's colours are written for any paper and drawn for the one they are on: on
// dark paper a dark ink is drawn light and a pale fill dark, each keeping its hue and chroma, its OKLCH lightness
// mirrored about MIRROR; the ink then lifted toward white until it reads at 4.5:1. CSS `light-dark()` picks the value
// by the page's colour scheme, so one drawing serves both.
import { hexOklch, oklchHex, readableInk } from '@livedoc/document';

export const LIGHT_PAPER = '#ffffff';
export const DARK_PAPER = '#1e1f20';
/** The writing's ink where it has no colour of its own. */
export const LIGHT_INK = '#000000';
export const DARK_INK = '#e3e3e3';
/** The lightness dark and pale colours are mirrored about (default). */
export const MIRROR = 0.635;
const LIGHTEST_INK = 0.95;

const HEX = /^#[0-9a-f]{6}$/i;

const mirrored = (hex: string, keep: (l: number) => boolean): string => {
  const colour = hexOklch(hex);
  if (!colour || keep(colour.l)) return hex.toLowerCase();
  return oklchHex(Math.min(LIGHTEST_INK, Math.max(0, 2 * MIRROR - colour.l)), colour.c, colour.h);
};

/** A text colour as drawn on dark paper. */
export const inkOnDarkPaper = (hex: string): string =>
  readableInk(
    mirrored(hex, (l) => l >= MIRROR),
    DARK_PAPER,
  );

/** A fill (a highlight, a background) as drawn on dark paper. */
export const fillOnDarkPaper = (hex: string): string => mirrored(hex, (l) => l <= MIRROR);

/** A text colour as one CSS value for either paper; anything not `#rrggbb` passes unchanged. */
export const paperInk = (hex: string): string =>
  HEX.test(hex) ? `light-dark(${hex}, ${inkOnDarkPaper(hex)})` : hex;

/** A fill as one CSS value for either paper. */
export const paperFill = (hex: string): string =>
  HEX.test(hex) ? `light-dark(${hex}, ${fillOnDarkPaper(hex)})` : hex;
