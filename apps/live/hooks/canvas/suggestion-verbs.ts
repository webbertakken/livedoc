import {
  applyContextSuggestions,
  isOpenSuggestion,
  isSuggestedContext,
  isSuggestion,
  LANES_MAX,
  openLanePlan,
  removeContexts,
  SPLIT_PARTS_MAX,
  withoutLanePlans,
  type Element,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import { applyLanePlan, checkLanePlan } from '@livedoc/storm-reading';
import { applyFirstChanges, withoutSuggestedChanges } from '@/lib/suggested-changes-apply';
import { changeMarks, nameRows } from '@/lib/suggested-changes';
import { applyAllSuggestions, applySuggestion, dismissSuggestions } from '@/lib/suggestion-apply';
import { declinedEverything, declinedSuggestions, dismissedTab } from '@/lib/suggestion-declined';
import { suggestionsInTimeline, type SuggestionElement } from '@/lib/suggestion-hints';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The Event Storming family's code (docs/specs/016-platform/web-performance.md), reached through useSuggestionActions
// and the registry at the press; never imported statically.
//
// The suggestion acts on an event-storming board (docs/specs/021-event-storming/suggestions.md "Applying and
// dismissing"): apply, dismiss, Apply All, Dismiss All, for suggested notes and suggested candidate contexts alike
// (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and decides"). Each is ONE commit through
// the ordinary choke point, so layer stamping, autosave, realtime and a single Undo work as for any change; the board
// each act leaves is decided by the pure `lib/suggestion-apply` and the document's context writes. A dismissal
// commits the tab, because it is remembered as declined in the same step
// (docs/specs/021-event-storming/asks.md "What was declined"). Apply All and Dismiss All take the board's name
// suggestions and note changes with them (docs/specs/021-event-storming/suggested-changes.md "Accepting"), and the
// open lane plan: Apply All applies it first, Dismiss All removes it, unremembered
// (docs/specs/021-event-storming/lane-plans.md "How a person sees and decides").

export type SuggestionActionsDeps = {
  activeTab: Tab;
  // The creation gate (a view-only session, a locked tab, a hidden or locked active layer): every act reshapes.
  createBlocked: boolean;
  layerInertIds: ReadonlySet<ElementId>;
  commit: (mapper: (els: Element[]) => Element[]) => void;
  // One undoable step over the whole tab: its elements and what it remembers as declined, together.
  commitTab: (mapTab: (tab: Tab) => Tab) => void;
  // Select one element; an applied note is selected, never opened for typing (its words were already chosen).
  select: (id: ElementId) => void;
};

export type SuggestionActions = {
  apply: (id: ElementId) => void;
  dismiss: (id: ElementId) => void;
  applyAll: () => void;
  dismissAll: () => void;
};

const refuse = (reason: 'blocked' | 'not-a-suggestion') =>
  debugLog('[suggestions] refused', { reason });

const suggestedContextIds = (elements: readonly Element[]) =>
  elements.filter(isSuggestedContext).map((el) => el.id);

// The board with every open suggestion gone: notes, contexts, names, note changes and the lane plan.
const withoutEverything = (elements: Element[]) =>
  withoutLanePlans(
    withoutSuggestedChanges(
      removeContexts(
        dismissSuggestions(
          elements,
          elements.filter(isSuggestion).map((el) => el.id),
        ),
        suggestedContextIds(elements),
      ),
    ),
  );

export function suggestionVerbs({
  activeTab,
  createBlocked,
  layerInertIds,
  commit,
  commitTab,
  select,
}: SuggestionActionsDeps): SuggestionActions {
  const open = () => activeTab.elements.filter(isSuggestion) as SuggestionElement[];
  // The name suggestions and note changes Apply All and Dismiss All take with them.
  const changes = () => ({
    names: nameRows(activeTab.elements).length,
    changes: changeMarks(activeTab.elements, layerInertIds).reduce(
      (sum, mark) => sum + mark.changes.length,
      0,
    ),
  });
  const find = (id: ElementId) =>
    activeTab.elements.find((el) => el.id === id && isOpenSuggestion(el));

  const guard = (ok: boolean): boolean => {
    if (createBlocked) refuse('blocked');
    else if (!ok) refuse('not-a-suggestion');
    return !createBlocked && ok;
  };

  const apply = (id: ElementId) => {
    const target = find(id);
    if (!guard(target !== undefined)) return;
    if (isSuggestedContext(target!)) {
      commit((els) => applyContextSuggestions(els, [id]));
      debugLog('[contexts] applied', { id });
      track('Canvas', 'Used', 'ContextApplied');
      return;
    }
    const s = target as SuggestionElement;
    commit((els) => applySuggestion(els, id, layerInertIds));
    debugLog('[suggestions] applied', { id, kind: s.esKind, side: s.esSuggestion.side });
    track('Canvas', 'Used', 'SuggestionApplied');
    track('Element', 'Added', 'Sticky');
    select(id);
  };

  const dismiss = (id: ElementId) => {
    const target = find(id);
    if (!guard(target !== undefined)) return;
    const remembered = (els: readonly Element[]) => declinedSuggestions(els, [id]);
    if (isSuggestedContext(target!)) {
      commitTab((tab) => dismissedTab(tab, (els) => removeContexts(els, [id]), remembered));
      debugLog('[contexts] dismissed', { id });
      track('Canvas', 'Used', 'ContextDismissed');
      return;
    }
    commitTab((tab) => dismissedTab(tab, (els) => dismissSuggestions(els, [id]), remembered));
    debugLog('[suggestions] dismissed', { count: 1 });
    track('Canvas', 'Used', 'SuggestionDismissed');
  };

  const applyAll = () => {
    // Orphans are swept, never landed: count what lands.
    const count = suggestionsInTimeline(activeTab.elements).length;
    const contexts = suggestedContextIds(activeTab.elements);
    const { names, changes: marked } = changes();
    // A stale plan is left for its row to say so: nothing is applied that the check would refuse.
    const open = openLanePlan(activeTab.elements)?.esLanePlan;
    const plan = open && checkLanePlan(activeTab, open).ok ? open : null;
    if (!guard(count + contexts.length + names + marked + (plan ? 1 : 0) > 0)) return;
    // A split's notes and a plan's lane names are named once, so the board is the same however often the commit
    // maps it.
    const partIds = Array.from({ length: marked * SPLIT_PARTS_MAX }, () => crypto.randomUUID());
    const nameIds = Array.from({ length: plan ? LANES_MAX : 0 }, () => crypto.randomUUID());
    const applyAll = (els: Element[]) => {
      let next = 0;
      let named = 0;
      // The lane plan first: everything else lands on the board it leaves.
      const planned =
        (plan &&
          applyLanePlan(
            { elements: els, layers: activeTab.layers },
            plan,
            () => nameIds[named++]!,
          )) ||
        els;
      const landed = applyContextSuggestions(
        applyAllSuggestions(planned, layerInertIds),
        suggestedContextIds(planned),
      );
      return applyFirstChanges(landed, { inertIds: layerInertIds, makeId: () => partIds[next++]! });
    };
    const applied = applyAll(activeTab.elements);
    commit((els) => applyAll(els).elements);
    debugLog('[suggestions] applied', {
      count,
      contexts: contexts.length,
      names: applied.names,
      changes: applied.changes,
      plan: plan ? 1 : 0,
    });
    track('Canvas', 'Used', 'SuggestionsAppliedAll');
    for (let i = 0; i < count + applied.added; i += 1) track('Element', 'Added', 'Sticky');
  };

  const dismissAll = () => {
    const ids = open().map((el) => el.id);
    const contexts = suggestedContextIds(activeTab.elements);
    const { names, changes: marked } = changes();
    const plan = openLanePlan(activeTab.elements) ? 1 : 0;
    if (!guard(ids.length + contexts.length + names + marked + plan > 0)) return;
    commitTab((tab) => dismissedTab(tab, withoutEverything, declinedEverything));
    debugLog('[suggestions] dismissed', {
      count: ids.length,
      contexts: contexts.length,
      names,
      changes: marked,
      plan,
    });
    track('Canvas', 'Used', 'SuggestionsDismissedAll');
  };

  return { apply, dismiss, applyAll, dismissAll };
}
