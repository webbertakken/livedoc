// The fold (docs/specs/021-event-storming/lane-plans.md "The fold"): the board's own lane plan, made without a
// model. It merges two neighbouring lanes at a time, the pair whose notes overlap least along the timeline first,
// until the lanes asked for are left; every merge must keep what the board says.

import {
  ES_LANES,
  laneIndexAt,
  LANES_MAX,
  LANES_MIN,
  newLanePlanElement,
  plannableNotes,
  type ElementId,
  type EsPlanLane,
  type LanePlanElement,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { readNotes } from '../notes';
import { readLanes } from '../structure';
import { byTime } from '../timeline';
import { checkLanePlan } from './check';

export type Fold =
  | { lanes: EsPlanLane[] }
  // `fits`: the board is on that many lanes or fewer already. `no_arrangement`: no fold keeps what it says.
  | { none: 'fits' | 'no_arrangement' };

type FoldLane = { name: string; notes: StickyElement[] };

// How much two lanes' notes share of the timeline: the x overlap of each note of one with each of the other.
function overlap(a: FoldLane, b: FoldLane): number {
  let shared = 0;
  for (const n of a.notes)
    for (const m of b.notes)
      shared += Math.max(0, Math.min(n.x + n.width, m.x + m.width) - Math.max(n.x, m.x));
  return shared;
}

export function foldLanes(tab: Pick<Tab, 'elements' | 'layers'>, count: number): Fold {
  const target = Math.min(LANES_MAX, Math.max(LANES_MIN, count));
  const read = readNotes(tab);
  const time = new Map([...read].sort(byTime).map((n, i) => [n.id, i]));
  const named = new Map(readLanes(tab, read).map((lane) => [lane.lane, lane]));
  const byLane = new Map<number, StickyElement[]>();
  for (const note of plannableNotes(tab)) {
    const lane = laneIndexAt(note.y + note.height / 2, ES_LANES);
    byLane.set(lane, [...(byLane.get(lane) ?? []), note]);
  }
  let lanes: FoldLane[] = [...byLane]
    .sort(([a], [b]) => a - b)
    .map(([lane, notes]) => ({
      name: named.get(lane)!.name ?? `Lane ${named.get(lane)!.number}`,
      notes,
    }));
  if (lanes.length <= target) return { none: 'fits' };

  const planOf = (folded: readonly FoldLane[]): EsPlanLane[] =>
    folded.map((lane) => ({
      name: lane.name,
      notes: lane.notes.map((n) => n.id).sort((a, b) => time.get(a)! - time.get(b)!),
    }));

  while (lanes.length > target) {
    const pairs = lanes
      .slice(0, -1)
      .map((lane, i) => ({ i, shared: overlap(lane, lanes[i + 1]!) }))
      .sort((a, b) => a.shared - b.shared || a.i - b.i);
    let merged: FoldLane[] | null = null;
    for (const { i } of pairs) {
      const upper = lanes[i]!;
      const lower = lanes[i + 1]!;
      const lane: FoldLane = {
        name: lower.notes.length > upper.notes.length ? lower.name : upper.name,
        notes: [...upper.notes, ...lower.notes],
      };
      const next = [...lanes.slice(0, i), lane, ...lanes.slice(i + 2)];
      if (checkLanePlan(tab, { lanes: planOf(next) }).ok) {
        merged = next;
        break;
      }
    }
    if (!merged) return { none: 'no_arrangement' };
    lanes = merged;
  }
  return { lanes: planOf(lanes) };
}

/** Who a fold is by, and why it is offered in place of a model's plan. */
export const FOLD_BY = 'LiveDoc';
export const FOLD_REASON = 'The board’s own fold: no model’s plan kept what the board says.';
/** Why, when a person asked the board itself. */
export const FOLD_REASON_OWN = 'The board’s own fold, made without a model.';

/** The fold as a plan a board can hold, or why there is none. */
export function foldPlan(
  tab: Pick<Tab, 'elements' | 'layers'>,
  count: number,
  plan: { id: ElementId; reason: string },
): { plan: LanePlanElement } | { none: 'fits' | 'no_arrangement' } {
  const fold = foldLanes(tab, count);
  if ('none' in fold) return fold;
  const held = new Set(fold.lanes.flatMap((lane) => lane.notes));
  return {
    plan: newLanePlanElement({
      id: plan.id,
      plan: { lanes: fold.lanes, reason: plan.reason, by: FOLD_BY },
      notes: plannableNotes(tab).filter((note) => held.has(note.id)),
    }),
  };
}

/** What the board says when it has nothing to fold. */
export function sayNoFold(none: 'fits' | 'no_arrangement', count: number): string {
  return none === 'fits'
    ? `The board already fits ${count} lanes.`
    : `No arrangement in ${count} lanes keeps what the board says. Try more lanes.`;
}
