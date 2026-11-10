import {
  applyMindMoves,
  autoPositionMindNodes,
  groupMindNodes,
  isMindNode,
  mindRootOf,
  relayoutMindMap,
  setMindDirection,
  setMindNumbered,
  treeIds,
  ungroupMindNodes,
  type Element,
  type MindDirectionChoice,
  type MindSpacing,
} from '@livedoc/document';
import { track } from '@/lib/telemetry';
import { debugLog } from '@/lib/debug-log';

type MindMapSetterDeps = {
  currentSelectionIds: () => Set<string>;
  commit: (mapElements: (els: Element[]) => Element[]) => void;
  // The active tab's elements now, to tell a tidy that moves nodes from one that moves none.
  elements: () => Element[];
  // An in-page notification (the editor's toast).
  notify: (tone: 'success' | 'info', message: string) => void;
};

// The Mind Map menu section's actions (docs/specs/009-elements/mind-node.md "Flows" + "Tidy Map"): the
// direction each selected node's branches grow in, and laying a map out tidily (on the map's ROOT, so
// selecting several nodes of one map acts on it once).
export function useMindMapSetters({
  currentSelectionIds,
  commit,
  elements,
  notify,
}: MindMapSetterDeps) {
  // The roots of every map with a selected node. Resolved inside the updater,
  // against the elements as they stand: the walk up to a root has to read the
  // same array it writes back.
  const selectedRoots = (all: Element[], ids: Set<string>) => [
    ...new Set(
      all
        .filter((el) => ids.has(el.id))
        .filter(isMindNode)
        .map((el) => mindRootOf(all, el).id),
    ),
  ];

  // Tidy Map puts every node placed by hand back into the layout (docs/specs/009-elements/mind-node.md "A tidy map
  // stays tidy").
  const unplaced = (all: Element[], rootId: string): Element[] => {
    const root = all.find((el) => el.id === rootId);
    if (!root || !isMindNode(root)) return all;
    const map = treeIds(all, root);
    if (!all.some((el) => map.has(el.id) && isMindNode(el) && el.mindPlaced === true)) return all;
    return all.map((el) => {
      if (!map.has(el.id) || !isMindNode(el) || el.mindPlaced !== true) return el;
      const { mindPlaced: _placed, ...rest } = el;
      return rest;
    });
  };

  // Lay each map out again, as one commit (Tidy Map puts its hand-placed nodes back too).
  const relayoutSelected = (ids: Set<string>, unplace = false) => {
    if (ids.size === 0) return;
    commit((all) => {
      let next = all;
      for (const rootId of selectedRoots(all, ids)) {
        if (unplace) next = unplaced(next, rootId);
        const plan = relayoutMindMap(next, rootId);
        if (!plan) continue;
        next = applyMindMoves(next, plan.moves, plan.reanchored);
        debugLog(`[mind-layout] relayout root=${rootId} moves=${plan.moves.length}`);
      }
      return next;
    });
  };

  // Picking a flow re-lays the map out in it straight away: a flow that only
  // changed where the NEXT node would land left the map looking the same after
  // the click, so the pick looked broken.
  // Each selected node takes the direction picked (docs/specs/009-elements/mind-node.md "A direction per node"),
  // its map laid out again, all as one commit, so the change and its re-layout are one undo step.
  const setMindFlowSelected = (flow: MindDirectionChoice) => {
    const ids = currentSelectionIds();
    if (ids.size === 0) return;
    commit((all) => {
      let next = all;
      for (const id of ids) {
        next = setMindDirection(next, id, flow === 'auto' ? null : flow);
        debugLog(`[mind-layout] direction node=${id} flow=${flow}`);
      }
      return next;
    });
    track('Element', 'Changed', 'MindFlow');
  };

  // Spacing (docs/specs/009-elements/mind-node.md "Spacing"): stored on each selected map's root, then the map
  // re-laid out at it, as one commit, the same way a flow pick re-lays it out.
  const setMindSpacingSelected = (spacing: MindSpacing) => {
    const ids = currentSelectionIds();
    if (ids.size === 0) return;
    commit((all) => {
      let next = all;
      for (const rootId of selectedRoots(all, ids)) {
        next = next.map((el) => (el.id === rootId ? { ...el, mindSpacing: spacing } : el));
        const plan = relayoutMindMap(next, rootId);
        if (plan) next = applyMindMoves(next, plan.moves, plan.reanchored);
        debugLog(`[mind-layout] spacing root=${rootId} spacing=${spacing}`);
      }
      return next;
    });
    track('Element', 'Changed', 'MindSpacing');
  };

  // Tidy Map on the maps of `ids`, saying what it did: "Map tidied", or "Map already tidy" when
  // no node moves and no connector re-anchors.
  const tidy = (ids: Set<string>) => {
    if (ids.size === 0) return;
    const all = elements();
    const changes = selectedRoots(all, ids).some((rootId) => {
      const free = unplaced(all, rootId);
      const plan = relayoutMindMap(free, rootId);
      return free !== all || (!!plan && (plan.moves.length > 0 || plan.reanchored.length > 0));
    });
    if (changes) relayoutSelected(ids, true);
    debugLog(`[mind-layout] tidy changed=${changes}`);
    notify(changes ? 'success' : 'info', changes ? 'Map tidied' : 'Map already tidy');
    track('Element', 'Changed', 'MindTidy');
  };

  const tidyMindMapSelected = () => tidy(currentSelectionIds());

  // Tidy Map on the map `id` belongs to: the badge on a map's root (element-badges.tsx).
  const tidyMindMap = (id: string) => tidy(new Set([id]));

  // The selection toolbar's arrangement buttons (docs/specs/009-elements/mind-node.md "Numbered nodes", "Groups",
  // "A tidy map stays tidy"): each one change, one undo step.
  const arrange = (what: string, change: (all: Element[], ids: Set<string>) => Element[]) => {
    const ids = currentSelectionIds();
    if (ids.size === 0) return false;
    commit((all) => change(all, ids));
    debugLog(`[mind-arrange] ${what} nodes=${ids.size}`);
    return true;
  };
  const mindArrangeActions: MindArrangeActions = {
    number: (on) => {
      if (arrange(on ? 'number' : 'unnumber', (all, ids) => setMindNumbered(all, ids, on)))
        track('Element', 'Changed', 'MindNumber');
    },
    // The new group's frame id, so the editor can select it and open its title.
    group: () => {
      const id = crypto.randomUUID();
      if (!arrange('group', (all, ids) => groupMindNodes(all, ids, id))) return null;
      track('Element', 'Changed', 'MindGroup');
      return id;
    },
    ungroup: () => {
      if (arrange('ungroup', ungroupMindNodes)) track('Element', 'Changed', 'MindUngroup');
    },
    autoPosition: () => {
      if (arrange('auto-position', autoPositionMindNodes))
        track('Element', 'Changed', 'MindAutoPosition');
    },
  };

  return {
    setMindFlowSelected,
    setMindSpacingSelected,
    tidyMindMapSelected,
    tidyMindMap,
    mindArrangeActions,
  };
}

export type MindArrangeActions = {
  number: (on: boolean) => void;
  group: () => string | null;
  ungroup: () => void;
  autoPosition: () => void;
};
