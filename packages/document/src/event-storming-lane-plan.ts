// A lane plan on an event-storming board (docs/specs/021-event-storming/lane-plans.md "The plan"): a proposal to
// reorganise the board into fewer lanes, top to bottom, each with its name and the notes it holds. It is an element,
// so it travels as any element does; no painter draws it. Pure: every write answers the board after it.

import { contextBounds } from './candidate-contexts';
import { eventStormingKindOf } from './event-storming';
import { isOnLane } from './event-storming-lanes';
import { LANE_NAME_MAX } from './event-storming-structure';
import { SUGGESTION_BY_MAX, SUGGESTION_REASON_MAX } from './event-storming-suggestions';
import type { Element, ElementId, Layer, ShapeElement, StickyElement } from './index';
import { lockedLayerElementIds } from './layers';

/** The fewest and the most lanes a plan may bound a board to. */
export const LANES_MIN = 2;
export const LANES_MAX = 12;
/** The most notes one plan names: more than any board a room reads (safe range: 400 to 5000). */
export const LANE_PLAN_NOTES_MAX = 2000;

export type EsPlanLane = {
  /** What the lane holds, in the business's words. */
  name: string;
  /** The workshop notes it holds, by id. */
  notes: ElementId[];
};

export type EsLanePlan = {
  /** The lanes, top to bottom. */
  lanes: EsPlanLane[];
  reason?: string;
  by?: string;
};

export type LanePlanElement = ShapeElement & { esLanePlan: EsLanePlan };

const optionalText = (v: unknown, max: number) =>
  v === undefined || (typeof v === 'string' && v.length <= max);

/** A name a lane may carry: 1 to LANE_NAME_MAX characters, not only space. */
export function isValidLaneName(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= LANE_NAME_MAX;
}

function isValidLane(v: unknown): v is EsPlanLane {
  if (typeof v !== 'object' || v === null) return false;
  const lane = v as Record<string, unknown>;
  return (
    isValidLaneName(lane.name) &&
    Array.isArray(lane.notes) &&
    lane.notes.length > 0 &&
    lane.notes.every((id) => typeof id === 'string' && id.length > 0)
  );
}

/** A plan a board may hold: LANES_MIN to LANES_MAX lanes, each named and holding notes, no note on two. */
export function isValidEsLanePlan(v: unknown): v is EsLanePlan {
  if (typeof v !== 'object' || v === null) return false;
  const plan = v as Record<string, unknown>;
  const lanes = plan.lanes;
  if (!Array.isArray(lanes) || lanes.length < LANES_MIN || lanes.length > LANES_MAX) return false;
  if (!lanes.every(isValidLane)) return false;
  const ids = lanes.flatMap((lane) => lane.notes);
  return (
    ids.length <= LANE_PLAN_NOTES_MAX &&
    new Set(ids).size === ids.length &&
    optionalText(plan.reason, SUGGESTION_REASON_MAX) &&
    optionalText(plan.by, SUGGESTION_BY_MAX)
  );
}

export function isLanePlan(el: { type: string; esLanePlan?: unknown }): el is LanePlanElement {
  return el.type === 'shape' && el.esLanePlan !== undefined;
}

/** The board's open plan; one that is not valid reads as none. */
export function openLanePlan(elements: readonly Element[]): LanePlanElement | null {
  const plan = elements.find((el) => isLanePlan(el) && isValidEsLanePlan(el.esLanePlan));
  return (plan as LanePlanElement | undefined) ?? null;
}

/** A new plan, boxed round the notes it holds (what brings it into view), on their layer. */
export function newLanePlanElement(input: {
  id: ElementId;
  plan: EsLanePlan;
  notes: readonly StickyElement[];
}): LanePlanElement {
  const first = input.notes[0];
  return {
    id: input.id,
    type: 'shape',
    shape: 'square',
    ...contextBounds(input.notes),
    ...(first?.layerId !== undefined ? { layerId: first.layerId } : {}),
    esLanePlan: input.plan,
  };
}

/** The board without its plans; the same array when it holds none. */
export function withoutLanePlans(elements: Element[]): Element[] {
  return elements.some(isLanePlan) ? elements.filter((el) => !isLanePlan(el)) : elements;
}

/** The board with this plan as its one open plan. */
export function withLanePlan(elements: Element[], plan: LanePlanElement): Element[] {
  return [...withoutLanePlans(elements), plan];
}

/** The notes a plan holds: every workshop note but a locked one and one placed free of the lanes. */
export function plannableNotes(tab: { elements: Element[]; layers?: Layer[] }): StickyElement[] {
  const lockedLayer = lockedLayerElementIds(tab.elements, tab.layers);
  return tab.elements.filter(
    (el): el is StickyElement =>
      el.type === 'sticky' &&
      eventStormingKindOf(el) !== null &&
      !el.locked &&
      !lockedLayer.has(el.id) &&
      isOnLane(el),
  );
}
