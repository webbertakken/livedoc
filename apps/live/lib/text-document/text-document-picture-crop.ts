// Cropping a picture (docs/specs/034-text-documents/objects.md "Working with a picture", Cropping): a crop mark moves
// its side (a corner its two) over the picture as drawn, inward to cut and outward back as far as its own edge, at least
// the least side kept each way. The picture's scale never changes: its box is what is left. The crop is the share cut
// from each side, to four decimals (objects.md "The model"), none when nothing is cut.
import type { PictureCrop } from '@livedoc/text-documents';
import { PICTURE_MIN_SIDE, type PictureHandle } from './text-document-picture-size';

/** A picture's size in points and its crop, as its attributes hold them. */
export type CroppedPicture = { width: number; height: number; crop: PictureCrop | null };

const share = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000 + 0;
const clamp = (value: number, least: number, most: number) =>
  Math.min(Math.max(value, least), Math.max(most, least));

/** A crop as its four shares, nothing cut where it holds none (or a share it cannot be). */
export function cropOf(crop: unknown): PictureCrop {
  const c = (crop ?? {}) as Partial<Record<keyof PictureCrop, unknown>>;
  return { top: share(c.top), right: share(c.right), bottom: share(c.bottom), left: share(c.left) };
}

/** What dragging a crop mark by (dx, dy) points leaves of the picture: its box and its crop. */
export function croppedPicture(
  start: CroppedPicture,
  handle: PictureHandle,
  dx: number,
  dy: number,
): CroppedPicture {
  if (!(start.width > 0 && start.height > 0)) return start;
  const c = cropOf(start.crop);
  const across = 1 - c.left - c.right;
  const down = 1 - c.top - c.bottom;
  if (across <= 0 || down <= 0) return start;
  // The picture as drawn, whole, at its scale.
  const drawnWidth = start.width / across;
  const drawnHeight = start.height / down;
  const leastAcross = PICTURE_MIN_SIDE / drawnWidth;
  const leastDown = PICTURE_MIN_SIDE / drawnHeight;
  const next = { ...c };
  if (handle.includes('e'))
    next.right = round4(clamp(c.right - dx / drawnWidth, 0, 1 - c.left - leastAcross));
  if (handle.includes('w'))
    next.left = round4(clamp(c.left + dx / drawnWidth, 0, 1 - c.right - leastAcross));
  if (handle.includes('s'))
    next.bottom = round4(clamp(c.bottom - dy / drawnHeight, 0, 1 - c.top - leastDown));
  if (handle.includes('n'))
    next.top = round4(clamp(c.top + dy / drawnHeight, 0, 1 - c.bottom - leastDown));
  const cut = next.top > 0 || next.right > 0 || next.bottom > 0 || next.left > 0;
  return {
    width: round3(drawnWidth * (1 - next.left - next.right)),
    height: round3(drawnHeight * (1 - next.top - next.bottom)),
    crop: cut ? next : null,
  };
}
