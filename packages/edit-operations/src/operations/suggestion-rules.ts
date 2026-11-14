// What every suggest operation checks alike (docs/specs/021-event-storming/suggestions.md, suggested-changes.md): the
// tab is a board, the reason fits, the board has room for one more open suggestion, and a person did not decline
// this one before (docs/specs/021-event-storming/asks.md "What was declined").

import type { EditRejection } from '@livedoc/api-schema';
import {
  isDeclined,
  isEventStormingTab,
  openSuggestionCount,
  SUGGESTION_BY_MAX,
  SUGGESTION_REASON_MAX,
  SUGGESTIONS_MAX,
  type EsDeclined,
} from '@livedoc/document';
import { currentElements, type EditState } from '../state';

export const refusal = (
  code: EditRejection['code'],
  operation: number,
  details: string[],
  hint?: string,
): EditRejection => ({ code, operation, details, ...(hint ? { hint } : {}) });

/** Words as a board keeps them: trimmed, runs of space as one. */
export const tidy = (words: string) => words.trim().replace(/\s+/g, ' ');

/** Who suggests: the agent's name as its presence shows it. */
export const suggestedBy = (state: EditState) => state.agentName?.slice(0, SUGGESTION_BY_MAX);

/** Why and who, as a suggestion carries them: each only when there is one. */
export const whyAndWho = (state: EditState, reason: string | undefined) => {
  const by = suggestedBy(state);
  return { ...(reason ? { reason } : {}), ...(by ? { by } : {}) };
};

export function notABoard(
  state: EditState,
  operation: number,
  what: string,
  hint?: string,
): EditRejection | null {
  if (isEventStormingTab(state.tab)) return null;
  return refusal('not_event_storming', operation, [`${what} go on an Event Storming board`], hint);
}

export function reasonTooLong(reason: string | undefined, operation: number): EditRejection | null {
  if (reason === undefined || reason.length <= SUGGESTION_REASON_MAX) return null;
  return refusal('reason_too_long', operation, [
    `the reason is ${reason.length} characters; at most ${SUGGESTION_REASON_MAX}`,
  ]);
}

/** Every open suggestion counts alike: notes, contexts, names and note changes. */
export function boardFull(state: EditState, operation: number): EditRejection | null {
  const open = openSuggestionCount(currentElements(state));
  if (open < SUGGESTIONS_MAX) return null;
  return refusal(
    'too_many_suggestions',
    operation,
    [`the board holds ${open} open suggestions; at most ${SUGGESTIONS_MAX}`],
    'dismiss some first, or wait for a person to apply them',
  );
}

export function declinedBefore(
  state: EditState,
  entry: EsDeclined,
  operation: number,
  what: string,
): EditRejection | null {
  if (!isDeclined(state.tab, entry)) return null;
  return refusal(
    'declined_before',
    operation,
    [`a person dismissed ${what} before`],
    'suggest something else; the storm view lists what was declined',
  );
}
