// The suggestion acts on an event-storming board (docs/specs/021-event-storming/suggestions.md "Applying and
// dismissing"). Their code is the Event Storming family's (suggestion-verbs.ts), reached through the registry at the
// press: a suggestion is only ever pressed on an Event Storming board, which draws once the family is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { SuggestionActions, SuggestionActionsDeps } from './suggestion-verbs';

export type { SuggestionActions } from './suggestion-verbs';

export function useSuggestionActions(deps: SuggestionActionsDeps): SuggestionActions {
  const verbs = () => requireKindFamily('event-storming').suggestionVerbs(deps);
  return {
    apply: (...args) => verbs().apply(...args),
    dismiss: (...args) => verbs().dismiss(...args),
    applyAll: () => verbs().applyAll(),
    dismissAll: () => verbs().dismissAll(),
  };
}
