// Arranging a mind map by hand (docs/specs/009-elements/mind-node.md "A tidy map stays tidy", "Numbered nodes",
// "Groups").
//
// A drag in a tidy map is read one of two ways. Dropped near the slot the layout would give it among its siblings,
// the node (or a whole group) is reordered there and the map laid out again. Dropped anywhere else, it is placed by
// hand: it stays where it was let go, its branch laid out from it, and the rest of the map closes up around the gap.
// Either way the map stays tidy, so growth keeps laying it out. A map already arranged by hand is left alone.
//
// Pure: every function returns the whole element list, for the editor to land as one change.

import { applyMindMoves, relayoutMindMap } from './mind-grow';
import { isVerticalMindFlow, type MindFlow } from './mind-flow';
import { isMindTreeTidy, layoutMindTree } from './mind-layout';
import { isMindNode, mindFlowOf, mindRootOf } from './mind-map';
import {
  isMindGroupFrame,
  mindGroupMembers,
  newMindGroupFrame,
  settleMindGroups,
  withMindGroupMembers,
} from './mind-group';
import type { Element, ElementId, ShapeElement } from './index';

/** What a drop did: reordered among its siblings, placed by hand, or nothing (not a tidy map's node). */
export type MindDropKind = 'reordered' | 'placed' | null;

export type MindDrop = {
  kind: MindDropKind;
  elements: Element[];
  /** Where a reordered node lands, for the drag's marker. */
  slot?: { x: number; y: number; width: number; height: number };
};

const findNode = (elements: Element[], id: ElementId | undefined): ShapeElement | undefined => {
  const el = id ? elements.find((e) => e.id === id) : undefined;
  return el && isMindNode(el) ? el : undefined;
};

const centre = (n: ShapeElement) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

function patch(
  elements: Element[],
  ids: ReadonlySet<ElementId>,
  change: (n: ShapeElement) => ShapeElement,
) {
  return elements.map((el) => (ids.has(el.id) && isMindNode(el) ? change(el) : el));
}

function without<K extends keyof ShapeElement>(n: ShapeElement, field: K): ShapeElement {
  const { [field]: _gone, ...rest } = n;
  return rest as ShapeElement;
}

// The whole map laid out again, every node to its slot and the connectors re-faced.
function relayout(elements: Element[], rootId: ElementId): Element[] {
  const plan = relayoutMindMap(elements, rootId);
  return plan ? applyMindMoves(elements, plan.moves, plan.reanchored) : elements;
}

const isTidy = (elements: Element[], node: ShapeElement) =>
  isMindTreeTidy(elements, mindRootOf(elements, node).id, mindFlowOf(elements, node));

// The roots of the maps `ids` are in.
function rootsOf(elements: Element[], ids: ReadonlySet<ElementId>): Set<ElementId> {
  const roots = new Set<ElementId>();
  for (const id of ids) {
    const n = findNode(elements, id);
    if (n) roots.add(mindRootOf(elements, n).id);
  }
  return roots;
}

// Change some nodes, then lay out again every map among `roots` that was tidy before the change.
function changeTidyMaps(
  elements: Element[],
  ids: ReadonlySet<ElementId>,
  change: (els: Element[]) => Element[],
  always = false,
): Element[] {
  const roots = [...rootsOf(elements, ids)].filter(
    (id) => always || isTidy(elements, findNode(elements, id)!),
  );
  let els = change(elements);
  for (const id of roots) els = relayout(els, id);
  return els;
}

// The group a dropped node belongs to now, from its neighbours along the stacking axis: it stays in its group beside
// a member, joins a group whose two members it lands between, and otherwise stands on its own.
function groupAfterDrop(
  siblings: readonly ShapeElement[],
  node: ShapeElement,
  flow: MindFlow,
): string | undefined {
  const key = (n: ShapeElement) => (isVerticalMindFlow(flow) ? centre(n).x : centre(n).y);
  const at = key(node);
  const sorted = [...siblings].sort((a, b) => key(a) - key(b));
  const prev = sorted.filter((s) => key(s) < at).at(-1);
  const next = sorted.find((s) => key(s) >= at);
  const own = node.mindGroup;
  if (own && (prev?.mindGroup === own || next?.mindGroup === own)) return own;
  if (prev?.mindGroup && prev.mindGroup === next?.mindGroup) return prev.mindGroup;
  return undefined;
}

/**
 * A drag of `draggedIds` let go, `primaryId` the node in hand: `before` the tab when it began, `after` with the drag
 * applied. Reorders or places the node (a group of siblings moving together as one block); `kind` null and `after`
 * itself when the node is a root or its map was arranged by hand.
 */
export function planMindDrop(
  before: Element[],
  after: Element[],
  primaryId: ElementId,
  draggedIds: ReadonlySet<ElementId>,
): MindDrop {
  const decided = decideMindDrop(before, after, primaryId, draggedIds);
  if (!decided) return { kind: null, elements: after };
  // A group's frame follows its members wherever they landed.
  return decided.kind === 'reordered'
    ? {
        kind: 'reordered',
        elements: settleMindGroups(relayout(decided.candidate, decided.rootId)),
        slot: decided.slot,
      }
    : { kind: 'placed', elements: settleMindGroups(relayout(decided.placed, decided.rootId)) };
}

// A group's frame in hand stands for its members: the first of them in the map's order leads the drop.
function inHand(
  before: Element[],
  primaryId: ElementId,
  draggedIds: ReadonlySet<ElementId>,
): { primaryId: ElementId; draggedIds: ReadonlySet<ElementId> } {
  const frame = before.find((e) => e.id === primaryId);
  if (!frame || !isMindGroupFrame(frame)) return { primaryId, draggedIds };
  const members = mindGroupMembers(before, frame.id);
  if (members.length === 0) return { primaryId, draggedIds };
  const flow = mindFlowOf(before, members[0]!);
  const key = (n: ShapeElement) => (isVerticalMindFlow(flow) ? centre(n).x : centre(n).y);
  const lead = [...members].sort((a, b) => key(a) - key(b))[0]!;
  return { primaryId: lead.id, draggedIds: withMindGroupMembers(before, draggedIds) };
}

/** What a drop would do, without laying the map out: for the marker a drag shows as it moves. */
export function previewMindDrop(
  before: Element[],
  after: Element[],
  primaryId: ElementId,
  draggedIds: ReadonlySet<ElementId>,
): Omit<MindDrop, 'elements'> {
  const decided = decideMindDrop(before, after, primaryId, draggedIds);
  if (!decided) return { kind: null };
  return decided.kind === 'reordered'
    ? { kind: 'reordered', slot: decided.slot }
    : { kind: 'placed' };
}

// Whether a map was tidy when a drag began: asked on every move of the drag, of the same tab.
const tidyAtStart = new WeakMap<Element[], Map<ElementId, boolean>>();
function wasTidy(before: Element[], node: ShapeElement): boolean {
  const rootId = mindRootOf(before, node).id;
  let known = tidyAtStart.get(before);
  if (!known) tidyAtStart.set(before, (known = new Map<ElementId, boolean>()));
  if (!known.has(rootId)) known.set(rootId, isTidy(before, node));
  return known.get(rootId)!;
}

type Decided =
  | {
      kind: 'reordered';
      rootId: ElementId;
      candidate: Element[];
      slot: NonNullable<MindDrop['slot']>;
    }
  | { kind: 'placed'; rootId: ElementId; placed: Element[] };

function decideMindDrop(
  before: Element[],
  after: Element[],
  heldId: ElementId,
  held: ReadonlySet<ElementId>,
): Decided | null {
  const { primaryId, draggedIds } = inHand(before, heldId, held);
  const was = findNode(before, primaryId);
  const node = findNode(after, primaryId);
  if (!was?.mindParentId || !node || !wasTidy(before, was)) return null;
  const root = mindRootOf(before, was);
  const flow = mindFlowOf(before, was);
  const siblings = after.filter(
    (e): e is ShapeElement => isMindNode(e) && e.mindParentId === was.mindParentId,
  );
  const unit = new Set(siblings.filter((s) => draggedIds.has(s.id)).map((s) => s.id));
  const members = was.mindGroup ? siblings.filter((s) => s.mindGroup === was.mindGroup) : [];
  const wholeGroup = members.length > 0 && members.every((m) => unit.has(m.id));
  const group = wholeGroup
    ? was.mindGroup
    : flow === 'bubble'
      ? was.mindGroup
      : groupAfterDrop(
          siblings.filter((s) => !unit.has(s.id)),
          node,
          flow,
        );

  const candidate = patch(after, unit, (n) => {
    const free = without(n, 'mindPlaced');
    return group ? { ...free, mindGroup: group } : without(free, 'mindGroup');
  });
  const slot = layoutMindTree(candidate, root.id, flow).get(primaryId)!;
  const distance = Math.hypot(node.x - slot.x, node.y - slot.y);
  if (distance <= Math.max(node.width, node.height)) {
    return {
      kind: 'reordered',
      rootId: root.id,
      candidate,
      slot: { ...slot, width: node.width, height: node.height },
    };
  }
  return {
    kind: 'placed',
    rootId: root.id,
    placed: patch(after, unit, (n) => ({ ...n, mindPlaced: true })),
  };
}

/** Auto Position: `ids` (a group's frame standing for its members) go back into the layout, their maps laid out again. */
export function autoPositionMindNodes(elements: Element[], ids: ReadonlySet<ElementId>): Element[] {
  const nodes = withMindGroupMembers(elements, ids);
  return settleMindGroups(
    changeTidyMaps(
      elements,
      nodes,
      (els) => patch(els, nodes, (n) => without(n, 'mindPlaced')),
      true,
    ),
  );
}

/**
 * Group the mind nodes among `ids`, one group per parent: a frame each, its id `groupId` (then `groupId-2`, ...),
 * untitled, around them and their branches.
 */
export function groupMindNodes(
  elements: Element[],
  ids: ReadonlySet<ElementId>,
  groupId: string,
): Element[] {
  const byParent = new Map<ElementId, string>();
  for (const id of ids) {
    const n = findNode(elements, id);
    if (!n?.mindParentId || byParent.has(n.mindParentId)) continue;
    byParent.set(n.mindParentId, byParent.size === 0 ? groupId : `${groupId}-${byParent.size + 1}`);
  }
  if (byParent.size === 0) return elements;
  const frames = [...byParent.values()].map(newMindGroupFrame);
  return settleMindGroups(
    changeTidyMaps(elements, ids, (els) => [
      ...patch(els, ids, (n) =>
        n.mindParentId && byParent.has(n.mindParentId)
          ? { ...n, mindGroup: byParent.get(n.mindParentId)! }
          : n,
      ),
      ...frames,
    ]),
  );
}

/** Ungroup every group among `ids` (its frame) or a node among them is in: the frames go, the members stay. */
export function ungroupMindNodes(elements: Element[], ids: ReadonlySet<ElementId>): Element[] {
  const groups = new Set<string>();
  for (const id of ids) {
    const el = elements.find((e) => e.id === id);
    if (!el) continue;
    if (isMindGroupFrame(el)) groups.add(el.id);
    else if (isMindNode(el) && el.mindGroup) groups.add(el.mindGroup);
  }
  if (groups.size === 0) return elements;
  const members = new Set(
    elements
      .filter((e) => isMindNode(e) && !!e.mindGroup && groups.has(e.mindGroup))
      .map((e) => e.id),
  );
  return changeTidyMaps(elements, members, (els) =>
    patch(
      els.filter((e) => !groups.has(e.id)),
      members,
      (n) => without(n, 'mindGroup'),
    ),
  );
}

/** Number (or unnumber) the mind nodes among `ids`, a group's frame standing for its members. */
export function setMindNumbered(
  elements: Element[],
  ids: ReadonlySet<ElementId>,
  on: boolean,
): Element[] {
  const nodes = withMindGroupMembers(elements, ids);
  return patch(elements, nodes, (n) =>
    on ? { ...n, mindNumbered: true } : without(n, 'mindNumbered'),
  );
}
