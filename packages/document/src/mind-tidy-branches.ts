// Tidy Branches (docs/specs/009-elements/mind-node.md "Tidy Branches"): each selected node's branch laid out again
// from the node where it stands, in the map's flow, spacing and each node's own direction. Nothing outside the
// branches moves. Pure: returns the whole element list, for the editor to land as one change.
import { applyMindMoves, type MindMove } from './mind-grow';
import { layoutMindTree, reanchorMindConnectors } from './mind-layout';
import { isMindNode, mindFlowOf, mindRootOf, mindSubtree } from './mind-map';
import { settleMindGroups } from './mind-group';
import type { Element, ElementId, ShapeElement } from './index';

// One branch: the layout reads its head as placed by hand, so the head stays where it stands and its branch is laid
// out from it (mind-layout-stack.ts), the rest of the map untouched; nodes placed by hand inside it rejoin the layout.
function tidyBranch(elements: Element[], head: ShapeElement): Element[] {
  const below = mindSubtree(elements, head.id);
  if (below.length === 0) return elements;
  const branch = new Set<ElementId>(below.map((n) => n.id));
  const freed = elements.map((el) => {
    if (!branch.has(el.id) || !isMindNode(el) || el.mindPlaced !== true) return el;
    const { mindPlaced: _placed, ...rest } = el;
    return rest;
  });
  const held = freed.map((el) =>
    el.id === head.id && head.mindParentId ? { ...head, mindPlaced: true } : el,
  );
  const root = mindRootOf(held, head);
  const flow = mindFlowOf(held, root);
  const layout = layoutMindTree(held, root.id, flow);
  const moves: MindMove[] = [];
  for (const n of below) {
    const p = layout.get(n.id);
    const now = freed.find((el) => el.id === n.id) as ShapeElement;
    if (p && (p.x !== now.x || p.y !== now.y)) moves.push({ id: n.id, ...p });
  }
  const ids = new Set<ElementId>([head.id, ...branch]);
  const reanchored = reanchorMindConnectors(freed, ids, flow, layout);
  const unchanged = below.every((n) => n.mindPlaced !== true);
  if (moves.length === 0 && reanchored.length === 0 && unchanged) return elements;
  return applyMindMoves(freed, moves, reanchored);
}

/**
 * Lay out the branch of every mind node among `ids` (lines and other elements are ignored), keeping each node where
 * it stands. A node inside another selected node's branch is arranged once, with it. Returns `elements` itself when
 * nothing changes.
 */
export function tidyMindBranches(elements: Element[], ids: ReadonlySet<ElementId>): Element[] {
  const selected = elements.filter((el): el is ShapeElement => ids.has(el.id) && isMindNode(el));
  const under = new Set<ElementId>(
    selected.flatMap((n) => mindSubtree(elements, n.id).map((d) => d.id)),
  );
  let next = elements;
  for (const head of selected) {
    if (under.has(head.id)) continue;
    next = tidyBranch(next, next.find((el) => el.id === head.id) as ShapeElement);
  }
  return next === elements ? elements : settleMindGroups(next);
}
