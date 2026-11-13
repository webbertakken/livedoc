// `suggest <kind> "<words>" before|after|above|below=<note> [reason=…] [gap=…] [id=<id>]`
// (docs/specs/021-event-storming/suggestions.md "How an agent suggests"): a note proposed for an Event Storming board,
// stored as a sticky carrying `esSuggestion`. Nothing on the board moves; a person applies or dismisses it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  EVENT_STORMING_NOTES,
  eventStormingKindOf,
  eventStormingNoteFields,
  isBoxed,
  isEventStormingTab,
  isOpenSuggestion,
  isSuggestion,
  SUGGESTION_BY_MAX,
  SUGGESTION_GAP_MAX,
  SUGGESTION_REASON_MAX,
  SUGGESTIONS_MAX,
  suggestionBounds,
  suggestionKindOf,
  type Element,
  type EventStormingNoteKind,
  type StickyElement,
} from '@livedoc/document';
import { newElementId } from '../ids';
import { resolveOne } from '../selectors';
import { currentElements, putElement, refsOf, type EditState } from '../state';
import type { SuggestOperation } from '../types';

const KINDS = EVENT_STORMING_NOTES.map((n) => n.kind);

const refusal = (
  code: EditRejection['code'],
  operation: number,
  details: string[],
  hint?: string,
): EditRejection => ({ code, operation, details, ...(hint ? { hint } : {}) });

const sameWords = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export function applySuggest(
  state: EditState,
  op: SuggestOperation,
  operation: number,
): EditRejection | null {
  if (!isEventStormingTab(state.tab))
    return refusal(
      'not_event_storming',
      operation,
      ['suggestions go on an Event Storming board'],
      'add the note instead',
    );
  if (!KINDS.includes(op.kind as EventStormingNoteKind))
    return refusal('invalid_kind', operation, [
      `"${op.kind}" is not a note kind`,
      `kinds: ${KINDS.join(', ')}`,
    ]);
  const kind = op.kind as EventStormingNoteKind;
  const words = op.words.trim().replace(/\s+/g, ' ');
  if (!words)
    return refusal('words_required', operation, ['a suggestion says what the note would say']);
  if (op.reason !== undefined && op.reason.length > SUGGESTION_REASON_MAX)
    return refusal('reason_too_long', operation, [
      `the reason is ${op.reason.length} characters; at most ${SUGGESTION_REASON_MAX}`,
    ]);
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
  // Suggested notes and suggested candidate contexts count alike (docs/specs/021-event-storming/candidate-contexts.md).
  const open = elements.filter(isSuggestion);
  const openCount = elements.filter(isOpenSuggestion).length;
  if (openCount >= SUGGESTIONS_MAX)
    return refusal(
      'too_many_suggestions',
      operation,
      [`the board holds ${openCount} open suggestions; at most ${SUGGESTIONS_MAX}`],
      'dismiss some first, or wait for a person to apply them',
    );
  const twin = open.find(
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
  const by = state.agentName?.slice(0, SUGGESTION_BY_MAX);
  const el: Element = {
    id,
    type: 'sticky',
    ...eventStormingNoteFields(kind),
    ...bounds,
    label: words,
    ...(anchor.layerId !== undefined ? { layerId: anchor.layerId } : {}),
    esSuggestion: {
      anchorId: anchor.id,
      side: op.side,
      ...(op.reason ? { reason: op.reason } : {}),
      ...(op.gap ? { gap: op.gap } : {}),
      ...(by ? { by } : {}),
    },
  };
  putElement(state, el, operation);
  state.created.push(id);
  state.log('[edit-ops] suggested', { operation, kind, side: op.side });
  return null;
}
