// How the board places a lane plan (docs/specs/021-event-storming/lane-plans.md "How the board places a plan"): the
// plan's lanes one under the other, each note keeping its place in time. Where two notes would stand on each other
// the column opens: that note and every note after it move right by what is missing. Pure and repeatable.

import {
  ES_LANES,
  ES_NOTE_GAP,
  laneCentre,
  type Element,
  type ElementId,
  type EsPlanLane,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { readNotes } from '../notes';
import { byTime } from '../timeline';
import { blockedBy, type Box } from './blocked';

export type PlacedPlan = {
  // The board with the plan's notes where they would stand; everything else as it was, in its order.
  elements: Element[];
  // The lane the plan's first lane takes.
  top: number;
  // The notes that stay which a placed note would land on.
  blocked: ElementId[];
};

export function placeLanePlan(
  tab: Pick<Tab, 'elements'>,
  lanes: readonly EsPlanLane[],
): PlacedPlan {
  const planLane = new Map<ElementId, number>();
  lanes.forEach((lane, i) => lane.notes.forEach((id) => planLane.set(id, i)));
  const notes = readNotes(tab);
  const held = notes.filter((n) => planLane.has(n.id)).sort(byTime);
  const top = held.length > 0 ? Math.min(...held.map((n) => n.lane)) : 0;

  // The opening sweep: along time, each lane remembers the right-most edge placed on it.
  const reached = new Map<number, number>();
  const placed = new Map<ElementId, Box>();
  const elements = [...tab.elements];
  let shift = 0;
  for (const n of held) {
    const lane = top + planLane.get(n.id)!;
    const missing = (reached.get(lane) ?? -Infinity) + ES_NOTE_GAP - (n.left + shift);
    if (missing > 0) shift += missing;
    const width = n.right - n.left;
    const height = n.bottom - n.top;
    const x = n.left + shift;
    const y = laneCentre(lane, ES_LANES) - height / 2;
    placed.set(n.id, { x, y, width, height });
    if (x !== n.left || y !== n.top)
      elements[n.index] = { ...(elements[n.index] as StickyElement), x, y };
    reached.set(lane, Math.max(reached.get(lane) ?? -Infinity, x + width));
  }

  return { elements, top, blocked: blockedBy(notes, placed) };
}
