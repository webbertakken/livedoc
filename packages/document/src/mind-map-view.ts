// What a drawn mind map shows beside its nodes and connectors (docs/specs/009-elements/mind-node.md "Groups",
// "Numbered nodes"): its groups' tinted boxes and each numbered node's number. Pure; drawn by the board and by an
// export without the layout (mind-layout.ts).
import { isMindNode, mindFlowOf, mindRootOf, mindSubtree } from './mind-map';
import { MIND_GROUP_PADDING, MIND_GROUP_TITLE_BAND, isPlaced } from './mind-layout-tree';
import { mindNodesInOrder } from './mind-order';
import { unionRects } from './geometry-primitives';
import type { Element, ElementId, ShapeElement } from './index';

export { MIND_GROUP_PADDING, MIND_GROUP_TITLE_BAND };
/** A group box's corner radius. */
export const MIND_GROUP_RADIUS = 14;
/** A group title's text size, in px. */
export const MIND_GROUP_TITLE_PX = 14;

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
