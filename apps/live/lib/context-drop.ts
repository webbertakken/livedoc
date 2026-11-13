import {
  CONTEXT_LEAVE_PX,
  candidateContexts,
  contextNotes,
  contextOutline,
  distanceToPolygon,
  eventStormingKindOf,
  isKeptContext,
  joinContext,
  leaveContext,
  pointInPolygon,
  polygonArea,
  type CandidateContextElement,
  type Element,
  type ElementId,
  type StickyElement,
} from '@livedoc/document';

// Notes joining and leaving candidate contexts by dragging (docs/specs/021-event-storming/candidate-contexts.md
// "Joining and leaving, exactly"). Pure: a plan read off the board before and after the drag, and the board the plan
// leaves, so the canvas can draw the outcome while the drag is in hand and the release writes the same thing.
// Each outline is judged as its context's OTHER notes make it, the dragged ones left out: an outline that took in
// the note in hand would follow it everywhere and never let it go.

export type ContextDropPlan = {
  // A dragged note and the kept context it joins.
  joins: ReadonlyMap<ElementId, ElementId>;
  // Dragged notes that leave their kept context.
  leaves: ReadonlySet<ElementId>;
};

export const NO_CONTEXT_DROP: ContextDropPlan = { joins: new Map(), leaves: new Set() };

const isNote = (el: Element | undefined): el is StickyElement =>
  el !== undefined && el.type === 'sticky' && eventStormingKindOf(el) !== null;

type Judged = { context: CandidateContextElement; polygon: ReturnType<typeof outlineOf> };

function outlineOf(context: CandidateContextElement, notes: readonly StickyElement[]) {
  const outline = contextOutline(context.id, notes);
  return outline ? { points: outline.polygon, area: polygonArea(outline.polygon) } : null;
}

/** What letting go of the dragged notes where they stand now would do to the kept contexts. */
export function contextDropPlan(
  committed: readonly Element[],
  previewed: readonly Element[],
  draggedIds: ReadonlySet<ElementId>,
): ContextDropPlan {
  const kept = candidateContexts(committed).filter(isKeptContext);
  if (kept.length === 0 || draggedIds.size === 0) return NO_CONTEXT_DROP;
  const before = new Map(committed.map((el) => [el.id, el]));
  const after = new Map(previewed.map((el) => [el.id, el]));
  const moved = [...draggedIds].filter((id) => {
    const was = before.get(id);
    const now = after.get(id);
    return isNote(was) && isNote(now) && (was.x !== now.x || was.y !== now.y);
  });
  if (moved.length === 0) return NO_CONTEXT_DROP;

  const judged: Judged[] = kept.map((context) => ({
    context,
    polygon: outlineOf(
      context,
      contextNotes(context, after).filter((n) => !draggedIds.has(n.id)),
    ),
  }));
  const joins = new Map<ElementId, ElementId>();
  const leaves = new Set<ElementId>();
  for (const id of moved) {
    const note = after.get(id) as StickyElement;
    const centre = { x: note.x + note.width / 2, y: note.y + note.height / 2 };
    const own = judged.find((j) => j.context.esContext.notes.includes(id));
    const target = judged
      .filter((j) => j !== own && j.polygon && pointInPolygon(centre, j.polygon.points))
      .sort((a, b) => a.polygon!.area - b.polygon!.area)[0];
    if (target) joins.set(id, target.context.id);
    else if (own?.polygon && distanceToPolygon(note, own.polygon.points) > CONTEXT_LEAVE_PX)
      leaves.add(id);
  }
  return joins.size === 0 && leaves.size === 0 ? NO_CONTEXT_DROP : { joins, leaves };
}

/** The board as the plan leaves it: each join and leave written, a context left with no note gone. */
export function applyContextDrop(elements: Element[], plan: ContextDropPlan): Element[] {
  let board = plan.leaves.size > 0 ? leaveContext(elements, [...plan.leaves]) : elements;
  const byContext = new Map<ElementId, ElementId[]>();
  for (const [note, context] of plan.joins)
    byContext.set(context, [...(byContext.get(context) ?? []), note]);
  for (const [context, notes] of byContext) board = joinContext(board, context, notes);
  return board;
}
