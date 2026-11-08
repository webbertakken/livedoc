// Restructuring a mind map by hand (docs/specs/009-elements/mind-node.md "Add Parent" and "Connecting nodes").
//
// The tree is the arrows you can see plus a parent pointer, so drawing a connector between two mind nodes is how a
// node changes parent: the node connected TO becomes the child of the node connected FROM, its branch with it. A node
// and its own ancestor (its parent included, either way round) cannot both be the other's parent, so the lower one
// takes the upper one's place and the upper one hangs under it: the hierarchy turns over at that point. Add Parent
// puts a new node between a node and its parent.
//
// Both return the whole element list, so the editor lands them as one change. A map that was tidy is laid out again;
// a hand-arranged one keeps its nodes where they are, with its connectors re-faced by the flow. Pure.

import { createPinnedArrow, createShape } from './factories';
import { mindConnectorAnchors, mindGaps, isMindSpacing, type MindFlow } from './mind-flow';
import {
  applyMindMoves,
  mindConnectorBetween,
  mindConnectorStyleSource,
  relayoutMindMap,
  type MindMove,
} from './mind-grow';
import { isMindTreeTidy, reanchorMindConnectors } from './mind-layout';
import { isMindNode, mindFlowOf, mindRootOf, mindSubtree, treeIds } from './mind-map';
import { isMindGroupFrame, settleMindGroups } from './mind-group';
import type { ArrowElement, Element, ElementId, ShapeElement } from './index';

/** Dresses a new node or connector the way the map's level looks (the editor's `mind-dress`). */
export type MindDress = {
  node: (node: ShapeElement, styleFrom: ShapeElement) => ShapeElement;
  connector: (arrow: ArrowElement, styleFrom: ArrowElement | null) => ArrowElement;
};

const findNode = (elements: Element[], id: ElementId | undefined): ShapeElement | undefined => {
  const el = id ? elements.find((e) => e.id === id) : undefined;
  return el && isMindNode(el) ? el : undefined;
};

// Cycle-guarded, like every walk over `mindParentId`.
function isAncestor(elements: Element[], ancestorId: ElementId, node: ShapeElement): boolean {
  const seen = new Set<ElementId>([node.id]);
  for (
    let at = findNode(elements, node.mindParentId);
    at;
    at = findNode(elements, at.mindParentId)
  ) {
    if (at.id === ancestorId) return true;
    if (seen.has(at.id)) return false;
    seen.add(at.id);
  }
  return false;
}

// A node's place in the tree, written in one go: its parent, or none (a root, which carries the map's flow and
// spacing). Moving a root's fields onto whatever takes its place keeps the map's shape.
// A node that changes place leaves its group and its hand placement behind: both are about its old siblings.
type Patch = Partial<
  Pick<ShapeElement, 'mindParentId' | 'mindFlow' | 'mindSpacing' | 'mindGroup' | 'mindPlaced'>
>;
const ROOT_FIELDS = ['mindParentId', 'mindFlow', 'mindSpacing', 'mindGroup', 'mindPlaced'] as const;

function patchNode(elements: Element[], id: ElementId, patch: Patch): Element[] {
  return elements.map((el) => {
    if (el.id !== id || !isMindNode(el)) return el;
    const next: ShapeElement = { ...el };
    for (const field of ROOT_FIELDS) delete next[field];
    return { ...next, ...stripUndefined(patch) };
  });
}

const stripUndefined = (patch: Patch): Patch =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

const rootFieldsOf = (node: ShapeElement): Patch => ({
  mindFlow: node.mindFlow,
  mindSpacing: node.mindSpacing,
});

// Drop the connector joining `a` and `b`, unless it is `keep`.
function dropConnector(elements: Element[], a: ElementId, b: ElementId, keep?: ElementId) {
  const old = mindConnectorBetween(
    elements.filter((e) => e.id !== keep),
    a,
    b,
  );
  return old ? elements.filter((e) => e.id !== old.id) : elements;
}

// Re-point the end of the `a`–`b` connector that sits on `from` to `to`, keeping its look.
function retargetConnector(
  elements: Element[],
  a: ElementId,
  b: ElementId,
  from: ElementId,
  to: ElementId,
): Element[] {
  const old = mindConnectorBetween(elements, a, b);
  if (!old) return elements;
  const swap = <E extends ArrowElement['from']>(end: E): E =>
    end.kind === 'pinned' && end.elementId === from ? { ...end, elementId: to } : end;
  return elements.map((e) =>
    e.id === old.id && e.type === 'arrow' ? { ...e, from: swap(e.from), to: swap(e.to) } : e,
  );
}

// `node` takes `over`'s place in the tree and `over` hangs under it. `keep` is the connector the person drew, which
// joins the two from now on.
function promote(
  elements: Element[],
  node: ShapeElement,
  over: ShapeElement,
  keep: ElementId,
): Element[] {
  let els = elements;
  if (node.mindParentId) els = dropConnector(els, node.mindParentId, node.id, keep);
  const grand = findNode(els, over.mindParentId);
  if (grand) {
    els = retargetConnector(els, grand.id, over.id, over.id, node.id);
    els = patchNode(els, node.id, { mindParentId: grand.id });
  } else {
    els = patchNode(els, node.id, rootFieldsOf(over));
  }
  return patchNode(els, over.id, { mindParentId: node.id });
}

// `child` (its branch with it) moves under `parent`.
function adopt(
  elements: Element[],
  parent: ShapeElement,
  child: ShapeElement,
  keep: ElementId,
): Element[] {
  const els = child.mindParentId
    ? dropConnector(elements, child.mindParentId, child.id, keep)
    : elements;
  return patchNode(els, child.id, { mindParentId: parent.id });
}

// The map `nodeId` is in, laid out again when it was tidy before the change, else only its connectors re-faced by
// the flow at the nodes' current places.
function settle(elements: Element[], nodeId: ElementId, wasTidy: boolean): Element[] {
  const node = findNode(elements, nodeId);
  if (!node) return elements;
  if (wasTidy) {
    const plan = relayoutMindMap(elements, nodeId);
    return plan ? applyMindMoves(elements, plan.moves, plan.reanchored) : elements;
  }
  const flow = mindFlowOf(elements, node);
  const ids = treeIds(elements, node);
  return applyMindMoves(elements, [], reanchorMindConnectors(elements, ids, flow, new Map()));
}

const tidyOf = (elements: Element[], node: ShapeElement): boolean =>
  isMindTreeTidy(elements, mindRootOf(elements, node).id, mindFlowOf(elements, node));

const pinnedPair = (arrow: ArrowElement | undefined): [ElementId, ElementId] | null =>
  arrow && arrow.from.kind === 'pinned' && arrow.to.kind === 'pinned'
    ? [arrow.from.elementId, arrow.to.elementId]
    : null;

// A connector moved off a pair it was the tree's edge for: the child it joined leaves its parent, as under a deleted
// connector's parent, and stands as a root.
function releaseOldPair(elements: Element[], previous: ArrowElement | undefined): Element[] {
  const pair = pinnedPair(previous);
  if (!pair) return elements;
  const [a, b] = pair.map((id) => findNode(elements, id));
  if (!a || !b) return elements;
  if (b.mindParentId === a.id) return patchNode(elements, b.id, {});
  if (a.mindParentId === b.id) return patchNode(elements, a.id, {});
  return elements;
}

/**
 * The tree after the connector `arrowId` was drawn (or one of its ends moved, `previous` being how it was) between
 * two mind nodes. Returns `elements` itself when the connector does not join two mind nodes, or joins the same two
 * it did.
 */
export function connectMindNodes(
  elements: Element[],
  arrowId: ElementId,
  previous: ArrowElement | undefined,
  dressConnector: MindDress['connector'],
): Element[] {
  const drawn = elements.find((e): e is ArrowElement => e.id === arrowId && e.type === 'arrow');
  const pair = pinnedPair(drawn);
  const before = pinnedPair(previous);
  if (before && pair && before[0] === pair[0] && before[1] === pair[1]) return elements;
  const released = releaseOldPair(elements, previous);
  const from = pair ? findNode(released, pair[0]) : undefined;
  const to = pair ? findNode(released, pair[1]) : undefined;
  if (!drawn || !from || !to || from.id === to.id) return released;

  // Tidy is asked of the maps as they stood, before anything moved in them.
  const tidy = tidyOf(released, from) && tidyOf(released, to);
  const toWasRoot = !to.mindParentId;
  const oldRootOfTo = mindRootOf(released, to);
  let els: Element[];
  if (to.mindParentId === from.id) els = promote(released, to, from, drawn.id);
  else if (isAncestor(released, to.id, from)) els = promote(released, from, to, drawn.id);
  else els = adopt(released, from, to, drawn.id);

  const child = [from, to]
    .map((n) => findNode(els, n.id)!)
    .find((n) => {
      const other = n.id === from.id ? to.id : from.id;
      return n.mindParentId === other;
    })!;
  const parent = findNode(els, child.mindParentId)!;
  const styleFrom = mindConnectorStyleSource(
    els.filter((e) => e.id !== drawn.id),
    parent,
  );
  els = els.map((e) => (e.id === drawn.id ? dressConnector(drawn, styleFrom) : e));
  els = settle(els, from.id, tidy);
  // The map `to` came from, when it was another and is left with nodes of its own.
  const leftBehind = toWasRoot ? undefined : findNode(els, oldRootOfTo.id);
  if (leftBehind && mindRootOf(els, leftBehind).id !== mindRootOf(els, parent).id)
    els = settle(els, leftBehind.id, tidy);
  return els;
}

// One level along the flow, for a map arranged by hand: where a node's new parent goes, its branch shifting out by
// that much so the parent has room.
function levelStep(
  elements: Element[],
  node: ShapeElement,
  flow: MindFlow,
): { dx: number; dy: number } {
  const root = mindRootOf(elements, node);
  const gaps = mindGaps(isMindSpacing(root.mindSpacing) ? root.mindSpacing : undefined);
  const across = node.width + gaps.child;
  const down = node.height + gaps.level;
  if (flow === 'downward') return { dx: 0, dy: down };
  if (flow === 'upward') return { dx: 0, dy: -down };
  if (flow === 'leftward') return { dx: -across, dy: 0 };
  if (flow === 'balanced')
    return { dx: node.x + node.width / 2 < root.x + root.width / 2 ? -across : across, dy: 0 };
  if (flow === 'bubble') {
    const parent = findNode(elements, node.mindParentId);
    if (!parent) return { dx: across, dy: 0 };
    const vx = node.x + node.width / 2 - (parent.x + parent.width / 2);
    const vy = node.y + node.height / 2 - (parent.y + parent.height / 2);
    const len = Math.hypot(vx, vy) || 1;
    const reach = Math.max(node.width, node.height) + gaps.child;
    return { dx: Math.round((vx / len) * reach), dy: Math.round((vy / len) * reach) };
  }
  return { dx: across, dy: 0 };
}

/**
 * A new node between `nodeId` and its parent (docs/specs/009-elements/mind-node.md "Add Parent"), looking like the
 * node it goes above. On a root it becomes the map's new root, the flow and spacing passing to it. `ids` names the
 * new node and its connectors: `into` from the parent (only when the node had a parent but no connector to it), `out`
 * down to the node. Null when `nodeId` is not a mind node.
 */
export function insertMindParent(
  elements: Element[],
  nodeId: ElementId,
  ids: { node: ElementId; into: ElementId; out: ElementId },
  dress: MindDress,
): Element[] | null {
  const node = findNode(elements, nodeId);
  if (!node) return null;
  const flow = mindFlowOf(elements, node);
  const tidy = tidyOf(elements, node);
  const parent = findNode(elements, node.mindParentId);
  const oldLink = parent ? mindConnectorBetween(elements, parent.id, node.id) : undefined;

  const base: ShapeElement = {
    ...createShape('mind-node', node.x, node.y),
    id: ids.node,
    width: node.width,
    height: node.height,
  };
  const added = { ...dress.node(base, node), id: ids.node, x: node.x, y: node.y };
  // It takes the node's place: its parent (or the root's flow and spacing), its group and its hand placement.
  const place = stripUndefined({ mindGroup: node.mindGroup, mindPlaced: node.mindPlaced });
  const inserted: ShapeElement = parent
    ? { ...added, ...place, mindParentId: parent.id }
    : { ...added, ...place, ...stripUndefined(rootFieldsOf(node)) };

  let els: Element[] = [...elements, inserted];
  if (parent && oldLink) els = retargetConnector(els, parent.id, node.id, node.id, inserted.id);
  else if (parent) {
    const [pa, ca] = mindConnectorAnchors(flow, parent, inserted);
    els.push(
      dress.connector({ ...createPinnedArrow(parent.id, pa, inserted.id, ca), id: ids.into }, null),
    );
  }
  els = patchNode(els, node.id, { mindParentId: inserted.id });

  if (!tidy) {
    // By hand: the node and its branch step out one level, so the new parent stands where the node stood.
    const step = levelStep(elements, node, flow);
    const branch = [node, ...mindSubtree(elements, node.id)];
    const moves: MindMove[] = branch.map((n) => ({ id: n.id, x: n.x + step.dx, y: n.y + step.dy }));
    els = applyMindMoves(els, moves);
  }
  const moved = findNode(els, node.id)!;
  const [pa, ca] = mindConnectorAnchors(flow, inserted, moved);
  const style = oldLink ?? mindConnectorStyleSource(elements, node);
  els.push(
    dress.connector(
      { ...createPinnedArrow(inserted.id, pa, node.id, ca), id: ids.out },
      style ?? null,
    ),
  );
  return settle(els, inserted.id, tidy);
}

/**
 * After nodes were deleted (docs/specs/009-elements/mind-node.md "Deleting"), every map that lost a node and was tidy
 * before is laid out again, so its siblings close the gap; a hand-arranged map is left as it is. `before` is the tab as
 * it was, `after` without the deleted elements.
 */
export function relayoutAfterRemoval(before: Element[], after: Element[]): Element[] {
  const kept = new Set(after.map((e) => e.id));
  const roots = new Set<ElementId>();
  for (const el of before) {
    if (!isMindNode(el) || kept.has(el.id)) continue;
    const parent = findNode(before, el.mindParentId);
    if (!parent || !kept.has(parent.id)) continue;
    const root = mindRootOf(before, parent);
    if (kept.has(root.id) && tidyOf(before, root)) roots.add(root.id);
  }
  // A group whose frame went: its members leave it, and their map closes up the group's room.
  const goneGroups = new Set(
    before.filter((el) => isMindGroupFrame(el) && !kept.has(el.id)).map((el) => el.id),
  );
  let els = after;
  if (goneGroups.size > 0) {
    els = els.map((el) => {
      if (!isMindNode(el) || !el.mindGroup || !goneGroups.has(el.mindGroup)) return el;
      const root = mindRootOf(before, el);
      if (tidyOf(before, root)) roots.add(root.id);
      const { mindGroup: _gone, ...rest } = el;
      return rest;
    });
  }
  for (const id of roots) els = settle(els, id, true);
  return settleMindGroups(els);
}
