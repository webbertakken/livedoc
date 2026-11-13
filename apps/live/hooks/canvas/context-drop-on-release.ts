// Notes let go inside or clear of a candidate context's outline join or leave it
// (docs/specs/021-event-storming/candidate-contexts.md "Joining and leaving, exactly"). Folded into the drag's result,
// so the move and the membership land as one change and one Undo takes both back.
import type { Element } from '@livedoc/document';
import { applyContextDrop, contextDropPlan } from '@/lib/context-drop';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

/** The release: the drag's result with the dragged notes joined to or gone from their contexts. */
export function contextDropOnRelease(
  committed: Element[],
  draggedIds: ReadonlySet<string>,
): (elements: Element[]) => Element[] {
  return (elements) => {
    const plan = contextDropPlan(committed, elements, draggedIds);
    if (plan.joins.size === 0 && plan.leaves.size === 0) return elements;
    debugLog('[contexts] drop', { joined: plan.joins.size, left: plan.leaves.size });
    for (let i = 0; i < plan.joins.size; i += 1) track('Canvas', 'Used', 'ContextNoteJoined');
    for (let i = 0; i < plan.leaves.size; i += 1) track('Canvas', 'Used', 'ContextNoteLeft');
    return applyContextDrop(elements, plan);
  };
}
