// The board's structure (docs/specs/021-event-storming/board-reading.md "Structure"): the lanes in use and their
// names, the pivotal events and the phases they close, and the decisions answered hotspots hold. Read as the board
// stands, from geometry and what the notes carry; no model is involved.

import {
  ES_LANE_HEIGHT,
  ES_LANES,
  LANE_NAME_MAX,
  laneCentre,
  laneIndexAt,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import { wordsOf } from './notes';
import type {
  PlacedNote,
  StormDecision,
  StormLane,
  StormMoment,
  StormPhase,
  StormRelations,
} from './types';

// The texts left of the wall, each on the lane its centre stands on: a lane's name is the one nearest the wall
// (docs/specs/021-event-storming/board-structure.md "Lane names").
function laneNames(tab: Pick<Tab, 'elements'>, wallLeft: number): Map<number, string> {
  const nearest = new Map<number, { right: number; name: string }>();
  for (const el of tab.elements) {
    if (el.type !== 'text') continue;
    const right = el.x + el.width;
    if (right > wallLeft) continue;
    const cy = el.y + el.height / 2;
    const lane = laneIndexAt(cy, ES_LANES);
    if (Math.abs(cy - laneCentre(lane, ES_LANES)) > ES_LANE_HEIGHT / 2) continue;
    const name = wordsOf(el.label).slice(0, LANE_NAME_MAX).trim();
    if (!name) continue;
    const held = nearest.get(lane);
    if (!held || right > held.right) nearest.set(lane, { right, name });
  }
  return new Map([...nearest].map(([lane, { name }]) => [lane, name]));
}

export function readLanes(tab: Pick<Tab, 'elements'>, notes: readonly PlacedNote[]): StormLane[] {
  if (notes.length === 0) return [];
  const names = laneNames(tab, Math.min(...notes.map((n) => n.left)));
  const lanes = [...new Set(notes.map((n) => n.lane))].sort((a, b) => a - b);
  return lanes.map((lane, i) => ({
    number: i + 1,
    lane,
    name: names.get(lane) ?? null,
    notes: notes
      .filter((n) => n.lane === lane)
      .sort((a, b) => a.left - b.left || a.index - b.index)
      .map((n) => n.id),
  }));
}

// The timeline's events cut after each pivotal one; none without a pivotal event.
export function readPhases(
  timeline: readonly StormMoment[],
  pivotal: ReadonlySet<ElementId>,
): StormPhase[] {
  if (pivotal.size === 0) return [];
  const phases: StormPhase[] = [];
  let run: ElementId[] = [];
  for (const { event } of timeline) {
    run.push(event);
    if (!pivotal.has(event)) continue;
    phases.push({ closes: event, events: run });
    run = [];
  }
  if (run.length > 0) phases.push({ closes: null, events: run });
  return phases;
}

// Every answered hotspot, in the order given: the question, the answer and the note it flags.
export function readDecisions(
  ordered: readonly PlacedNote[],
  relations: StormRelations,
): StormDecision[] {
  return ordered
    .filter((n) => n.kind === 'hotspot' && n.answer)
    .map((n) => ({
      hotspot: n.id,
      question: n.words,
      answer: n.answer,
      flags: relations.flags[n.id] ?? null,
    }));
}
