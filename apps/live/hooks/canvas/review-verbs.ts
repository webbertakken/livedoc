import {
  renameTerm,
  termRename,
  type Element,
  type ElementId,
  type Tab,
  type TermScope,
} from '@livedoc/document';
import type { StormGap } from '@livedoc/storm-reading';
import { debugLog } from '@/lib/debug-log';
import { buildEventStormingNote } from '@/lib/draw-commit';
import { landNoteBeside } from '@/lib/suggestion-apply';
import { track } from '@/lib/telemetry';

// The Event Storming family's code (docs/specs/016-platform/web-performance.md), reached through useReviewActions
// and the registry at the press; never imported statically.
//
// The Review panel's writes (docs/specs/021-event-storming/board-review.md "Check", board-language.md "The Language
// tab"): Add lands the note that would close a gap, Rename Term changes a term where it is used. Each is ONE commit
// through the ordinary choke point, so one Undo takes it back. An Editor's alone.

export type ReviewActionsDeps = {
  activeTab: Tab;
  // Whoever may not change the board from the panel: anyone but an Editor, and an Editor on a board that takes no
  // change (a locked tab, a hidden or locked active layer).
  blocked: boolean;
  // Elements that may not change: locked, or on a hidden or locked layer.
  layerInertIds: ReadonlySet<ElementId>;
  commit: (mapper: (els: Element[]) => Element[]) => void;
  // Selects an element just added and opens its words for typing.
  openForTyping: (id: ElementId) => void;
};

export type ReviewActions = {
  // A blank note of the gap's remedy, landed where the remedy says and opened for typing.
  addForGap: (gap: StormGap) => void;
  renameTerm: (from: string, to: string, scope: TermScope) => void;
};

export function reviewVerbs({
  activeTab,
  blocked,
  layerInertIds,
  commit,
  openForTyping,
}: ReviewActionsDeps): ReviewActions {
  const addForGap = (gap: StormGap) => {
    const remedy = gap.remedy;
    if (blocked || !remedy) return debugLog('[review] add refused', { code: gap.code });
    const note = buildEventStormingNote(remedy.kind, 0, 0, activeTab);
    const land = (els: Element[]) =>
      landNoteBeside(els, note, remedy.anchor, remedy.side, layerInertIds);
    // The note the remedy names is gone, or is no note of the board any more.
    if (land(activeTab.elements) === activeTab.elements)
      return debugLog('[review] add refused', { code: gap.code });
    track('Canvas', 'Used', 'GapNoteAdded');
    track('Element', 'Added', 'Sticky');
    commit(land);
    debugLog('[review] add', { code: gap.code });
    openForTyping(note.id);
  };

  const rename = (from: string, to: string, scope: TermScope) => {
    const change = blocked ? null : termRename(activeTab.elements, from, to, scope, layerInertIds);
    const counts = { notes: change?.notes.length ?? 0, contexts: change?.contexts.length ?? 0 };
    if (counts.notes + counts.contexts === 0)
      return debugLog('[review] rename refused', { blocked });
    track('Canvas', 'Used', 'TermRenamed');
    commit((els) => renameTerm(els, from, to, scope, layerInertIds));
    debugLog('[review] term renamed', { ...counts, scoped: scope.type !== 'board' });
  };

  return { addForGap, renameTerm: rename };
}
