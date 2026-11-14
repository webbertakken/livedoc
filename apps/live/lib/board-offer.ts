import {
  contextBounds,
  eventStormingKindOf,
  isBoxed,
  openLanePlan,
  type Element,
  type ElementId,
  type LanePlanElement,
  type Rect,
  type Tab,
} from '@livedoc/document';
import {
  arrangeBoard,
  checkLanePlan,
  landLanePlan,
  type ReadingChange,
} from '@livedoc/storm-reading';

// A whole board rearranged, as a person looks at it before deciding
// (docs/specs/021-event-storming/lane-plans.md "How a person sees and decides",
// docs/specs/021-event-storming/arrange.md "How a person arranges"): the board as applying the open lane plan, or
// arranging along the timeline, would leave it. Pure: worked out from the board as it stands, never written. The
// board places and checks; nothing is offered that the check would refuse.

type Board = Pick<Tab, 'elements' | 'layers'>;

export type BoardOffer = {
  elements: Element[];
  // How many loose notes find a partner.
  gained: number;
  // The board as it would be, for the view to fit.
  bounds: Rect;
} & ({ what: 'lane-plan'; lanes: number } | { what: 'arrange' });

/** Why a board would not be arranged; the notes named are ways in to fix it by hand. */
export type ArrangeRefusal =
  | { why: 'no_events' | 'already' }
  | { why: 'blocked'; blocked: ElementId[] }
  | { why: 'reading_changes'; changes: ReadingChange[] };

// The workshop notes of the offered board, and the lane names it writes: what the eye should take in.
function offeredBounds(offered: readonly Element[], board: Board): Rect {
  const was = new Map(board.elements.map((el) => [el.id, el]));
  return contextBounds(
    offered
      .filter(isBoxed)
      .filter(
        (el) => eventStormingKindOf(el) !== null || (el.type === 'text' && was.get(el.id) !== el),
      ),
  );
}

/** The board as applying its open lane plan would leave it; null when `planId` is not that plan, or it is stale. */
export function lanePlanOffer(board: Board, planId: ElementId): BoardOffer | null {
  const plan = openLanePlan(board.elements);
  if (plan?.id !== planId) return null;
  const verdict = checkLanePlan(board, plan.esLanePlan);
  if (!verdict.ok) return null;
  let n = 0;
  const elements = landLanePlan(
    board,
    plan.esLanePlan,
    verdict,
    () => `offered-lane-name-${(n += 1)}`,
  );
  return {
    what: 'lane-plan',
    elements,
    gained: verdict.gained,
    bounds: offeredBounds(elements, board),
    lanes: plan.esLanePlan.lanes.length,
  };
}

/** The board arranged along the timeline; null when it would not be arranged (`arrangeRefusal` says why). */
export function arrangeOffer(board: Board): BoardOffer | null {
  const arranged = arrangeBoard(board);
  if (!arranged.ok) return null;
  return {
    what: 'arrange',
    elements: arranged.elements,
    gained: arranged.gained,
    bounds: offeredBounds(arranged.elements, board),
  };
}

/** Why the board would not be arranged; null when it would. */
export function arrangeRefusal(board: Board): ArrangeRefusal | null {
  const arranged = arrangeBoard(board);
  if (arranged.ok) return null;
  const { ok: _refused, ...refusal } = arranged;
  return refusal;
}

/** The open lane plan as the suggestions panel lists it, first of all its rows. */
export type LanePlanRow = {
  type: 'lane-plan';
  plan: LanePlanElement;
  lanes: number;
  notes: number;
  // The board changed since the plan was made: only dismissing it is left.
  stale: boolean;
  // What pointing at the row brings into view: the board as it would be, or the plan's notes while it is stale.
  bounds: Rect;
};

export function lanePlanRow(board: Board): LanePlanRow | null {
  const plan = openLanePlan(board.elements);
  if (!plan) return null;
  const offer = lanePlanOffer(board, plan.id);
  const held = new Set(plan.esLanePlan.lanes.flatMap((lane) => lane.notes));
  return {
    type: 'lane-plan',
    plan,
    lanes: plan.esLanePlan.lanes.length,
    notes: held.size,
    stale: offer === null,
    bounds:
      offer?.bounds ??
      contextBounds(board.elements.filter(isBoxed).filter((el) => held.has(el.id))),
  };
}
