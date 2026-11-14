// The open lane plan as the storm view lists it (docs/specs/021-event-storming/lane-plans.md): its ref, so an agent
// can take it back with `rm`, its lanes and how many notes each holds, why and who, and whether the board changed
// since it was made.

import { computeRefs, openLanePlan, type ElementId, type Tab } from '@livedoc/document';
import { checkLanePlan } from './check';

export type StormLanePlan = {
  id: ElementId;
  ref: string;
  lanes: { name: string; notes: number }[];
  reason?: string;
  by?: string;
  // The plan no longer passes the check: only dismissing it is left.
  stale: boolean;
};

export function readLanePlan(tab: Pick<Tab, 'elements' | 'layers'>): StormLanePlan | null {
  const el = openLanePlan(tab.elements);
  if (!el) return null;
  const plan = el.esLanePlan;
  return {
    id: el.id,
    ref: computeRefs(tab.elements.map((e) => e.id)).refOf(el.id),
    lanes: plan.lanes.map((lane) => ({ name: lane.name, notes: lane.notes.length })),
    ...(plan.reason ? { reason: plan.reason } : {}),
    ...(plan.by ? { by: plan.by } : {}),
    stale: !checkLanePlan(tab, plan).ok,
  };
}
