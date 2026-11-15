// A kitchen's order flow for the ask tests, a lane per kind: who, what they ask for, what happened and how the
// kitchen reacts. Invented; no one's board. Its ids are slugs, so a line names a note by its id.

import {
  ES_LANES,
  ES_NOTE_GAP,
  eventStormingNoteSize,
  laneCentre,
  type Element,
  type EventStormingNoteKind,
  type Tab,
} from '@livedoc/document';

const STEP = 200 + ES_NOTE_GAP;

export function note(
  id: string,
  kind: EventStormingNoteKind,
  col: number,
  lane: number,
  label: string,
): Element {
  const size = eventStormingNoteSize(kind);
  return {
    id,
    type: 'sticky',
    x: col * STEP,
    y: laneCentre(lane, ES_LANES) - size.height / 2,
    ...size,
    label,
    esKind: kind,
    fixedSize: true,
  };
}

export function kitchen(elements: Element[] = []): Tab {
  return {
    id: 'kitchen',
    name: 'Kitchen',
    kind: 'event-storming',
    elements: [
      note('cook', 'actor', 0, 0, 'Cook'),
      note('waiter', 'actor', 2, 0, 'Waiter'),
      note('take-order', 'command', 0, 1, 'Take Order'),
      note('plate-dish', 'command', 2, 1, 'Plate Dish'),
      note('order-taken', 'domain-event', 0, 2, 'Order Taken'),
      note('dish-plated', 'domain-event', 2, 2, 'Dish Plated'),
      note('fire-ticket', 'policy', 1, 3, 'Fire Ticket'),
      ...elements,
    ],
  };
}

// Two lanes, one for each part of the business: the board reads the same.
export const TWO_LANES = [
  'suggest-lane "Orders" cook take-order order-taken reason="a lane for each part of the kitchen"',
  'suggest-lane "Pass" fire-ticket waiter plate-dish dish-plated',
];

// The events three lanes from their commands: out of the reading's reach, so the board would say something else.
export const OUT_OF_REACH = [
  'suggest-lane "Events" kind=domain-event reason="what happened first"',
  'suggest-lane "People" kind=actor',
  'suggest-lane "Rules" kind=policy',
  'suggest-lane "Commands" kind=command',
];
