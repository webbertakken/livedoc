// Converting a flow into a mind map (docs/specs/009-elements/mind-node.md "Converting a flow").
//
// Boxes joined by arrows, converted to mind nodes, are a map: an arrow between two mind nodes (one of them just
// converted) is a tree edge from the node it points from to the node it points to. The tree is read breadth-first
// from the nodes no arrow points into, so each node takes the first parent that reaches it and an arrow that would
// give a node a second parent or close a loop stays an ordinary arrow. Every arrow stays, look and label included.
//
// Directions come from where the nodes are drawn: each child sits on the side of its parent it is drawn on, and a
// parent grows the way of its children's one side, or in any direction when they sit on several. A map that was
// tidy (every freshly converted node is) is laid out around its root; a hand-arranged one keeps its places. Pure.

import { applyMindMoves, relayoutMindMap } from './mind-grow';
import {
  isMindSide,
  isRootOnlyMindFlow,
  MIND_SIDES,
  mindBranchFlowOf,
  mindSideByPosition,
  mindSideOf,
  type MindSide,
} from './mind-direction';
import type { MindFlow } from './mind-flow';
import { isMindTreeTidy, reanchorMindConnectors } from './mind-layout';
import { isMindNode, mindChildren, mindFlowOf, mindRootOf, treeIds } from './mind-map';
import type { Element, ElementId, ShapeElement } from './index';

type Edge = { parent: ElementId; child: ElementId };

const nodesById = (elements: Element[]): Map<ElementId, ShapeElement> =>
  new Map(elements.filter(isMindNode).map((n) => [n.id, n]));

// The arrows that may become tree edges: pinned at both ends between two different mind nodes, one of them
// converted, and not already the edge between a node and its parent. In document order.
function candidateArrows(
  elements: Element[],
  nodes: Map<ElementId, ShapeElement>,
  converted: ReadonlySet<ElementId>,
): Edge[] {
  const out: Edge[] = [];
  for (const el of elements) {
    if (el.type !== 'arrow' || el.from.kind !== 'pinned' || el.to.kind !== 'pinned') continue;
    const from = nodes.get(el.from.elementId);
    const to = nodes.get(el.to.elementId);
    if (!from || !to || from.id === to.id) continue;
    if (!converted.has(from.id) && !converted.has(to.id)) continue;
    if (to.mindParentId === from.id || from.mindParentId === to.id) continue;
    out.push({ parent: from.id, child: to.id });
  }
  return out;
}

/** The new tree edges, breadth-first from the nodes no candidate arrow points into, then from any loop left. */
function treeEdges(
  elements: Element[],
  nodes: Map<ElementId, ShapeElement>,
  arrows: Edge[],
): Edge[] {
  const parents = new Map<ElementId, ElementId>();
  for (const n of nodes.values())
    if (n.mindParentId && nodes.has(n.mindParentId)) parents.set(n.id, n.mindParentId);
  // Cycle-guarded, like every walk over parents: stored data may already hold a loop.
  const isAncestor = (ancestor: ElementId, of: ElementId): boolean => {
    const seen = new Set<ElementId>();
    for (let at: ElementId | undefined = of; at && !seen.has(at); at = parents.get(at)) {
      if (at === ancestor) return true;
      seen.add(at);
    }
    return false;
  };

  const outOf = new Map<ElementId, ElementId[]>();
  const pointedInto = new Set<ElementId>();
  for (const a of arrows) {
    outOf.set(a.parent, [...(outOf.get(a.parent) ?? []), a.child]);
    pointedInto.add(a.child);
  }
  const ends = new Set(arrows.flatMap((a) => [a.parent, a.child]));
  const inOrder = elements.filter((el) => ends.has(el.id)).map((el) => el.id);
  const starts = [...inOrder.filter((id) => !pointedInto.has(id)), ...inOrder];

  const edges: Edge[] = [];
  const visited = new Set<ElementId>();
  for (const start of starts) {
    if (visited.has(start)) continue;
    visited.add(start);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i]!;
      for (const child of outOf.get(at) ?? []) {
        if (!parents.has(child) && !isAncestor(child, at)) {
          parents.set(child, at);
          edges.push({ parent: at, child });
        }
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }
  }
  return edges;
}

function patchNode(elements: Element[], id: ElementId, patch: Partial<ShapeElement>): Element[] {
  return elements.map((el) => {
    if (el.id !== id || !isMindNode(el)) return el;
    const next: ShapeElement = { ...el, ...patch };
    for (const key of Object.keys(patch) as (keyof ShapeElement)[])
      if (patch[key] === undefined) delete next[key];
    return next;
  });
}

// Where a child of the parent being settled sits: on a side it already holds, or where it is drawn from the parent.
type Drawn = { parent: ShapeElement; child: ShapeElement };
type Placing = { side: MindSide } | Drawn;

const centre = (n: ShapeElement) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
const offset = ({ parent, child }: Drawn) => {
  const [p, c] = [centre(parent), centre(child)];
  return { dx: c.x - p.x, dy: c.y - p.y };
};

/**
 * How each child of `parentId` sits, read from the tab as it was drawn (`before`): a child already under it on the
 * side the map put it; a joining branch on its own direction's side when it has one, else where it is drawn. Outside a
 * bubble map, every child sits on a side.
 */
function childPlacings(
  before: Element[],
  els: Element[],
  parentId: ElementId,
  joined: ReadonlySet<ElementId>,
): Map<ElementId, Placing> {
  const nodes = nodesById(before);
  const parent = nodes.get(parentId)!;
  const placings = new Map<ElementId, Placing>();
  for (const child of mindChildren(els, parentId)) {
    const was = nodes.get(child.id)!;
    const grown = mindChildren(before, was.id).length > 0 ? mindBranchFlowOf(before, was) : null;
    if (!joined.has(child.id)) placings.set(child.id, { side: mindSideOf(before, was)! });
    else if (grown && isMindSide(grown)) placings.set(child.id, { side: grown });
    else placings.set(child.id, { parent, child: was });
  }
  return placings;
}

// How far a drawn child lies out along a side's way (positive: on that side), for each side.
const ALONG: Record<MindSide, (p: { dx: number; dy: number }) => number> = {
  tree: (p) => p.dx,
  leftward: (p) => -p.dx,
  downward: (p) => p.dy,
  upward: (p) => -p.dy,
};

/**
 * The one side every child sits on, if there is one: each child holding a side holds it, and each drawn child lies
 * out that way, however far it strays across (a flow fans its branches out diagonally). When two sides fit, the one
 * the children lie further out along; a tie goes across, as `mindSideByPosition`'s does.
 */
function sharedSide(placings: Placing[]): MindSide | null {
  let best: { side: MindSide; reach: number } | null = null;
  for (const side of MIND_SIDES) {
    let reach = 0;
    const fits = placings.every((p) => {
      if ('side' in p) return p.side === side;
      const along = ALONG[side](offset(p));
      reach += along;
      return along > 0;
    });
    if (fits && (!best || reach > best.reach)) best = { side, reach };
  }
  return best?.side ?? null;
}

// A child's own side under an any-direction parent: held, else the side it is drawn on.
const sideOfPlacing = (p: Placing): MindSide =>
  'side' in p ? p.side : mindSideByPosition(p.parent, p.child);

/**
 * The direction a parent grows in for how its children sit: all on one side, that side's; else any direction, each
 * child on its own side. A balanced root stays balanced while its children sit only left and right: under it, a
 * drawn child sits left or right by where it is. `rootFlow` is the map's flow when the parent is a root, else null.
 */
function flowForPlacings(rootFlow: MindFlow | null, placings: Placing[]): MindFlow {
  const across = (p: Placing) => !('side' in p) || p.side === 'tree' || p.side === 'leftward';
  if (rootFlow === 'balanced' && placings.every(across)) return 'balanced';
  return sharedSide(placings) ?? 'any';
}

// Directions for every parent the edges touch, top-down, kept minimal: a deeper node growing the way it would on
// Auto holds none; under an any-direction parent a child holds the side it sits on.
function settleDirections(before: Element[], linked: Element[], edges: Edge[]): Element[] {
  let els = linked;
  const joined = new Set(edges.map((e) => e.child));
  const parents = [...new Set(edges.map((e) => e.parent))];
  for (const id of parents) {
    const node = nodesById(els).get(id)!;
    // A bubble map is laid out round its root as a whole: its directions are not read.
    if (mindFlowOf(els, node) === 'bubble') continue;
    const rootFlow = node.mindParentId ? null : mindFlowOf(els, node);
    const placings = childPlacings(before, els, id, joined);
    const flow = flowForPlacings(rootFlow, [...placings.values()]);
    els = patchNode(els, id, { mindFlow: flow });
    if (flow !== 'any') continue;
    for (const [child, placing] of placings)
      if (!nodesById(els).get(child)!.mindFlow)
        els = patchNode(els, child, { mindFlow: sideOfPlacing(placing) });
  }
  // Drop what Auto gives anyway, top-down so each node reads its parent as it now grows.
  for (const id of [...parents, ...joined]) {
    const node = nodesById(els).get(id)!;
    if (!node.mindParentId || !node.mindFlow) continue;
    const parent = nodesById(els).get(node.mindParentId)!;
    const parentFlow = mindBranchFlowOf(els, parent);
    if (isMindSide(parentFlow) && parentFlow === node.mindFlow)
      els = patchNode(els, id, { mindFlow: undefined });
  }
  return els;
}

// A map laid out again when every map that joined it was tidy, else only its connectors re-faced by the flow.
function settleMap(elements: Element[], rootId: ElementId, tidy: boolean): Element[] {
  if (tidy) {
    const plan = relayoutMindMap(elements, rootId)!;
    return applyMindMoves(elements, plan.moves, plan.reanchored);
  }
  const root = nodesById(elements).get(rootId)!;
  const reanchored = reanchorMindConnectors(
    elements,
    treeIds(elements, root),
    mindFlowOf(elements, root),
    new Map(),
  );
  return applyMindMoves(elements, [], reanchored);
}

/**
 * The tab after the mind nodes in `converted` were converted from other shapes: the arrows between them and other
 * mind nodes become the tree, its directions read from where the nodes are drawn, and each map they make laid out
 * when it was tidy. Returns `elements` itself when no arrow joins a converted node to another mind node.
 */
export function joinConvertedMindNodes(
  elements: Element[],
  converted: ReadonlySet<ElementId>,
): Element[] {
  const nodes = nodesById(elements);
  const edges = treeEdges(elements, nodes, candidateArrows(elements, nodes, converted));
  if (edges.length === 0) return elements;

  // Tidy is asked of the maps as they stood, before anything joined them.
  const wasTidy = (id: ElementId) => {
    const root = mindRootOf(elements, nodes.get(id)!);
    return isMindTreeTidy(elements, root.id, mindFlowOf(elements, root));
  };
  const untidy = new Set(edges.flatMap((e) => [e.parent, e.child]).filter((id) => !wasTidy(id)));

  let els = elements;
  for (const { parent, child } of edges) {
    // A root joining a map stops being one: its spacing goes, and the direction it grew in stays with its branch.
    const was = nodes.get(child)!;
    const flow = was.mindFlow && isRootOnlyMindFlow(was.mindFlow) ? 'any' : was.mindFlow;
    els = patchNode(els, child, {
      mindParentId: parent,
      mindFlow: flow,
      mindSpacing: undefined,
      mindPlaced: undefined,
      mindGroup: undefined,
    });
  }
  els = settleDirections(elements, els, edges);

  const roots = new Map<ElementId, boolean>();
  for (const { parent, child } of edges) {
    const root = mindRootOf(els, nodesById(els).get(parent)!).id;
    const tidy = (roots.get(root) ?? true) && !untidy.has(parent) && !untidy.has(child);
    roots.set(root, tidy);
  }
  for (const [root, tidy] of roots) els = settleMap(els, root, tidy);
  return els;
}
