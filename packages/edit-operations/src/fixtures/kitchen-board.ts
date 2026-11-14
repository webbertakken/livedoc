// A kitchen's order flow for the lane-plan suites (docs/specs/021-event-storming/lane-plans.md), laid out a lane per
// kind: who, what they ask for, what happened and how the kitchen reacts. Invented; no one's board.

import {
  ES_LANES,
  ES_NOTE_GAP,
  eventStormingNoteSize,
  laneCentre,
  type Element,
  type EventStormingNoteKind,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { stormContext, stormNote } from './storm-board';

// One rhythm step: a square note and a gutter.
const STEP = 200 + ES_NOTE_GAP;

export const laneNote = (
  id: string,
  kind: EventStormingNoteKind,
  column: number,
  lane: number,
  extra: Partial<StickyElement> = {},
): StickyElement =>
  stormNote(id, id, column * STEP, {
    esKind: kind,
    y: laneCentre(lane, ES_LANES) - eventStormingNoteSize(kind).height / 2,
    ...extra,
  });

export const kitchenBoard = (more: Element[] = []): Tab => ({
  id: 't',
  name: 'Kitchen',
  kind: 'event-storming',
  elements: [
    laneNote('cook', 'actor', 0, 0),
    laneNote('waiter', 'actor', 2, 0),
    laneNote('take-order', 'command', 0, 1),
    laneNote('plate-dish', 'command', 2, 1),
    laneNote('order-taken', 'domain-event', 0, 2),
    laneNote('dish-plated', 'domain-event', 2, 2),
    laneNote('fire-ticket', 'policy', 1, 3),
    stormContext('orders', 'Orders', { notes: ['cook', 'take-order', 'order-taken'] }),
    ...more,
  ],
});

// Two lanes, one for each part of the business: it reads the same.
export const TWO_LANES = [
  'suggest-lane "Orders" context=orders reason="Two parts of the business"',
  'suggest-lane "Kitchen" lanes=1,2,3,4',
].join('\n');
