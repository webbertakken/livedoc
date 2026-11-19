import {
  chooseNameSuggestion,
  declinedChange,
  dismissNameSuggestions,
  dismissNoteChange,
  type Element,
  type ElementId,
  type EsNoteChange,
  type RewordScope,
  type Tab,
} from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { acceptNoteChange } from '@/lib/suggested-changes-apply';
import { declinedNames, dismissedTab } from '@/lib/suggestion-declined';
import { track } from '@/lib/telemetry';

// The Event Storming family's code (docs/specs/016-platform/web-performance.md), reached through useChangeActions
// and the registry at the press; never imported statically.
//
// The acts on an event-storming board's suggested changes (docs/specs/021-event-storming/suggested-changes.md "How a
// person sees and decides", "Accepting"): choose or dismiss a context's suggested names, accept or dismiss a note
// change. Each is ONE step through the ordinary choke point, so one Undo takes it back: accepting commits the
// elements, and a dismissal commits the tab, because it is remembered as declined in the same step
// (docs/specs/021-event-storming/asks.md "What was declined"). The board each leaves is the document's own writes.

export type ChangeActionsDeps = {
  activeTab: Tab;
  // The creation gate (a view-only session, a locked tab, a hidden or locked active layer): every act reshapes.
  createBlocked: boolean;
  layerInertIds: ReadonlySet<ElementId>;
  commit: (mapper: (els: Element[]) => Element[]) => void;
  // One undoable step over the whole tab: its elements and what it remembers as declined, together.
  commitTab: (mapTab: (tab: Tab) => Tab) => void;
};

export type ChangeActions = {
  // A suggested name chosen: one context renamed, or several merged under it. Answers the context kept, or null
  // when nothing was chosen.
  chooseName: (contextIds: readonly ElementId[], name: string) => ElementId | null;
  // The names suggested for exactly these contexts dismissed: all of them, or only those given.
  dismissNames: (contextIds: readonly ElementId[], names?: readonly string[]) => void;
  // A reword reaches its note's context unless `scope` says the whole board (Everywhere).
  acceptChange: (noteId: ElementId, change: EsNoteChange, scope?: RewordScope) => void;
  dismissChange: (noteId: ElementId, change: EsNoteChange) => void;
};

type Refusal = 'blocked' | 'not-suggested';
const refuse = (reason: Refusal) => debugLog('[changes] refused', { reason });

export function changeVerbs({
  activeTab,
  createBlocked,
  layerInertIds,
  commit,
  commitTab,
}: ChangeActionsDeps): ChangeActions {
  const guard = (ok: boolean): boolean => {
    if (createBlocked) refuse('blocked');
    else if (!ok) refuse('not-suggested');
    return !createBlocked && ok;
  };

  const chooseName = (contextIds: readonly ElementId[], name: string) => {
    const { keptId } = chooseNameSuggestion(activeTab.elements, contextIds, name);
    if (!guard(keptId !== null)) return null;
    commit((els) => chooseNameSuggestion(els, contextIds, name).elements);
    const merged = new Set(contextIds).size > 1;
    debugLog('[changes] name chosen', { contexts: new Set(contextIds).size, merged });
    track('Canvas', 'Used', 'NameSuggestionApplied');
    if (merged) track('Canvas', 'Used', 'ContextsMerged');
    return keptId;
  };

  const dismissNames = (contextIds: readonly ElementId[], names?: readonly string[]) => {
    const dropped = declinedNames(activeTab.elements, contextIds, names);
    if (!guard(dropped.length > 0)) return;
    commitTab((tab) =>
      dismissedTab(
        tab,
        (els) => dismissNameSuggestions(els, contextIds, names),
        (els) => declinedNames(els, contextIds, names),
      ),
    );
    debugLog('[changes] names dismissed', {
      contexts: new Set(contextIds).size,
      names: dropped.length,
    });
    track('Canvas', 'Used', 'NameSuggestionDismissed');
  };

  const acceptChange = (
    noteId: ElementId,
    change: EsNoteChange,
    scope: RewordScope = 'context',
  ) => {
    // A split's notes are named once, so the board is the same however often the commit maps it.
    const partIds =
      change.change === 'split' ? change.parts.slice(1).map(() => crypto.randomUUID()) : [];
    const accept = (els: Element[]) => {
      let next = 0;
      return acceptNoteChange(els, noteId, change, scope, {
        inertIds: layerInertIds,
        makeId: () => partIds[next++]!,
      });
    };
    const accepted = accept(activeTab.elements);
    if (!guard(accepted.elements !== activeTab.elements)) return;
    commit((els) => accept(els).elements);
    debugLog('[changes] accepted', { change: change.change, scope, added: accepted.added });
    track('Canvas', 'Used', 'NoteChangeApplied');
    for (let i = 0; i < accepted.added; i += 1) track('Element', 'Added', 'Sticky');
  };

  const dismissChange = (noteId: ElementId, change: EsNoteChange) => {
    const dismissed = dismissNoteChange(activeTab.elements, noteId, change);
    if (!guard(dismissed !== activeTab.elements)) return;
    commitTab((tab) =>
      dismissedTab(
        tab,
        (els) => dismissNoteChange(els, noteId, change),
        () => [declinedChange(noteId, change)],
      ),
    );
    debugLog('[changes] dismissed', { change: change.change });
    track('Canvas', 'Used', 'NoteChangeDismissed');
  };

  return { chooseName, dismissNames, acceptChange, dismissChange };
}
