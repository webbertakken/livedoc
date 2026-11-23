// docs/specs/034-text-documents/objects.md "The model", Placement: a wrap of four, a margin of 0 to 72 pt each side,
// moving with text or fixed on the page, and its corner's offsets; anything else is no placement.
import { describe, expect, it } from 'vitest';
import { PICTURE_MARGIN_MAX, PicturePlacements } from './picture-placement';

const placed = {
  wrap: 'wrap',
  margin: PicturePlacements.margin(9),
  moves: 'with-text',
  x: 36.12345,
  y: -12,
};

describe('a placement', () => {
  it('is held with its lengths to three decimals', () => {
    expect(PicturePlacements.of(placed)).toEqual({ ...placed, x: 36.123 });
  });

  it.each([
    ['nothing', undefined],
    ['an unknown wrap', { ...placed, wrap: 'tight' }],
    ['an unknown movement', { ...placed, moves: 'margin' }],
    [
      'a margin past an inch',
      { ...placed, margin: PicturePlacements.margin(PICTURE_MARGIN_MAX + 1) },
    ],
    ['a negative margin', { ...placed, margin: { ...placed.margin, left: -1 } }],
    ['no margin', { ...placed, margin: undefined }],
    ['an offset of no number', { ...placed, x: Number.NaN }],
    ['an offset past the widest page', { ...placed, y: 5000 }],
  ])('is none for %s', (_, value) => {
    expect(PicturePlacements.of(value)).toBeUndefined();
  });
});
