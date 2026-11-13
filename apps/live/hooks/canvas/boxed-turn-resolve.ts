// Resolving one frame of a turn by hand (docs/specs/008-canvas/selection-transforms.md "Rotating by hand"): the
// angle the pointer has swept about the selection's pivot since the press, snapped under Shift, applied to the
// selection as the gesture found it. Pure, like boxed-drag-resolve: the drag hook feeds the start state and the live
// pointer and writes back what this returns.
import {
  rotationOf,
  turnReference,
  turnSelection,
  type Element,
  type Point,
} from '@livedoc/document';

/** Shift snaps the reference member's angle to these steps (ST1). */
export const ROTATE_SNAP_DEGREES = 15;

/** The clockwise angle (degrees, y down) swept about `pivot` from `start` to `now`, the short way round. */
export function sweptDegrees(pivot: Point, start: Point, now: Point): number {
  if ((start.x === pivot.x && start.y === pivot.y) || (now.x === pivot.x && now.y === pivot.y)) {
    return 0;
  }
  const from = Math.atan2(start.y - pivot.y, start.x - pivot.x);
  const to = Math.atan2(now.y - pivot.y, now.x - pivot.x);
  const deg = ((to - from) * 180) / Math.PI;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * The selection's members turned by the sweep, keyed by id, from the elements as the gesture found them (as they
 * were while the sweep is under a whole degree, so sweeping back puts them back). The angles are read on screen: the canvas is never itself turned, so a sweep
 * on screen is the same sweep on the canvas.
 */
export function resolveBoxedTurn({
  startElements,
  ids,
  pivotClient,
  pressClient,
  client,
  shiftHeld,
}: {
  startElements: Element[];
  ids: ReadonlySet<string>;
  pivotClient: Point;
  pressClient: Point;
  client: Point;
  shiftHeld: boolean;
}): Map<string, Element> {
  let turn = Math.round(sweptDegrees(pivotClient, pressClient, client));
  const reference = shiftHeld ? turnReference(startElements, ids) : null;
  if (shiftHeld) {
    const from = reference ? rotationOf(reference) : 0;
    turn = Math.round((from + turn) / ROTATE_SNAP_DEGREES) * ROTATE_SNAP_DEGREES - from;
  }
  const turned = turnSelection(startElements, ids, turn);
  const out = new Map<string, Element>();
  for (const el of turned) if (ids.has(el.id)) out.set(el.id, el);
  return out;
}
