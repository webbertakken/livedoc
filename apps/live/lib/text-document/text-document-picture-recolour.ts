// Image options' Recolour choices (docs/specs/034-text-documents/objects.md "Working with a picture", Recolour):
// No recolour, then each of eight colours light (from the colour to white) and dark (from black to the colour), as
// duotones; the look and colours are LiveDoc's reading of Google's until a capture confirms them `(default)`.
import type { PictureRecolour } from '@livedoc/text-documents';

/** The eight colours, 1 to 8 `(default)`: grey, red, orange, yellow, green, cyan, cornflower blue, purple. */
export const PICTURE_RECOLOUR_COLOURS: readonly string[] = [
  '#666666',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#9900ff',
];

const BLACK = '#000000';
const WHITE = '#ffffff';

export type PictureRecolourChoice = {
  readonly id: string;
  readonly label: string;
  readonly recolour: PictureRecolour | undefined;
};

const duotones = (shade: 'light' | 'dark'): PictureRecolourChoice[] =>
  PICTURE_RECOLOUR_COLOURS.map((colour, i) => ({
    id: `${shade}-${i + 1}`,
    label: `${shade === 'light' ? 'Light' : 'Dark'} ${i + 1}`,
    recolour:
      shade === 'light'
        ? { kind: 'duotone', dark: colour, light: WHITE }
        : { kind: 'duotone', dark: BLACK, light: colour },
  }));

export const PICTURE_RECOLOURS: readonly PictureRecolourChoice[] = [
  { id: 'none', label: 'No recolour', recolour: undefined },
  ...duotones('light'),
  ...duotones('dark'),
];

const same = (a: PictureRecolour | undefined, b: PictureRecolour | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The choice a picture's recolour is, or null when it is none of them (greyscale, or a file's own duotone). */
export const pictureRecolourOf = (recolour: PictureRecolour | undefined): string | null =>
  PICTURE_RECOLOURS.find((choice) => same(choice.recolour, recolour))?.id ?? null;
