// Sizing a picture (docs/specs/034-text-documents/objects.md "Working with a picture"): by its handles, a corner keeping
// its ratio and an edge stretching one side (Shift keeping the ratio); by Image options' Width, Height and Scale, locked
// to its ratio or not; never under the least side nor past the room the text has. Its crop is kept as shares, so it
// scales with the picture.

/** The least a picture's side may be, in points (default). */
export const PICTURE_MIN_SIDE = 4.5;

/** The most Image options' Scale takes, in percent (default). */
export const PICTURE_SCALE_MOST = 1000;

/** The eight handles a selected picture draws, by the compass. */
export const PICTURE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type PictureHandle = (typeof PICTURE_HANDLES)[number];

export type PictureSize = { width: number; height: number };

const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const sized = (width: number, height: number): PictureSize => ({
  width: round3(width),
  height: round3(height),
});
export const hasPictureSize = (size: PictureSize) => size.width > 0 && size.height > 0;

/** The picture scaled by `scale`, kept between the least side and the room (the room winning where both bind). */
function scaled(start: PictureSize, scale: number, room: PictureSize): PictureSize {
  const least = Math.max(PICTURE_MIN_SIDE / start.width, PICTURE_MIN_SIDE / start.height);
  const most = Math.min(room.width / start.width, room.height / start.height);
  const s = Math.min(Math.max(scale, least), most);
  return sized(start.width * s, start.height * s);
}

/** One side between the least side and the room's. */
const side = (value: number, most: number) =>
  round3(Math.min(Math.max(value, PICTURE_MIN_SIDE), Math.max(most, PICTURE_MIN_SIDE)));

/**
 * The size a handle dragged by (dx, dy) points gives a picture of `start`: a corner follows the pointer along the
 * picture's diagonal, an edge moves its side (both, keeping the ratio, while Shift is held).
 */
export function resizedPicture(
  start: PictureSize,
  handle: PictureHandle,
  dx: number,
  dy: number,
  { shift, room }: { shift: boolean; room: PictureSize },
): PictureSize {
  if (!hasPictureSize(start)) return start;
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const width = start.width + sx * dx;
  const height = start.height + sy * dy;
  if (sx !== 0 && sy !== 0) {
    const diagonal = start.width ** 2 + start.height ** 2;
    return scaled(start, (width * start.width + height * start.height) / diagonal, room);
  }
  if (sx !== 0)
    return shift
      ? scaled(start, width / start.width, room)
      : { width: side(width, room.width), height: start.height };
  return shift
    ? scaled(start, height / start.height, room)
    : { width: start.width, height: side(height, room.height) };
}

/** A change in Image options' Size: a side in points, or a side's scale in percent of its own size. */
export type PictureSizeChange = {
  field: 'width' | 'height' | 'scaleWidth' | 'scaleHeight';
  value: number;
};

/** The size a change in Image options gives, the other side following while locked; none for Scale without its own. */
export function changedPictureSize(
  current: PictureSize,
  change: PictureSizeChange,
  { lock, own, room }: { lock: boolean; own: PictureSize | null; room: PictureSize },
): PictureSize | null {
  if (!hasPictureSize(current)) return null;
  const across = change.field === 'width' || change.field === 'scaleWidth';
  const isScale = change.field === 'scaleWidth' || change.field === 'scaleHeight';
  if (isScale && !own) return null;
  const value =
    isScale && own ? ((across ? own.width : own.height) * change.value) / 100 : change.value;
  if (lock) return scaled(current, value / (across ? current.width : current.height), room);
  return across
    ? { width: side(value, room.width), height: current.height }
    : { width: current.width, height: side(value, room.height) };
}
