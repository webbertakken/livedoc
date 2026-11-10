// The map as a tree for the tidy layout (docs/specs/009-elements/mind-node.md "A tidy map stays tidy"): every node's
// children in the order they are drawn, and what the layouts share about them.

import { mindChildren } from './mind-map';
import type { Element, ElementId, ShapeElement } from './index';

/** How far a group's tinted box reaches past its members, and so the extra room a group takes among its siblings
 *  (docs/specs/009-elements/mind-node.md "Groups"). The title is inset as far: it is the `md` padding preset, the
 *  frame's own (`PADDING_PX.md`, pinned by mind-group.test.ts). */
export const MIND_GROUP_PADDING = 14;
/** The band at a group's top its title sits in, above the padding: the title's line (14 px at the label line height,
 *  1.25, so 18 px) and the padding again under it, so the title is as far from the members as from the frame's edge
 *  (docs/specs/009-elements/mind-node.md "Groups"). */
export const MIND_GROUP_TITLE_BAND = 32;

// A node placed by hand keeps its own position (docs/specs/009-elements/mind-node.md "A tidy map stays tidy").
export const isPlaced = (n: ShapeElement) => n.mindPlaced === true && !!n.mindParentId;
export const groupOf = (n: ShapeElement) => n.mindGroup ?? null;

/** Where a node that is not on the canvas yet slots into its siblings: right
 *  after `after` (Enter inserts the next line), else at the end (Tab). */
export type MindOrderHint = { id: ElementId; after?: ElementId };

export type MindPoint = { x: number; y: number };
/** Top-left position per node of the map, root included. */
export type MindLayout = Map<ElementId, MindPoint>;

export const centre = (n: ShapeElement): MindPoint => ({
  x: n.x + n.width / 2,
  y: n.y + n.height / 2,
});

// The map as a tree of nodes, children in their drawn order. Cycle-guarded
// like the rest of the mind-map walkers: `mindParentId` is stored data.
export type Tree = Map<ElementId, ShapeElement[]>;

/** A node's children; every node of the tree has an entry, a leaf an empty one. */
export const kidsOf = (tree: Tree, id: ElementId) => tree.get(id)!;

/** The tree from `root`, each parent's children sorted by `orderKey` (asked parent first, so a key may read what
 *  it worked out for the parent), the hinted node slotted in where its hint says. */
export function buildTree(
  elements: Element[],
  root: ShapeElement,
  orderKey: (node: ShapeElement, parent: ShapeElement) => number,
  hint?: MindOrderHint,
): Tree {
  const tree: Tree = new Map();
  const seen = new Set<ElementId>([root.id]);
  const frontier = [root];
  while (frontier.length > 0) {
    const parent = frontier.shift()!;
    const kids = mindChildren(elements, parent.id).filter((k) => !seen.has(k.id));
    for (const k of kids) seen.add(k.id);
    // The hinted node has no meaningful position yet, so it is kept out of
    // the positional sort and inserted where the hint says.
    const hinted = hint ? kids.find((k) => k.id === hint.id) : undefined;
    const keyed = kids
      .filter((k) => k !== hinted)
      .map((k, i) => ({ k, key: orderKey(k, parent), i }));
    // A group sits where its first member is, its members together in their own order.
    const groupKey = new Map<string, number>();
    for (const e of keyed) {
      const g = groupOf(e.k);
      if (g !== null) groupKey.set(g, Math.min(groupKey.get(g) ?? Infinity, e.key));
    }
    const at = (e: (typeof keyed)[number]) => {
      const g = groupOf(e.k);
      return g === null ? e.key : groupKey.get(g)!;
    };
    const placed = keyed
      // Stable on ties (document order), so nodes stacked on one spot still
      // come out in a deterministic order.
      .sort((a, b) => at(a) - at(b) || a.key - b.key || a.i - b.i)
      .map((e) => e.k);
    if (hinted) {
      const after = hint?.after ? placed.findIndex((k) => k.id === hint.after) : -1;
      placed.splice(after === -1 ? placed.length : after + 1, 0, hinted);
    }
    tree.set(parent.id, placed);
    frontier.push(...placed);
  }
  return tree;
}
