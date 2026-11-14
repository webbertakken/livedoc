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
- **Columns stand as close as keeps what the board says**: `ARRANGE_COLUMN_GAP` (three gutters) apart, and wider,
  step by step up to `ARRANGE_COLUMN_GAP_MAX` (a square note and a gutter), where the closer spacing would change
  the reading (default).
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
- **Nothing to arrange**: a board with no event says "No events yet. Arrange and Reorder follows the timeline."; a
  board that is arranged already says "Already arranged."

## How a person arranges

- **Arrange and Reorder** is offered in the Ask popover, apart from the topics, when nothing is selected; it needs no
  hand (default; its placement is ruled with the Ask button's).
- **Choosing it previews**: every note draws where it would stand and the view fits the board as it would be, under
  a bar that says "Arranged and reordered along the timeline", how many loose notes find a partner when any do,
  **Keep** and **Put Back**.
- **Keep** moves the notes as one undoable step. **Put Back**, or Escape, leaves the board as it was.
- A preview never writes; under reduced motion the notes jump rather than glide.

## How an agent arranges

- **The edit operation `arrange`**, with no arguments: it arranges the board as the editor does, as one changeset,
  revertable as one unit. It is no suggestion: the result is worked out and checked by the board, not proposed by a
  model (default).
- Refusals: `not_event_storming`, `nothing_to_arrange` (no event, or already arranged), `reading_changes`,
  `lane_blocked`.
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

`Canvas / Used / BoardArranged` (default).
