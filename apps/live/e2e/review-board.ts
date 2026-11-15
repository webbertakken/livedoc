import type { Page } from '@playwright/test';
import {
  ES_LANES,
  eventStormingNoteFields,
  laneCentre,
  laneNameElement,
  newContextElement,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { startSuggestionBoard } from './suggestion-board';

// A kitchen's evening with something of every kind for a review to find (docs/specs/021-event-storming/
// board-structure.md, docs/specs/021-event-storming/board-review.md): a pivotal event, named lanes, an answered
// hotspot and an open one, a hole in the story, a slip of grammar, two kept contexts and words they share. Invented;
// no one's board.

export const REVIEW_BOARD_IDS = {
  waiter: 'n-waiter',
  takeOrder: 'n-take-order',
  orderTaken: 'n-order-taken',
  fireTicket: 'n-fire-ticket',
  cook: 'n-cook',
  plateOrder: 'n-plate-order',
  orderPlated: 'n-order-plated',
  whoCalls: 'n-who-calls',
  runner: 'n-runner',
  serveTable: 'n-serve-table',
  tableServed: 'n-table-served',
  sentBack: 'n-sent-back',
  presentBill: 'n-present-bill',
  guestPays: 'n-guest-pays',
  tableCleared: 'n-table-cleared',
  floor: 'c-floor',
  pass: 'c-pass',
  laneStaff: 't-lane-staff',
  laneCommands: 't-lane-commands',
  laneEvents: 't-lane-events',
} as const;

const IDS = REVIEW_BOARD_IDS;

export const REVIEW_BOARD_ANSWER = 'The head chef, from the pass.';

function note(
  id: string,
  kind: EventStormingNoteKind,
  label: string,
  x: number,
  lane: number,
  extra: Partial<StickyElement> = {},
): StickyElement {
  const fields = eventStormingNoteFields(kind);
  return {
    id,
    type: 'sticky',
    label,
    ...fields,
    x,
    y: laneCentre(lane, ES_LANES) - fields.height / 2,
    ...extra,
  };
}

/** The kitchen's notes, column by column. */
export function reviewBoardNotes(): StickyElement[] {
  return [
    note(IDS.waiter, 'actor', 'Waiter', 0, 0),
    note(IDS.takeOrder, 'command', 'Take order', 0, 1),
    note(IDS.orderTaken, 'domain-event', 'Order taken', 0, 2, { esPivotal: true }),
    note(IDS.fireTicket, 'policy', 'Fire the ticket', 330, 3),
    note(IDS.cook, 'actor', 'Cook', 760, 0),
    note(IDS.plateOrder, 'command', 'Plate order', 760, 1),
    note(IDS.orderPlated, 'domain-event', 'Order plated', 760, 2),
    note(IDS.whoCalls, 'hotspot', 'Who calls the pass?', 790, 3, {
      esAnswer: REVIEW_BOARD_ANSWER,
    }),
    note(IDS.runner, 'actor', 'Runner', 1240, 0),
    note(IDS.serveTable, 'command', 'Serve table', 1240, 1),
    note(IDS.tableServed, 'domain-event', 'Table served', 1240, 2),
    note(IDS.sentBack, 'hotspot', 'What if an order is sent back?', 1270, 3),
    // A command nobody issues, an event told in the present, and an event nothing causes.
    note(IDS.presentBill, 'command', 'Present bill', 1720, 1),
    note(IDS.guestPays, 'domain-event', 'Guest pays', 1720, 2),
    note(IDS.tableCleared, 'domain-event', 'Table cleared', 2200, 2),
  ];
}

export function reviewBoardElements(): Record<string, unknown>[] {
  const notes = reviewBoardNotes();
  const held = (...ids: string[]) => notes.filter((n) => ids.includes(n.id));
  const wallLeft = Math.min(...notes.map((n) => n.x));
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
      notes: held(IDS.cook, IDS.plateOrder, IDS.orderPlated, IDS.whoCalls),
    }),
    laneNameElement({ id: IDS.laneStaff, name: 'Staff', lane: 0, wallLeft }),
    laneNameElement({ id: IDS.laneCommands, name: 'Commands', lane: 1, wallLeft }),
    laneNameElement({ id: IDS.laneEvents, name: 'Events', lane: 2, wallLeft }),
  ];
}

/** A new Event Storming board holding the kitchen as a review finds it. */
export async function startReviewBoard(page: Page): Promise<void> {
  await startSuggestionBoard(page, reviewBoardElements(), IDS.orderTaken);
}
