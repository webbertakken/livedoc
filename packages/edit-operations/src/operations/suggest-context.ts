// `suggest-context "<name>" <note>… [reason=…] [id=<id>]` (docs/specs/021-event-storming/candidate-contexts.md "How an
// agent suggests one"): a candidate context proposed round some workshop notes of an Event Storming board, stored as a
// shape carrying `esContext` with its suggestion. Nothing on the board moves; a person applies or dismisses it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  CONTEXT_NAME_MAX,
  CONTEXT_NOTES_MAX,
  contextOf,
  eventStormingKindOf,
  isEventStormingTab,
  isOpenSuggestion,
  newContextElement,
  SUGGESTION_BY_MAX,
  SUGGESTION_REASON_MAX,
  SUGGESTIONS_MAX,
  type StickyElement,
} from '@livedoc/document';
import { newElementId } from '../ids';
import { resolveOne } from '../selectors';
import { currentElements, putElement, refsOf, type EditState } from '../state';
import type { SuggestContextOperation } from '../types';

const refusal = (
  code: EditRejection['code'],
  operation: number,
  details: string[],
  hint?: string,
): EditRejection => ({ code, operation, details, ...(hint ? { hint } : {}) });

// The notes named, each resolved to a workshop note no context holds yet; the first refusal otherwise.
function resolveNotes(
  state: EditState,
  selectors: readonly string[],
  operation: number,
): StickyElement[] | EditRejection {
  const elements = currentElements(state);
  const notes: StickyElement[] = [];
  for (const selector of selectors) {
    const resolved = resolveOne(state, selector, operation);
    if ('rejection' in resolved) return resolved.rejection;
    const el = resolved.el;
    const ref = refsOf(state).refOf(el.id);
    if (el.type !== 'sticky' || eventStormingKindOf(el) === null)
      return refusal('note_not_a_note', operation, [`${ref} is not a workshop note`]);
    if (notes.some((n) => n.id === el.id)) continue;
    const holder = contextOf(elements, el.id);
    if (holder)
      return refusal(
        'note_in_context',
        operation,
        [`${ref} already belongs to ${refsOf(state).refOf(holder.id)} "${holder.label}"`],
        'leave it out, or ask the person to change that context',
      );
    notes.push(el);
  }
  return notes;
}

export function applySuggestContext(
  state: EditState,
  op: SuggestContextOperation,
  operation: number,
): EditRejection | null {
  if (!isEventStormingTab(state.tab))
    return refusal('not_event_storming', operation, [
      'candidate contexts go on an Event Storming board',
    ]);
  const name = op.name.trim().replace(/\s+/g, ' ');
  if (!name) return refusal('name_required', operation, ['a candidate context needs a name']);
  if (name.length > CONTEXT_NAME_MAX)
    return refusal('name_too_long', operation, [
      `the name is ${name.length} characters; at most ${CONTEXT_NAME_MAX}`,
    ]);
  if (op.reason !== undefined && op.reason.length > SUGGESTION_REASON_MAX)
    return refusal('reason_too_long', operation, [
      `the reason is ${op.reason.length} characters; at most ${SUGGESTION_REASON_MAX}`,
    ]);
  if (op.notes.length === 0)
    return refusal('notes_required', operation, ['name the notes it groups, by ref']);

  const notes = resolveNotes(state, op.notes, operation);
  if (!Array.isArray(notes)) return notes;
  if (notes.length > CONTEXT_NOTES_MAX)
    return refusal('invalid_value', operation, [
      `${notes.length} notes; a candidate context groups at most ${CONTEXT_NOTES_MAX}`,
    ]);
  const open = currentElements(state).filter(isOpenSuggestion).length;
  if (open >= SUGGESTIONS_MAX)
    return refusal(
      'too_many_suggestions',
      operation,
      [`the board holds ${open} open suggestions; at most ${SUGGESTIONS_MAX}`],
      'dismiss some first, or wait for a person to apply them',
    );

  const id = newElementId(state, { given: op.id, label: name, kind: 'shape' }, operation);
  if (typeof id !== 'string') return id;
  const by = state.agentName?.slice(0, SUGGESTION_BY_MAX);
  putElement(
    state,
    newContextElement({
      id,
      name,
      notes,
      suggestion: { ...(op.reason ? { reason: op.reason } : {}), ...(by ? { by } : {}) },
    }),
    operation,
  );
  state.created.push(id);
  state.log('[edit-ops] suggested context', { operation, notes: notes.length });
  return null;
}
