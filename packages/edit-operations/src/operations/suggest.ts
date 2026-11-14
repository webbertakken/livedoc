// `suggest <kind> "<words>" before|after|above|below=<note> [reason=…] [gap=…] [id=<id>]`
// (docs/specs/021-event-storming/suggestions.md "How an agent suggests"): a note proposed for an Event Storming board,
// stored as a sticky carrying `esSuggestion`. Nothing on the board moves; a person applies or dismisses it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  declinedNote,
  EVENT_STORMING_NOTES,
  eventStormingKindOf,
  eventStormingNoteFields,
  isBoxed,
  isSuggestion,
  SUGGESTION_GAP_MAX,
  suggestionBounds,
  suggestionKindOf,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { newElementId } from '../ids';
import { resolveOne } from '../selectors';
import { currentElements, putElement, refsOf, type EditState } from '../state';
import type { SuggestOperation } from '../types';
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

const sameWords = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase();

export function applySuggest(
  state: EditState,
  op: SuggestOperation,
  operation: number,
): EditRejection | null {
  const board = notABoard(state, operation, 'suggestions', 'add the note instead');
  if (board) return board;
  if (!KINDS.includes(op.kind as EventStormingNoteKind))
    return refusal('invalid_kind', operation, [
      `"${op.kind}" is not a note kind`,
      `kinds: ${KINDS.join(', ')}`,
    ]);
  const kind = op.kind as EventStormingNoteKind;
  const words = tidy(op.words);
  if (!words)
    return refusal('words_required', operation, ['a suggestion says what the note would say']);
  const long = reasonTooLong(op.reason, operation);
  if (long) return long;
  if (op.gap !== undefined && op.gap.length > SUGGESTION_GAP_MAX)
    return refusal('invalid_value', operation, [`gap: at most ${SUGGESTION_GAP_MAX} characters`]);

  const resolved = resolveOne(state, op.anchor, operation);
  if ('rejection' in resolved) return resolved.rejection;
  const anchor = resolved.el;
  if (!isBoxed(anchor) || (!eventStormingKindOf(anchor) && !isSuggestion(anchor)))
    return refusal('anchor_not_a_note', operation, [
      `${refsOf(state).refOf(anchor.id)} is not a workshop note or a suggestion`,
    ]);

  const elements = currentElements(state);
  const full = boardFull(state, operation);
  if (full) return full;
  const twin = elements
    .filter(isSuggestion)
    .find(
      (el): el is StickyElement =>
        el.type === 'sticky' &&
        el.esSuggestion?.anchorId === anchor.id &&
        suggestionKindOf(el) === kind &&
        sameWords(el.label ?? '', words),
    );
  if (twin)
    return refusal('duplicate_suggestion', operation, [
      `${refsOf(state).refOf(twin.id)} already suggests ${kind} "${words}" on ${refsOf(state).refOf(anchor.id)}`,
    ]);

  const id = newElementId(state, { given: op.id, label: words, kind: 'sticky' }, operation);
  if (typeof id !== 'string') return id;
  const bounds = suggestionBounds(anchor, op.side, kind);
  const el: StickyElement = {
    id,
    type: 'sticky',
    ...eventStormingNoteFields(kind),
    ...bounds,
    label: words,
    ...(anchor.layerId !== undefined ? { layerId: anchor.layerId } : {}),
    esSuggestion: {
      anchorId: anchor.id,
      side: op.side,
      ...(op.gap ? { gap: op.gap } : {}),
      ...whyAndWho(state, op.reason),
    },
  };
  // A chain suggested again is refused at its first link: a suggestion is remembered about its chain's root note.
  const declined = declinedBefore(
    state,
    declinedNote([...elements, el], el),
    operation,
    `${kind} "${words}" on ${refsOf(state).refOf(anchor.id)}`,
  );
  if (declined) return declined;
  putElement(state, el, operation);
  state.created.push(id);
  state.log('[edit-ops] suggested', { operation, kind, side: op.side });
  return null;
}
