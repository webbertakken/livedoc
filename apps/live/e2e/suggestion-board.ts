import type { Page } from '@playwright/test';
import {
  ES_LANES,
  ES_NOTE_GAP,
  eventStormingNoteFields,
  laneCentre,
  suggestionBounds,
  type EsSuggestionSide,
  type EventStormingNoteKind,
} from '@livedoc/document';
import { pageOwnerHeaders, startTemplateDocument } from './fixtures';

// An order flow with five open suggestions (docs/specs/021-event-storming/suggestions.md): a gap with a chain on
// it, one that fits the board's free space, and two on the lane below, so every hint, count and fit case shows.

type Note = Record<string, unknown> & {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function note(
  id: string,
  kind: EventStormingNoteKind,
  label: string,
  x: number,
  lane: number,
): Note {
  const fields = eventStormingNoteFields(kind);
  return {
    id,
    type: 'sticky',
    label,
    ...fields,
    x,
    y: laneCentre(lane, ES_LANES) - fields.height / 2,
  };
}

function row(
  lane: number,
  start: number,
  notes: [string, EventStormingNoteKind, string][],
): Note[] {
  let x = start;
  return notes.map(([id, kind, label]) => {
    const n = note(id, kind, label, x, lane);
    x += n.width + ES_NOTE_GAP;
    return n;
  });
}

function suggestion(
  id: string,
  kind: EventStormingNoteKind,
  label: string,
  anchor: Note,
  side: EsSuggestionSide,
  reason: string,
  gap?: string,
): Note {
  const spot = suggestionBounds(anchor, side, kind);
  return {
    ...note(id, kind, label, spot.x, 0),
    y: spot.y,
    esSuggestion: { anchorId: anchor.id, side, reason, by: 'Claude', ...(gap ? { gap } : {}) },
  };
}

export const SUGGESTION_BOARD_IDS = {
  orderShipped: 'n-order-shipped',
  shipOrder: 's-ship-order',
  worker: 's-warehouse-worker',
  notify: 's-notify',
  basket: 's-basket',
  failed: 's-payment-failed',
} as const;

export function suggestionBoardElements(): Note[] {
  const flow = row(2, 0, [
    ['n-place-order', 'command', 'Place order'],
    ['n-order-placed', 'domain-event', 'Order placed'],
    ['n-take-payment-policy', 'policy', 'Whenever an order is placed, take payment'],
    ['n-take-payment', 'command', 'Take payment'],
    ['n-payment-received', 'domain-event', 'Payment received'],
    [SUGGESTION_BOARD_IDS.orderShipped, 'domain-event', 'Order shipped'],
  ]);
  const byId = (id: string) => flow.find((n) => n.id === id)!;
  const above = [
    note('n-customer', 'actor', 'Customer', byId('n-place-order').x, 1),
    note('n-provider', 'external-system', 'Payment provider', byId('n-take-payment').x, 1),
  ];
  const shipOrder = suggestion(
    SUGGESTION_BOARD_IDS.shipOrder,
    'command',
    'Ship order',
    byId(SUGGESTION_BOARD_IDS.orderShipped),
    'before',
    'Nothing on the board causes the shipment: someone, or a policy, has to ask for it.',
    'event_without_cause',
  );
  return [
    ...flow,
    ...above,
    shipOrder,
    suggestion(
      SUGGESTION_BOARD_IDS.worker,
      'actor',
      'Warehouse worker',
      shipOrder,
      'above',
      'Who ships the order? In most shops a warehouse worker does.',
    ),
    suggestion(
      SUGGESTION_BOARD_IDS.notify,
      'policy',
      'Whenever an order ships, notify the customer',
      byId(SUGGESTION_BOARD_IDS.orderShipped),
      'after',
      'The customer hears nothing after paying; the shipment is the moment to tell them.',
    ),
    suggestion(
      SUGGESTION_BOARD_IDS.basket,
      'read-model',
      'Basket',
      byId('n-place-order'),
      'below',
      'The customer decides to order from what is in their basket.',
    ),
    suggestion(
      SUGGESTION_BOARD_IDS.failed,
      'hotspot',
      'What if the payment fails?',
      byId('n-payment-received'),
      'below',
      'Only the happy path is on the wall; a declined payment needs events of its own.',
    ),
  ];
}

// A new Event Storming board holding the order flow and its suggestions.
export async function startSuggestionBoard(page: Page): Promise<void> {
  await startTemplateDocument(page, 'Technical', /^Event storming/i);
  const notes = page.locator('[data-canvas-a11y-root]').getByRole('img', { name: /^Sticky note/ });
  await notes.first().waitFor();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page, { 'Content-Type': 'application/json' });
  await page.evaluate(
    async ({ base, headers, elements }) => {
      const id = location.pathname.split('/').filter(Boolean).pop()!;
      // Wait for the new board's first save (its seeded note on the server), so the board is not written over by it.
      let tab: (Record<string, unknown> & { elements: unknown[] }) | null = null;
      let tabId = '';
      for (let i = 0; i < 80 && !tab; i += 1) {
        const doc = (await (await fetch(`${base}/documents/${id}`, { headers })).json()) as {
          document?: { tabs?: { id: string }[] };
        };
        tabId = doc.document?.tabs?.[0]?.id ?? '';
        if (tabId) {
          const got = (await (
            await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
          ).json()) as {
            tab?: Record<string, unknown> & { elements: unknown[] };
          };
          if (got.tab?.elements?.length === 1) tab = got.tab;
        }
        if (!tab) await new Promise((r) => setTimeout(r, 100));
      }
      if (!tab) throw new Error('the new board never saved its seed note');
      const res = await fetch(`${base}/documents/${id}/tabs/${tabId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...tab, elements }),
      });
      if (!res.ok) throw new Error(`seeding the board failed: ${res.status}`);
    },
    { base: apiBase, headers, elements: suggestionBoardElements() },
  );
  await page.reload();
  await page.locator(`[data-element-id="${SUGGESTION_BOARD_IDS.orderShipped}"]`).first().waitFor();
}
