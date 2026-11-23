// docs/specs/034-text-documents/objects.md "The model" (Rotation) and "In the editor": a picture's turn, clockwise from 0
// to below 360 to two decimals, none for 0; the bounds its line makes room for.
import { describe, expect, it } from 'vitest';
import { Pictures } from './pictures';

describe('Pictures.rotation', () => {
  it.each([
    [30, 30],
    [-90, 270],
    [360, undefined],
    [725.5, 5.5],
    [0, undefined],
    [-0, undefined],
    [359.996, undefined],
    [12.3456, 12.35],
    [Number.NaN, undefined],
    [Number.POSITIVE_INFINITY, undefined],
    ['30', undefined],
    [null, undefined],
  ])('reads %s as %s', (value, rotation) => {
    expect(Pictures.rotation(value)).toBe(rotation);
  });
});

const closeTo = (size: { width: number; height: number }) => ({
  width: expect.closeTo(size.width, 3) as number,
  height: expect.closeTo(size.height, 3) as number,
});

describe('Pictures.turnedBounds', () => {
  it('is the size itself unturned', () => {
    expect(Pictures.turnedBounds({ width: 60, height: 40 }, undefined)).toEqual({
      width: 60,
      height: 40,
    });
  });

  it('swaps the sides at a quarter turn', () => {
    expect(Pictures.turnedBounds({ width: 60, height: 40 }, 90)).toEqual(
      closeTo({ width: 40, height: 60 }),
    );
  });

  it('reaches past the size at an angle, the same either way', () => {
    const bounds = closeTo({ width: 71.962, height: 64.641 });
    expect(Pictures.turnedBounds({ width: 60, height: 40 }, 30)).toEqual(bounds);
    expect(Pictures.turnedBounds({ width: 60, height: 40 }, 330)).toEqual(bounds);
  });
});
