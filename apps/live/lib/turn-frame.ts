// The frame a turn by hand pivots on (docs/specs/008-canvas/selection-transforms.md "Rotating by hand"): the
// selection chrome marks the box a rotate zone belongs to (a lone element's turned box, a multi-selection's frame),
// and a press on a zone reads that box's centre on screen. A turned box's screen rect is centred where the box is, so
// either way the centre is the selection's pivot.
import type { Point } from '@livedoc/document';

export const TURN_FRAME_ATTR = 'data-turn-frame';

/** The on-screen centre of the turn frame holding `target`, or null when it sits in none. */
export function turnFramePivotClient(target: EventTarget | null): Point | null {
  const frame =
    target instanceof globalThis.Element ? target.closest(`[${TURN_FRAME_ATTR}]`) : null;
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
