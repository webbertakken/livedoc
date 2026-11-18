// Tidy mind-map layout (docs/specs/009-elements/mind-node.md "A tidy map stays tidy").
//
// Where every node of ONE map goes when the map is laid out in its flow: each
// parent centred on the block of its children, siblings stacked along the
// flow's axis with no gaps and no overlaps, the root left exactly where it is.
//
// Growth uses it twice: once to ask whether the map is still tidy (every node
// already where this would put it), and once more, with the new node in, to
// lay the map out around it. Tidy Map and a flow change use it directly.
//
// Pure geometry over the element list. Deterministic, and a FIXED POINT: laying
// out an already-laid-out map returns the same positions, which is what makes
// "is it tidy?" a meaningful question. That is why sibling order is read back
// from the positions as drawn (so the layout never reorders what it placed) and
// why every coordinate is rounded.

import {
  isMindSpacing,
  mindConnectorAnchors,
  mindGaps,
  type MindFlow,
  type MindGaps,
} from './mind-flow';
import { mindSideOf, mindStackedSideUnder, type MindSide } from './mind-direction';
import { isMindNode, mindRootOf } from './mind-map';
import { stackMindBranch, type StackContext } from './mind-layout-stack';
import {
  buildTree,
  centre,
  isPlaced,
  kidsOf,
  type MindLayout,
  type MindOrderHint,
  type MindPoint,
  type Tree,
} from './mind-layout-tree';
import { BUBBLE_SEAM, TAU, orderKeyFor } from './mind-order';
import type { ArrowElement, Element, ElementId, ShapeElement } from './index';

export type { MindLayout, MindPoint };

/** How far a node may sit from its laid-out slot and still count as tidy.
 *  Rounding in the layout itself is the only drift a tidy map ever has. */
const MIND_TIDY_TOLERANCE = 1;

// --- Bubble: radial wedges --------------------------------------------------

// The root's children share the full circle equally, and every deeper level
// splits its parent's wedge by leaf count, on rings around the ROOT that grow
// until the nodes on them clear each other, starting at the seam (mind-order.ts).

function bubbleLayout(tree: Tree, out: MindLayout, root: ShapeElement, gaps: MindGaps) {
  const leaves = new Map<ElementId, number>();
  const count = (n: ShapeElement): number => {
    const k = kidsOf(tree, n.id);
    const v = k.length === 0 ? 1 : k.reduce((s, c) => s + count(c), 0);
    leaves.set(n.id, v);
    return v;
  };
  count(root);
  const byDepth: ShapeElement[][] = [];
  const walk = (n: ShapeElement, d: number) => {
    (byDepth[d] ??= []).push(n);
    for (const c of kidsOf(tree, n.id)) walk(c, d + 1);
  };
  walk(root, 0);
  // A box's worst-case reach from its centre in any direction, so a ring
  // clears the one inside it whichever way its nodes face.
  const footprint = (n: ShapeElement) => Math.max(n.width, n.height);
  const radius: number[] = [0];
  for (let d = 1; d < byDepth.length; d++) {
    const ring = byDepth[d]!;
    const inner = Math.max(...byDepth[d - 1]!.map(footprint));
    const outer = Math.max(...ring.map(footprint));
    const clear = radius[d - 1]! + inner / 2 + outer / 2 + gaps.child;
    const around = ring.reduce((s, n) => s + footprint(n) + gaps.sibling, 0) / TAU;
    radius.push(Math.max(clear, around));
  }
  const origin = centre(root);
  const place = (n: ShapeElement, start: number, share: number, depth: number) => {
    let a = start;
    const kids = kidsOf(tree, n.id);
    for (const c of kids) {
      // The root's branches share the circle EQUALLY: weighting them by leaf
      // count swung every other branch round the dial each time one of them
      // grew a leaf. Below the root, a wedge is split by leaves, so a busy
      // sub-branch gets the room it needs without moving its neighbours' parents.
      const s = depth === 0 ? share / kids.length : (share * leaves.get(c.id)!) / leaves.get(n.id)!;
      const mid = a + s / 2;
      const r = radius[depth + 1]!;
      out.set(
        c.id,
        isPlaced(c)
          ? { x: c.x, y: c.y }
          : {
              x: origin.x + Math.cos(mid) * r - c.width / 2,
              y: origin.y + Math.sin(mid) * r - c.height / 2,
            },
      );
      place(c, a, s, depth + 1);
      a += s;
    }
  };
  place(root, BUBBLE_SEAM, TAU, 0);
}

// --- Public API ---------------------------------------------------------------

/**
 * Lay out the map rooted at `rootId` in `flow`. The root stays put; every
 * other node of the map gets a rounded top-left position. Nodes that are not
 * part of the map are not in the result.
 *
 * Balanced sides are read from where branches are drawn, except when switching
 * TO a balanced map from another flow: then no branch has a side yet, and they
 * are dealt out to whichever side has less, in order.
 */
export function layoutMindTree(
  elements: Element[],
  rootId: ElementId,
  flow: MindFlow,
  hint?: MindOrderHint,
  // The flow the map is DRAWN in, which is what sibling order is read in.
  // Differs from `flow` only when switching flows: a tree's branches read top
  // to bottom, and that is the order the new arrangement should keep.
  orderFlow: MindFlow = flow,
  // An order to lay siblings out in instead of the drawn one (an outline save, mind-outline.ts):
  // a rank per node, lower first. A balanced map then deals its branches out afresh.
  order?: ReadonlyMap<ElementId, number>,
  // Whether a balanced map deals its branches out afresh rather than keeping the sides they are drawn on; by
  // default when an order is given or the map was drawn in another flow.
  deal: boolean = !!order || orderFlow !== 'balanced',
): MindLayout {
  const out: MindLayout = new Map();
  const root = elements.find((el) => el.id === rootId);
  if (!root || !isMindNode(root)) return out;
  const key = order
    ? (n: ShapeElement) => order.get(n.id) ?? Number.MAX_SAFE_INTEGER
    : orderKeyFor(orderFlow, root);
  const tree = buildTree(elements, root, key, hint);
  out.set(root.id, { x: root.x, y: root.y });
  // The map's spacing lives on its root, like its flow (docs/specs/009-elements/mind-node.md "Spacing").
  const gaps = mindGaps(isMindSpacing(root.mindSpacing) ? root.mindSpacing : undefined);
  if (flow === 'bubble') bubbleLayout(tree, out, root, gaps);
  else {
    // Every branch on the side its direction puts it (docs/specs/009-elements/mind-node.md "A direction per node").
    const ctx: StackContext = {
      tree,
      gaps,
      // Never a bubble map here, so every child has a side.
      sideOf: (parent, parentFlow, child) =>
        mindStackedSideUnder(parentFlow as Exclude<MindFlow, 'bubble'>, parent, child),
    };
    // A balanced root deals its branches to its two sides; one placed by hand grows on the side it stands on.
    const sides = flow === 'balanced' ? balancedSides(tree, root, hint, deal, gaps) : undefined;
    stackMindBranch(ctx, out, root, flow, sides);
  }
  for (const [id, p] of out) out.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
  return out;
}

// A balanced map's two sides. A branch keeps the side it is drawn on; a new
// root child goes where there is less, or beside the sibling Enter was pressed
// on.
function balancedSides(
  tree: Tree,
  root: ShapeElement,
  hint: MindOrderHint | undefined,
  fresh: boolean,
  gaps: MindGaps,
): Map<ElementId, MindSide> {
  const kids = kidsOf(tree, root.id);
  const rootX = centre(root).x;
  // Less on the left, by the height each branch's whole subtree takes, sends a branch left; a tie goes right,
  // which is where the very first branch always goes. Weighed by the branch boxes alone, every branch counted the
  // same, and a map of 10 leaves against 7 stood lopsided.
  const span = (n: ShapeElement): number => {
    const k = kidsOf(tree, n.id);
    const block = k.reduce((s, c) => s + span(c), 0) + gaps.sibling * Math.max(0, k.length - 1);
    return Math.max(n.height, block);
  };
  const height = (side: ShapeElement[]) => side.reduce((s, n) => s + span(n), 0);
  const hinted = hint ? kids.find((k) => k.id === hint.id) : undefined;
  const left: ShapeElement[] = [];
  const right: ShapeElement[] = [];
  const dealt = new Set<ElementId>();
  for (const k of kids) {
    if (k === hinted || isPlaced(k)) continue;
    const goLeft = fresh ? height(left) < height(right) : centre(k).x < rootX;
    (goLeft ? left : right).push(k);
    if (goLeft) dealt.add(k.id);
  }
  const isLeft = (n: ShapeElement) => dealt.has(n.id);
  if (hinted) {
    const after = kids.find((k) => k.id === hint?.after);
    const goLeft = after ? isLeft(after) : height(left) < height(right);
    const side = goLeft ? left : right;
    const at = after ? side.indexOf(after) + 1 : side.length;
    side.splice(at, 0, hinted);
  }
  const sides = new Map<ElementId, MindSide>();
  for (const k of left) sides.set(k.id, 'leftward');
  for (const k of right) sides.set(k.id, 'tree');
  return sides;
}

/** Whether every node of the map already sits where the layout puts it. */
export function isMindTreeTidy(elements: Element[], rootId: ElementId, flow: MindFlow): boolean {
  const layout = layoutMindTree(elements, rootId, flow);
  for (const [id, p] of layout) {
    const el = elements.find((e) => e.id === id);
    if (!el || !isMindNode(el)) return false;
    if (Math.abs(el.x - p.x) > MIND_TIDY_TOLERANCE || Math.abs(el.y - p.y) > MIND_TIDY_TOLERANCE)
      return false;
  }
  return true;
}

/**
 * Re-anchor every parent-child connector of the map by the flow's rule, given
 * where its nodes are (or are about to be). Returns only the arrows that
 * change, as whole replacements.
 */
export function reanchorMindConnectors(
  elements: Element[],
  nodeIds: ReadonlySet<ElementId>,
  flow: MindFlow,
  at: MindLayout,
): ArrowElement[] {
  const moved = (n: ShapeElement): ShapeElement => {
    const p = at.get(n.id);
    return p ? { ...n, ...p } : n;
  };
  // The board as it is about to be, its root growing `flow`: each child's side is read from there.
  let board = elements.map((el) => (isMindNode(el) && nodeIds.has(el.id) ? moved(el) : el));
  const first = board.find((el): el is ShapeElement => isMindNode(el) && nodeIds.has(el.id));
  if (first) {
    const root = mindRootOf(board, first);
    board = board.map((el) => (el.id === root.id ? { ...root, mindFlow: flow } : el));
  }
  const nodes = new Map<ElementId, ShapeElement>();
  for (const el of board) if (isMindNode(el) && nodeIds.has(el.id)) nodes.set(el.id, el);
  // The faces follow the side the child sits on (a fanned bubble map's, whichever way it went).
  const anchorsOf = (parent: ShapeElement, child: ShapeElement) =>
    mindConnectorAnchors(mindSideOf(board, child) ?? 'bubble', parent, child);
  const out: ArrowElement[] = [];
  for (const el of elements) {
    if (el.type !== 'arrow' || el.from.kind !== 'pinned' || el.to.kind !== 'pinned') continue;
    const a = nodes.get(el.from.elementId);
    const b = nodes.get(el.to.elementId);
    if (!a || !b) continue;
    // Either direction: the connector is the tree's edge whichever end the
    // person who drew it started from.
    const aIsParent = b.mindParentId === a.id;
    if (!aIsParent && a.mindParentId !== b.id) continue;
    const [pa, ca] = aIsParent ? anchorsOf(a, b) : anchorsOf(b, a);
    const [fromA, toA] = aIsParent ? [pa, ca] : [ca, pa];
    if (el.from.anchor === fromA && el.to.anchor === toA) continue;
    out.push({ ...el, from: { ...el.from, anchor: fromA }, to: { ...el.to, anchor: toA } });
  }
  return out;
}
