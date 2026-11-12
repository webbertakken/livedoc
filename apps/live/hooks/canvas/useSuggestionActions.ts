import { isSuggestion, type Element, type ElementId, type Tab } from '@livedoc/document';
import { applyAllSuggestions, applySuggestion, dismissSuggestions } from '@/lib/suggestion-apply';
import { suggestionsInTimeline, type SuggestionElement } from '@/lib/suggestion-hints';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The suggestion acts on an event-storming board (docs/specs/021-event-storming/suggestions.md "Applying and
// dismissing"): apply, dismiss, Apply All, Dismiss All. Each is ONE commit through the ordinary choke point, so
// layer stamping, autosave, realtime and a single Undo work as for any change; the board each act leaves is decided
// by the pure `lib/suggestion-apply`.

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

export function useSuggestionActions({
  activeTab,
  createBlocked,
  layerInertIds,
  commit,
  select,
}: SuggestionActionsDeps): SuggestionActions {
  const open = () => activeTab.elements.filter(isSuggestion) as SuggestionElement[];
  const isOpen = (id: ElementId) => open().some((el) => el.id === id);

  const guard = (ok: boolean): boolean => {
    if (createBlocked) refuse('blocked');
    else if (!ok) refuse('not-a-suggestion');
    return !createBlocked && ok;
  };

  const apply = (id: ElementId) => {
    if (!guard(isOpen(id))) return;
    const s = open().find((el) => el.id === id)!;
    commit((els) => applySuggestion(els, id, layerInertIds));
    debugLog('[suggestions] applied', { id, kind: s.esKind, side: s.esSuggestion.side });
    track('Canvas', 'Used', 'SuggestionApplied');
    track('Element', 'Added', 'Sticky');
    select(id);
  };

  const dismiss = (id: ElementId) => {
    if (!guard(isOpen(id))) return;
    commit((els) => dismissSuggestions(els, [id]));
    debugLog('[suggestions] dismissed', { count: 1 });
    track('Canvas', 'Used', 'SuggestionDismissed');
  };

  const applyAll = () => {
    // Orphans are swept, never landed: count what lands.
    const count = suggestionsInTimeline(activeTab.elements).length;
    if (!guard(count > 0)) return;
    commit((els) => applyAllSuggestions(els, layerInertIds));
    debugLog('[suggestions] applied', { count });
    track('Canvas', 'Used', 'SuggestionsAppliedAll');
    for (let i = 0; i < count; i += 1) track('Element', 'Added', 'Sticky');
  };

  const dismissAll = () => {
    const ids = open().map((el) => el.id);
    if (!guard(ids.length > 0)) return;
    commit((els) => dismissSuggestions(els, ids));
    debugLog('[suggestions] dismissed', { count: ids.length });
    track('Canvas', 'Used', 'SuggestionsDismissedAll');
  };

  return { apply, dismiss, applyAll, dismissAll };
}
