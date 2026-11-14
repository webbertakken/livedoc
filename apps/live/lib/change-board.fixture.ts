import {
  ES_LANES,
  ES_NOTE_GAP,
  addNameSuggestion,
  addNoteChange,
  laneCentre,
  newContextElement,
  type Element,
  type EsNoteChange,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';

// A small order flow for the unit tests of suggested changes (docs/specs/021-event-storming/suggested-changes.md):
// "Ordering" round placing an order, "Fulfilment" round packing and shipping it, and one note in no context.

export const STEP = 200 + ES_NOTE_GAP;

export function note(
  id: string,
  label: string,
  column: number,
  kind: EventStormingNoteKind = 'domain-event',
  lane = 2,
): StickyElement {
  return {
    id,
    type: 'sticky',
    esKind: kind,
    fixedSize: true,
    label,
    x: column * STEP,
    y: laneCentre(lane, ES_LANES) - 100,
    width: 200,
    height: 200,
  };
}

export const REWORD: EsNoteChange = {
  change: 'reword',
  words: 'Pack parcel',
  term: 'Order',
  to: 'Parcel',
  reason: 'The warehouse handles a parcel.',
  by: 'Claude',
};
export const KIND: EsNoteChange = { change: 'kind', kind: 'command', reason: 'It asks.' };
export const SPLIT: EsNoteChange = { change: 'split', parts: ['Order packed', 'Order shipped'] };
export const REMOVE: EsNoteChange = { change: 'remove', by: 'Claude' };

/** The board: `place`, `placed` in Ordering; `pack`, `packed`, `sent` in Fulfilment; `refund` in none. */
export function orderFlow(): Element[] {
  const notes = [
    note('place', 'Place order', 0, 'command'),
    note('placed', 'Order placed', 1),
    note('refund', 'Refund the order', 3),
    note('pack', 'Pack order', 5, 'command'),
    note('packed', 'Order packed and shipped', 6),
    note('sent', 'Order was shipped', 7),
  ];
  const pick = (...ids: string[]) => ids.map((id) => notes.find((n) => n.id === id)!);
  return [
    ...notes,
    newContextElement({ id: 'ordering', name: 'Ordering', notes: pick('place', 'placed') }),
    newContextElement({
      id: 'fulfilment',
      name: 'Fulfilment',
      notes: pick('pack', 'packed', 'sent'),
    }),
  ];
}

export const changed = (board: Element[], id: string, ...changes: EsNoteChange[]): Element[] =>
  changes.reduce((els, change) => addNoteChange(els, id, change), board);

export const named = (board: Element[], ids: string[], ...names: string[]): Element[] =>
  names.reduce(
    (els, name) => addNameSuggestion(els, ids, { name, reason: `Why ${name}`, by: 'Claude' }),
    board,
  );

export const byId = <T extends Element = StickyElement>(els: readonly Element[], id: string): T =>
  els.find((el) => el.id === id) as T;
