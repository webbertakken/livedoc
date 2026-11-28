// An image over cells' menu and Insert Image over Cells' state (docs/specs/029-sheets/inserted-objects.md "Images over
// cells", D625): the menu's items, drawn by the office shell's context menu, and why Insert Image over Cells is dimmed
// where it cannot place one. Pure.
import type { OfficeAction, OfficeEntry, OfficeItem } from '@/lib/office/office-catalogue';

export const INSERT_IMAGE_OVER_CELLS = 'insert-image-over-cells';
export const IMAGE_ALT_TEXT = 'image-alt-text';
export const IMAGE_REPLACE = 'image-replace';
export const IMAGE_DELETE = 'image-delete';

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
  { kind: 'separator' },
  built(IMAGE_DELETE, 'Delete'),
];

export const IMAGES_UNAVAILABLE_NOTE = 'Unavailable';
export const IMAGES_UNAVAILABLE_HINT = "Image uploads aren't enabled on this deployment";
export const IMAGES_LOCAL_NOTE = 'LiveDoc only';
export const IMAGES_LOCAL_HINT = 'Sync Document to place images over cells';

/** Where images can be placed: yes, not on this deployment (the gallery's probe answered 503), or not in This Browser. */
export type ImagePlacing = 'ready' | 'unavailable' | 'local';

/** Insert Image over Cells' binding: running `run`, or dimmed with why. */
export function insertImageAction(placing: ImagePlacing, run: () => void): OfficeAction {
  if (placing === 'unavailable')
    return {
      run: () => {},
      disabled: true,
      note: IMAGES_UNAVAILABLE_NOTE,
      hint: IMAGES_UNAVAILABLE_HINT,
    };
  if (placing === 'local')
    return { run: () => {}, disabled: true, note: IMAGES_LOCAL_NOTE, hint: IMAGES_LOCAL_HINT };
  return { run };
}
