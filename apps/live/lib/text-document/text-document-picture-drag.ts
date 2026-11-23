// A selected picture's handles dragged (docs/specs/034-text-documents/objects.md "Working with a picture"): a size
// handle or crop mark read along the picture's own sides, turned or not; the rotation handle turning it about its centre,
// Shift snapping to 15° steps. The picture follows the pointer (drawn, not written); on release what the drag made is given
// back once, Escape or a cancelled pointer giving back nothing.
import { Pictures, type PictureCrop } from '@livedoc/text-documents';
import { croppedPicture, type CroppedPicture } from './text-document-picture-crop';
import { alongPicture, draggedRotation } from './text-document-picture-rotate';
import { resizedPicture, type PictureHandle, type PictureSize } from './text-document-picture-size';

/** The rotation handle, beside the eight size handles. */
export const PICTURE_ROTATE_HANDLE = 'rotate';
export type PictureDragHandle = PictureHandle | typeof PICTURE_ROTATE_HANDLE;

/** What a drag made: a size, a crop, or a turn. */
export type PictureDragResult =
  | { readonly size: PictureSize }
  | { readonly crop: CroppedPicture }
  | { readonly rotation: number };

// A point is drawn as 4/3 of a pixel where nothing is laid out to measure.
const PIXELS_A_POINT = 96 / 72;

/** Begins a drag from `down` on `handle`; gives back how to end it (written or not). */
export function dragPicture(
  down: PointerEvent,
  handle: PictureDragHandle,
  {
    attrs,
    cropping,
    dom,
    room,
    preview,
    done,
  }: {
    // The picture's attributes as the drag begins.
    attrs: Readonly<Record<string, unknown>>;
    cropping: boolean;
    // The picture's box as laid out: its centre is what it turns about, its drawn size its scale.
    dom: HTMLElement;
    room: PictureSize;
    // Draws the picture as the drag has it.
    preview: (attrs: Readonly<Record<string, unknown>>) => void;
    // Told once, as the drag ends: what it made, or null (cancelled, or nothing changed).
    done: (result: PictureDragResult | null) => void;
  },
): (write: boolean) => void {
  const start = {
    width: typeof attrs.width === 'number' ? attrs.width : 0,
    height: typeof attrs.height === 'number' ? attrs.height : 0,
  };
  const startCrop: CroppedPicture = { ...start, crop: (attrs.crop as PictureCrop | null) ?? null };
  const rotation = Pictures.rotation(attrs.rotation) ?? 0;
  const rect = dom.getBoundingClientRect();
  const bounds = Pictures.turnedBounds(start, rotation);
  const pixelsAPoint =
    rect.width > 0 && bounds.width > 0 ? rect.width / bounds.width : PIXELS_A_POINT;
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  let made: PictureDragResult | null = null;
  const move = (e: PointerEvent) => {
    if (handle === PICTURE_ROTATE_HANDLE) {
      const turn = draggedRotation(
        rotation,
        centre,
        { x: down.clientX, y: down.clientY },
        { x: e.clientX, y: e.clientY },
        { shift: e.shiftKey },
      );
      made = turn === rotation ? null : { rotation: turn };
      return preview({ ...attrs, rotation: turn });
    }
    const { dx, dy } = alongPicture(
      (e.clientX - down.clientX) / pixelsAPoint,
      (e.clientY - down.clientY) / pixelsAPoint,
      rotation,
    );
    const next = cropping
      ? croppedPicture(startCrop, handle, dx, dy)
      : { ...startCrop, ...resizedPicture(start, handle, dx, dy, { shift: e.shiftKey, room }) };
    const moved = JSON.stringify(next) !== JSON.stringify(startCrop);
    made = !moved
      ? null
      : cropping
        ? { crop: next }
        : { size: { width: next.width, height: next.height } };
    preview({ ...attrs, ...next });
  };
  const up = () => end(true);
  const cancel = () => end(false);
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  };
  let ended = false;
  function end(write: boolean) {
    if (ended) return;
    ended = true;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    done(write ? made : null);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
  return end;
}
