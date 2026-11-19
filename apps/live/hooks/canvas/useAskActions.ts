// The acts of an ask (docs/specs/021-event-storming/asks.md). Their code is the Event Storming family's (ask-verbs.ts),
// reached through the registry at the press: an ask is only ever opened on an Event Storming board, drawn once the
// family is in. The ask under way is held here, across renders.
import { useRef } from 'react';
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { AskActions, AskActionsDeps } from './ask-verbs';

export type { AskActions } from './ask-verbs';

export function useAskActions(deps: AskActionsDeps): AskActions {
  const asking = useRef<AbortController | null>(null);
  const verbs = () => requireKindFamily('event-storming').askVerbs({ ...deps, asking });
  return {
    openAsk: (...args) => verbs().openAsk(...args),
    openAskAbout: (...args) => verbs().openAskAbout(...args),
    copyPrompt: (...args) => verbs().copyPrompt(...args),
    ask: (...args) => verbs().ask(...args),
    cancelAsk: () => verbs().cancelAsk(),
    saveAbout: (...args) => verbs().saveAbout(...args),
    forgetDeclined: () => verbs().forgetDeclined(),
    foldBoard: (...args) => verbs().foldBoard(...args),
  };
}
