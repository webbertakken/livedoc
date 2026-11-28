// Where an image over cells lands and how its box changes (docs/specs/029-sheets/inserted-objects.md "Images over
// cells", D623): the size a picked picture lands at, a picture replaced in its box, a handle's resize (corners in
// proportion, edges stretching), Alt Text's title folded into its one text, and what it is called. Pure.
import {
  SHEET_IMAGE_ALT_MAX,
  SHEET_IMAGE_SIZE,
  type CellAnchor,
  type SheetImage,
} from '@livedoc/sheets';

/** The box a picked picture is scaled down to fit, kept in proportion (D623). */
export const IMAGE_FIT_BOX = { width: 600, height: 400 } as const;
/** What an image without alt text is called. */
export const IMAGE_LABEL = 'Image';

/** A picture as the picker hands it: its gallery id and natural size (0 when unknown). */
export type PickedPicture = { id: string; width: number; height: number };

/** A box's handle, by compass point. */
export type ImageHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const IMAGE_HANDLES: readonly ImageHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** A box in sheet px: its top-left from A1's corner and its size. */
export type ImageBox = { x: number; y: number; width: number; height: number };

const side = (v: number) =>
  Math.round(Math.min(SHEET_IMAGE_SIZE.max, Math.max(SHEET_IMAGE_SIZE.min, v)));

const known = (p: { width: number; height: number }) => p.width >= 1 && p.height >= 1;

/** A picture's natural size scaled down to fit 600 by 400 px, in proportion; an unknown size lands square. */
export function fittedImageSize(natural: { width: number; height: number }): {
  width: number;
  height: number;
} {
  if (!known(natural)) return { width: IMAGE_FIT_BOX.height, height: IMAGE_FIT_BOX.height };
  const scale = Math.min(
    1,
    IMAGE_FIT_BOX.width / natural.width,
    IMAGE_FIT_BOX.height / natural.height,
  );
  return { width: side(natural.width * scale), height: side(natural.height * scale) };
}

const naturalOf = (p: PickedPicture) =>
  known(p) ? { naturalWidth: Math.round(p.width), naturalHeight: Math.round(p.height) } : {};

/** A new image over cells showing `picked`, its top-left at `at`. */
export function newSheetImage(id: string, picked: PickedPicture, at: CellAnchor): SheetImage {
  return {
    id,
    kind: 'image',
    at,
    ...fittedImageSize(picked),
    imageId: picked.id,
    ...naturalOf(picked),
  };
}

/** `cur` showing `picked` instead: the box's width kept, its height following the new proportion, the alt text gone. */
export function replacedImage(cur: SheetImage, picked: PickedPicture): SheetImage {
  const { alt: _alt, naturalWidth: _w, naturalHeight: _h, ...rest } = cur;
  return {
    ...rest,
    height: known(picked) ? side((cur.width * picked.height) / picked.width) : cur.height,
    imageId: picked.id,
    ...naturalOf(picked),
  };
}

/**
 * `box` with `handle` dragged by (dx, dy) sheet px: an edge stretches its side, a corner resizes in proportion
 * (`ratio`, width over height, the picture's own when known, else the box's), following the larger pull. The opposite
 * side or corner stays put; each side kept to 16 to 4,000 px.
 */
export function resizedImageBox(
  box: ImageBox,
  handle: ImageHandle,
  dx: number,
  dy: number,
  ratio = box.width / box.height,
): ImageBox {
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  let width = box.width;
  let height = box.height;
  if (sx !== 0 && sy !== 0) {
    const byX = box.width + sx * dx;
    const byY = (box.height + sy * dy) * ratio;
    const pulled = Math.abs(byX - box.width) >= Math.abs(byY - box.width) ? byX : byY;
    const least = Math.max(SHEET_IMAGE_SIZE.min, SHEET_IMAGE_SIZE.min * ratio);
    const most = Math.min(SHEET_IMAGE_SIZE.max, SHEET_IMAGE_SIZE.max * ratio);
    width = Math.round(Math.min(most, Math.max(least, pulled)));
    height = side(width / ratio);
  } else if (sx !== 0) width = side(box.width + sx * dx);
  else height = side(box.height + sy * dy);
  return {
    x: sx < 0 ? box.x + box.width - width : box.x,
    y: sy < 0 ? box.y + box.height - height : box.y,
    width,
    height,
  };
}

/** Alt Text's title and description as the one text LiveDoc keeps: the title, a line break, the description. */
export function altOfTitled(title: string, description: string): string {
  return [title.trim(), description.trim()]
    .filter((part) => part !== '')
    .join('\n')
    .slice(0, SHEET_IMAGE_ALT_MAX);
}

/** What an image is called to a screen reader: its alt text, else Image. */
export function imageLabel(image: Pick<SheetImage, 'alt'>): string {
  return image.alt?.trim() || IMAGE_LABEL;
}
