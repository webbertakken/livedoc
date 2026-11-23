// docs/specs/034-text-documents/objects.md "The model" (Recolour, Adjustments) and "In the editor" (drawn so): a
// picture's recolour and adjustments as the model holds them, and the one colour filter that draws them.
import { describe, expect, it } from 'vitest';
import {
  PICTURE_CONTRAST_MAX_SLOPE,
  PictureColours,
  type PictureAdjustment,
} from './picture-colours';

/** A channel value from 0 to 255 through one row of the matrix, the others 0, clamped as a filter clamps. */
const through = (values: readonly number[], row: number, rgb: readonly [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const at = row * 5;
  const out = values[at]! * r + values[at + 1]! * g + values[at + 2]! * b + values[at + 4]!;
  return Math.round(Math.min(1, Math.max(0, out)) * 255);
};

describe('a recolour', () => {
  it('is greyscale, or a duotone of two colours held in lower case', () => {
    expect(PictureColours.recolour({ kind: 'greyscale' })).toEqual({ kind: 'greyscale' });
    expect(PictureColours.recolour({ kind: 'duotone', dark: '#000000', light: '#4285F4' })).toEqual(
      { kind: 'duotone', dark: '#000000', light: '#4285f4' },
    );
  });

  it.each([
    ['nothing', undefined],
    ['an unknown kind', { kind: 'sepia' }],
    ['a duotone missing a colour', { kind: 'duotone', dark: '#000000' }],
    ['a duotone of a named colour', { kind: 'duotone', dark: 'black', light: '#ffffff' }],
    ['a duotone of a short colour', { kind: 'duotone', dark: '#000', light: '#ffffff' }],
  ])('is none for %s', (_, value) => {
    expect(PictureColours.recolour(value)).toBeUndefined();
  });
});

describe('an adjustment', () => {
  it.each<[PictureAdjustment, number, number | undefined]>([
    ['transparency', 40, 40],
    ['transparency', 100, 100],
    ['brightness', -100, -100],
    ['contrast', 33.33333, 33.333],
    ['brightness', 0, undefined],
    ['transparency', -1, undefined],
    ['brightness', 100.5, undefined],
    ['contrast', Number.NaN, undefined],
  ])('%s %s is held as %s', (name, value, held) => {
    expect(PictureColours.adjustment(name, value)).toBe(held);
  });

  it('is in range from 0 to 100 percent for transparency, -100 to 100 for brightness and contrast', () => {
    expect(PictureColours.inRange('transparency', -0.001)).toBe(false);
    expect(PictureColours.inRange('transparency', 100)).toBe(true);
    expect(PictureColours.inRange('brightness', -100)).toBe(true);
    expect(PictureColours.inRange('contrast', 100.001)).toBe(false);
  });

  it('is none for anything but a number', () => {
    expect(PictureColours.adjustment('brightness', '20')).toBeUndefined();
  });
});

describe('the colour filter', () => {
  it('is none for a picture neither recoloured nor brightened nor contrasted', () => {
    expect(PictureColours.matrix({})).toBeUndefined();
    expect(PictureColours.matrix({ transparency: 50 })).toBeUndefined();
  });

  // LibreOffice 24.2 bakes Word's a:lum bright 20 % contrast 30 % into these bytes: 124 → 184, 131 → 194, 0 → 8.
  it("draws brightness and contrast by Word's formula", () => {
    const values = PictureColours.matrix({ brightness: 20, contrast: 30 })!;
    expect(through(values, 0, [124, 0, 131])).toBe(184);
    expect(through(values, 2, [124, 0, 131])).toBe(194);
    expect(through(values, 0, [0, 0, 0])).toBeLessThanOrEqual(8);
    expect(through(values, 0, [255, 0, 0])).toBe(255);
  });

  it('brightens alone by adding, and lowers contrast toward the middle grey', () => {
    expect(through(PictureColours.matrix({ brightness: 20 })!, 1, [0, 100, 0])).toBe(151);
    expect(through(PictureColours.matrix({ contrast: -50 })!, 1, [0, 0, 0])).toBe(64);
  });

  it('draws a full contrast as a threshold of one step', () => {
    const values = PictureColours.matrix({ contrast: 100 })!;
    expect(values[0]).toBe(PICTURE_CONTRAST_MAX_SLOPE);
    expect(through(values, 0, [127, 0, 0])).toBe(0);
    expect(through(values, 0, [129, 0, 0])).toBe(255);
  });

  it('lays a duotone from its dark colour to its light by luminance', () => {
    const values = PictureColours.matrix({
      recolour: { kind: 'duotone', dark: '#000000', light: '#4285f4' },
    })!;
    expect([0, 1, 2].map((row) => through(values, row, [255, 255, 255]))).toEqual([66, 133, 244]);
    expect([0, 1, 2].map((row) => through(values, row, [0, 0, 0]))).toEqual([0, 0, 0]);
    expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  it('draws greyscale from black to white, then its brightness', () => {
    const values = PictureColours.matrix({ recolour: { kind: 'greyscale' }, brightness: 10 })!;
    expect([0, 1, 2].map((row) => through(values, row, [255, 0, 0]))).toEqual([102, 102, 102]);
  });

  it('draws its transparency as its opacity', () => {
    expect(PictureColours.opacity({ transparency: 25 })).toBe(0.75);
    expect(PictureColours.opacity({})).toBe(1);
  });
});
