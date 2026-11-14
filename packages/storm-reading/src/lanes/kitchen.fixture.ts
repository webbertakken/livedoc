// A kitchen's order flow for the lane tests, laid out a lane per kind: who, what they ask for, what happened and how
// the kitchen reacts. Invented; no one's board.

import type { Element, EsPlanLane, StickyElement, Tab } from '@livedoc/document';
import { board } from '../testing';

export function kitchen(): Tab {
  return board(
    { id: 'cook', kind: 'actor', col: 0, lane: 0 },
    { id: 'waiter', kind: 'actor', col: 2, lane: 0 },
    { id: 'take-order', kind: 'command', col: 0, lane: 1 },
    { id: 'plate-dish', kind: 'command', col: 2, lane: 1 },
    { id: 'order-taken', kind: 'domain-event', col: 0, lane: 2 },
    { id: 'dish-plated', kind: 'domain-event', col: 2, lane: 2 },
    { id: 'fire-ticket', kind: 'policy', col: 1, lane: 3 },
  );
}

// Two lanes, one for each part of the business: it reads the same.
export const twoLanes: EsPlanLane[] = [
  { name: 'Orders', notes: ['cook', 'take-order', 'order-taken'] },
  { name: 'Kitchen', notes: ['fire-ticket', 'waiter', 'plate-dish', 'dish-plated'] },
];

// The events three lanes from their commands: out of the reading's reach.
export const outOfReach: EsPlanLane[] = [
  { name: 'Events', notes: ['order-taken', 'dish-plated'] },
  { name: 'People', notes: ['cook', 'waiter'] },
  { name: 'Rules', notes: ['fire-ticket'] },
  { name: 'Commands', notes: ['take-order', 'plate-dish'] },
];

// A note's place, and every element's x: the tests' boards hold notes and texts only.
export const at = (tab: Pick<Tab, 'elements'>, id: string) => {
  const el = tab.elements.find((e) => e.id === id) as StickyElement;
  return [el.x, el.y];
};
export const xs = (elements: readonly Element[]) => (elements as StickyElement[]).map((el) => el.x);
