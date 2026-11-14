import {
  contextOf,
  eventStormingKindOf,
  joinContext,
  type Element,
  type ElementId,
} from '@livedoc/document';
import { judgeContexts, smallestHolding } from './context-drop';

// A note arriving in a candidate context (docs/specs/021-event-storming/candidate-contexts.md "Arriving in a
// context"). Pure: the add paths name what the note was added beside, and the board answers which context, kept or
// suggested, it joins, so the note and its membership land as one change.

export type ArrivalHint = {
  // The note it was added from: a next-note button's note, or an applied suggestion's anchor.
  beside?: ElementId;
  // The notes either side of an Alt insertion.
  between?: readonly [ElementId | null, ElementId | null];
};

function sharedContext(board: readonly Element[], hint: ArrivalHint): ElementId | null {
  if (hint.beside) return contextOf(board, hint.beside)?.id ?? null;
  const [left, right] = hint.between ?? [null, null];
  if (!left || !right) return null;
  const context = contextOf(board, left);
  return context && context.id === contextOf(board, right)?.id ? context.id : null;
}

/** The context a new note joins, or null when it arrives in none. */
export function contextForArrival(
  board: readonly Element[],
  noteId: ElementId,
  hint: ArrivalHint,
): ElementId | null {
  const note = board.find((el) => el.id === noteId);
  if (!note || note.type !== 'sticky' || eventStormingKindOf(note) === null) return null;
  if (contextOf(board, noteId)) return null;
  const shared = sharedContext(board, hint);
  if (shared) return shared;
  const byId = new Map(board.map((el) => [el.id, el] as const));
  const centre = { x: note.x + note.width / 2, y: note.y + note.height / 2 };
  return smallestHolding(judgeContexts(byId, new Set([noteId])), centre)?.context.id ?? null;
}

/** The board with the new note in the context it arrives in; the same board when it arrives in none. */
export function joinArrival(board: Element[], noteId: ElementId, hint: ArrivalHint): Element[] {
  const contextId = contextForArrival(board, noteId, hint);
  return contextId ? joinContext(board, contextId, [noteId]) : board;
}
