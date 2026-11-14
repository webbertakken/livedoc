// The notes that stay (a locked one, one placed free of the lanes) which a moved note would land on
// (docs/specs/021-event-storming/lane-plans.md `lane_blocked`, arrange.md "A note in the way").

import type { ElementId } from '@livedoc/document';
import type { PlacedNote } from '../types';

export type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Of `notes`, those not in `moved` whose box a moved note's box overlaps. */
export function blockedBy(
  notes: readonly PlacedNote[],
  moved: ReadonlyMap<ElementId, Box>,
): ElementId[] {
  const boxes = [...moved.values()];
  return notes
    .filter((n) => !moved.has(n.id))
    .filter((n) => {
      const box = { x: n.left, y: n.top, width: n.right - n.left, height: n.bottom - n.top };
      return boxes.some((b) => overlaps(b, box));
    })
    .map((n) => n.id);
}
