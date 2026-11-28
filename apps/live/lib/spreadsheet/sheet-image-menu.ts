// An image over cells' menu, a cell picture's items and Insert Image's state (docs/specs/029-sheets/inserted-objects.md
// "Images over cells", "Images in a cell", D625, D632): the menu's items, drawn by the office shell's context menu, and
// why Insert Image over Cells and Insert Image in Cell are dimmed where they cannot place one. Pure.
import type { OfficeAction, OfficeEntry, OfficeItem } from '@/lib/office/office-catalogue';

export const INSERT_IMAGE_OVER_CELLS = 'insert-image-over-cells';
export const IMAGE_ALT_TEXT = 'image-alt-text';
export const IMAGE_REPLACE = 'image-replace';
export const IMAGE_DELETE = 'image-delete';
export const INSERT_IMAGE_IN_CELL = 'insert-image-in-cell';
// An image over cells into the active cell, from its menu.
export const PLACE_IMAGE_IN_CELL = 'place-image-in-cell';
// A cell's picture's items in the cell's context menu, drawn only on a cell holding one.
export const CELL_PICTURE_ALT_TEXT = 'cell-picture-alt-text';
export const PLACE_IMAGE_OVER_CELLS = 'place-image-over-cells';

const built = (id: string, label: string): OfficeItem => ({
  kind: 'item',
  id,
  label,
  level: 'edit',
  status: 'built',
});

/** The ⋮ button's and a right-click's menu on an image over cells. */
export const IMAGE_MENU_ENTRIES: readonly OfficeEntry[] = [
  built(IMAGE_ALT_TEXT, 'Alt Text'),
  built(IMAGE_REPLACE, 'Replace Image'),
  built(PLACE_IMAGE_IN_CELL, 'Place Image in Selected Cell'),
  { kind: 'separator' },
  built(IMAGE_DELETE, 'Delete'),
];

export const IMAGES_UNAVAILABLE_NOTE = 'Unavailable';
export const IMAGES_UNAVAILABLE_HINT = "Image uploads aren't enabled on this deployment";
export const IMAGES_LOCAL_NOTE = 'LiveDoc only';
export const IMAGES_LOCAL_HINT = 'Sync Document to place images over cells';
export const IMAGES_LOCAL_IN_CELL_HINT = 'Sync Document to place images in cells';

/** Where images can be placed: yes, not on this deployment (the gallery's probe answered 503), or not in This Browser. */
export type ImagePlacing = 'ready' | 'unavailable' | 'local';

/** Insert Image over Cells' (or in a cell's) binding: running `run`, or dimmed with why. */
export function insertImageAction(
  placing: ImagePlacing,
  run: () => void,
  where: 'over' | 'in' = 'over',
): OfficeAction {
  if (placing === 'unavailable')
    return {
      run: () => {},
      disabled: true,
      note: IMAGES_UNAVAILABLE_NOTE,
      hint: IMAGES_UNAVAILABLE_HINT,
    };
  if (placing === 'local')
    return {
      run: () => {},
      disabled: true,
      note: IMAGES_LOCAL_NOTE,
      hint: where === 'in' ? IMAGES_LOCAL_IN_CELL_HINT : IMAGES_LOCAL_HINT,
    };
  return { run };
}
