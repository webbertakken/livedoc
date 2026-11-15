# Board structure

What an Event Storming board carries beyond its notes, so that the wall reads as a structured story: **pivotal
events**, the **phases** between them, **lane names**, and the **answers** to its hotspots.
Each is the room's own knowledge, which no model brings, and each reaches the
[reading](board-reading.md#structure) and the [domain export](domain-export.md).

## Pivotal events

A **pivotal event** is one of the few events the whole flow turns on: where one phase of the business ends and the
next begins ("Order Placed", "Order Shipped").

- **A mark on the event.** `esPivotal: true` on a domain event's sticky; only a domain event carries it.
  Changing the note's kind drops the mark (default).
- **Mark as Pivotal** and **Unmark Pivotal**, in a domain event's menu; one undoable step.
- A pivotal event's accessible name ends ", pivotal": the tape is decoration (default).
- **The tape.** A pivotal event draws a vertical band through its centre, `PIVOTAL_TAPE_PX` (6) canvas px wide,
  behind the notes, from half a lane above the top-most lane the board's notes use to half a lane below the lowest.
  It follows its event. Its ink is the candidate contexts' muted slate at `PIVOTAL_TAPE_OPACITY` (0.8), 3:1 or more
  against either canvas paper (default).
- The SVG and PNG exports draw the tape; text exports leave it out, and the reading lists it (default).

## Phases

- **A phase** is the run of events up to and including a pivotal event; the events after the last pivotal event are
  the last phase, which no event closes.
- A phase is named by the event that closes it; nothing more is stored (default).
- A board with no pivotal event has no phases.

## Lane names

A **lane name** says what a lane holds ("Customer", "Kitchen", "Commands").

- **A lane's name is the text standing left of the wall on that lane**: a text element whose right edge is at or
  left of the wall's left edge (the left-most workshop note's x) and whose centre is within half a lane of the
  lane's centre; the one nearest the wall when there are several (default).
  It is found from geometry alone, as everything the reading reads, so the names the MCP's storm graph writes, and
  any a person typed there, are lane names already.
- It is ordinary text: selected, edited, moved and deleted as text is, painted and exported as text is.
- **Name This Lane**, in a workshop note's menu, adds the name left of the wall on the note's lane (right aligned,
  muted, one gutter clear of the wall) and opens it for typing; when the lane has a name the row reads
  **Rename This Lane** and opens that one (default).
- A blank name left as it is leaves nothing behind: it hugs its text, and the editor removes a hugging text box left
  empty (default).
- A name is up to `LANE_NAME_MAX` (40) characters when a [lane plan](lane-plans.md) writes it; text typed by hand is
  read whole and cut to that in the reading (default).
- Only a lane that holds workshop notes has a name read.

## Hotspot answers

A hotspot is a question the room left open. Its **answer** is what the room decided, kept on the question.

- **On the hotspot.** `esAnswer` on a hotspot's sticky: plain text, up to `HOTSPOT_ANSWER_MAX` (300) characters;
  absent or blank means open. Changing the note's kind drops it (default).
- **Answer…**, in a hotspot's menu, opens a small field under the note; Enter or leaving it keeps the answer, Escape
  leaves it as it was, and an emptied answer reopens the question. One undoable step. On an answered hotspot the row
  reads **Edit Answer…** (default).
- **An answer is one paragraph**: its whitespace is collapsed, so Enter keeps it with or without Shift, and the field
  says so under it ("Enter keeps it, Esc leaves it"). A counter shows from 240 characters (default).
- **An answered hotspot** wears a small check on its top right corner (a 20 px disc in a 28 px target, white on
  emerald, ringed in the canvas's paper); pointing at it or focusing it shows the answer as a caption under the
  note. Its paper and words do not change: the question stays readable (default).
- **Pressing the check opens the answer** for whoever may answer; for everyone else it is an image that shows the
  caption and has nothing to press (default).
- **The field and the caption stay inside the window**: a gap under their note, moved back in while the note
  stands at an edge and no further than a margin from it, and under the note again once they fit. That holds as
  the board is panned or zoomed, the window resized, and their words grow (default).
- **The keyboard after the field**: kept with Enter, the answer's check takes the keyboard once the board has drawn
  it; put away with Escape, or emptied, the keyboard goes back to what opened the field while that still stands,
  else to the check the note wears. Left by pointing elsewhere, the field hands it nowhere (default).
- **In the reading** an answered hotspot is a **decision** and no longer the gap `open_hotspot`.

## Share roles

| Role        | Sees                                             | May                                            |
| ----------- | ------------------------------------------------ | ---------------------------------------------- |
| Editor      | the tape, the lane names, the checks and answers | mark and unmark, name a lane, answer a hotspot |
| Participant | the same                                         | nothing: each of them reshapes the board       |
| Viewer      | the same                                         | nothing                                        |

- Marking, naming and answering are an Editor's (default).
- **The room holds it, not only the menu.** A Participant's change sets and changes no `esPivotal` and no `esAnswer`,
  on a note it added as on anyone's; a copy it makes of a marked or answered note lands plain. Its own note may drop
  the mark or the answer, as a change of kind does (default).
- **Name This Lane is an Editor's; a lane's name is still geometry.** A Participant may add text
  ([Share roles](../013-workspace/share-roles.md#what-a-participant-changes)), and text it leaves left of the wall
  reads as that lane's name, as any text there does (default).
- An agent reads all of it in the `storm` view; it marks no event and answers no hotspot (default).

## Telemetry

`Canvas / Used / PivotalMarked`, `PivotalUnmarked`, `HotspotAnswered` and `LaneNamed` (default).

## Where it lives

- The marks, their pure writes and the tape's geometry: `packages/document/src/event-storming-structure.ts`; the
  tape in the SVG export `packages/document/src/svg-render-structure.ts`.
- The reading's part: `packages/storm-reading/src/structure.ts`.
- The room's rule for a Participant: `packages/document/src/participant-content.ts` (`BOARD_STRUCTURE_FIELDS`),
  held by `participant-content.leak.test.ts`.
- The acts and their gate: `apps/live/hooks/canvas/useStructureActions.ts`, `can.structure` in
  `apps/live/lib/editor-capabilities.ts`.
- The menu rows: `apps/live/lib/note-structure-menu.ts` and `apps/live/components/palette/NoteStructureRows.tsx`.
- On the canvas: `StructureTapes.tsx`, `StructureMarks.tsx`, `AnswerMark.tsx`, `AnswerField.tsx` and
  `NoteCallout.tsx` in `apps/live/components/canvas/structure/`; what keeps the field and the caption inside
  the window `apps/live/hooks/canvas/useKeepInWindow.ts`; which answer is open
  `apps/live/lib/structure-view.ts`; a blank lane name `apps/live/lib/lane-name.ts`.
- Taught in the help centre by `apps/help/app/canvas/event-storming-boards/reviewing-a-board/page.mdx`.
