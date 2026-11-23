// A picture's recolour and adjustments (docs/specs/034-text-documents/objects.md "The model"): greyscale, or a duotone
// of two colours; its transparency, brightness and contrast in percent. And the one colour filter that draws them
// ("In the editor"): a matrix over each pixel's colour, in sRGB, its transparency as its opacity.

/** Greyscale, or each pixel's luminance laid from `dark` to `light` (`#rrggbb`), as DrawingML's duotone. */
export type PictureRecolour =
  | { readonly kind: 'greyscale' }
  | { readonly kind: 'duotone'; readonly dark: string; readonly light: string };

export type PictureAdjustment = 'transparency' | 'brightness' | 'contrast';

/** What a picture's colours hold: none of each is none. */
export type PictureColouring = {
  readonly recolour?: PictureRecolour;
  readonly transparency?: number;
  readonly brightness?: number;
  readonly contrast?: number;
};

export const PICTURE_ADJUSTMENTS: readonly PictureAdjustment[] = [
  'transparency',
  'brightness',
  'contrast',
];

/** Each adjustment's range in percent, as Word, LibreOffice and the formats hold it. */
export const PICTURE_ADJUSTMENT_RANGES: Readonly<
  Record<PictureAdjustment, readonly [number, number]>
> = {
  transparency: [0, 100],
  brightness: [-100, 100],
  contrast: [-100, 100],
};

/** The steepest contrast drawn: a full contrast is a threshold one 8-bit step wide (default). */
export const PICTURE_CONTRAST_MAX_SLOPE = 255;

/** Luminance from red, green and blue (BT.601), as LibreOffice's greyscale weighs them. */
export const PICTURE_LUMA = [0.299, 0.587, 0.114] as const;

/** Adjustments are held to three decimals of a percent: OOXML's step. */
const PRECISION = 1000;
const round3 = (n: number) => Math.round(n * PRECISION) / PRECISION + 0;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string) =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];

export const PictureColours = {
  /** A recolour as a picture holds one, its colours in lower case; none for anything else. */
  recolour: (value: unknown): PictureRecolour | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    const v = value as Record<string, unknown>;
    if (v.kind === 'greyscale') return { kind: 'greyscale' };
    if (v.kind !== 'duotone') return undefined;
    const { dark, light } = v;
    if (typeof dark !== 'string' || typeof light !== 'string') return undefined;
    if (!HEX.test(dark) || !HEX.test(light)) return undefined;
    return { kind: 'duotone', dark: dark.toLowerCase(), light: light.toLowerCase() };
  },
  /** Whether a number is within the adjustment's range. */
  inRange: (name: PictureAdjustment, value: number): boolean => {
    const [low, high] = PICTURE_ADJUSTMENT_RANGES[name];
    return Number.isFinite(value) && value >= low && value <= high;
  },
  /** An adjustment as a picture holds it, to three decimals; none for 0, out of range or no number. */
  adjustment: (name: PictureAdjustment, value: unknown): number | undefined => {
    if (typeof value !== 'number' || !PictureColours.inRange(name, value)) return undefined;
    const held = round3(value);
    return held === 0 ? undefined : held;
  },
  /**
   * The 20 values of one colour matrix (rows red, green, blue, alpha; columns red, green, blue, alpha, offset, colours
   * from 0 to 1) drawing the recolour, then brightness and contrast by Word's formula: a contrast c's slope is
   * 1 / (1 - c) above 0 and 1 + c below, about the middle grey, half the brightness added before it and half after.
   * None when the picture's colours are drawn as they are.
   */
  matrix: (picture: PictureColouring): number[] | undefined => {
    const recolour = PictureColours.recolour(picture.recolour);
    const b = (PictureColours.adjustment('brightness', picture.brightness) ?? 0) / 100;
    const c = (PictureColours.adjustment('contrast', picture.contrast) ?? 0) / 100;
    if (!recolour && b === 0 && c === 0) return undefined;
    const slope = c >= 0 ? Math.min(1 / (1 - c), PICTURE_CONTRAST_MAX_SLOPE) : 1 + c;
    const intercept = slope * (b / 2 - 0.5) + 0.5 + b / 2;
    const [dark, light] =
      recolour?.kind === 'duotone'
        ? [channels(recolour.dark), channels(recolour.light)]
        : [
            [0, 0, 0],
            [1, 1, 1],
          ];
    const rows = [0, 1, 2].map((channel) => {
      const own = [0, 0, 0].map((_, from) => (from === channel ? 1 : 0));
      const spread = light[channel]! - dark[channel]!;
      const coefficients = recolour ? PICTURE_LUMA.map((w) => w * spread) : own;
      const offset = recolour ? dark[channel]! : 0;
      return [...coefficients.map((k) => k * slope), 0, offset * slope + intercept];
    });
    return [...rows.flat(), 0, 0, 0, 1, 0].map(round6);
  },
  /** How opaque its transparency leaves it, from 0 to 1. */
  opacity: (picture: PictureColouring): number =>
    1 - (PictureColours.adjustment('transparency', picture.transparency) ?? 0) / 100,
} as const;
