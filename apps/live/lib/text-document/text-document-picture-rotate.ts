// Turning a picture (docs/specs/034-text-documents/objects.md "Working with a picture"): by its rotation handle, the
// picture following the pointer about its centre (Shift snapping to 15° steps), by ⌥← / ⌥→ (15°) and ⌥⇧← / ⌥⇧→ (1°),
// and by Image options' Angle. A turned picture's handles turn with it, so a drag on one is read along its own sides.
import { Pictures } from '@livedoc/text-documents';

/** The step Shift snaps the handle to, and ⌥← / ⌥→ turn by, in degrees. */
export const PICTURE_TURN_STEP = 15;
/** The step ⌥⇧← / ⌥⇧→ turn by, in degrees. */
export const PICTURE_NUDGE_STEP = 1;

/** The turning shortcuts' rows (keyboard-shortcuts.md), by id, and how far each turns a selected picture clockwise. */
export const PICTURE_TURN_KEYS: Readonly<Record<string, number>> = {
  'rotate-clockwise-by-15': PICTURE_TURN_STEP,
  'rotate-counterclockwise-by-15': -PICTURE_TURN_STEP,
  'rotate-clockwise-by-1': PICTURE_NUDGE_STEP,
  'rotate-counterclockwise-by-1': -PICTURE_NUDGE_STEP,
};

export type Point = { x: number; y: number };

/** The angle of `point` seen from `centre`, in degrees clockwise from straight up (screen y grows down). */
export const pointerAngle = (centre: Point, point: Point): number =>
  (Math.atan2(point.x - centre.x, centre.y - point.y) * 180) / Math.PI;

/** The turn a picture held at `start` takes as the handle moves from `down` to `now` about `centre`; 0 for none. */
export function draggedRotation(
  start: number,
  centre: Point,
  down: Point,
  now: Point,
  { shift }: { shift: boolean },
): number {
  const turned = start + pointerAngle(centre, now) - pointerAngle(centre, down);
  const snapped = shift ? Math.round(turned / PICTURE_TURN_STEP) * PICTURE_TURN_STEP : turned;
  return Pictures.rotation(snapped) ?? 0;
}

/** A turn of `rotation` turned further by `by` degrees (clockwise), as a picture holds it; 0 for none. */
export const turnedBy = (rotation: number, by: number): number =>
  Pictures.rotation(rotation + by) ?? 0;

/** A pointer's move on the screen read along a picture turned by `rotation`: across and down its own sides. */
export function alongPicture(dx: number, dy: number, rotation: number): { dx: number; dy: number } {
  if (rotation === 0) return { dx, dy };
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { dx: dx * cos + dy * sin, dy: dy * cos - dx * sin };
}
