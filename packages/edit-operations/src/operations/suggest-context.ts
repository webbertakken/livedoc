// `suggest-context "<name>" <note>… [reason=…] [id=<id>]` (docs/specs/021-event-storming/candidate-contexts.md "How an
// agent suggests one"): a candidate context proposed round some workshop notes of an Event Storming board, stored as a
// shape carrying `esContext` with its suggestion. Nothing on the board moves; a person applies or dismisses it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  CONTEXT_NAME_MAX,
  CONTEXT_NOTES_MAX,
  contextOf,
  declinedContext,
  eventStormingKindOf,
  newContextElement,
  type StickyElement,
} from '@livedoc/document';
import { newElementId } from '../ids';
import { resolveOne } from '../selectors';
import { currentElements, putElement, refsOf, type EditState } from '../state';
import type { SuggestContextOperation } from '../types';
import {
  boardFull,
  declinedBefore,
  notABoard,
  reasonTooLong,
  refusal,
  tidy,
  whyAndWho,
} from './suggestion-rules';

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
  const board = notABoard(state, operation, 'candidate contexts');
  if (board) return board;
  const name = tidy(op.name);
  if (!name) return refusal('name_required', operation, ['a candidate context needs a name']);
  if (name.length > CONTEXT_NAME_MAX)
    return refusal('name_too_long', operation, [
      `the name is ${name.length} characters; at most ${CONTEXT_NAME_MAX}`,
    ]);
  const long = reasonTooLong(op.reason, operation);
  if (long) return long;
  if (op.notes.length === 0)
    return refusal('notes_required', operation, ['name the notes it groups, by ref']);

  const notes = resolveNotes(state, op.notes, operation);
  if (!Array.isArray(notes)) return notes;
  if (notes.length > CONTEXT_NOTES_MAX)
    return refusal('invalid_value', operation, [
      `${notes.length} notes; a candidate context groups at most ${CONTEXT_NOTES_MAX}`,
    ]);
  const full = boardFull(state, operation);
  if (full) return full;

  const id = newElementId(state, { given: op.id, label: name, kind: 'shape' }, operation);
  if (typeof id !== 'string') return id;
  const context = newContextElement({
    id,
    name,
    notes,
    suggestion: whyAndWho(state, op.reason),
  });
  const declined = declinedBefore(
    state,
    declinedContext(context),
    operation,
    `the context "${name}" round those notes`,
  );
  if (declined) return declined;
  putElement(state, context, operation);
  state.created.push(id);
  state.log('[edit-ops] suggested context', { operation, notes: notes.length });
  return null;
}
