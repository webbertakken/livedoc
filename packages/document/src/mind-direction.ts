// A direction per mind node (docs/specs/009-elements/mind-node.md "A direction per node").
//
// Every node holds the direction its own children grow in (`mindFlow`). The root's is the map's flow, Tree when it
// holds none. A deeper node holding none is Auto: under a parent with one direction it grows that way; under a
// balanced root or an any-direction parent it grows the way of the SIDE it sits on. So two things are resolved per
// node: the side of its parent it sits on, and the direction its children grow in.
//
// Balanced and Bubble are the root's only; on a deeper node they read as Auto. A bubble map is laid out round its
// root as a whole, so its nodes have no sides and every direction in it reads as Bubble.
//
// Pure. Walks `mindParentId` with a seen-set, like every other mind-map walk: it is stored data.

import { DEFAULT_MIND_FLOW, isMindFlow, type MindFlow } from './mind-flow';
import type { Element, ElementId, ShapeElement } from './index';

/** A side of a parent a child sits on, named by the flow that grows that way. */
export type MindSide = 'tree' | 'leftward' | 'downward' | 'upward';

export const MIND_SIDES: readonly MindSide[] = ['tree', 'leftward', 'downward', 'upward'];

/** The directions a node below the root may hold (besides Auto, which is holding none). */
export const MIND_BRANCH_FLOWS: readonly MindFlow[] = [
  'tree',
  'leftward',
  'downward',
  'upward',
  'any',
];

export function isMindSide(value: string | undefined): value is MindSide {
  return value !== undefined && (MIND_SIDES as readonly string[]).includes(value);
}

/** Whether a flow may be held only by a root. */
export const isRootOnlyMindFlow = (flow: MindFlow) => flow === 'balanced' || flow === 'bubble';

/**
 * The direction `node` holds itself: a root's map flow (Tree when it holds none); a deeper node's own, or null for
 * Auto (none, or a root-only flow left on it).
 */
export function mindOwnFlow(node: ShapeElement, isRoot: boolean): MindFlow | null {
  const flow = isMindFlow(node.mindFlow) ? node.mindFlow : null;
  if (isRoot) return flow ?? DEFAULT_MIND_FLOW;
  return flow && !isRootOnlyMindFlow(flow) ? flow : null;
}

const centre = (n: ShapeElement) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

/** The side of `parent` that `child` is drawn on: the axis it is further out along, a tie going across. */
export function mindSideByPosition(parent: ShapeElement, child: ShapeElement): MindSide {
  const p = centre(parent);
  const c = centre(child);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'tree' : 'leftward';
  return dy >= 0 ? 'downward' : 'upward';
}

/**
 * The side `child` sits on under a parent growing `parentFlow`: that direction, or, under a balanced root, the side
 * it is drawn on across, or, under an any-direction parent, its own direction when that is a side, else where it is
 * drawn. Null in a bubble map.
 */
export function mindSideUnder(
  parentFlow: MindFlow,
  parent: ShapeElement,
  child: ShapeElement,
): MindSide | null {
  return parentFlow === 'bubble' ? null : mindStackedSideUnder(parentFlow, parent, child);
}

/** `mindSideUnder` for a parent outside a bubble map, where every child has a side. */
export function mindStackedSideUnder(
  parentFlow: Exclude<MindFlow, 'bubble'>,
  parent: ShapeElement,
  child: ShapeElement,
): MindSide {
  if (isMindSide(parentFlow)) return parentFlow;
  if (parentFlow === 'balanced') return centre(child).x < centre(parent).x ? 'leftward' : 'tree';
  const own = mindOwnFlow(child, false);
  return own && isMindSide(own) ? own : mindSideByPosition(parent, child);
}

/** The direction a child on `side` grows in: its own, else (Auto) its side; Bubble throughout a bubble map. */
export const mindFlowOn = (child: ShapeElement, side: MindSide | null): MindFlow =>
  side === null ? 'bubble' : (mindOwnFlow(child, false) ?? side);

// The mind nodes by id, built once per element array: resolving walks up to the root, a lookup per step.
const nodeIndex = new WeakMap<Element[], Map<ElementId, ShapeElement>>();
function nodesOf(elements: Element[]): Map<ElementId, ShapeElement> {
  let index = nodeIndex.get(elements);
  if (!index) {
    index = new Map();
    for (const el of elements)
      if (el.type === 'shape' && el.shape === 'mind-node') index.set(el.id, el);
    nodeIndex.set(elements, index);
  }
  return index;
}

// `node`, its parent, ... up to its root (last), stopping where the parents repeat.
function pathToRoot(elements: Element[], node: ShapeElement): ShapeElement[] {
  const nodes = nodesOf(elements);
  const path = [node];
  const seen = new Set<ElementId>([node.id]);
  for (;;) {
    const at = path[path.length - 1]!;
    const parent = at.mindParentId ? nodes.get(at.mindParentId) : undefined;
    if (!parent || seen.has(parent.id)) return path;
    seen.add(parent.id);
    path.push(parent);
  }
}

function resolve(
  elements: Element[],
  node: ShapeElement,
): { side: MindSide | null; flow: MindFlow } {
  const path = pathToRoot(elements, node);
  const root = path[path.length - 1]!;
  let flow = mindOwnFlow(root, true)!;
  let side: MindSide | null = null;
  for (let i = path.length - 2; i >= 0; i--) {
    side = mindSideUnder(flow, path[i + 1]!, path[i]!);
    flow = mindFlowOn(path[i]!, side);
  }
  return { side, flow };
}

/** The direction `node`'s children grow in. */
export const mindBranchFlowOf = (elements: Element[], node: ShapeElement): MindFlow =>
  resolve(elements, node).flow;

/** The side of its parent `node` sits on; null for a root and throughout a bubble map. */
export const mindSideOf = (elements: Element[], node: ShapeElement): MindSide | null =>
  resolve(elements, node).side;

/**
 * The side a new child of `parent` holds (docs/specs/009-elements/mind-node.md "Flows"): under an any-direction
 * parent, the side of the sibling Enter was pressed on (`after`), else of the parent's last added child, else the
 * right. Null under any other parent: the child holds none and follows it.
 */
export function mindNewChildSide(
  elements: Element[],
  parent: ShapeElement,
  after?: ShapeElement,
): MindSide | null {
  if (mindBranchFlowOf(elements, parent) !== 'any') return null;
  const last =
    after ??
    elements.findLast(
      (el): el is ShapeElement =>
        el.type === 'shape' && el.shape === 'mind-node' && el.mindParentId === parent.id,
    );
  return last ? mindStackedSideUnder('any', parent, last) : 'tree';
}
