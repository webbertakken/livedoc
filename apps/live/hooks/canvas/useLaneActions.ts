// A whole event-storming board rearranged (docs/specs/021-event-storming/lane-plans.md,
// docs/specs/021-event-storming/arrange.md). Its code is the Event Storming family's (lane-verbs.ts), reached through
// the registry at the press: Arrange and a lane plan are only ever offered on an Event Storming board, drawn once the
// family is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { LaneActions, LaneActionsDeps } from './lane-verbs';

export type { LaneActions } from './lane-verbs';

export function useLaneActions(deps: LaneActionsDeps): LaneActions {
  const verbs = () => requireKindFamily('event-storming').laneVerbs(deps);
  return {
    applyLanePlan: () => verbs().applyLanePlan(),
    dismissLanePlan: () => verbs().dismissLanePlan(),
    arrange: () => verbs().arrange(),
    keepArranged: () => verbs().keepArranged(),
    selectNote: (...args) => verbs().selectNote(...args),
  };
}
