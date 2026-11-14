// `suggest-name "<name>" <context>… [reason=…]` (docs/specs/021-event-storming/suggested-changes.md "Name
// suggestions"): another name proposed for a candidate context, or, for several contexts, one name for them merged.
// It is kept on the context (the one a merge would keep); nothing is renamed or merged until a person chooses it.

import type { EditRejection } from '@livedoc/api-schema';
import {
  addNameSuggestion,
  CONTEXT_NAME_MAX,
  CONTEXT_NAMES_MAX,
  declinedName,
  isCandidateContext,
  mergeKeeperOf,
  NAMED_CONTEXTS_MAX,
  nameSuggestionsFor,
  sameContextName,
  type CandidateContextElement,
} from '@livedoc/document';
import { resolveOne } from '../selectors';
import { currentElements, refsOf, refuseLocked, writeFields, type EditState } from '../state';
import type { SuggestNameOperation } from '../types';
import {
  boardFull,
  declinedBefore,
  notABoard,
  reasonTooLong,
  refusal,
  tidy,
  whyAndWho,
} from './suggestion-rules';

// The contexts named, each once; the first refusal otherwise.
function resolveContexts(
  state: EditState,
  selectors: readonly string[],
  operation: number,
): CandidateContextElement[] | EditRejection {
  const contexts: CandidateContextElement[] = [];
  for (const selector of selectors) {
    const resolved = resolveOne(state, selector, operation);
    if ('rejection' in resolved) return resolved.rejection;
    const el = resolved.el;
    if (!isCandidateContext(el))
      return refusal(
        'not_a_context',
        operation,
        [`${refsOf(state).refOf(el.id)} is not a candidate context`],
        'the storm view lists the contexts, kept and suggested, with their refs',
      );
    if (!contexts.some((c) => c.id === el.id)) contexts.push(el);
  }
  return contexts;
}

export function applySuggestName(
  state: EditState,
  op: SuggestNameOperation,
  operation: number,
): EditRejection | null {
  const board = notABoard(state, operation, 'name suggestions');
  if (board) return board;
  const name = tidy(op.name);
  if (!name) return refusal('name_required', operation, ['a name suggestion needs a name']);
  if (name.length > CONTEXT_NAME_MAX)
    return refusal('name_too_long', operation, [
      `the name is ${name.length} characters; at most ${CONTEXT_NAME_MAX}`,
    ]);
  const long = reasonTooLong(op.reason, operation);
  if (long) return long;
  if (op.contexts.length === 0)
    return refusal(
      'contexts_required',
      operation,
      ['name the context it is for, by ref'],
      'several contexts: one name for them merged',
    );

  const contexts = resolveContexts(state, op.contexts, operation);
  if (!Array.isArray(contexts)) return contexts;
  if (contexts.length > NAMED_CONTEXTS_MAX)
    return refusal('invalid_value', operation, [
      `${contexts.length} contexts; a name is for at most ${NAMED_CONTEXTS_MAX}`,
    ]);
  const elements = [...currentElements(state)];
  const ids = contexts.map((c) => c.id);
  const refs = ids.map((id) => refsOf(state).refOf(id)).join(', ');
  const only = contexts.length === 1 ? contexts[0]! : null;
  if (only && sameContextName(only.label, name))
    return refusal('duplicate_suggestion', operation, [
      `${refs} is called "${only.label}" already`,
    ]);
  if (nameSuggestionsFor(elements, ids).some((s) => sameContextName(s.name, name)))
    return refusal('duplicate_suggestion', operation, [
      `"${name}" is already suggested for ${refs}`,
    ]);

  // A merge's name is held by the context the merge keeps.
  const holder = only ?? mergeKeeperOf(elements, ids)!;
  const lock = state.locked.get(holder.id);
  if (lock) return refuseLocked(state, 'suggest-name', operation, holder, lock);
  const held = holder.esContext.names?.length ?? 0;
  if (held >= CONTEXT_NAMES_MAX)
    return refusal(
      'too_many_suggestions',
      operation,
      [
        `${refsOf(state).refOf(holder.id)} holds ${held} name suggestions; at most ${CONTEXT_NAMES_MAX}`,
      ],
      'wait for a person to choose or dismiss them',
    );
  const full = boardFull(state, operation);
  if (full) return full;
  const declined = declinedBefore(
    state,
    declinedName(ids, name),
    operation,
    `the name "${name}" for ${refs}`,
  );
  if (declined) return declined;

  const next = addNameSuggestion(elements, ids, { name, ...whyAndWho(state, op.reason) });
  writeFields(
    state,
    next.find((el) => el.id === holder.id)!,
    operation,
    ['esContext'],
  );
  state.log('[edit-ops] suggested name', { operation, contexts: ids.length });
  return null;
}
