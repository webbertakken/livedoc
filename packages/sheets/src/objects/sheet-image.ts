// An image over cells (docs/specs/029-sheets/inserted-objects.md "Images over cells", D623): one of its sheet's
// objects, anchored at a cell as a chart is, showing a gallery image by its id (docs/specs/009-elements/images.md),
// whose bytes live in the uploader's gallery, never in the sheet.
import type { SheetLayout } from '../sheet';
import type { CellAnchor } from './sheet-objects';
import { inRange, isAnchor, onlyKeys, textUpTo } from './object-checks';

export type SheetImage = {
  id: string;
  kind: 'image';
  at: CellAnchor;
  // Its box, px at 100%.
  width: number;
  height: number;
  // The gallery image it shows.
  imageId: string;
  // The picture's own size, when known: what Replace Image and a corner handle keep the proportion of.
  naturalWidth?: number;
  naturalHeight?: number;
  alt?: string;
};

export const SHEET_IMAGE_SIZE = { min: 16, max: 4000 } as const;
export const SHEET_IMAGE_ALT_MAX = 1000;
// A gallery id, as the image reference index reads one (images.md "What is a reference").
const IMAGE_ID_MAX = 128;
// The largest natural size a picture is taken at (the upload pipeline's caps are far below it).
const NATURAL_MAX = 100_000;

const IMAGE_KEYS = [
  'id',
  'kind',
  'at',
  'width',
  'height',
  'imageId',
  'naturalWidth',
  'naturalHeight',
  'alt',
] as const;

/** The box a placed picture is scaled down to fit, kept in proportion (D623). */
export const IMAGE_FIT_BOX = { width: 600, height: 400 } as const;

const side = (v: number) =>
  Math.round(Math.min(SHEET_IMAGE_SIZE.max, Math.max(SHEET_IMAGE_SIZE.min, v)));

/** A picture's natural size scaled down to fit 600 by 400 px, in proportion; an unknown size lands square. */
export function fittedImageSize(natural: { width: number; height: number }): {
  width: number;
  height: number;
} {
  if (!(natural.width >= 1 && natural.height >= 1))
    return { width: IMAGE_FIT_BOX.height, height: IMAGE_FIT_BOX.height };
  const scale = Math.min(
    1,
    IMAGE_FIT_BOX.width / natural.width,
    IMAGE_FIT_BOX.height / natural.height,
  );
  return { width: side(natural.width * scale), height: side(natural.height * scale) };
}

/** Whether a gallery id is one: 1 to 128 characters, never a data URI. */
export const isGalleryImageId = (x: unknown): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= IMAGE_ID_MAX && !x.startsWith('data:');

// Whether a record is an image over cells, whole and within its bounds (its id and kind checked by the caller).
export function isSheetImage(x: Record<string, unknown>): boolean {
  const natural = (n: unknown) => n === undefined || inRange(n, 1, NATURAL_MAX);
  return (
    onlyKeys(x, IMAGE_KEYS) &&
    isAnchor(x.at) &&
    inRange(x.width, SHEET_IMAGE_SIZE.min, SHEET_IMAGE_SIZE.max) &&
    inRange(x.height, SHEET_IMAGE_SIZE.min, SHEET_IMAGE_SIZE.max) &&
    isGalleryImageId(x.imageId) &&
    natural(x.naturalWidth) &&
    natural(x.naturalHeight) &&
    textUpTo(x.alt, SHEET_IMAGE_ALT_MAX)
  );
}

/** The gallery images a sheet's layout places, each once, in paint order (images.md "A sheet's references"). */
export function sheetImageIds(layout: Pick<SheetLayout, 'objects'>): string[] {
  const ids = new Set<string>();
  for (const x of layout.objects ?? []) if (x.kind === 'image') ids.add(x.imageId);
  return [...ids];
}
