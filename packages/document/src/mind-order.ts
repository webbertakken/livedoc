// The order a mind map reads in (docs/specs/009-elements/mind-node.md "A tidy map stays tidy"): siblings read back
// from where they are drawn, in the flow the map grows, so a layout, an outline and a node's number all agree.
// Pure; the reading the layout (mind-layout.ts) keeps fixed, and what drawing a map's numbers needs without it.
import { mindFlowOn, mindStackedSideUnder } from './mind-direction';
import type { MindFlow } from './mind-flow';
import { isMindNode } from './mind-map';
import { buildTree, centre, kidsOf } from './mind-layout-tree';
import type { Element, ElementId, ShapeElement } from './index';

export const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

// A bubble map's circle is cut on the root's WEST side and runs clockwise, so a lone first branch points east, the
// way a tree would start.
export const BUBBLE_SEAM = Math.PI;

/**
 * The sibling-order key for `node` under `parent`, read from where it is drawn, the map read as growing `flow`
 * from its root. Stacked: along the axis its side stacks across (across a row above or below, down a column
 * either side). Bubble: clockwise around the ROOT from the seam opposite the parent's own direction, which is
 * outside the parent's wedge, so the order a layout produces reads back unchanged. Asked parent first, as
 * `buildTree` does, so each node's direction is known by the time its children are keyed.
 */
export function orderKeyFor(
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
