import type { Page } from '@playwright/test';
import {
  ES_LANES,
  ES_NOTE_GAP,
  addNameSuggestion,
  addNoteChange,
  eventStormingNoteFields,
  laneCentre,
  newContextElement,
  type Element,
  type EsNoteChange,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { startSuggestionBoard } from './suggestion-board';

// An order flow with suggested changes (docs/specs/021-event-storming/suggested-changes.md): a kept "Ordering" that
// holds three other names, a suggested "Payments" that holds one, one name for the two merged, and in "Fulfilment" a
// reword whose term ripples through its context (and is held beyond it), a split on a note that holds two changes
// (so its mark counts) and a removal; the kind change is on a note in "Payments".

const COLUMN = 200 + ES_NOTE_GAP;
const BY = 'Claude';

function note(
  id: string,
  kind: EventStormingNoteKind,
  label: string,
  column: number,
  lane: number,
): StickyElement {
  const fields = eventStormingNoteFields(kind);
  return {
    id,
    type: 'sticky',
    label,
    ...fields,
    x: column * COLUMN,
    y: laneCentre(lane, ES_LANES) - fields.height / 2,
  };
}

export const CHANGE_BOARD_IDS = {
  ordering: 'c-ordering',
  payments: 'c-payments',
  fulfilment: 'c-fulfilment',
  placeOrder: 'n-place-order',
  orderPlaced: 'n-order-placed',
  refund: 'n-refund',
  packOrder: 'n-pack-order',
  packedAndShipped: 'n-packed-and-shipped',
  orderSent: 'n-order-sent',
} as const;

export const CHANGE_BOARD_NAMES = {
  ordering: ['Order taking', 'Sales', 'Front of house'],
  payments: ['Billing'],
  merged: 'Checkout',
} as const;

const IDS = CHANGE_BOARD_IDS;

export const CHANGE_BOARD_CHANGES = {
  reword: {
    change: 'reword',
    words: 'Pack parcel',
    term: 'Order',
    to: 'Parcel',
    reason: 'Once it is paid for, the warehouse handles a parcel, not an order.',
    by: BY,
  },
  kind: {
    change: 'kind',
    kind: 'command',
    reason: 'It asks for something to happen, so it reads as a command, not a fact.',
    by: BY,
  },
  split: {
    change: 'split',
    parts: ['Order packed', 'Order shipped'],
    reason: 'Packing and shipping are two facts, and a courier only cares about the second.',
    by: BY,
  },
  shorter: {
    change: 'reword',
    words: 'Order dispatched',
    reason: 'One word the warehouse already uses for both.',
    by: BY,
  },
  remove: {
    change: 'remove',
    reason: 'It says what the note before it already says.',
    by: BY,
  },
} as const satisfies Record<string, EsNoteChange>;

export function changeBoardElements(): Record<string, unknown>[] {
  const notes = [
    note('n-customer', 'actor', 'Customer', 0, 1),
    note('n-menu', 'read-model', 'Menu', 1, 1),
    note(IDS.placeOrder, 'command', 'Place order', 0, 2),
    note(IDS.orderPlaced, 'domain-event', 'Order placed', 1, 2),
    note('n-provider', 'external-system', 'Payment provider', 3, 1),
    note('n-take-payment', 'command', 'Take payment', 3, 2),
    note('n-payment-received', 'domain-event', 'Payment received', 4, 2),
    note(IDS.refund, 'domain-event', 'Refund the customer', 5, 2),
    note(IDS.packOrder, 'command', 'Pack order', 7, 2),
    note(IDS.packedAndShipped, 'domain-event', 'Order packed and shipped', 8, 2),
    note(IDS.orderSent, 'domain-event', 'Order was shipped', 9, 2),
  ];
  const pick = (...ids: string[]) => ids.map((id) => notes.find((n) => n.id === id)!);
  let board: Element[] = [
    ...notes,
    newContextElement({
      id: IDS.ordering,
      name: 'Ordering',
      notes: pick('n-customer', 'n-menu', IDS.placeOrder, IDS.orderPlaced),
    }),
    newContextElement({
      id: IDS.payments,
      name: 'Payments',
      notes: pick('n-provider', 'n-take-payment', 'n-payment-received', IDS.refund),
      suggestion: { reason: 'Taking the money is a part of the business of its own.', by: BY },
    }),
    newContextElement({
      id: IDS.fulfilment,
      name: 'Fulfilment',
      notes: pick(IDS.packOrder, IDS.packedAndShipped, IDS.orderSent),
    }),
  ];
  const named = (ids: string[], name: string, reason: string) => {
    board = addNameSuggestion(board, ids, { name, reason, by: BY });
  };
  const [taking, sales, front] = CHANGE_BOARD_NAMES.ordering;
  named([IDS.ordering], taking, 'It is the act the customer and the waiter share.');
  named([IDS.ordering], sales, 'What the business calls this part in its own reports.');
  named([IDS.ordering], front, 'Where it happens, as the staff say it.');
  named(
    [IDS.payments],
    CHANGE_BOARD_NAMES.payments[0],
    'It also holds refunds, not only payments.',
  );
  named(
    [IDS.ordering, IDS.payments],
    CHANGE_BOARD_NAMES.merged,
    'Placing the order and paying for it happen in one sitting.',
  );
  const changed = (id: string, change: EsNoteChange) => {
    board = addNoteChange(board, id, change);
  };
  changed(IDS.packOrder, CHANGE_BOARD_CHANGES.reword);
  changed(IDS.refund, CHANGE_BOARD_CHANGES.kind);
  changed(IDS.packedAndShipped, CHANGE_BOARD_CHANGES.split);
  changed(IDS.packedAndShipped, CHANGE_BOARD_CHANGES.shorter);
  changed(IDS.orderSent, CHANGE_BOARD_CHANGES.remove);
  return board;
}

export async function startChangeBoard(page: Page): Promise<void> {
  await startSuggestionBoard(page, changeBoardElements(), IDS.orderPlaced);
  await page
    .locator(`[data-testid="context-lines"] [data-candidate-context="${IDS.ordering}"]`)
    .waitFor();
}
