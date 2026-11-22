// The multi-selection menu's Mind Map row (docs/specs/009-elements/mind-node.md "Several nodes selected"): offered to an
// Editor when the selection is mind nodes, with or without the lines between them; it acts on the nodes.
import {
  mindRootOf,
  mindSelectionChoices,
  mindSelectionNodes,
  withMindBranches,
  type Element,
} from '@livedoc/document';
import { track } from '@/lib/telemetry';
import type { MindSelectionMenu } from './EditorContextMenu.types';

type MindSelectionMenuDeps = {
  elements: Element[];
  // The selection's members, in document order.
  selection: readonly Element[];
  can: { level: string };
  selectMarquee: (ids: Set<string>) => void;
  mindOutline: { canEdit: (id: string) => boolean; open: (id: string) => void };
  onTidyBranches: () => void;
};

export function mindSelectionMenu({
  elements,
  selection,
  can,
  selectMarquee,
  mindOutline,
  onTidyBranches,
}: MindSelectionMenuDeps): MindSelectionMenu | undefined {
  if (can.level !== 'edit') return undefined;
  const nodes = mindSelectionNodes(elements, selection);
  if (!nodes) return undefined;
  const { flowRows, flow, spacing, mapRoot } = mindSelectionChoices(elements, nodes);
  // Through the marquee commit, as the single node's Select Branch does, lines between the nodes included.
  const selectBranchesOf = (ids: Iterable<string>) => {
    selectMarquee(new Set(withMindBranches(elements, new Set(ids))));
    track('Element', 'Selected', 'MindBranch');
  };
  return {
    flowRows,
    flow,
    spacing,
    onTidyBranches,
    onEditOutline:
      mapRoot && mindOutline.canEdit(mapRoot.id) ? () => mindOutline.open(mapRoot.id) : undefined,
    onSelectBranch: () => selectBranchesOf(nodes.map((n) => n.id)),
    onSelectMap: () => selectBranchesOf(nodes.map((n) => mindRootOf(elements, n).id)),
  };
}
