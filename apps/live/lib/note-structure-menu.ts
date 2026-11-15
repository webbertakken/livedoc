import {
  answerOf,
  eventStormingKindOf,
  isPivotalEvent,
  type Element,
  type ElementId,
} from '@livedoc/document';

// What a workshop note's menu offers about the board's structure (docs/specs/021-event-storming/board-structure.md
// "Pivotal events", "Hotspot answers"): a domain event is marked pivotal or unmarked, a hotspot is answered. Null
// for a note that offers neither, and for anything that is not a workshop note.

export type NoteStructureMenu = {
  // A domain event: whether it is pivotal now, and the act that turns it.
  pivotal: { on: boolean; onToggle: () => void } | null;
  // A hotspot: whether it holds an answer, and the act that opens it for typing.
  answer: { answered: boolean; onOpen: () => void } | null;
};

export function noteStructureMenu(
  elements: readonly Element[],
  noteId: ElementId,
  acts: {
    setPivotal: (id: ElementId, on: boolean) => void;
    openAnswer: (id: ElementId) => void;
  },
): NoteStructureMenu | null {
  const note = elements.find((el) => el.id === noteId);
  const kind = note ? eventStormingKindOf(note) : null;
  if (!note || (kind !== 'domain-event' && kind !== 'hotspot')) return null;
  if (kind === 'hotspot')
    return {
      pivotal: null,
      answer: { answered: answerOf(note) !== '', onOpen: () => acts.openAnswer(noteId) },
    };
  const on = isPivotalEvent(note);
  return { pivotal: { on, onToggle: () => acts.setPivotal(noteId, !on) }, answer: null };
}
