// The Review panel's writes (docs/specs/021-event-storming/board-review.md "Check", board-language.md "The Language
// tab"). Their code is the Event Storming family's (review-verbs.ts), reached through the registry at the press: the
// panel only ever opens on an Event Storming board, drawn once the family is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { ReviewActions, ReviewActionsDeps } from './review-verbs';

export type { ReviewActions } from './review-verbs';

export function useReviewActions(deps: ReviewActionsDeps): ReviewActions {
  const verbs = () => requireKindFamily('event-storming').reviewVerbs(deps);
  return {
    addForGap: (...args) => verbs().addForGap(...args),
    renameTerm: (...args) => verbs().renameTerm(...args),
  };
}
