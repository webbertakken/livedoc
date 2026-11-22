// A selection of several mind nodes (docs/specs/009-elements/mind-node.md "Several nodes selected"): whether it is one,
// and what its Mind Map menu offers and ticks. Pure; the editor's menu reads it.
import { mindDirectionChoices, type MindDirectionChoice } from './mind-direction-choice';
import type { MindSpacing } from './mind-flow';
import { isMindNode, mindRootOf, mindSpacingOf } from './mind-map';
import type { Element, ShapeElement } from './index';

/** What a mind selection's Branching and Spacing offer and tick, and the one map it is in. */
export type MindSelectionChoices = {
  flowRows: readonly MindDirectionChoice[];
  /** The direction every node holds, or null when they differ. */
  flow: MindDirectionChoice | null;
  /** The spacing every map shares, or null when they differ. */
  spacing: MindSpacing | null;
  /** The root of the one map every node is in, or null when the nodes span maps. */
  mapRoot: ShapeElement | null;
};

// A line pinned at both ends to mind nodes: a branch's connector, or a link drawn between two nodes.
function isMindLine(byId: ReadonlyMap<string, Element>, el: Element): boolean {
  if (el.type !== 'arrow' || el.from.kind !== 'pinned' || el.to.kind !== 'pinned') return false;
  const from = byId.get(el.from.elementId);
  const to = byId.get(el.to.elementId);
  return !!from && !!to && isMindNode(from) && isMindNode(to);
}

/**
 * The mind nodes of `selection` when it is a mind selection: at least one mind node, every other member a line
 * between mind nodes, carried along rather than counted as another kind. Null for any other selection.
 */
export function mindSelectionNodes(
  elements: readonly Element[],
  selection: readonly Element[],
): ShapeElement[] | null {
  const nodes = selection.filter(isMindNode);
  if (nodes.length === 0) return null;
  const byId = new Map(elements.map((el) => [el.id, el]));
  const carried = selection.every((el) => isMindNode(el) || isMindLine(byId, el));
  return carried ? nodes : null;
}

// The one value every item shares, or null when they differ.
function shared<T>(values: readonly T[]): T | null {
  return values.every((v) => v === values[0]) ? (values[0] ?? null) : null;
}

/** What the Mind Map menu offers and ticks for the mind nodes `nodes` (at least one). */
export function mindSelectionChoices(
  elements: Element[],
  nodes: readonly ShapeElement[],
): MindSelectionChoices {
  const choices = nodes.map((n) => mindDirectionChoices(elements, n));
  const flowRows = choices.reduce<readonly MindDirectionChoice[]>(
    (rows, c) => rows.filter((row) => c.rows.includes(row)),
    choices[0]?.rows ?? [],
  );
  const roots = [
    ...new Map(nodes.map((n) => mindRootOf(elements, n)).map((r) => [r.id, r])).values(),
  ];
  return {
    flowRows,
    flow: shared(choices.map((c) => c.selected)),
    spacing: shared(roots.map((r) => mindSpacingOf(elements, r))),
    mapRoot: roots.length === 1 ? roots[0]! : null,
  };
}
