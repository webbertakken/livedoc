import type { Page } from '@playwright/test';
import {
  ES_LANES,
  eventStormingNoteFields,
  laneCentre,
  newLanePlanElement,
  type EsPlanLane,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { startSuggestionBoard } from './suggestion-board';

// A kitchen's evening on four lanes, one per kind of note (docs/specs/021-event-storming/lane-plans.md,
// docs/specs/021-event-storming/arrange.md): who, what they ask for, what happened and how the kitchen reacts. Its
// columns stand unevenly apart, so Arrange and Reorder has work, and its open plan folds it into two lanes, one for
// each part of the business. Invented; no one's board.

export const LANE_BOARD_IDS = {
  waiter: 'n-waiter',
  takeOrder: 'n-take-order',
  orderTaken: 'n-order-taken',
  fireTicket: 'n-fire-ticket',
  cook: 'n-cook',
  plateDish: 'n-plate-dish',
  dishPlated: 'n-dish-plated',
  runner: 'n-runner',
  serveTable: 'n-serve-table',
  tableServed: 'n-table-served',
  plan: 'p-lanes',
  inTheWay: 'n-in-the-way',
} as const;

const IDS = LANE_BOARD_IDS;

export const LANE_BOARD_PLAN = {
  lanes: [
    {
      name: 'Front of house',
      notes: [
        IDS.waiter,
        IDS.takeOrder,
        IDS.orderTaken,
        IDS.runner,
        IDS.serveTable,
        IDS.tableServed,
      ],
    },
    { name: 'Kitchen', notes: [IDS.fireTicket, IDS.cook, IDS.plateDish, IDS.dishPlated] },
  ] satisfies EsPlanLane[],
  reason: 'Two parts of the business work this evening: the floor and the kitchen.',
  by: 'Claude',
} as const;

function note(
  id: string,
  kind: EventStormingNoteKind,
  label: string,
  x: number,
  lane: number,
): StickyElement {
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

/** The kitchen's notes: three moments, each a column, the third a long way from the second. */
export function laneBoardNotes(): StickyElement[] {
  return [
    note(IDS.waiter, 'actor', 'Waiter', 0, 0),
    note(IDS.takeOrder, 'command', 'Take order', 0, 1),
    note(IDS.orderTaken, 'domain-event', 'Order taken', 0, 2),
    note(IDS.fireTicket, 'policy', 'Whenever an order is taken, fire the ticket', 330, 3),
    note(IDS.cook, 'actor', 'Cook', 760, 0),
    note(IDS.plateDish, 'command', 'Plate dish', 760, 1),
    note(IDS.dishPlated, 'domain-event', 'Dish plated', 760, 2),
    note(IDS.runner, 'actor', 'Runner', 1540, 0),
    note(IDS.serveTable, 'command', 'Serve table', 1540, 1),
    note(IDS.tableServed, 'domain-event', 'Table served', 1540, 2),
  ];
}

/** A locked note standing where arranging would put the kitchen's second column. */
export function noteInTheWay(): StickyElement {
  return { ...note(IDS.inTheWay, 'hotspot', 'Who calls the pass?', 420, 2), locked: true };
}

export function laneBoardElements(
  options: { plan?: boolean; inTheWay?: boolean } = {},
): Record<string, unknown>[] {
  const notes = laneBoardNotes();
  return [
    ...notes,
    ...(options.inTheWay ? [noteInTheWay()] : []),
    ...(options.plan
      ? [newLanePlanElement({ id: IDS.plan, plan: { ...LANE_BOARD_PLAN }, notes })]
      : []),
  ];
}

/** A new Event Storming board holding the kitchen, with its open lane plan when asked. */
export async function startLaneBoard(
  page: Page,
  options: { plan?: boolean; inTheWay?: boolean } = {},
): Promise<void> {
  await startSuggestionBoard(page, laneBoardElements(options), IDS.orderTaken);
}
