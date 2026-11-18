// The collaboration panels' verbs (docs/specs/012-collaboration/participant-responses.md to
// docs/specs/012-collaboration/roll-call.md): casting a response, revealing an estimate, dropping an anonymous idea,
// pressing an agenda segment, and taking a roll call. The collaboration panels family's code
// (docs/specs/016-platform/web-performance.md): useCollabElements reaches it through the registry, and only a press on
// a panel, drawn once the family is in, calls it.
import {
  clampAgendaMinutes,
  createSticky,
  IDEA_MAX_CARDS,
  responseDeltaFor,
  type Element,
  type EstimateScale,
  type ShapeElement,
} from '@livedoc/document';
import { participantKey, uniqueParticipants } from '@/lib/identity';
import { track } from '@/lib/telemetry';
import type { CollabElementsDeps } from './useCollabElements';

// How far apart scattered ideas land, in canvas px (docs/specs/012-collaboration/idea-box.md).
const SCATTER_STEP = 20;
const SCATTER_COLS = 4;
const STICKY_SIZE = 160;

type PatchShape = (elementId: string, patch: (el: ShapeElement) => Partial<ShapeElement>) => void;

export function collabPanelVerbs({
  deps: {
    activeId,
    commitTabs,
    applyElementDelta,
    postIdea,
    editsBlocked,
    sessionToolsBlocked,
    selfParticipant,
    livePresence,
    startTimer,
  },
  patchElement,
  patchAsFacilitator,
}: {
  deps: CollabElementsDeps;
  patchElement: PatchShape;
  patchAsFacilitator: PatchShape;
}) {
  // Cast, or withdraw by pressing your own answer again — one press, so there
  // is no second control to find.
  //
  // Keyed on `participantKey`, NOT on `selfParticipant.id`. The id is our
  // OWNER id: writing it into a shared document publishes an `X-Owner-Id`
  // credential to every co-viewer, and it is also unjoinable — peers see us
  // under the room's per-socket presence id (docs/specs/015-api/public-api-and-tokens.md §6), never under this.
  // That mismatch is what made a done check invisible to everyone but the
  // person pressing it.
  const respond = (element: ShapeElement, value: string) => {
    if (editsBlocked) return;
    // ONE answer, as a delta stamped with the card's round (docs/specs/012-collaboration/collab-race-hardening.md): it
    // commutes with everybody else's, and a cast from before a clear is
    // dropped rather than landing in the next round.
    applyElementDelta(
      element.id,
      responseDeltaFor(element, participantKey(selfParticipant), value, Date.now()),
    );
    track(
      'Element',
      'Changed',
      element.shape === 'estimate'
        ? 'Estimate'
        : element.shape === 'done-check'
          ? 'DoneCheck'
          : 'Temperature',
    );
  };

  // --- Estimate card (docs/specs/012-collaboration/estimate-card.md) --------------------------------------------
  const setResponsesRevealed = (element: ShapeElement, revealed: boolean) => {
    patchAsFacilitator(element.id, () => ({ responsesRevealed: revealed }));
    track('Element', 'Changed', 'Estimate');
  };

  // Choosing a new card's scale on the canvas (docs/specs/012-collaboration/estimate-card.md "Choosing a
  // scale"). Authoring, like the menu's Scale, so it is an ordinary undoable
  // edit, and anyone who can edit may make it (it is not running the room).
  const chooseEstimateScale = (element: ShapeElement, scale: EstimateScale) => {
    if (editsBlocked) return;
    commitTabs((ts) =>
      ts.map((tab) =>
        tab.id !== activeId
          ? tab
          : {
              ...tab,
              elements: tab.elements.map((el) =>
                el.id === element.id && el.type === 'shape' ? { ...el, estimateScale: scale } : el,
              ),
            },
      ),
    );
    track('Element', 'Changed', 'Estimate');
  };

  const clearResponses = (element: ShapeElement) => {
    // Clearing un-reveals as well: the next round starts closed, or the card
    // would collect its first answer in the open. (A done check has nothing to
    // reveal, so the second field is a harmless no-op there.)
    // A new round (docs/specs/012-collaboration/collab-race-hardening.md): an answer cast before this clear names the old
    // one, so no peer can let it into the next round.
    patchAsFacilitator(element.id, () => ({
      responses: [],
      responsesRevealed: false,
      collabRound: crypto.randomUUID(),
    }));
    track(
      'Element',
      'Changed',
      element.shape === 'done-check'
        ? 'DoneCheck'
        : element.shape === 'temperature'
          ? 'Temperature'
          : 'Estimate',
    );
  };

  // --- Idea box (docs/specs/012-collaboration/idea-box.md) --------------------------------------------------
  // Anonymity is structural — there is nowhere in `ideaCards` to record an
  // author. One other route to a name is closed here rather than in the
  // schema:
  // no selection, so the docs/specs/007-editor/live-app.md concurrent-selection ring doesn't put a name
  // on the box at the moment somebody types into it. This function
  // deliberately never touches the selection.
  // Returns whether the idea went in, so the composer keeps a refused draft: false at the press for a full
  // box, else the post's promise, which answers false when the room numbered another card first.
  const addIdea = (element: ShapeElement, text: string): boolean | Promise<boolean> => {
    const clean = text.trim();
    if (!clean || editsBlocked) return false;
    // A full box takes no more: one card past the cap would fail the whole
    // tab's validation on save (docs/specs/012-collaboration/collab-race-hardening.md).
    if ((element.ideaCards ?? []).length >= IDEA_MAX_CARDS) return false;
    // ONE idea, as a delta (docs/specs/012-collaboration/collab-race-hardening.md), so two people posting at once both
    // land. Still no author: the delta has nowhere to put one either, and its card id is random.
    track('Element', 'Changed', 'Idea-box');
    return postIdea(activeId, element, clean);
  };

  const revealIdeas = (element: ShapeElement) => {
    patchAsFacilitator(element.id, () => ({ ideasRevealed: true }));
    track('Element', 'Changed', 'Idea-box');
  };

  // Empty the Box: clear it for the next round. Un-reveals as well, exactly as
  // clearResponses does: a box that kept its lid off would collect the first
  // card of the next round in the open, and the whole point of the element is
  // that nothing is visible until somebody decides it is.
  const clearIdeas = (element: ShapeElement) => {
    patchAsFacilitator(element.id, () => ({
      ideaCards: [],
      ideaCardIds: [],
      ideasRevealed: false,
      collabRound: crypto.randomUUID(),
    }));
    track('Element', 'Changed', 'Idea-box');
  };

  // Turn an open box's cards into ordinary sticky notes beside it, which is
  // what a retro does next — they group, move, theme and dot-vote like
  // anything else. Created WITHOUT authorship, so the scatter doesn't undo the
  // anonymity that was the point.
  const scatterIdeas = (element: ShapeElement) => {
    if (editsBlocked || sessionToolsBlocked) return;
    const cards = element.ideaCards ?? [];
    if (cards.length === 0) return;
    const stickies: Element[] = cards.map((text, i) => {
      const col = i % SCATTER_COLS;
      const row = Math.floor(i / SCATTER_COLS);
      const sticky = createSticky(
        element.x + element.width + SCATTER_STEP + col * (STICKY_SIZE + SCATTER_STEP),
        element.y + row * (STICKY_SIZE + SCATTER_STEP),
      );
      return { ...sticky, width: STICKY_SIZE, height: STICKY_SIZE, label: text };
    });
    commitTabs((ts) =>
      ts.map((tab) =>
        tab.id !== activeId ? tab : { ...tab, elements: [...tab.elements, ...stickies] },
      ),
    );
    track('Element', 'Added', 'Sticky');
  };

  // --- Agenda (docs/specs/012-collaboration/agenda.md) ----------------------------------------------------
  // Pressing a segment starts the tab timer through `startTimer` — the same
  // entry point the Current Tab menu and the session button use, so the
  // edit-role gate and the telemetry all still happen
  // exactly once, where they are owned.
  //
  // Pressing while another segment runs REPLACES the timer rather than
  // queueing: an agenda that refuses to move on because the last segment
  // overran is an agenda nobody uses twice.
  const pressAgendaItem = (element: ShapeElement, index: number) => {
    // It starts that item's countdown, so it is the timer wearing a row.
    if (editsBlocked || sessionToolsBlocked) return;
    const item = (element.agendaItems ?? [])[index];
    if (!item) return;
    const startedAt = startTimer('countdown', clampAgendaMinutes(item.minutes) * 60_000);
    if (startedAt === undefined) return;
    // The run it started, so the face shows this timer's time left only while
    // the tab timer is still that run.
    patchElement(element.id, () => ({ agendaCurrent: index, agendaTimerStartedAt: startedAt }));
    track('Element', 'Changed', 'Agenda');
  };

  // Back to "not started": no segment current. The tab timer is left alone,
  // it is the room's, and the agenda simply stops claiming it.
  const resetAgenda = (element: ShapeElement) => {
    patchAsFacilitator(element.id, () => ({
      agendaCurrent: undefined,
      agendaTimerStartedAt: undefined,
    }));
    track('Element', 'Changed', 'Agenda');
  };

  // --- Roll call (docs/specs/012-collaboration/roll-call.md) -------------------------------------------------
  // Freezes who is here INTO the element: names and colours are copied and
  // never re-joined to the live participant, so someone since renamed or
  // deleted still appears under the name they were in the room under.
  //
  // Ourselves first, then presence — presence lists the OTHERS, and a roll
  // call that omits the person taking it is wrong in the most obvious way.
  const takeRoll = (element: ShapeElement) => {
    if (sessionToolsBlocked) return;
    const at = Date.now();
    // One chip per person, by collab key: your second tab (or a peer who
    // rejoined on a new socket) has its own presence id but the same key.
    const entries = uniqueParticipants([selfParticipant, ...livePresence]).map((p) => ({
      name: p.name,
      color: p.color,
      at,
    }));
    // Replaces rather than merges: a merge would quietly turn "who was here"
    // into "who has ever been here", a different and less useful question.
    patchElement(element.id, () => ({ rollCall: entries }));
    track('Element', 'Changed', 'Roll-call');
  };

  return {
    respond,
    setResponsesRevealed,
    chooseEstimateScale,
    clearResponses,
    addIdea,
    revealIdeas,
    clearIdeas,
    scatterIdeas,
    pressAgendaItem,
    resetAgenda,
    takeRoll,
  };
}

export type CollabPanelVerbs = ReturnType<typeof collabPanelVerbs>;
