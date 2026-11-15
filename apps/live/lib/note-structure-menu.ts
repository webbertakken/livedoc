import {
  answerOf,
  eventStormingKindOf,
  isPivotalEvent,
  type Element,
  type ElementId,
} from '@livedoc/document';
import { laneNameSpot } from '@livedoc/storm-reading';

// What a workshop note's menu offers about the board's structure (docs/specs/021-event-storming/board-structure.md
// "Pivotal events", "Lane names", "Hotspot answers"): a domain event is marked pivotal or unmarked, a hotspot is
// answered, and the lane any workshop note stands on is named. Null for anything that is not a workshop note.

export type NoteStructureMenu = {
  // A domain event: whether it is pivotal now, and the act that turns it.
  pivotal: { on: boolean; onToggle: () => void } | null;
  // A hotspot: whether it holds an answer, and the act that opens it for typing.
  answer: { answered: boolean; onOpen: () => void } | null;
  // The note's lane: whether it has a name now, and the act that opens one for typing.
  lane: { named: boolean; onName: () => void };
};

export function noteStructureMenu(
  elements: readonly Element[],
  noteId: ElementId,
  acts: {
    setPivotal: (id: ElementId, on: boolean) => void;
    openAnswer: (id: ElementId) => void;
    nameLane: (id: ElementId) => void;
  },
): NoteStructureMenu | null {
  const note = elements.find((el) => el.id === noteId);
  const spot = laneNameSpot({ elements: [...elements] }, noteId);
  if (!note || !spot) return null;
  const kind = eventStormingKindOf(note);
  const on = isPivotalEvent(note);
  return {
    pivotal: kind === 'domain-event' ? { on, onToggle: () => acts.setPivotal(noteId, !on) } : null,
    answer:
      kind === 'hotspot'
        ? { answered: answerOf(note) !== '', onOpen: () => acts.openAnswer(noteId) }
        : null,
    lane: { named: spot.text !== null, onName: () => acts.nameLane(noteId) },
  };
}
