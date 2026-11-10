// A mind node dragged in a tidy map (docs/specs/009-elements/mind-node.md "A tidy map stays tidy"): while it moves,
// a line marks the slot it would be reordered into among its siblings; let go, it is reordered there or placed by
// hand where it was dropped. Folded into the drag's result, so the move and the new layout land as one change.
import {
  isMindGroupFrame,
  isMindNode,
  mindGroupMembers,
  isVerticalMindFlow,
  mindSideOf,
  planMindDrop,
  previewMindDrop,
  withMindSubtrees,
  type AlignmentGuide,
  type Element,
  type MindDrop,
} from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// Only a drag of a mind node below its root, or of a group's frame (standing for its first member), counts; anything
// else in the selection keeps its plain move.
function droppedNode(committed: readonly Element[], primaryId: string) {
  const held = committed.find((el) => el.id === primaryId);
  const node = held && isMindGroupFrame(held) ? mindGroupMembers(committed, held.id)[0] : held;
  return node && isMindNode(node) && node.mindParentId ? node : null;
}

type DropPreview = Omit<MindDrop, 'elements'>;

/** What the drop would do now, or null when the drag is not a tidy map's node. */
export function mindDropNow(
  committed: Element[],
  previewed: Element[],
  primaryId: string,
  draggedIds: ReadonlySet<string>,
): DropPreview | null {
  if (!droppedNode(committed, primaryId)) return null;
  const drop = previewMindDrop(committed, previewed, primaryId, draggedIds);
  return drop.kind ? drop : null;
}

/** The marker for a reorder: a line across the slot's leading edge, along the siblings' stacking axis. */
export function mindDropGuide(
  committed: Element[],
  primaryId: string,
  drop: DropPreview | null,
): AlignmentGuide | null {
  const node = droppedNode(committed, primaryId);
  if (!node || drop?.kind !== 'reordered' || !drop.slot) return null;
  const s = drop.slot;
  return isVerticalMindFlow(mindSideOf(committed, node) ?? 'tree')
    ? { axis: 'x', position: s.x - 4, start: s.y, end: s.y + s.height }
    : { axis: 'y', position: s.y - 4, start: s.x, end: s.x + s.width };
}

/** The release: the drag's result with the map reordered or the node placed. */
export function mindDropOnRelease(
  committed: Element[],
  primaryId: string,
  draggedIds: ReadonlySet<string>,
): (elements: Element[]) => Element[] {
  return (elements) => {
    if (!droppedNode(committed, primaryId)) return elements;
    const drop = planMindDrop(
      committed,
      elements,
      primaryId,
      withMindSubtrees(committed, draggedIds),
    );
    if (!drop.kind) return elements;
    debugLog(`[mind-drop] ${drop.kind} node=${primaryId}`);
    if (drop.kind === 'reordered') track('Element', 'Changed', 'MindReorder');
    else track('Element', 'Changed', 'MindPlace');
    return drop.elements;
  };
}
