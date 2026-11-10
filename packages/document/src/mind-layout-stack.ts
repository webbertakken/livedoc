// The stacked tidy layout (docs/specs/009-elements/mind-node.md "A tidy map stays tidy", "A direction per node").
//
// Each parent's children sit on the sides their directions put them on: right (tree), left, below or above. On each
// side they stack across that side's axis with no gaps and no overlaps, the block centred on the parent. A branch is
// laid out first on its own, so the room it takes is the box its whole subtree covers, whichever ways its own
// branches grow; the parent then stacks those boxes. When every branch grows one way the boxes are centred on their
// nodes, which is exactly the classic layout: a map without directions of its own keeps its shape.
//
// Pure geometry over the tree. Positions come back unrounded; the caller rounds once.

import { mindFlowOn, type MindSide, MIND_SIDES } from './mind-direction';
import type { MindFlow, MindGaps } from './mind-flow';
import {
  MIND_GROUP_PADDING,
  MIND_GROUP_TITLE_BAND,
  groupOf,
  isPlaced,
  kidsOf,
  type MindLayout,
  type MindPoint,
  type Tree,
} from './mind-layout-tree';
import type { ElementId, ShapeElement } from './index';

type Axis = 'x' | 'y';
const cross = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');
const extent = (n: ShapeElement, axis: Axis) => (axis === 'x' ? n.width : n.height);

/** The axis a side's levels run along, and which way. */
const SIDE_AXIS: Record<MindSide, { axis: Axis; dir: 1 | -1 }> = {
  tree: { axis: 'x', dir: 1 },
  leftward: { axis: 'x', dir: -1 },
  downward: { axis: 'y', dir: 1 },
  upward: { axis: 'y', dir: -1 },
};

// What a branch covers, relative to its own node's top-left.
type Box = { x0: number; y0: number; x1: number; y1: number };
const lo = (b: Box, axis: Axis) => (axis === 'x' ? b.x0 : b.y0);
const hi = (b: Box, axis: Axis) => (axis === 'x' ? b.x1 : b.y1);
const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});
const shifted = (b: Box, by: MindPoint): Box => ({
  x0: b.x0 + by.x,
  y0: b.y0 + by.y,
  x1: b.x1 + by.x,
  y1: b.y1 + by.y,
});

type Branch = {
  /** Every node of the branch, relative to its node's top-left. */
  pos: Map<ElementId, MindPoint>;
  box: Box;
  /** Children placed by hand somewhere in the branch, each with the direction it grows in. */
  placed: { node: ShapeElement; flow: MindFlow }[];
};

export type StackContext = {
  tree: Tree;
  gaps: MindGaps;
  /** The side a child sits on under its parent growing `parentFlow`. */
  sideOf: (parent: ShapeElement, parentFlow: MindFlow, child: ShapeElement) => MindSide;
};

function layoutBranch(
  ctx: StackContext,
  node: ShapeElement,
  flow: MindFlow,
  sides?: ReadonlyMap<ElementId, MindSide>,
): Branch {
  const { gaps } = ctx;
  const pos = new Map<ElementId, MindPoint>([[node.id, { x: 0, y: 0 }]]);
  let box: Box = { x0: 0, y0: 0, x1: node.width, y1: node.height };
  const placed: Branch['placed'] = [];
  const bySide = new Map<MindSide, ShapeElement[]>();
  for (const k of kidsOf(ctx.tree, node.id)) {
    const side = sides?.get(k.id) ?? ctx.sideOf(node, flow, k);
    if (isPlaced(k)) placed.push({ node: k, flow: mindFlowOn(k, side) });
    else bySide.set(side, [...(bySide.get(side) ?? []), k]);
  }
  for (const side of MIND_SIDES) {
    const kids = bySide.get(side);
    if (!kids) continue;
    const { axis, dir } = SIDE_AXIS[side];
    const across = cross(axis);
    const gap = axis === 'x' ? gaps.child : gaps.level;
    // A group's room before its first member and after its last: the padding, and before, where the siblings stack
    // down, the title's band too (a group's title is at its top).
    const titled = across === 'y' ? MIND_GROUP_TITLE_BAND : 0;
    const pad = (n: ShapeElement) => (groupOf(n) !== null ? MIND_GROUP_PADDING : 0);
    const lead = (n: ShapeElement) => (pad(n) > 0 ? pad(n) + titled : 0);
    // The room between two siblings: the gap, and a group's room where a group begins or ends.
    const between = (a: ShapeElement, b: ShapeElement) =>
      gaps.sibling + (groupOf(a) !== null && groupOf(a) === groupOf(b) ? 0 : pad(a) + lead(b));
    const subs = kids.map((k) => layoutBranch(ctx, k, mindFlowOn(k, side)));
    const width = (b: Branch) => hi(b.box, across) - lo(b.box, across);
    const block =
      subs.reduce((s, b, i) => s + width(b) + (i > 0 ? between(kids[i - 1]!, kids[i]!) : 0), 0) +
      lead(kids[0]!) +
      pad(kids[kids.length - 1]!);
    const start = extent(node, across) / 2 - block / 2;
    let cursor = start + lead(kids[0]!);
    kids.forEach((k, i) => {
      const sub = subs[i]!;
      if (i > 0) cursor += between(kids[i - 1]!, k);
      const a = cursor - lo(sub.box, across);
      // Out past the gap, and further when the branch reaches back towards the parent.
      const m =
        dir === 1
          ? extent(node, axis) + gap + Math.max(0, -lo(sub.box, axis))
          : -gap - extent(k, axis) - Math.max(0, hi(sub.box, axis) - extent(k, axis));
      const at = axis === 'x' ? { x: m, y: a } : { x: a, y: m };
      for (const [id, p] of sub.pos) pos.set(id, { x: p.x + at.x, y: p.y + at.y });
      placed.push(...sub.placed);
      box = union(box, shifted(sub.box, at));
      cursor += width(sub);
    });
    // The block's own room across, a group's padding at its ends included.
    const blockBox =
      across === 'y'
        ? { x0: 0, x1: node.width, y0: start, y1: start + block }
        : { y0: 0, y1: node.height, x0: start, x1: start + block };
    box = union(box, blockBox);
  }
  return { pos, box, placed };
}

/**
 * Lay out the branch of `node` (already in `out`) growing `flow`, and every branch placed by hand inside it from
 * where it stands. `sides` names the side of some of `node`'s children ahead of `ctx.sideOf` (a balanced root's
 * dealt sides).
 */
export function stackMindBranch(
  ctx: StackContext,
  out: MindLayout,
  node: ShapeElement,
  flow: MindFlow,
  sides?: ReadonlyMap<ElementId, MindSide>,
): void {
  const at = out.get(node.id)!;
  const branch = layoutBranch(ctx, node, flow, sides);
  for (const [id, p] of branch.pos) out.set(id, { x: at.x + p.x, y: at.y + p.y });
  for (const { node: k, flow: kFlow } of branch.placed) {
    out.set(k.id, { x: k.x, y: k.y });
    stackMindBranch(ctx, out, k, kFlow);
  }
}
