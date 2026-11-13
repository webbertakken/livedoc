import {
  applyContextSuggestions,
  isOpenSuggestion,
  isSuggestedContext,
  isSuggestion,
  removeContexts,
  type Element,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import { applyAllSuggestions, applySuggestion, dismissSuggestions } from '@/lib/suggestion-apply';
import { suggestionsInTimeline, type SuggestionElement } from '@/lib/suggestion-hints';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The suggestion acts on an event-storming board (docs/specs/021-event-storming/suggestions.md "Applying and
// dismissing"): apply, dismiss, Apply All, Dismiss All, for suggested notes and suggested candidate contexts alike
// (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and decides"). Each is ONE commit through
// the ordinary choke point, so layer stamping, autosave, realtime and a single Undo work as for any change; the board
// each act leaves is decided by the pure `lib/suggestion-apply` and the document's context writes.

type SuggestionActionsDeps = {
  activeTab: Tab;
  // The creation gate (a view-only session, a locked tab, a hidden or locked active layer): every act reshapes.
  createBlocked: boolean;
  layerInertIds: ReadonlySet<ElementId>;
  commit: (mapper: (els: Element[]) => Element[]) => void;
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

export function useSuggestionActions({
  activeTab,
  createBlocked,
  layerInertIds,
  commit,
  select,
}: SuggestionActionsDeps): SuggestionActions {
  const open = () => activeTab.elements.filter(isSuggestion) as SuggestionElement[];
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
    if (isSuggestedContext(target!)) {
      commit((els) => removeContexts(els, [id]));
      debugLog('[contexts] dismissed', { id });
      track('Canvas', 'Used', 'ContextDismissed');
      return;
    }
    commit((els) => dismissSuggestions(els, [id]));
    debugLog('[suggestions] dismissed', { count: 1 });
    track('Canvas', 'Used', 'SuggestionDismissed');
  };

  const applyAll = () => {
    // Orphans are swept, never landed: count what lands.
    const count = suggestionsInTimeline(activeTab.elements).length;
    const contexts = suggestedContextIds(activeTab.elements);
    if (!guard(count + contexts.length > 0)) return;
    commit((els) =>
      applyContextSuggestions(applyAllSuggestions(els, layerInertIds), suggestedContextIds(els)),
    );
    debugLog('[suggestions] applied', { count, contexts: contexts.length });
    track('Canvas', 'Used', 'SuggestionsAppliedAll');
    for (let i = 0; i < count; i += 1) track('Element', 'Added', 'Sticky');
  };

  const dismissAll = () => {
    const ids = open().map((el) => el.id);
    const contexts = suggestedContextIds(activeTab.elements);
    if (!guard(ids.length + contexts.length > 0)) return;
    commit((els) => removeContexts(dismissSuggestions(els, ids), suggestedContextIds(els)));
    debugLog('[suggestions] dismissed', { count: ids.length, contexts: contexts.length });
    track('Canvas', 'Used', 'SuggestionsDismissedAll');
  };

  return { apply, dismiss, applyAll, dismissAll };
}
