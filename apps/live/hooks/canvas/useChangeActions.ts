// The changes suggested to what is already on an event-storming board (docs/specs/021-event-storming/suggested-changes.md):
// names for a context, changes to a note. Their code is the Event Storming family's (change-verbs.ts), reached through
// the registry at the press: a change is only ever pressed on an Event Storming board, drawn once the family is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { ChangeActions, ChangeActionsDeps } from './change-verbs';

export type { ChangeActions } from './change-verbs';

export function useChangeActions(deps: ChangeActionsDeps): ChangeActions {
  const verbs = () => requireKindFamily('event-storming').changeVerbs(deps);
  return {
    chooseName: (...args) => verbs().chooseName(...args),
    dismissNames: (...args) => verbs().dismissNames(...args),
    acceptChange: (...args) => verbs().acceptChange(...args),
    dismissChange: (...args) => verbs().dismissChange(...args),
  };
}
