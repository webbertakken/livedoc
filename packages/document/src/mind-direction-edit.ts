// Changing a mind node's direction (docs/specs/009-elements/mind-node.md "A direction per node", "Connecting a branch
// keeps its direction"): a pick from Branching, and what a branch connected under a new parent keeps.
//
// The rules that keep directions minimal and sides stable:
// - A child holding the very direction its one-direction parent has drops it (Auto).
// - A child of an any-direction parent holds its side, so the layout never has to guess it from where it is drawn.
// Pure; returns the whole element list, laid out again where the change asks for it.

import {
  MIND_BRANCH_FLOWS,
  isMindSide,
  isRootOnlyMindFlow,
  mindBranchFlowOf,
  mindOwnFlow,
  mindSideByPosition,
  mindSideOf,
  type MindSide,
} from './mind-direction';
import { MIND_FLOW_LABEL, MIND_FLOWS, type MindFlow } from './mind-flow';
import { applyMindMoves, relayoutMindMap } from './mind-grow';
import { mindNodesInOrder } from './mind-layout';
import { isMindNode, mindChildren, mindFlowOf, mindRootOf } from './mind-map';
import type { Element, ElementId, ShapeElement } from './index';

const findNode = (elements: Element[], id: ElementId | undefined): ShapeElement | undefined => {
  const el = id ? elements.find((e) => e.id === id) : undefined;
  return el && isMindNode(el) ? el : undefined;
};

/** `id`'s own direction set to `flow`, or dropped (Auto) for null. */
function withOwnFlow(elements: Element[], id: ElementId, flow: MindFlow | null): Element[] {
  return elements.map((el) => {
    if (el.id !== id || !isMindNode(el)) return el;
    if (flow) return { ...el, mindFlow: flow };
    const { mindFlow: _dropped, ...rest } = el;
    return rest;
  });
}

const isRoot = (elements: Element[], node: ShapeElement) =>
  mindRootOf(elements, node).id === node.id;

/**
 * Settle the directions of `parent`'s children for the direction it now grows: under one direction, a child holding
 * that very direction drops it; under any direction, a child holding none takes the side it sits on (`sideOf`, read
 * before the change). A deeper parent holding what it would follow anyway drops it too.
 */
function settleChildren(
  elements: Element[],
  parentId: ElementId,
  sideOf: (child: ShapeElement) => MindSide | null,
): Element[] {
  let els = elements;
  const parent = findNode(els, parentId)!;
  const flow = mindBranchFlowOf(els, parent);
  for (const child of mindChildren(els, parentId)) {
    const own = mindOwnFlow(child, false);
    if (isMindSide(flow) && own === flow) els = withOwnFlow(els, child.id, null);
    if (flow === 'any' && own === null) els = withOwnFlow(els, child.id, sideOf(child));
  }
  if (!isRoot(els, parent) && parent.mindFlow && parent.mindParentId) {
    // Auto would give it the same: it holds nothing of its own.
    const bare = withOwnFlow(els, parent.id, null);
    const auto = mindBranchFlowOf(bare, findNode(bare, parent.id)!);
    if (auto === parent.mindFlow) els = withOwnFlow(els, parent.id, null);
  }
  return els;
}

/** The map of `nodeId` laid out again, siblings in the order they were drawn in `drawn`. */
function relaidOut(drawn: Element[], elements: Element[], nodeId: ElementId, deal: boolean) {
  const node = findNode(elements, nodeId)!;
  const root = mindRootOf(elements, node);
  const ranks = new Map(
    mindNodesInOrder(drawn, root.id, mindFlowOf(drawn, root)).map(({ node: n }, i) => [n.id, i]),
  );
  const plan = relayoutMindMap(elements, root.id, undefined, ranks, deal)!;
  return applyMindMoves(elements, plan.moves, plan.reanchored);
}

/**
 * A direction picked from Branching on `nodeId` (null for Auto), the map laid out again around its root. A pick in a
 * bubble map acts on its root. Returns `elements` itself when there is nothing to change: Auto on a root, a root-only
 * flow on a deeper node.
 */
export function setMindDirection(
  elements: Element[],
  nodeId: ElementId,
  flow: MindFlow | null,
): Element[] {
  const picked = findNode(elements, nodeId);
  if (!picked) return elements;
  const root = mindRootOf(elements, picked);
  const target = mindFlowOf(elements, root) === 'bubble' ? root : picked;
  const onRoot = target.id === root.id;
  if (onRoot ? flow === null : flow !== null && isRootOnlyMindFlow(flow)) return elements;
  const before = elements;
  let els = withOwnFlow(elements, target.id, flow);
  els = settleChildren(els, target.id, (child) => mindSideOf(before, child));
  const dealt = onRoot && flow === 'balanced' && mindFlowOf(before, root) !== 'balanced';
  return relaidOut(before, els, target.id, dealt);
}

/**
 * After a connector moved `childId` under a new parent (mind-connect.ts): every node in `moved` whose parent changed
 * keeps the direction it grew in before (`before`), and the parent takes the sides its children now sit on: one side,
 * that side's direction; more, any direction. A balanced root keeps Balanced while its children sit left and right,
 * and a bubble map stays as it is. Not laid out: the caller settles the map.
 */
export function keepMindDirections(
  before: Element[],
  after: Element[],
  moved: readonly ElementId[],
  childId: ElementId,
): Element[] {
  let els = after;
  const grown = new Map<ElementId, MindFlow>();
  for (const id of moved) {
    const was = findNode(before, id);
    const now = findNode(els, id);
    if (!was || !now || isRoot(els, now)) continue;
    const flow = mindBranchFlowOf(before, was);
    grown.set(id, flow);
    els = withOwnFlow(els, id, isRootOnlyMindFlow(flow) ? 'any' : flow);
  }
  const child = findNode(els, childId)!;
  const parent = findNode(els, child.mindParentId)!;
  const mapFlow = mindFlowOf(els, parent);
  if (mapFlow === 'bubble') return els;
  // The side each child sits on: the connected branch its own direction, else where it is drawn; the others where
  // the parent put them so far.
  const sideOf = (c: ShapeElement): MindSide => {
    if (c.id === childId) {
      const own = mindOwnFlow(c, false);
      return own && isMindSide(own) ? own : mindSideByPosition(parent, c);
    }
    // A child outside a bubble map always sits on a side.
    return mindSideOf(els, c)!;
  };
  const children = mindChildren(els, parent.id);
  const sides = new Map(children.map((c) => [c.id, sideOf(c)]));
  const distinct = new Set(sides.values());
  const balanced =
    isRoot(els, parent) &&
    mapFlow === 'balanced' &&
    [...distinct].every((s) => s === 'tree' || s === 'leftward');
  if (!balanced) {
    const flow: MindFlow = distinct.size === 1 ? [...distinct][0]! : 'any';
    els = withOwnFlow(els, parent.id, flow);
  }
  return settleChildren(els, parent.id, (c) => sides.get(c.id)!);
}

/** A row of Branching: a direction, or Auto (holding none, following the parent). */
export type MindDirectionChoice = MindFlow | 'auto';

export const MIND_DIRECTION_LABEL: Record<MindDirectionChoice, string> = {
  ...MIND_FLOW_LABEL,
  auto: 'Auto',
};

/**
 * What Branching offers on `node` and which row is ticked (docs/specs/009-elements/mind-node.md "The Mind Map
 * menu"): on a root, and anywhere in a bubble map, the map's flows with the root's ticked; on a deeper node, Auto and
 * the directions a branch may hold, its own ticked.
 */
export function mindDirectionChoices(
  elements: Element[],
  node: ShapeElement,
): { rows: readonly MindDirectionChoice[]; selected: MindDirectionChoice } {
  const root = mindRootOf(elements, node);
  const rootFlow = mindFlowOf(elements, root);
  if (root.id === node.id || rootFlow === 'bubble') return { rows: MIND_FLOWS, selected: rootFlow };
  return { rows: ['auto', ...MIND_BRANCH_FLOWS], selected: mindOwnFlow(node, false) ?? 'auto' };
}
