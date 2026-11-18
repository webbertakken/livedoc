// The runtime behaviour of the collaboration elements (docs/specs/012-collaboration/participant-responses.md to docs/specs/012-collaboration/roll-call.md):
// casting a response, revealing an estimate, dropping an anonymous idea,
// pressing an agenda segment, and taking a roll call. The verbs themselves are the collaboration panels family's
// (collab-panel-verbs.ts), reached through the registry at the press.
//
// Sibling of useBehaviourElements, and the same shape: a press resolves what
// to do from the element, then calls something that already exists. It is its
// own hook because these write to the DOCUMENT (the behaviour elements mostly
// don't) and because they share one rule the rest of the editor doesn't — see
// `patchElement` below.

import {
  checklistDeltaFor,
  type Element,
  type ShapeElement,
  type Tab,
  type TimerMode,
} from '@livedoc/document';
import type { Participant } from '@/lib/identity';
import type { ApplyElementDelta } from '@/hooks/collab/useElementDeltas';
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { CollabPanelVerbs } from './collab-panel-verbs';

export type CollabElementsDeps = {
  activeId: string;
  // Undoable: only scatter uses it, because scatter CREATES stickies, which is
  // authoring like any other add.
  commitTabs: (mapTabs: (ts: Tab[]) => Tab[]) => unknown;
  // Not undoable, and not logged: every press below (docs/specs/012-collaboration/collab-race-hardening.md).
  tickTabs: (mapTabs: (ts: Tab[]) => Tab[]) => void;
  // An answer or an idea: applied here and sent to the room as a delta, so
  // two people pressing the same card at once both land (docs/specs/012-collaboration/collab-race-hardening.md).
  applyElementDelta: ApplyElementDelta;
  // One idea into a box, held until the room answers it (useIdeaPosts): false when it lost the box's
  // last card to an earlier post (docs/specs/012-collaboration/idea-box.md "Racing for the last card").
  postIdea: (tabId: string, element: ShapeElement, text: string) => Promise<boolean>;
  // The active tab's elements, to read a checklist row before ticking it.
  activeElements: Element[];
  // A view-role visitor / locked tab. The room already drops their mutations
  // (docs/specs/015-api/api.md), so this is about not lying to them in the UI.
  editsBlocked: boolean;
  // Somebody else is facilitating (docs/specs/012-collaboration/facilitator.md). Revealing, clearing, scattering,
  // rolling and pressing an agenda item are theirs; responding is everyone's.
  sessionToolsBlocked: boolean;
  selfParticipant: Participant;
  livePresence: Participant[];
  // Returns the run's `startedAt`, or undefined when nothing started.
  startTimer: (mode: TimerMode, durationMs?: number) => number | undefined;
};

export function useCollabElements(deps: CollabElementsDeps) {
  const {
    activeId,
    tickTabs,
    applyElementDelta,
    activeElements,
    editsBlocked,
    sessionToolsBlocked,
  } = deps;
  // `patchElement`, for a verb that runs the room rather than answering it:
  // reveal, clear, roll, agenda. One helper rather than a flag on every call,
  // so which side of the facilitator line a verb sits on is visible in the
  // call itself (docs/specs/012-collaboration/facilitator.md).
  const patchAsFacilitator = (
    elementId: string,
    patch: (el: ShapeElement) => Partial<ShapeElement>,
  ) => {
    if (sessionToolsBlocked) return;
    patchElement(elementId, patch);
  };

  // Patch one element on the active tab, through `tickTabs`: no undo history,
  // because undo is a personal control and one person's Ctrl+Z must never
  // retract another's answer (docs/specs/012-collaboration/participant-responses.md). Undo re-grafts these fields too
  // (`LIVE_ELEMENT_FIELDS`), so an older snapshot can't take them back.
  const patchElement = (elementId: string, patch: (el: ShapeElement) => Partial<ShapeElement>) => {
    if (editsBlocked) return;
    tickTabs((ts) =>
      ts.map((tab) =>
        tab.id !== activeId
          ? tab
          : {
              ...tab,
              elements: tab.elements.map((el) =>
                el.id === elementId && el.type === 'shape' ? { ...el, ...patch(el) } : el,
              ),
            },
      ),
    );
  };

  // The panels' verbs, built at the press from the family (a press needs a panel on the board, drawn once it is in).
  const verbs = () =>
    requireKindFamily('collab-panels').collabPanelVerbs({ deps, patchElement, patchAsFacilitator });

  // --- Checklist (docs/specs/009-elements/checklist.md) --------------------------------------------------
  // Not one of the collaboration family, but the same problem: a whole room
  // ticking rows on one shared list. A tick used to replace the whole element
  // (and push undo), so two people ticking different rows lost one of them.
  // Now it is one delta naming the row by index and text (docs/specs/012-collaboration/collab-race-hardening.md).
  const toggleChecklistItem = (elementId: string, index: number) => {
    if (editsBlocked) return;
    const element = activeElements.find((el) => el.id === elementId);
    const delta = element ? checklistDeltaFor(element, index) : null;
    if (delta) applyElementDelta(elementId, delta);
    // Box ticks deliberately don't track: high-frequency, low-signal,
    // matching docs/specs/012-collaboration/session-tools.md's vote-cast precedent.
  };

  return {
    // For a sibling hook whose verbs run the room the same way (the quiz,
    // useQuizElements), so the facilitator line is drawn in one place.
    patchAsFacilitator,
    toggleChecklistItem,
    respond: (...args: Parameters<CollabPanelVerbs['respond']>) => verbs().respond(...args),
    setResponsesRevealed: (...args: Parameters<CollabPanelVerbs['setResponsesRevealed']>) =>
      verbs().setResponsesRevealed(...args),
    chooseEstimateScale: (...args: Parameters<CollabPanelVerbs['chooseEstimateScale']>) =>
      verbs().chooseEstimateScale(...args),
    clearResponses: (...args: Parameters<CollabPanelVerbs['clearResponses']>) =>
      verbs().clearResponses(...args),
    addIdea: (...args: Parameters<CollabPanelVerbs['addIdea']>) => verbs().addIdea(...args),
    revealIdeas: (...args: Parameters<CollabPanelVerbs['revealIdeas']>) =>
      verbs().revealIdeas(...args),
    clearIdeas: (...args: Parameters<CollabPanelVerbs['clearIdeas']>) =>
      verbs().clearIdeas(...args),
    scatterIdeas: (...args: Parameters<CollabPanelVerbs['scatterIdeas']>) =>
      verbs().scatterIdeas(...args),
    pressAgendaItem: (...args: Parameters<CollabPanelVerbs['pressAgendaItem']>) =>
      verbs().pressAgendaItem(...args),
    resetAgenda: (...args: Parameters<CollabPanelVerbs['resetAgenda']>) =>
      verbs().resetAgenda(...args),
    takeRoll: (...args: Parameters<CollabPanelVerbs['takeRoll']>) => verbs().takeRoll(...args),
  };
}
