import {
  ES_LANES,
  ES_NOTE_GAP,
  isBoxed,
  isSuggestion,
  laneIndexAt,
  type BoxedElement,
  type Element,
  type ElementId,
  type Rect,
} from '@livedoc/document';

// Opening one lane for a note that lands above or below another (docs/specs/021-event-storming/suggestions.md
// "Opening a lane"). The lane splits at the spot's centre; the note lands on the spot, or in the place of the note
// it covers, and the lane after it moves along together by just enough for one gutter, so it keeps its rhythm with
// no overlap and no gap. Only that lane opens: the anchor's column stays lined up with the note it now holds. Pure.

export type LaneOpening = {
  // Where the note lands.
  bounds: Rect;
  // The lane's notes after it, and how far they move along (0 when they already clear it).
  shiftedIds: readonly ElementId[];
  shiftDx: number;
};

const centreX = (el: { x: number; width: number }) => el.x + el.width / 2;
const laneOf = (el: { y: number; height: number }) => laneIndexAt(el.y + el.height / 2, ES_LANES);

export function planLaneOpening(
  elements: readonly Element[],
  spot: Rect,
  // Elements on a hidden or locked layer: they cannot decide where the lane opens, but travel with it.
  inertIds: ReadonlySet<ElementId> = new Set(),
): LaneOpening {
  const lane = laneOf(spot);
  const split = centreX(spot);
  const onLane = elements.filter(
    (el): el is BoxedElement => isBoxed(el) && !isSuggestion(el) && laneOf(el) === lane,
  );
  const seen = onLane.filter((el) => !inertIds.has(el.id));
  const before = seen.filter((el) => centreX(el) < split);
  const after = onLane.filter((el) => centreX(el) >= split).sort((a, b) => a.x - b.x);
  const firstAfter = after.find((el) => !inertIds.has(el.id));

  const lastEnd = Math.max(-Infinity, ...before.map((el) => el.x + el.width));
  const x = Math.max(Math.min(spot.x, firstAfter?.x ?? spot.x), lastEnd + ES_NOTE_GAP);
  const shiftDx = firstAfter ? Math.max(0, x + spot.width + ES_NOTE_GAP - firstAfter.x) : 0;
  return {
    bounds: { ...spot, x },
    shiftedIds: shiftDx > 0 ? after.filter((el) => el.locked !== true).map((el) => el.id) : [],
    shiftDx,
  };
}

/** The board with the lane opened; the same board when nothing moves. */
export function openLane(elements: Element[], opening: LaneOpening): Element[] {
  if (opening.shiftDx === 0 || opening.shiftedIds.length === 0) return elements;
  const moving = new Set(opening.shiftedIds);
  return elements.map((el) =>
    isBoxed(el) && moving.has(el.id) ? { ...el, x: el.x + opening.shiftDx } : el,
  );
}
