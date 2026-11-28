// A picture held in a cell, moved over the cells and back (docs/specs/029-sheets/inserted-objects.md "Images in a cell",
// D632): Place Image over Cells takes it out of its cell to an image over cells at the cell's top-left, fitted as
// Insert fits one; Place Image in Selected Cell takes an image over cells off the sheet into the active cell. Each is
// one layout write carrying the cell's change, so one undo step; the alt text goes with the picture. Pure.
import {
  pictureInput,
  pictureOfInput,
  type Cell,
  type CellPicture,
  type SheetImage,
  type SheetWrite,
} from '@livedoc/sheets';
import { newSheetImage } from './sheet-image-place';

/** A cell by its row and column ids. */
export type CellIds = { r: string; c: string };

/** The picture a cell holds as its own input, or null (a formula's picture is its formula's). */
export const cellPictureOf = (cell: Cell | undefined): CellPicture | null =>
  pictureOfInput(cell?.input);

/** The image over cells `image` taken off the sheet into the cell `at`, its alt text kept. */
export function pictureIntoCellWrite(image: SheetImage, at: CellIds): SheetWrite {
  return {
    kind: 'layout',
    changes: [{ k: 'object', id: image.id, object: null }],
    cells: [{ ...at, i: pictureInput(image.imageId, image.alt) }],
  };
}

/**
 * The cell `at`'s picture taken out to an image over cells of id `id` at the cell's top-left, sized from `natural` as
 * Insert sizes one (square when unknown), its alt text kept.
 */
export function pictureOverCellsWrite(
  id: string,
  picture: CellPicture,
  at: CellIds,
  natural: { width: number; height: number } | null,
): SheetWrite {
  const image = newSheetImage(
    id,
    { id: picture.id, width: natural?.width ?? 0, height: natural?.height ?? 0 },
    { ...at, dx: 0, dy: 0 },
  );
  return {
    kind: 'layout',
    changes: [{ k: 'object', id, object: picture.alt ? { ...image, alt: picture.alt } : image }],
    cells: [{ ...at, i: null }],
  };
}
