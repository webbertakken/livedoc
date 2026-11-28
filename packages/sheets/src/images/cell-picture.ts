// A picture in a cell (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D630): a gallery image held as the
// cell's input, with its alt text, checked as an image over cells' id and alt text are.
import type { CellInput, CellPicture } from '../sheet';
import { isGalleryImageId, SHEET_IMAGE_ALT_MAX } from '../objects/sheet-image';
import { isRecord, onlyKeys, textUpTo } from '../objects/object-checks';

const PICTURE_KEYS = ['id', 'alt'] as const;

/** Whether a value is a cell's picture: a gallery id and, when given, alt text of up to 1,000 characters. */
export function isCellPicture(x: unknown): x is CellPicture {
  return (
    isRecord(x) &&
    onlyKeys(x, PICTURE_KEYS) &&
    isGalleryImageId(x.id) &&
    textUpTo(x.alt, SHEET_IMAGE_ALT_MAX)
  );
}

/** The input of a cell holding the picture `id`, its alt text left out when empty. */
export function pictureInput(id: string, alt?: string): CellInput {
  return { img: alt ? { id, alt } : { id } };
}

/** The picture a cell's input holds, or null. */
export function pictureOfInput(input: CellInput | undefined): CellPicture | null {
  return input && 'img' in input ? input.img : null;
}
