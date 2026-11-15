// A board's structure in an exported image (docs/specs/021-event-storming/board-structure.md "Pivotal events"): the
// tape of every pivotal event shown, drawn beneath the notes in the ink of the candidate contexts' lines, from the
// same geometry the canvas draws.

import { pivotalTapes } from './event-storming-structure';
import type { Rect } from './geometry-primitives';
import type { Element } from './index';
import { CONTEXT_INK } from './svg-render-contexts';
import { r2, xmlEscape } from './svg-render-primitives';

/** How strong the tape's ink is over the canvas: quieter than a context's line, and 3:1 or more against either
 *  paper (safe range: 0.78 to 1; below it the light canvas falls under 3:1). */
export const PIVOTAL_TAPE_OPACITY = 0.8;

/** The tapes of the pivotal events among `visible`, and the box they reach; empty when none shows. */
export function svgPivotalTapes(
  elements: readonly Element[],
  visible: readonly Element[],
  surface: 'light' | 'dark',
): { tapes: string; bounds: Rect | null } {
  const tapes = pivotalTapes(elements, visible);
  if (tapes.length === 0) return { tapes: '', bounds: null };
  const ink = CONTEXT_INK[surface].line;
  const left = Math.min(...tapes.map((t) => t.x));
  const right = Math.max(...tapes.map((t) => t.x + t.width));
  const { y, height } = tapes[0]!;
  return {
    tapes: tapes
      .map(
        (t) =>
          `<rect data-pivotal-tape="${xmlEscape(t.eventId)}" x="${r2(t.x)}" y="${r2(t.y)}" ` +
          `width="${r2(t.width)}" height="${r2(t.height)}" rx="${r2(t.width / 2)}" ` +
          `fill="${ink}" fill-opacity="${PIVOTAL_TAPE_OPACITY}"/>`,
      )
      .join('\n'),
    bounds: { x: left, y, width: right - left, height },
  };
}
