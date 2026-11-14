import {
  newLanePlanElement,
  type Element,
  type EsPlanLane,
  type LanePlanElement,
  type Tab,
} from '@livedoc/document';
import { note } from './change-board.fixture';

// A kitchen's order flow for the unit tests of lane plans and arranging (docs/specs/021-event-storming/lane-plans.md,
// docs/specs/021-event-storming/arrange.md), a lane per kind: who, what they ask for, what happened and how the
// kitchen reacts. Invented; no one's board.

export function kitchenNotes(): Element[] {
  return [
    note('cook', 'Cook', 0, 'actor', 0),
    note('waiter', 'Waiter', 2, 'actor', 0),
    note('take-order', 'Take order', 0, 'command', 1),
    note('plate-dish', 'Plate dish', 2, 'command', 1),
    note('order-taken', 'Order taken', 0, 'domain-event', 2),
    note('dish-plated', 'Dish plated', 2, 'domain-event', 2),
    note('fire-ticket', 'Fire the ticket', 1, 'policy', 3),
  ];
}

// Two lanes, one for each part of the business: the board reads the same.
export const TWO_LANES: EsPlanLane[] = [
  { name: 'Orders', notes: ['cook', 'take-order', 'order-taken'] },
  { name: 'Kitchen', notes: ['fire-ticket', 'waiter', 'plate-dish', 'dish-plated'] },
];

export const lanePlan = (extra: { reason?: string; by?: string } = {}): LanePlanElement =>
  newLanePlanElement({ id: 'plan', plan: { lanes: TWO_LANES, ...extra }, notes: [] });

/** The kitchen with an open plan for two lanes. */
export function plannedKitchen(extra: { reason?: string; by?: string } = {}): Tab {
  return {
    id: 't',
    name: 'Kitchen',
    kind: 'event-storming',
    elements: [...kitchenNotes(), lanePlan(extra)],
  };
}

export const kitchenTab = (elements: Element[] = kitchenNotes()): Tab => ({
  id: 't',
  name: 'Kitchen',
  kind: 'event-storming',
  elements,
});
