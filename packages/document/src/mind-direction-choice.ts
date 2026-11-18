// What Branching offers on a mind node (docs/specs/009-elements/mind-node.md "The Mind Map menu"): its rows and the
// one ticked. Pure; the menu reads it without the edit that applies a pick (mind-direction-edit.ts).
import { MIND_BRANCH_FLOWS, mindOwnFlow } from './mind-direction';
import { MIND_FLOW_LABEL, MIND_FLOWS, type MindFlow } from './mind-flow';
import { mindFlowOf, mindRootOf } from './mind-map';
import type { Element, ShapeElement } from './index';

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
