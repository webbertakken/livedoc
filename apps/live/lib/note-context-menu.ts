import {
  candidateContexts,
  contextOf,
  eventStormingKindOf,
  isKeptContext,
  type Element,
  type ElementId,
} from '@livedoc/document';
import type { NoteContextsMenu } from '@/components/palette/EditorContextMenu.types';

// What a workshop note's menu offers about candidate contexts (docs/specs/021-event-storming/candidate-contexts.md
// "Its notes change two ways"): the board's kept contexts by name, the one the note is in, and the acts on it. Null
// for anything that is not a workshop note, and when there is nothing to offer (no kept context on the board).
export function noteContextMenu(
  elements: readonly Element[],
  noteId: ElementId,
  acts: {
    addNotes: (contextId: ElementId, noteIds: readonly ElementId[]) => void;
    removeNotes: (noteIds: readonly ElementId[]) => void;
  },
): NoteContextsMenu | null {
  const note = elements.find((el) => el.id === noteId);
  if (!note || eventStormingKindOf(note) === null) return null;
  const contexts = candidateContexts(elements)
    .filter(isKeptContext)
    .map((c) => ({ id: c.id, name: c.label }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (contexts.length === 0) return null;
  const holder = contextOf(elements, noteId);
  return {
    contexts,
    currentId: holder && isKeptContext(holder) ? holder.id : null,
    onAdd: (contextId) => acts.addNotes(contextId, [noteId]),
    onRemove: () => acts.removeNotes([noteId]),
  };
}
