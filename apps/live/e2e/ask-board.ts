import type { Page } from '@playwright/test';
import type { StormAskResponse } from '@livedoc/api-schema';
import {
  eventStormingNoteFields,
  newContextElement,
  suggestionBounds,
  type EsSuggestionSide,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { LANE_BOARD_IDS, laneBoardNotes } from './lane-board';
import { startSuggestionBoard } from './suggestion-board';

// The kitchen's evening with nothing suggested yet (docs/specs/021-event-storming/asks.md): its notes on four lanes,
// and two kept candidate contexts, the floor and the pass, so an ask can be about the board, some notes, one context
// or two. Invented; no one's board.

export const ASK_BOARD_IDS = {
  ...LANE_BOARD_IDS,
  floor: 'c-floor',
  pass: 'c-pass',
  // What the stubbed model answers.
  billPaid: 's-bill-paid',
  dishSentBack: 's-dish-sent-back',
} as const;

const IDS = ASK_BOARD_IDS;

export function askBoardElements(): Record<string, unknown>[] {
  const notes = laneBoardNotes();
  const held = (...ids: string[]) => notes.filter((n) => ids.includes(n.id));
  return [
    ...notes,
    newContextElement({
      id: IDS.floor,
      name: 'Floor',
      notes: held(IDS.waiter, IDS.takeOrder, IDS.orderTaken),
    }),
    newContextElement({
      id: IDS.pass,
      name: 'Pass',
      notes: held(IDS.cook, IDS.plateDish, IDS.dishPlated),
    }),
  ];
}

function suggested(
  id: string,
  kind: EventStormingNoteKind,
  label: string,
  anchor: StickyElement,
  side: EsSuggestionSide,
  reason: string,
): StickyElement {
  return {
    id,
    type: 'sticky',
    label,
    ...eventStormingNoteFields(kind),
    ...suggestionBounds(anchor, side, kind),
    esSuggestion: { anchorId: anchor.id, side, reason, by: 'Built-in model' },
  };
}

/** What the built-in hand's route answers in these tests: two notes the kitchen is missing. */
export function askAnswer(): StormAskResponse {
  const byId = (id: string) => laneBoardNotes().find((n) => n.id === id)!;
  return {
    added: [
      suggested(
        IDS.billPaid,
        'domain-event',
        'Bill paid',
        byId(IDS.tableServed),
        'after',
        'The evening ends when the table pays, and nothing on the board says so.',
      ),
      suggested(
        IDS.dishSentBack,
        'hotspot',
        'What if a dish is sent back?',
        byId(IDS.dishPlated),
        'below',
        'Only the happy path is on the wall.',
      ),
    ],
    names: [],
    changes: [],
    lines: 2,
    dropped: 0,
  };
}

/** A new Event Storming board holding the kitchen and its two contexts, with no suggestion open, on a deployment
 *  that has a model to ask unless told otherwise. The stack's api has no model key: only the capability is set
 *  here, and a test answers the built-in hand's route itself. */
export async function startAskBoard(page: Page, options: { model?: boolean } = {}): Promise<void> {
  await page.route('**/api/capabilities', async (route) => {
    const answered = await route.fetch();
    const capabilities = (await answered.json()) as Record<string, unknown>;
    await route.fulfill({
      response: answered,
      json: { ...capabilities, aiEnabled: options.model !== false },
    });
  });
  await startSuggestionBoard(page, askBoardElements(), IDS.orderTaken);
  await page
    .locator(`[data-testid="context-lines"] [data-candidate-context="${IDS.floor}"]`)
    .waitFor();
}
