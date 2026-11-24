// Dark pages (docs/specs/035-pdf-documents/dark-pages.md "The recolouring"): a page's pixels shown dark for one
// person. Lightness is mirrored in OKLab onto the text document's dark paper and ink, bent so a grey that read at
// 4.5:1 on white still does on dark paper; hue and chroma are kept, so a red heading stays red. A photograph is put
// back as the file drew it. Pure: the engine's worker runs it on a tile, the surface on the colours it draws itself.
import { DARK_PAGES_CURVE, DARK_PAGES_PICTURE_COLOURS } from './limits';

/** A box of a bitmap's pixels, half open: x from `x0` up to `x1`, y from `y0` up to `y1`. */
export type PixelBox = {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
};

/** The text document's dark paper and its ink (editing-surface.md "The page in the dark scheme"). */
export const DARK_PAPER = 0x1e1f20;
export const DARK_INK = 0xe3e3e3;

// sRGB and OKLab, by Björn Ottosson's matrices.
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => toLinear(i / 255));

function oklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function linearOf(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const byte = (linear: number): number =>
  Math.round(toGamma(Math.min(1, Math.max(0, linear))) * 255);
const lightnessOf = (rgb: number): number =>
  oklab(LINEAR[(rgb >> 16) & 255]!, LINEAR[(rgb >> 8) & 255]!, LINEAR[rgb & 255]!)[0];
const PAPER_L = lightnessOf(DARK_PAPER);
const INK_L = lightnessOf(DARK_INK);

/** One colour, `0xRRGGBB`, as Dark pages shows it. */
function colour(rgb: number): number {
  const [L, a, b] = oklab(
    LINEAR[(rgb >> 16) & 255]!,
    LINEAR[(rgb >> 8) & 255]!,
    LINEAR[rgb & 255]!,
  );
  const mirrored = PAPER_L + Math.max(0, 1 - L) ** DARK_PAGES_CURVE * (INK_L - PAPER_L);
  const [r, g, bl] = linearOf(mirrored, a, b);
  return (byte(r) << 16) | (byte(g) << 8) | byte(bl);
}

const inside = (boxes: readonly PixelBox[], x: number, y: number): boolean =>
  boxes.some((box) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1);

export const DarkPages = {
  colour,

  /** A `#rrggbb` colour as Dark pages shows it. */
  hex: (hex: string): string =>
    `#${colour(Number.parseInt(hex.slice(1), 16))
      .toString(16)
      .padStart(6, '0')}`,

  /**
   * A bitmap shown dark: every pixel mirrored but those inside `keep` (the photographs), which stay as drawn. RGBA,
   * four bytes a pixel, row by row; alpha kept. A new bitmap: the one drawn is left as it was.
   */
  mirror: (
    rgba: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    keep: readonly PixelBox[],
  ): Uint8ClampedArray<ArrayBuffer> => {
    const out = new Uint8ClampedArray(rgba.length);
    const seen = new Map<number, number>();
    // A page is mostly runs of one colour: the last one answers without a look-up.
    let lastIn = -1;
    let lastOut = 0;
    for (let at = 0; at < rgba.length; at += 4) {
      out[at + 3] = rgba[at + 3]!;
      const pixel = at / 4;
      if (keep.length > 0 && inside(keep, pixel % width, Math.floor(pixel / width))) {
        out[at] = rgba[at]!;
        out[at + 1] = rgba[at + 1]!;
        out[at + 2] = rgba[at + 2]!;
        continue;
      }
      const rgb = (rgba[at]! << 16) | (rgba[at + 1]! << 8) | rgba[at + 2]!;
      if (rgb !== lastIn) {
        lastIn = rgb;
        lastOut = seen.get(rgb) ?? colour(rgb);
        seen.set(rgb, lastOut);
      }
      out[at] = lastOut >> 16;
      out[at + 1] = (lastOut >> 8) & 255;
      out[at + 2] = lastOut & 255;
    }
    return out;
  },

  /** Whether a picture drawn alone shows enough distinct colours, five bits a channel, to be a photograph. */
  isPhotograph: (rgba: Uint8ClampedArray): boolean => {
    const colours = new Set<number>();
    for (let at = 0; at < rgba.length; at += 4) {
      colours.add(((rgba[at]! >> 3) << 10) | ((rgba[at + 1]! >> 3) << 5) | (rgba[at + 2]! >> 3));
      if (colours.size >= DARK_PAGES_PICTURE_COLOURS) return true;
    }
    return false;
  },
} as const;
