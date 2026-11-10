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
import { mindFlowOn, mindSideOf, mindStackedSideUnder, type MindSide } from './mind-direction';
import { isMindNode, mindFlowOf, mindRootOf, mindSubtree } from './mind-map';
import { stackMindBranch, type StackContext } from './mind-layout-stack';
import {
  MIND_GROUP_PADDING,
  MIND_GROUP_TITLE_BAND,
  buildTree,
  centre,
  isPlaced,
  kidsOf,
  type MindLayout,
  type MindOrderHint,
  type MindPoint,
  type Tree,
} from './mind-layout-tree';
import { unionRects } from './geometry-primitives';
import type { ArrowElement, Element, ElementId, ShapeElement } from './index';

export { MIND_GROUP_PADDING, MIND_GROUP_TITLE_BAND, type MindLayout, type MindPoint };
/** A group box's corner radius. */
export const MIND_GROUP_RADIUS = 14;
/** A group title's text size, in px. */
export const MIND_GROUP_TITLE_PX = 14;

/** How far a node may sit from its laid-out slot and still count as tidy.
 *  Rounding in the layout itself is the only drift a tidy map ever has. */
const MIND_TIDY_TOLERANCE = 1;

const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

// --- Bubble: radial wedges --------------------------------------------------

// The root's children share the full circle equally, and every deeper level
// splits its parent's wedge by leaf count, on rings around the ROOT that grow
// until the nodes on them clear each other. The
// circle is cut on the root's WEST side and runs clockwise, so a lone first
// branch points east, the way a tree would start.
const BUBBLE_SEAM = Math.PI;

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
 * The sibling-order key for `node` under `parent`, read from where it is drawn, the map read as growing `flow`
 * from its root. Stacked: along the axis its side stacks across (across a row above or below, down a column
 * either side). Bubble: clockwise around the ROOT from the seam opposite the parent's own direction, which is
 * outside the parent's wedge, so the order a layout produces reads back unchanged. Asked parent first, as
 * `buildTree` does, so each node's direction is known by the time its children are keyed.
 */
function orderKeyFor(
  flow: MindFlow,
  root: ShapeElement,
): (node: ShapeElement, parent: ShapeElement) => number {
  if (flow !== 'bubble') {
    const flows = new Map<ElementId, MindFlow>([[root.id, flow]]);
    return (n, parent) => {
      // Asked parent first, so the parent's direction is known; never Bubble here.
      const parentFlow = flows.get(parent.id)! as Exclude<MindFlow, 'bubble'>;
      const side = mindStackedSideUnder(parentFlow, parent, n);
      flows.set(n.id, mindFlowOn(n, side));
      return side === 'downward' || side === 'upward' ? centre(n).x : centre(n).y;
    };
  }
  const o = centre(root);
  const angle = (n: ShapeElement) => Math.atan2(centre(n).y - o.y, centre(n).x - o.x);
  return (n, parent) => {
    const towards = parent.id === root.id ? 0 : angle(parent);
    return wrap(angle(n) - (towards + BUBBLE_SEAM));
  };
}

/**
 * The map rooted at `rootId`, depth first, each node with its depth (the root's is 0), siblings in
 * the order the layout reads them in the map's flow: the order an outline of the map lists them.
 */
export function mindNodesInOrder(
  elements: Element[],
  rootId: ElementId,
  flow: MindFlow,
): { node: ShapeElement; depth: number }[] {
  const root = elements.find((el) => el.id === rootId);
  if (!root || !isMindNode(root)) return [];
  const tree = buildTree(elements, root, orderKeyFor(flow, root));
  const out: { node: ShapeElement; depth: number }[] = [];
  const walk = (node: ShapeElement, depth: number) => {
    out.push({ node, depth });
    for (const kid of kidsOf(tree, node.id)) walk(kid, depth + 1);
  };
  walk(root, 0);
  return out;
}

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

/** A group's tinted box (docs/specs/009-elements/mind-node.md "Groups"): its members and their branches, padded. */
export type MindGroupBox = {
  parentId: ElementId;
  groupId: string;
  memberIds: ElementId[];
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Every group's box on the tab: siblings sharing a `mindGroup` under one parent, a branch placed elsewhere by hand
 *  left out. */
export function mindGroupBoxes(elements: Element[]): MindGroupBox[] {
  const groups = new Map<string, ShapeElement[]>();
  for (const el of elements) {
    if (!isMindNode(el) || !el.mindGroup || !el.mindParentId) continue;
    const key = `${el.mindParentId}\u0000${el.mindGroup}`;
    const list = groups.get(key);
    if (list) list.push(el);
    else groups.set(key, [el]);
  }
  const out: MindGroupBox[] = [];
  for (const members of groups.values()) {
    const nodes: ShapeElement[] = [];
    for (const m of members) {
      nodes.push(m);
      const away = new Set<ElementId>();
      for (const n of mindSubtree(elements, m.id)) {
        const parentAway = n.mindParentId ? away.has(n.mindParentId) : false;
        if (isPlaced(n) || parentAway) away.add(n.id);
        else nodes.push(n);
      }
    }
    const r = unionRects(nodes)!;
    out.push({
      parentId: members[0]!.mindParentId!,
      groupId: members[0]!.mindGroup!,
      memberIds: members.map((m) => m.id),
      x: r.x - MIND_GROUP_PADDING,
      y: r.y - MIND_GROUP_PADDING - MIND_GROUP_TITLE_BAND,
      width: r.width + 2 * MIND_GROUP_PADDING,
      height: r.height + 2 * MIND_GROUP_PADDING + MIND_GROUP_TITLE_BAND,
    });
  }
  return out;
}

/** The number each numbered node is drawn with (docs/specs/009-elements/mind-node.md "Numbered nodes"): its place
 *  among its numbered siblings, in the order the map reads them, 1 up. */
export function mindNumbers(elements: Element[]): Map<ElementId, number> {
  const out = new Map<ElementId, number>();
  if (!elements.some((el) => isMindNode(el) && el.mindNumbered === true)) return out;
  const roots = new Set<ElementId>();
  for (const el of elements) if (isMindNode(el)) roots.add(mindRootOf(elements, el).id);
  for (const rootId of roots) {
    const root = elements.find((e) => e.id === rootId) as ShapeElement;
    const counts = new Map<ElementId, number>();
    for (const { node } of mindNodesInOrder(elements, rootId, mindFlowOf(elements, root))) {
      if (node.mindNumbered !== true || !node.mindParentId || node.id === rootId) continue;
      const n = (counts.get(node.mindParentId) ?? 0) + 1;
      counts.set(node.mindParentId, n);
      out.set(node.id, n);
    }
  }
  return out;
}

// One hue per group, picked from its id so a group keeps its colour wherever it is drawn.
const GROUP_HUES = [210, 150, 35, 280, 345, 185, 95, 260] as const;

/** A group's tint (docs/specs/009-elements/mind-node.md "Groups"): mostly transparent, its edge a little stronger, in
 *  one mid tone that reads on light and dark paper alike. */
export function mindGroupColours(groupId: string): { fill: string; stroke: string } {
  let hash = 0;
  for (const ch of groupId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = GROUP_HUES[hash % GROUP_HUES.length]!;
  return { fill: `hsla(${hue}, 70%, 55%, 0.1)`, stroke: `hsla(${hue}, 70%, 55%, 0.5)` };
}

/** The elements as an export draws them: a numbered node's label led by its number ("2. Venue"). */
export function withMindNumberLabels(elements: Element[]): Element[] {
  const numbers = mindNumbers(elements);
  if (numbers.size === 0) return elements;
  return elements.map((el) => {
    const n = numbers.get(el.id);
    if (n === undefined || el.type !== 'shape') return el;
    const prefix = `${n}. `;
    const runs = el.richText;
    return {
      ...el,
      label: prefix + (el.label ?? ''),
      ...(runs && runs.length > 0
        ? { richText: [{ ...runs[0]!, text: prefix + runs[0]!.text }, ...runs.slice(1)] }
        : {}),
    };
  });
}
