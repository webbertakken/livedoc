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
// "Its notes change two ways", "Making one by hand"): the board's kept contexts by name, the one the note is in, and
// the acts on it, New Context among them. Null for anything that is not a workshop note.
export function noteContextMenu(
  elements: readonly Element[],
  noteId: ElementId,
  acts: {
    addNotes: (contextId: ElementId, noteIds: readonly ElementId[]) => void;
    removeNotes: (noteIds: readonly ElementId[]) => void;
    create: (noteIds: readonly ElementId[], how: 'selection' | 'drawn') => ElementId | null;
  },
  // Opens a new context's name for typing.
  onCreated: (contextId: ElementId) => void = () => {},
): NoteContextsMenu | null {
  const note = elements.find((el) => el.id === noteId);
  if (!note || eventStormingKindOf(note) === null) return null;
  const contexts = candidateContexts(elements)
    .filter(isKeptContext)
    .map((c) => ({ id: c.id, name: c.label }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const holder = contextOf(elements, noteId);
  return {
    contexts,
    currentId: holder && isKeptContext(holder) ? holder.id : null,
    onAdd: (contextId) => acts.addNotes(contextId, [noteId]),
    onRemove: () => acts.removeNotes([noteId]),
    onCreate: () => {
      const made = acts.create([noteId], 'selection');
      if (made) onCreated(made);
    },
  };
}
