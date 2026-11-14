// Note changes on an event-storming board (docs/specs/021-event-storming/suggested-changes.md "Note changes"): a
// change an agent proposes to one workshop note (other words, another kind, a split, taking it off the board). They
// live on the note (`esChanges`), so they travel and go with it; nothing on the board changes until a person accepts
// one (note-change-accept.ts). Pure: every write answers the board after it, unchanged (the same array) when nothing
// changes.

import {
  EVENT_STORMING_NOTES,
  eventStormingKindOf,
  type EventStormingNoteKind,
} from './event-storming';
import { SUGGESTION_BY_MAX, SUGGESTION_REASON_MAX } from './event-storming-suggestions';
import { isValidTerm } from './event-storming-terms';
import { sameWords } from './event-storming-words';
import type { Element, ElementId, StickyElement } from './index';

/** The most changes one note holds (safe range: 2 to 8; the mark previews the first). */
export const NOTE_CHANGES_MAX = 4;
/** The most notes a split proposes, the note itself included (safe range: 2 to 6). */
export const SPLIT_PARTS_MAX = 4;
/** The longest words a reword or a split part proposes, characters: what still reads on a note (safe range: 80 to 400). */
export const NOTE_CHANGE_WORDS_MAX = 200;

export const NOTE_CHANGE_TYPES = ['reword', 'kind', 'split', 'remove'] as const;
export type NoteChangeType = (typeof NOTE_CHANGE_TYPES)[number];

// Why, in the agent's words, and who suggested it.
type Why = { reason?: string; by?: string };

/** Other words for the note; with `term` and `to`, a term that changes wherever the board holds it. */
export type EsRewordChange = Why & { change: 'reword'; words: string; term?: string; to?: string };
export type EsKindChange = Why & { change: 'kind'; kind: EventStormingNoteKind };
/** Several notes for one that holds several facts: the note keeps the first part. */
export type EsSplitChange = Why & { change: 'split'; parts: string[] };
export type EsRemoveChange = Why & { change: 'remove' };
export type EsNoteChange = EsRewordChange | EsKindChange | EsSplitChange | EsRemoveChange;

const optionalText = (v: unknown, max: number) =>
  v === undefined || (typeof v === 'string' && v.length <= max);

const isWords = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= NOTE_CHANGE_WORDS_MAX;

function isValidChangeBody(c: Record<string, unknown>): boolean {
  switch (c.change) {
    case 'reword':
      return (
        isWords(c.words) &&
        (c.term === undefined) === (c.to === undefined) &&
        (c.term === undefined || (isValidTerm(c.term) && isValidTerm(c.to)))
      );
    case 'kind':
      return EVENT_STORMING_NOTES.some((n) => n.kind === c.kind);
    case 'split':
      return (
        Array.isArray(c.parts) &&
        c.parts.length >= 2 &&
        c.parts.length <= SPLIT_PARTS_MAX &&
        c.parts.every(isWords)
      );
    default:
      return c.change === 'remove';
  }
}

export function isValidEsNoteChange(v: unknown): v is EsNoteChange {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    isValidChangeBody(c) &&
    optionalText(c.reason, SUGGESTION_REASON_MAX) &&
    optionalText(c.by, SUGGESTION_BY_MAX)
  );
}

/** The changes a note may hold: at most NOTE_CHANGES_MAX, each one of the four. */
export function isValidEsChanges(v: unknown): v is EsNoteChange[] {
  return Array.isArray(v) && v.length <= NOTE_CHANGES_MAX && v.every(isValidEsNoteChange);
}

type Changed = Parameters<typeof eventStormingKindOf>[0] & { esChanges?: unknown };

/** The changes suggested on a workshop note; none on a suggestion, a plain sticky or anything else. */
export function noteChangesOf(el: Changed): EsNoteChange[] {
  if (eventStormingKindOf(el) === null || !Array.isArray(el.esChanges)) return [];
  return el.esChanges.filter(isValidEsNoteChange);
}

/** Two changes that propose the same: the same words (case, punctuation and spacing aside), kind or parts. */
export function sameNoteChange(a: EsNoteChange, b: EsNoteChange): boolean {
  if (a.change === 'reword' && b.change === 'reword') return sameWords(a.words, b.words);
  if (a.change === 'kind' && b.change === 'kind') return a.kind === b.kind;
  if (a.change === 'split' && b.change === 'split')
    return (
      a.parts.length === b.parts.length && a.parts.every((part, i) => sameWords(part, b.parts[i]!))
    );
  return a.change === 'remove' && b.change === 'remove';
}

/** How many note changes are open on the board. */
export function openNoteChanges(elements: readonly Element[]): number {
  return elements.reduce((sum, el) => sum + noteChangesOf(el).length, 0);
}

/** The note with its changes set to `changes`, the field gone when none are left. */
export function withNoteChanges<T extends StickyElement>(
  note: T,
  changes: readonly EsNoteChange[],
): T {
  const { esChanges: _dropped, ...rest } = note;
  return (changes.length ? { ...rest, esChanges: [...changes] } : rest) as T;
}

// One workshop note's changes rewritten by `next` (null changes nothing); the same array when nothing changed.
function rewrite(
  elements: Element[],
  noteId: ElementId,
  next: (changes: EsNoteChange[]) => EsNoteChange[] | null,
): Element[] {
  const index = elements.findIndex((el) => el.id === noteId);
  const el = elements[index];
  if (!el || el.type !== 'sticky' || eventStormingKindOf(el) === null) return elements;
  const changes = next(noteChangesOf(el));
  if (changes === null) return elements;
  const out = [...elements];
  out[index] = withNoteChanges(el, changes);
  return out;
}

/** A change suggested on a workshop note. Unchanged for anything else, or a note that holds NOTE_CHANGES_MAX. */
export function addNoteChange(
  elements: Element[],
  noteId: ElementId,
  change: EsNoteChange,
): Element[] {
  return rewrite(elements, noteId, (held) =>
    held.length >= NOTE_CHANGES_MAX ? null : [...held, change],
  );
}

/** The note's changes without those `drop` names; unchanged when it names none. */
export function dropNoteChanges(
  elements: Element[],
  noteId: ElementId,
  drop: (change: EsNoteChange) => boolean,
): Element[] {
  return rewrite(elements, noteId, (held) => {
    const kept = held.filter((c) => !drop(c));
    return kept.length === held.length ? null : kept;
  });
}

/** One suggested change dismissed. */
export function dismissNoteChange(
  elements: Element[],
  noteId: ElementId,
  change: EsNoteChange,
): Element[] {
  return dropNoteChanges(elements, noteId, (c) => sameNoteChange(c, change));
}

/** Every change a note holds dropped: Dismiss All, and how an agent takes its own back. */
export function withoutNoteChanges(elements: Element[], noteId: ElementId): Element[] {
  return dropNoteChanges(elements, noteId, () => true);
}
