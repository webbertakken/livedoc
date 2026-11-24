// docs/specs/034-text-documents/objects.md "Working with a picture" (Recolour): No recolour, then Light 1 to 8 (from
// the colour to white) and Dark 1 to 8 (from black to the colour); a recolour that is none of them checks none.
import { describe, expect, it } from 'vitest';
import {
  PICTURE_RECOLOUR_COLOURS,
  PICTURE_RECOLOURS,
  pictureRecolourOf,
} from './text-document-picture-recolour';

describe('PICTURE_RECOLOURS', () => {
  it('offers No recolour, then Light 1 to 8 and Dark 1 to 8', () => {
    expect(PICTURE_RECOLOUR_COLOURS).toHaveLength(8);
    expect(PICTURE_RECOLOURS.map((r) => r.label)).toEqual([
      'No recolour',
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Light ${n}`),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Dark ${n}`),
    ]);
  });

  it('lays Light from its colour to white, and Dark from black to its colour', () => {
    const light2 = PICTURE_RECOLOURS.find((r) => r.id === 'light-2')!;
    const dark2 = PICTURE_RECOLOURS.find((r) => r.id === 'dark-2')!;
    expect(light2.recolour).toEqual({ kind: 'duotone', dark: '#ff0000', light: '#ffffff' });
    expect(dark2.recolour).toEqual({ kind: 'duotone', dark: '#000000', light: '#ff0000' });
    expect(PICTURE_RECOLOURS[0]!.recolour).toBeUndefined();
  });
});

describe('pictureRecolourOf', () => {
  it('names the choice a recolour is', () => {
    expect(pictureRecolourOf(undefined)).toBe('none');
    expect(pictureRecolourOf({ kind: 'duotone', dark: '#000000', light: '#9900ff' })).toBe(
      'dark-8',
    );
  });

  it('names none for greyscale or another duotone', () => {
    expect(pictureRecolourOf({ kind: 'greyscale' })).toBeNull();
    expect(pictureRecolourOf({ kind: 'duotone', dark: '#123456', light: '#ffffff' })).toBeNull();
  });
});
