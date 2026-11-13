import {
  candidateContexts,
  contextNotes,
  contextOutline,
  isSuggestedContext,
  type CandidateContextElement,
  type ContextOutline,
  type Element,
  type ElementId,
} from '@livedoc/document';
import { applyContextDrop, contextDropPlan, NO_CONTEXT_DROP } from './context-drop';

// The candidate contexts the canvas draws (docs/specs/021-event-storming/candidate-contexts.md "Its outline,
// exactly"): each round its notes as they are drawn now (a drag in hand, the Show All and Alt insertion shifts), only
// the notes on visible layers counting. While a person drags notes, every outline is drawn as letting go would
// leave it, the one a note would join highlighted, so a drop is never a surprise. Pure.

export type DrawnContext = {
  context: CandidateContextElement;
  suggested: boolean;
  outline: ContextOutline;
  // How many of its notes show.
  notes: number;
  // The outline a dragged note would join.
  highlighted: boolean;
};

export type DrawnContextsInput = {
  // The board as committed, and as drawn now (the drag preview laid over it).
  committed: readonly Element[];
  drawn: Element[];
  // Elements on hidden layers.
  hidden: ReadonlySet<ElementId>;
  // A note's render-only shift along the timeline (Show All, the Alt insertion), if any.
  shiftX: (id: ElementId) => number | undefined;
  // The notes this person is dragging; empty when none, or when they may not change contexts.
  draggedIds: ReadonlySet<ElementId>;
  // Suggested contexts are drawn only for someone who may act on suggestions.
  showSuggested: boolean;
};

export function drawnContexts(input: DrawnContextsInput): DrawnContext[] {
  const plan =
    input.draggedIds.size > 0
      ? contextDropPlan(input.committed, input.drawn, input.draggedIds)
      : NO_CONTEXT_DROP;
  const board = plan === NO_CONTEXT_DROP ? input.drawn : applyContextDrop(input.drawn, plan);
  const joining = new Set(plan.joins.values());
  const shown = new Map(
    board.filter((el) => !input.hidden.has(el.id)).map((el) => [el.id, el] as const),
  );
  const out: DrawnContext[] = [];
  for (const context of candidateContexts(board)) {
    const suggested = isSuggestedContext(context);
    if (suggested && !input.showSuggested) continue;
    const rects = contextNotes(context, shown).map((n) => ({
      x: n.x + (input.shiftX(n.id) ?? 0),
      y: n.y,
      width: n.width,
      height: n.height,
    }));
    const outline = contextOutline(context.id, rects);
    if (!outline) continue;
    out.push({
      context,
      suggested,
      outline,
      notes: rects.length,
      highlighted: joining.has(context.id),
    });
  }
  return out;
}
