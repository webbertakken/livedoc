// What a selection's mind nodes are now, for their arrangement buttons (docs/specs/009-elements/mind-node.md "Numbered
// nodes", "Groups", "A tidy map stays tidy"). Read by the selection toolbars before the buttons, which are the mind
// maps family's (MindArrangeButtons.tsx), are drawn.
import { isMindGroupFrame, isMindNode, type Element } from '@livedoc/document';

export type MindArrangeState = { numbered: boolean; grouped: boolean; placed: boolean };

/** What the selected nodes are now (a group's frame standing for its members), or null when the selection holds no
 *  mind node below a root and no group. */
export function mindArrangeState(
  selected: readonly Element[],
  elements: readonly Element[],
): MindArrangeState | null {
  const frames = new Set(selected.filter(isMindGroupFrame).map((f) => f.id));
  const nodes = [
    ...selected.filter(isMindNode).filter((n) => !!n.mindParentId),
    ...(frames.size > 0
      ? elements.filter(isMindNode).filter((n) => !!n.mindGroup && frames.has(n.mindGroup))
      : []),
  ];
  if (nodes.length === 0) return null;
  const first = nodes[0]!;
  return {
    numbered: nodes.every((n) => n.mindNumbered === true),
    grouped:
      !!first.mindGroup &&
      nodes.every((n) => n.mindGroup === first.mindGroup && n.mindParentId === first.mindParentId),
    placed: nodes.some((n) => n.mindPlaced === true),
  };
}
