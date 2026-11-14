// Whether a lane plan may stand (docs/specs/021-event-storming/lane-plans.md "What must stay true"): it holds
// exactly the notes a plan holds, none of them lands on a note that stays, and the board says the same after it.
// The engine checks a plan when it is suggested; the editor checks it again when it is previewed and applied.

import {
  plannableNotes,
  withoutLanePlans,
  type Element,
  type ElementId,
  type EsLanePlan,
  type Tab,
} from '@livedoc/document';
import { withLaneNames } from './names';
import { placeLanePlan } from './place';
import { readingChanges, type ReadingChange } from './same-reading';

export type LanePlanVerdict =
  // `elements`: the board with the plan's notes where they would stand.
  | { ok: true; elements: Element[]; top: number; gained: number }
  // The board changed since the plan was made: a note it holds has gone, or one it does not hold has arrived.
  | { ok: false; why: 'stale'; stale: 'gone' | 'arrived' }
  | { ok: false; why: 'blocked'; blocked: ElementId[] }
  | { ok: false; why: 'reading_changes'; changes: ReadingChange[] };

export function checkLanePlan(
  tab: Pick<Tab, 'elements' | 'layers'>,
  plan: Pick<EsLanePlan, 'lanes'>,
): LanePlanVerdict {
  const plannable = new Set(plannableNotes(tab).map((n) => n.id));
  const held = new Set(plan.lanes.flatMap((lane) => lane.notes));
  if ([...held].some((id) => !plannable.has(id))) return { ok: false, why: 'stale', stale: 'gone' };
  if (held.size < plannable.size) return { ok: false, why: 'stale', stale: 'arrived' };

  const placed = placeLanePlan(tab, plan.lanes);
  if (placed.blocked.length > 0) return { ok: false, why: 'blocked', blocked: placed.blocked };
  const { changes, gained } = readingChanges(tab, placed);
  if (changes.length > 0) return { ok: false, why: 'reading_changes', changes };
  return { ok: true, elements: placed.elements, top: placed.top, gained };
}

/** The board a passing verdict leaves: the plan's notes moved, the lane names written, the plan gone. A preview
 *  lands the verdict it already holds; applying checks and lands. */
export function landLanePlan(
  tab: Pick<Tab, 'elements' | 'layers'>,
  plan: Pick<EsLanePlan, 'lanes'>,
  verdict: Extract<LanePlanVerdict, { ok: true }>,
  makeId: () => string,
): Element[] {
  const names = plan.lanes.map((lane) => lane.name);
  return withoutLanePlans(withLaneNames(tab, verdict.elements, names, verdict.top, makeId));
}

/** The board with the plan applied; null when it may not be. */
export function applyLanePlan(
  tab: Pick<Tab, 'elements' | 'layers'>,
  plan: Pick<EsLanePlan, 'lanes'>,
  makeId: () => string,
): Element[] | null {
  const verdict = checkLanePlan(tab, plan);
  return verdict.ok ? landLanePlan(tab, plan, verdict, makeId) : null;
}
