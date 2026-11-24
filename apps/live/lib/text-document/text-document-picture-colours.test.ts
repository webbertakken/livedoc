// docs/specs/034-text-documents/objects.md "The model" (Recolour, Adjustments), "In the editor": a picture's colours read
// as it holds them, each absent where it has none or holds no valid one; drawn as one matrix and an opacity.
import { describe, expect, it } from 'vitest';
import { pictureColourFilter, pictureColouring } from './text-document-picture-colours';

describe('pictureColouring', () => {
  it('reads a recolour and the adjustments it holds', () => {
    expect(
      pictureColouring({
        recolour: { kind: 'duotone', dark: '#000000', light: '#FF0000' },
        transparency: 10,
        brightness: null,
        contrast: -30,
      }),
    ).toEqual({
      recolour: { kind: 'duotone', dark: '#000000', light: '#ff0000' },
      transparency: 10,
      contrast: -30,
    });
  });

  it('reads none from nothing, or from values it cannot hold', () => {
    expect(pictureColouring({})).toEqual({});
    expect(pictureColouring({ recolour: { kind: 'sepia' }, brightness: 300 })).toEqual({});
  });
});

describe('pictureColourFilter', () => {
  it('draws a neutral picture as it is, and a transparent one at its opacity', () => {
    expect(pictureColourFilter({})).toEqual({ values: null, opacity: 1 });
    expect(pictureColourFilter({ transparency: 25 })).toEqual({ values: null, opacity: 0.75 });
  });

  it('draws a recolour as a colour matrix of 20 values', () => {
    expect(
      pictureColourFilter({ recolour: { kind: 'greyscale' } }).values?.split(' '),
    ).toHaveLength(20);
  });
});
