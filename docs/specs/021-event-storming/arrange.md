# Arrange and Reorder

**Arrange and Reorder** lays an Event Storming board out afresh along the timeline: one column per event, every note
in the column of the event it belongs to.
It is the board's own act, worked out from the [reading](board-reading.md): no model is asked.

Ruled 2026-11-14: reorganising keeps each note's x, "but there should be a separate option for 'arrange'".
Ruled 2026-11-14, asked what the act is called: "Arrange and Reorder". It reads so wherever a person meets it; the
edit operation stays `arrange`, and this file and the telemetry keep their names (default).

## Two acts, one axis each

- **A [lane plan](lane-plans.md) changes lanes and keeps time**: a note moves up or down, never along the timeline.
- **Arrange and Reorder changes time and keeps lanes**: a note moves along the timeline, never off its lane
  (ruled 2026-11-14: "Keep every lane").
- Either is used alone; a board reorganised and then arranged is laid out afresh on both axes.
- Neither does the other's work: applying a lane plan never arranges, and Arrange and Reorder never changes a lane.

## How the board arranges

- **A column per event**, in the timeline's order, left to right.
- **A note stands in the column of the event it belongs to**: what leads to the event (its commands, with their
  actors and read models), what decides it (aggregates, external systems), what it triggers (its policies) and what
  flags it (hotspots). A command a policy issues stands in the column of the event it causes.
- **A note the timeline does not reach** (a loose note) takes a column of its own, where it stands now among the
  events: after the last event whose centre is left of its own (default).
- **Within a column**, notes on one lane stand a gutter (`ES_NOTE_GAP`) apart, in the reading's order.
- **No note stands left of what leads to it**: along the reading's order a note's centre never steps back, so a
  column of notes each on its own lane shares one centre (default).
- **A note whose event stays** (a locked or free-placed event) heads a column of its own (default).
- **Columns stand as close as keeps what the board says**: `ARRANGE_COLUMN_GAP` (three gutters) apart, and wider,
  a gutter at a time up to `ARRANGE_COLUMN_GAP_MAX` (a square note and a gutter), where the closer spacing would
  change the reading (default).
- **The wall starts where it starts**: the left-most column begins at the left-most workshop note's present x, so
  the lane names keep their place.
- **Which notes move.** Every workshop note but a locked one and one placed free of the lanes: those stay.
  Nothing else moves; candidate contexts and pivotal tapes follow their notes, as they always do.
- Arranging is pure and repeatable: the same board always arranges the same, and an arranged board arranges to
  itself.

## What must stay true

The same check a lane plan passes ([Lane plans](lane-plans.md#what-must-stay-true)):

- Every relation the reading finds before is found after, between the same two notes, and the events keep their
  order. A loose note may find a partner; the preview counts them.
- **When no spacing keeps it**, the board is not arranged: "Arranging would change what the board says." with the
  first `READING_CHANGES_SHOWN` (5) relations it would change, each a way in to fix the board by hand.
- **A note in the way.** When an arranged note would land on a locked or free-placed one, the board is not arranged,
  and it names that note.
- **A note in the way** says "A note that stays where it is stands in the way.", naming it as a way in too.
- **Nothing to arrange**: a board with no event says "No events yet. Arrange and Reorder follows the timeline."; a
  board that is arranged already says "Already arranged."

## How a person arranges

- **Arrange and Reorder** is offered in the [Ask popover](asks.md#where-an-ask-starts), apart from the topics, when
  nothing is selected; it needs no hand, and choosing it closes the popover (default).
  The Ask pill was ruled to stand beside the suggestions count (2026-11-15), so that corner is where arranging
  starts.
- **It is a command too**: the command palette lists "Arrange and Reorder" on an Event Storming board that is not
  locked, for an Editor (default).
- **Choosing it previews**: every note draws where it would stand and the view fits the board as it would be, under
  a bar that says "Arranged and reordered along the timeline", how many loose notes find a partner when any do,
  **Keep** and **Put Back**.
- **Keep** moves the notes as one undoable step. **Put Back**, or Escape, leaves the board as it was.
- **The preview does not hold the board**: panning, zooming and selecting keep working under it, the suggestions
  on the board stand down while it lasts, and a drag in hand puts the board back, since the board is then the
  drag's (default).
- **A board that is not arranged says why** in the bar's place: the sentence, then each note it names as a line
  that selects that note and brings it into view, and **Close**; Escape closes it too (default).
- **Nothing to arrange is said in one line** that goes by itself, with no bar (default).
- A preview never writes; the notes glide to where they would stand and back, and under reduced motion they jump.

## How an agent arranges

- **The edit operation `arrange`**, with no arguments: it arranges the board as the editor does, as one changeset,
  revertable as one unit. It is no suggestion: the result is worked out and checked by the board, not proposed by a
  model (default).
- Refusals: `not_event_storming`, `nothing_to_arrange` (no event, or already arranged), `reading_changes`,
  `lane_blocked`.
- Its result line says the notes were `arranged` (default).
- The CLI's `livedoc edit` and the MCP's `update_document` take it as they take any operation; the `storm` guide
  teaches it beside lane plans.

## Share roles

| Role        | May                                                |
| ----------- | -------------------------------------------------- |
| Editor      | preview, Keep and Put Back                         |
| Participant | nothing: arranging reshapes the board              |
| Viewer      | nothing                                            |
| Agent       | `arrange`, with a token that may edit the document |

## Telemetry

`Canvas / Used / BoardArranged`, counted when an arrangement is kept (default).

## Where it lives

- Arranging, pure: `packages/storm-reading/src/lanes/arrange.ts`, checked by
  `packages/storm-reading/src/lanes/same-reading.ts`; what is in the way:
  `packages/storm-reading/src/lanes/blocked.ts`.
- The edit operation: `packages/edit-operations/src/operations/arrange.ts`.
- In the editor: the board arranged, or why not: `apps/live/lib/board-offer.ts`; the words:
  `apps/live/lib/board-offer-words.ts`; that a person is arranging: `apps/live/lib/suggestion-view.ts`; the bar with
  Keep and Put Back, and the refusal: `apps/live/components/canvas/suggestions/BoardOffers.tsx` and
  `apps/live/components/canvas/suggestions/BoardOfferBar.tsx`; the acts: `apps/live/hooks/canvas/useLaneActions.ts`;
  the command: `apps/live/lib/editor-commands.ts`; the Ask popover's button:
  `apps/live/components/canvas/ask/AskPopover.tsx`; the glide: `apps/live/hooks/canvas/useOfferGlide.ts`.
- Proven in a browser by `apps/live/e2e/event-storming-lane-plans.spec.ts`.
