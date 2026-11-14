import {
  acceptKindChange,
  acceptRemoval,
  acceptReword,
  acceptSplit,
  candidateContexts,
  chooseNameSuggestion,
  contextOf,
  joinContext,
  nameSuggestionsFor,
  noteChangesOf,
  withoutNameSuggestions,
  withoutNoteChanges,
  type Element,
  type ElementId,
  type EsNoteChange,
  type EsSplitChange,
  type RewordScope,
} from '@livedoc/document';
import { applySuggestion } from './suggestion-apply';
import { changeMarks } from './suggested-changes';

// Accepting suggested changes on the board (docs/specs/021-event-storming/suggested-changes.md "Accepting"). Pure:
// each answers the board after the act, so the act is one commit through the ordinary choke point and one Undo puts
// the board back. The document decides what a reword, a kind change and a removal leave; a split's further parts land
// here, exactly as an applied `after` suggestion lands, because where a note lands is the editor's to say.

export type AcceptOptions = {
  // Elements on hidden or locked layers: never what the board opens around.
  inertIds: ReadonlySet<ElementId>;
  makeId: () => ElementId;
};

/** A split accepted and landed: the note keeps the first part, and each further part is a note of its kind after it,
 *  in the note's candidate context. `partIds` are the notes added, in order. */
export function landSplit(
  elements: Element[],
  noteId: ElementId,
  change: EsSplitChange,
  { inertIds, makeId }: AcceptOptions,
): { elements: Element[]; partIds: ElementId[] } {
  const split = acceptSplit(elements, noteId, change, makeId);
  let board = split.elements;
  for (const id of split.partIds) board = applySuggestion(board, id, inertIds);
  const context = contextOf(board, noteId);
  if (context) board = joinContext(board, context.id, split.partIds);
  return { elements: board, partIds: split.partIds };
}

/** One suggested change accepted: the board after it and how many notes it added. The same board when the note no
 *  longer holds that change. */
export function acceptNoteChange(
  elements: Element[],
  noteId: ElementId,
  change: EsNoteChange,
  scope: RewordScope,
  options: AcceptOptions,
): { elements: Element[]; added: number } {
  switch (change.change) {
    case 'reword':
      return { elements: acceptReword(elements, noteId, change, scope), added: 0 };
    case 'kind':
      return { elements: acceptKindChange(elements, noteId, change), added: 0 };
    case 'remove':
      return { elements: acceptRemoval(elements, noteId), added: 0 };
    case 'split': {
      const landed = landSplit(elements, noteId, change, options);
      return { elements: landed.elements, added: landed.partIds.length };
    }
  }
}

/** What Apply All takes of the suggested changes: each context's first name for itself, then each note's first
 *  change along the timeline (a reword in its context's scope), each on the board the one before left. A merge's
 *  name is left for the person to choose. */
export function applyFirstChanges(
  elements: Element[],
  options: AcceptOptions,
): { elements: Element[]; names: number; changes: number; added: number } {
  let board = elements;
  let names = 0;
  for (const context of candidateContexts(elements)) {
    const [first] = nameSuggestionsFor(board, [context.id]);
    if (!first) continue;
    board = chooseNameSuggestion(board, [context.id], first.name).elements;
    names += 1;
  }
  let changes = 0;
  let added = 0;
  for (const mark of changeMarks(elements, options.inertIds)) {
    const out = acceptNoteChange(board, mark.note.id, mark.changes[0]!, 'context', options);
    if (out.elements === board) continue;
    board = out.elements;
    changes += 1;
    added += out.added;
  }
  return { elements: board, names, changes, added };
}

/** The board with every name suggestion and every note change dropped: what Dismiss All leaves of them. The same
 *  board when it holds none. */
export function withoutSuggestedChanges(elements: Element[]): Element[] {
  let board = elements;
  for (const context of candidateContexts(elements))
    board = withoutNameSuggestions(board, context.id);
  for (const el of elements)
    if (noteChangesOf(el).length > 0) board = withoutNoteChanges(board, el.id);
  return board;
}
