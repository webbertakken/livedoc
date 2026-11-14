import {
  eventStormingKindOf,
  pointInPolygon,
  type Element,
  type ElementId,
} from '@livedoc/document';

// The notes a drawn loop takes in (docs/specs/021-event-storming/candidate-contexts.md "Making one by hand"): every
// workshop note whose centre lies inside the loop, on a visible layer. The loop is only the gesture; the context's
// outline is still worked out from its notes. Pure.

/** The fewest points a loop needs to enclose anything. */
export const CONTEXT_LOOP_MIN_POINTS = 3;

export function notesInLoop(
  elements: readonly Element[],
  loop: readonly { x: number; y: number }[],
  hidden: ReadonlySet<ElementId>,
): ElementId[] {
  if (loop.length < CONTEXT_LOOP_MIN_POINTS) return [];
  return elements
    .filter(
      (el) =>
        el.type === 'sticky' &&
        eventStormingKindOf(el) !== null &&
        !hidden.has(el.id) &&
        pointInPolygon({ x: el.x + el.width / 2, y: el.y + el.height / 2 }, loop),
    )
    .map((el) => el.id);
}

/** A loop as SVG path data, closed back to its start. */
export function loopPath(loop: readonly { x: number; y: number }[]): string {
  if (loop.length === 0) return '';
  const [first, ...rest] = loop;
  return `M${first!.x} ${first!.y}${rest.map((p) => `L${p.x} ${p.y}`).join('')}Z`;
}
