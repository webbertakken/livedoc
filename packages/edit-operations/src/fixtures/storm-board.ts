// A small Event Storming board for the suggested-change suites (docs/specs/021-event-storming/suggested-changes.md):
// an order flow with two kept contexts and one suggested, a plain shape and a text beside them.

import {
  ES_LANES,
  eventStormingNoteFields,
  laneCentre,
  type CandidateContextElement,
  type Element,
  type EsContext,
  type StickyElement,
  type Tab,
} from '@livedoc/document';

const y = laneCentre(0, ES_LANES) - 100;

export const stormNote = (
  id: string,
  label: string,
  x: number,
  extra: Partial<StickyElement> = {},
): StickyElement => ({
  id,
  type: 'sticky',
  ...eventStormingNoteFields(extra.esKind ?? 'domain-event'),
  x,
  y,
  label,
  ...extra,
});

export const stormContext = (
  id: string,
  label: string,
  esContext: EsContext,
): CandidateContextElement => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label,
  textSize: 'md',
  esContext,
});

// A note as an older board holds it: no text size yet, which the engine fills in when it writes the note.
const OLD_NOTE: Element = {
  id: 'old',
  type: 'sticky',
  x: 1500,
  y,
  width: 200,
  height: 200,
  label: 'Order Lost',
  esKind: 'domain-event',
};

const box: Element = {
  id: 'box',
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 900,
  width: 100,
  height: 60,
};

// placed and paid are Ordering (two notes, so a merge keeps it), cooked is Kitchen, shipped is in none, and Delivery
// is suggested round nothing else.
export const stormBoard = (
  change: (el: Element) => Element = (el) => el,
  more: Element[] = [],
): Tab => ({
  id: 't',
  name: 'Order flow',
  kind: 'event-storming',
  elements: [
    stormNote('placed', 'Order Placed', 0),
    stormNote('paid', 'Order Paid', 300),
    stormNote('cooked', 'Meal Cooked', 600),
    stormNote('shipped', 'Order Shipped', 900),
    stormNote('pay', 'Pay Order', 300, { esKind: 'command', y: y - 240 }),
    OLD_NOTE,
    box,
    stormContext('ordering', 'Ordering', { notes: ['placed', 'paid'] }),
    stormContext('kitchen', 'Kitchen', { notes: ['cooked'] }),
    stormContext('delivery', 'Delivery', { notes: ['shipped'], suggestion: { by: 'Ada' } }),
    ...more,
  ].map(change),
});

export const inBoard = <T extends Element = Element>(tab: Tab, id: string): T =>
  tab.elements.find((el) => el.id === id) as T;
