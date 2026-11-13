import type { Page } from '@playwright/test';
import {
  ES_LANES,
  ES_NOTE_GAP,
  eventStormingNoteFields,
  laneCentre,
  newContextElement,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { startSuggestionBoard } from './suggestion-board';

// A drawn order flow with candidate contexts (docs/specs/021-event-storming/candidate-contexts.md): a kept "Ordering"
// round the customer placing an order from the menu, a suggested "Payments" round taking the money, and the shipment
// in none. Ordering's outline holds a free spot (lane 1, column 1) a dragged note can be dropped into.

const COLUMN = 200 + ES_NOTE_GAP;

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
  } as StickyElement;
}

export const CONTEXT_BOARD_IDS = {
  ordering: 'c-ordering',
  payments: 'c-payments',
  placeOrder: 'n-place-order',
  orderPlaced: 'n-order-placed',
  customer: 'n-customer',
  menu: 'n-menu',
  takePayment: 'n-take-payment',
  orderShipped: 'n-order-shipped',
} as const;

export function contextBoardElements(): Record<string, unknown>[] {
  const notes = [
    note('n-customer', 'actor', 'Customer', 0, 1),
    note('n-menu', 'read-model', 'Menu', 2, 1),
    note('n-place-order', 'command', 'Place order', 0, 2),
    note('n-order-placed', 'domain-event', 'Order placed', 1, 2),
    note('n-provider', 'external-system', 'Payment provider', 3, 1),
    note('n-take-payment', 'command', 'Take payment', 3, 2),
    note('n-payment-received', 'domain-event', 'Payment received', 4, 2),
    note('n-order-shipped', 'domain-event', 'Order shipped', 6, 2),
  ];
  const pick = (...ids: string[]) => ids.map((id) => notes.find((n) => n.id === id)!);
  return [
    ...notes,
    newContextElement({
      id: CONTEXT_BOARD_IDS.ordering,
      name: 'Ordering',
      notes: pick('n-customer', 'n-menu', 'n-place-order', 'n-order-placed'),
    }),
    newContextElement({
      id: CONTEXT_BOARD_IDS.payments,
      name: 'Payments',
      notes: pick('n-provider', 'n-take-payment', 'n-payment-received'),
      suggestion: {
        reason: 'Taking the money is a part of the business of its own.',
        by: 'Claude',
      },
    }),
  ];
}

export async function startContextBoard(page: Page): Promise<void> {
  await startSuggestionBoard(page, contextBoardElements());
  await page.locator(`[data-candidate-context="${CONTEXT_BOARD_IDS.ordering}"]`).waitFor();
}
