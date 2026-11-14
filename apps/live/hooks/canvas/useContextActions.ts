import {
  contextOf,
  createContext,
  isCandidateContext,
  isKeptContext,
  mergeContexts,
  joinContext,
  leaveContext,
  removeContexts,
  renameContext,
  type Element,
  type ElementId,
  type Tab,
} from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

// The acts on a kept candidate context (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and
// decides"): rename it, delete it, and change its notes from a note's menu. Each is ONE commit through the ordinary
// choke point, so one Undo takes it back; the board each leaves is the document's own context writes. Joining and
// leaving by dragging ride the drag's own change (context-drop-on-release.ts).

type ContextActionsDeps = {
  activeTab: Tab;
  // The creation gate (a view-only session, a locked tab, a hidden or locked active layer): every act reshapes.
  createBlocked: boolean;
  commit: (mapper: (els: Element[]) => Element[]) => void;
};

export type ContextActions = {
  rename: (id: ElementId, name: string) => void;
  remove: (id: ElementId) => void;
  // Notes join a kept context, leaving any other.
  addNotes: (contextId: ElementId, noteIds: readonly ElementId[]) => void;
  // Notes leave whatever context holds them.
  removeNotes: (noteIds: readonly ElementId[]) => void;
  // Contexts merged into one; answers the id of the one kept, or null when nothing was merged.
  merge: (ids: readonly ElementId[]) => ElementId | null;
  // A kept context made round some notes, from a selection or a drawn loop; answers its id, or null when none of
  // them is a workshop note (candidate-contexts.md "Making one by hand").
  create: (noteIds: readonly ElementId[], how: 'selection' | 'drawn') => ElementId | null;
};

/** What a context made by hand is called until its maker names it. */
export const NEW_CONTEXT_NAME = 'New context';

type Refusal =
  | 'blocked'
  | 'not-a-kept-context'
  | 'not-a-context'
  | 'unchanged'
  | 'not-in-a-context'
  | 'too-few'
  | 'no-notes';
const refuse = (reason: Refusal) => debugLog('[contexts] refused', { reason });

export function useContextActions({
  activeTab,
  createBlocked,
  commit,
}: ContextActionsDeps): ContextActions {
  const kept = (id: ElementId) =>
    activeTab.elements.some((el) => el.id === id && isKeptContext(el));
  const guard = (ok: boolean, reason: Refusal): boolean => {
    if (createBlocked) refuse('blocked');
    else if (!ok) refuse(reason);
    return !createBlocked && ok;
  };

  // Any context may be renamed: a merged suggestion is named before it is applied.
  const rename = (id: ElementId, name: string) => {
    const any = activeTab.elements.some((el) => el.id === id && isCandidateContext(el));
    if (!guard(any, 'not-a-context')) return;
    const renamed = renameContext(activeTab.elements, id, name);
    if (!guard(renamed !== activeTab.elements, 'unchanged')) return;
    commit((els) => renameContext(els, id, name));
    debugLog('[contexts] renamed', { id });
    track('Canvas', 'Used', 'ContextRenamed');
  };

  const remove = (id: ElementId) => {
    if (!guard(kept(id), 'not-a-kept-context')) return;
    commit((els) => removeContexts(els, [id]));
    debugLog('[contexts] deleted', { id });
    track('Canvas', 'Used', 'ContextDeleted');
  };

  const addNotes = (contextId: ElementId, noteIds: readonly ElementId[]) => {
    if (!guard(kept(contextId), 'not-a-kept-context')) return;
    const joined = joinContext(activeTab.elements, contextId, noteIds);
    if (!guard(joined !== activeTab.elements, 'unchanged')) return;
    const fresh = noteIds.filter((id) => contextOf(activeTab.elements, id)?.id !== contextId);
    commit((els) => joinContext(els, contextId, noteIds));
    debugLog('[contexts] joined', { contextId, notes: fresh.length });
    fresh.forEach(() => track('Canvas', 'Used', 'ContextNoteJoined'));
  };

  const removeNotes = (noteIds: readonly ElementId[]) => {
    const held = noteIds.filter((id) => contextOf(activeTab.elements, id) !== null);
    if (!guard(held.length > 0, 'not-in-a-context')) return;
    commit((els) => leaveContext(els, held));
    debugLog('[contexts] left', { notes: held.length });
    held.forEach(() => track('Canvas', 'Used', 'ContextNoteLeft'));
  };

  const merge = (ids: readonly ElementId[]) => {
    const { keptId } = mergeContexts(activeTab.elements, ids);
    if (!guard(keptId !== null, 'too-few')) return null;
    commit((els) => mergeContexts(els, ids).elements);
    debugLog('[contexts] merged', { count: ids.length, keptId });
    track('Canvas', 'Used', 'ContextsMerged');
    return keptId;
  };

  const create = (noteIds: readonly ElementId[], how: 'selection' | 'drawn') => {
    const id = crypto.randomUUID();
    const made = createContext(activeTab.elements, id, NEW_CONTEXT_NAME, noteIds);
    if (!guard(made !== activeTab.elements, 'no-notes')) return null;
    commit((els) => createContext(els, id, NEW_CONTEXT_NAME, noteIds));
    debugLog('[contexts] created', { id, how, notes: noteIds.length });
    track('Canvas', 'Used', how === 'drawn' ? 'ContextDrawn' : 'ContextCreated');
    return id;
  };

  return { rename, remove, addNotes, removeNotes, merge, create };
}
