// Colour maths (docs/specs/011-theme/light-and-dark.md): reading a colour, mixing it, and judging contrast.
// Nothing here knows an element, so what only needs a colour (the brand mark, a page's paint) imports this and
// not the element defaults in colors.ts, which carry every shape kind with them.
import { parseCssColour, parseCssColourAlpha } from './css-colour';

export type RGB = { r: number; g: number; b: number };

// A colour as written to 0-255 channels, or null for anything it cannot read. It reads `#rrggbb` and the shorthand
// `#rgb` (the `#` optional on the long form, surrounding spaces ignored), either with an alpha (`#rrggbbaa`, `#rgba`,
// the alpha set aside: the channels are what an ink is judged against), and the CSS named colours (`red`,
// `slategray`; any case, trimmed), because agents write all of them (docs/specs/011-theme/light-and-dark.md "Colours an
// agent writes"). An rgb() string, `transparent` and anything else stay null. The one colour parser (css-colour.ts):
// callers that know their input is a catalogue hex assert it rather than re-parsing.
export function hexToRgb(hex: string): RGB | null {
  return parseCssColour(hex);
}

// Any colour hexToRgb reads, as `#rrggbb`; null for the rest. For code that hands a colour on to a parser that only
// knows `#rrggbb` (mixing, OKLCH walks).
export function normaliseHex(colour: string): string | null {
  const c = parseCssColour(colour);
  return c ? rgbToHex(c) : null;
}

// Whether a colour reads and is fully opaque: `#fff8` and `#0ea5e980` read but show what is under them.
export function colourIsOpaque(colour: string): boolean {
  return parseCssColourAlpha(colour)?.a === 255;
}

// WCAG 2.2 SC 1.4.3: the minimum contrast for normal-size text (AA).
export const MIN_TEXT_CONTRAST = 4.5;

// WCAG 2.2 contrast ratio of two colours hexToRgb reads, in [1, 21] and
// order-independent. NaN for any other input, so a `>=` threshold check
// can never pass on a colour it could not read.
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return NaN;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

// Channels back to `#rrggbb`, rounded and clamped into 0-255 first.
export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function mixWithWhite(rgb: RGB, amount: number): RGB {
  return {
    r: rgb.r + (255 - rgb.r) * amount,
    g: rgb.g + (255 - rgb.g) * amount,
    b: rgb.b + (255 - rgb.b) * amount,
  };
}

function darken(rgb: RGB, amount: number): RGB {
  return { r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) };
}

// Hex-level tint (mix toward white) / shade (toward black) by `amount`
// in 0..1. Used to spin a single theme hue into a light → base → dark
// ramp for the colour-picker presets so the user has several on-theme
// versions to apply without opening the full swatch. Failsafe: returns
// the input unchanged on unparseable hex.
export function tint(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(mixWithWhite(rgb, amount)) : hex;
}

export function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(darken(rgb, amount)) : hex;
}

export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  // Perceived-brightness (NTSC weighted) — < 155 reads as dark.
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 155;
}

// Whichever of a dark and a light ink contrasts more with `fill`. A brightness cut-off (isLightColor) gave mid-tones
// light text they could not carry (orange, #f97316, at 2.6:1 under slate-100 where slate-800 reads 5.4:1); off the
// mid-tones the two rules agree. An unparseable colour reads as light, as isLightColor has it, so it takes the dark ink.
export function bestInk(fill: string, dark: string, light: string): string {
  if (!hexToRgb(fill)) return dark;
  return contrastRatio(dark, fill) >= contrastRatio(light, fill) ? dark : light;
}

// The ink that reads on a SOLID fill of `color`: whichever of white and the app's near-black reads better (bestInk). The Collaborate cards' accent buttons use
// it on the canvas (CollabAccentScope) and in the export
// (svg-render-panel-faces), so a pale theme accent never carries white text in
// either.
export function inkOn(color: string): string {
  return bestInk(color, '#0f172a', '#ffffff');
}
