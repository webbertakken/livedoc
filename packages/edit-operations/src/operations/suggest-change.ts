// The note changes (docs/specs/021-event-storming/suggested-changes.md "Note changes"): `suggest-reword <note>
// "<words>" [term=… to=…]`, `suggest-kind <note> <kind>`, `suggest-split <note> "<words>" "<words>"…` and
// `suggest-remove <note>`, each with `reason=`. A change is kept on its note (`esChanges`); the note itself is
// untouched until a person accepts it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  declinedChange,
  EVENT_STORMING_NOTES,
  eventStormingKindOf,
  holdsTerm,
  isSuggestion,
  isValidTerm,
  NOTE_CHANGE_WORDS_MAX,
  NOTE_CHANGES_MAX,
  noteChangesOf,
  sameNoteChange,
  SPLIT_PARTS_MAX,
  TERM_MAX,
  withNoteChanges,
  type EsNoteChange,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { resolveOne } from '../selectors';
import { refsOf, refuseLocked, writeFields, type EditState } from '../state';
import type { SuggestChangeOperation } from '../types';
import {
  boardFull,
  declinedBefore,
  notABoard,
  reasonTooLong,
  refusal,
  tidy,
  whyAndWho,
} from './suggestion-rules';

const KINDS = EVENT_STORMING_NOTES.map((n) => n.kind);

// Words a change proposes: some, and no more than fit a note.
function wordsRefusal(words: string, operation: number, what: string): EditRejection | null {
  if (!words) return refusal('words_required', operation, [`${what} needs words`]);
  if (words.length > NOTE_CHANGE_WORDS_MAX)
    return refusal('invalid_value', operation, [
      `${what} is ${words.length} characters; at most ${NOTE_CHANGE_WORDS_MAX}`,
    ]);
  return null;
}

// The change an operation proposes, its words tidied and checked; the first refusal otherwise.
function changeOf(op: SuggestChangeOperation, operation: number): EsNoteChange | EditRejection {
  switch (op.op) {
    case 'suggest-reword': {
      const words = tidy(op.words);
      const refused = wordsRefusal(words, operation, 'a reword');
      if (refused) return refused;
      if (op.term === undefined || op.to === undefined) return { change: 'reword', words };
      const [term, to] = [tidy(op.term), tidy(op.to)];
      if (!isValidTerm(term) || !isValidTerm(to))
        return refusal('invalid_value', operation, [
          `term and to are each 1 to ${TERM_MAX} characters`,
        ]);
      return { change: 'reword', words, term, to };
    }
    case 'suggest-kind':
      if (!KINDS.includes(op.kind as EventStormingNoteKind))
        return refusal('invalid_kind', operation, [
          `"${op.kind}" is not a note kind`,
          `kinds: ${KINDS.join(', ')}`,
        ]);
      return { change: 'kind', kind: op.kind as EventStormingNoteKind };
    case 'suggest-split': {
      const parts = op.parts.map(tidy);
      if (parts.length < 2 || parts.length > SPLIT_PARTS_MAX)
        return refusal('parts_required', operation, [
          `a split proposes 2 to ${SPLIT_PARTS_MAX} notes; ${parts.length} given`,
        ]);
      for (const part of parts) {
        const refused = wordsRefusal(part, operation, 'a part of a split');
        if (refused) return refused;
      }
      return { change: 'split', parts };
    }
    case 'suggest-remove':
      return { change: 'remove' };
  }
}

// What makes no sense on this note: the kind it already is, the words it already says, a term that is not there.
function senseRefusal(
  note: StickyElement,
  ref: string,
  change: EsNoteChange,
  operation: number,
): EditRejection | null {
  if (change.change === 'kind' && eventStormingKindOf(note) === change.kind)
    return refusal('same_kind', operation, [`${ref} is a ${change.kind} already`]);
  if (change.change !== 'reword') return null;
  const says = tidy(note.label ?? '');
  if (says === change.words)
    return refusal('duplicate_suggestion', operation, [`${ref} says "${says}" already`]);
  if (change.term === undefined || change.to === undefined) return null;
  if (!holdsTerm(says, change.term))
    return refusal(
      'term_not_in_words',
      operation,
      [`"${change.term}" is not in what ${ref} says: "${says}"`],
      'term names a word the note holds now; leave term and to out to reword this note alone',
    );
  if (!holdsTerm(change.words, change.to))
    return refusal('term_not_in_words', operation, [
      `"${change.to}" is not in the suggested words: "${change.words}"`,
    ]);
  return null;
}

export function applySuggestChange(
  state: EditState,
  op: SuggestChangeOperation,
  operation: number,
): EditRejection | null {
  const board = notABoard(state, operation, 'suggested changes');
  if (board) return board;
  const change = changeOf(op, operation);
  if ('code' in change) return change;
  const long = reasonTooLong(op.reason, operation);
  if (long) return long;

  const resolved = resolveOne(state, op.note, operation);
  if ('rejection' in resolved) return resolved.rejection;
  const note = resolved.el;
  const ref = refsOf(state).refOf(note.id);
  if (note.type !== 'sticky' || eventStormingKindOf(note) === null)
    return refusal(
      'note_not_a_note',
      operation,
      [`${ref} is not a workshop note`],
      isSuggestion(note)
        ? 'a suggestion is not a note yet: suggest it again in other words'
        : undefined,
    );
  const lock = state.locked.get(note.id);
  if (lock) return refuseLocked(state, op.op, operation, note, lock);
  const senseless = senseRefusal(note, ref, change, operation);
  if (senseless) return senseless;

  const held = noteChangesOf(note);
  if (held.some((c) => sameNoteChange(c, change)))
    return refusal('duplicate_suggestion', operation, [
      `${ref} already holds that ${change.change}`,
    ]);
  if (held.length >= NOTE_CHANGES_MAX)
    return refusal(
      'too_many_suggestions',
      operation,
      [`${ref} holds ${held.length} suggested changes; at most ${NOTE_CHANGES_MAX}`],
      'wait for a person to accept or dismiss them',
    );
  const full = boardFull(state, operation);
  if (full) return full;
  const declined = declinedBefore(
    state,
    declinedChange(note.id, change),
    operation,
    `that ${change.change} of ${ref}`,
  );
  if (declined) return declined;

  const proposed: EsNoteChange = { ...change, ...whyAndWho(state, op.reason) };
  writeFields(state, withNoteChanges(note, [...held, proposed]), operation, ['esChanges']);
  state.log('[edit-ops] suggested change', { operation, change: change.change });
  return null;
}
