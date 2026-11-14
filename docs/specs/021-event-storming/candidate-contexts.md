# Candidate contexts

A **candidate context** is a group of notes on an Event Storming board that seem to belong to one part of the
business: a loose, hand-drawn dashed outline around them, with a name.
It is what Brandolini calls a candidate bounded context: on a Big Picture wall, grouping events shows where the
business naturally splits. A bounded context proper (one model, one language, one team) is a design decision made
later; a candidate context is the evidence for it (ruled 2026-11-13: "Candidate context").

Requested 2026-11-13: agents suggest groupings too, drawn as seemingly free-drawn shapes with dashed lines.

## What it is

- **A name and its notes.** A candidate context holds a name (up to `CONTEXT_NAME_MAX`, 60, characters) and the
  workshop notes it groups, by id. A note belongs to at most one candidate context (default).
- **Its shape follows its notes.** The outline is never drawn by hand and never stored: it is worked out from where
  its notes stand, as a loose hull around the outermost of them, so it reshapes itself whenever a note moves, is
  added or leaves (ruled 2026-11-13: "stays a dashed shape that shapes based on the outer stickies").
- **It looks drawn, not drafted.** A dashed line in a muted ink, with a gentle, seeded wobble so it reads as a marker
  line round some paper rather than a box; the same context always wobbles the same way. The line is drawn
  behind the notes; its name sits in the middle of the shape, over them (see "The name").
- **It is board content, not a note.** It is not a workshop note: the reading, the lanes, the next-note buttons and
  the Alt insertion ignore it as they ignore any shape. The domain export reads it: each candidate context names a
  context the brief groups aggregates into.
- **A note leaving takes nothing with it.** A deleted note leaves its context; a context with no notes left is
  removed in the same step (default).

## How an agent suggests one

- A **suggested** candidate context is the same thing marked as a suggestion, with the agent's reason and who
  suggested it, as a suggested note is ([Suggestions](suggestions.md)). Its outline is drawn fainter and its name
  carries a "suggested" mark; nothing on the board moves.
- **The edit operation `suggest-context`**: `suggest-context "<name>" <note>… [reason="…"]`. Refusals:
  `not_event_storming`, `name_required`, `notes_required`, `note_not_a_note`, `note_in_context` (the note already
  belongs to a context), `too_many_suggestions`, and `name_too_long` and `reason_too_long` past their limits.
  A note named twice counts once; a suggested context counts towards `SUGGESTIONS_MAX` as a suggested note does.
- **The MCP**: `suggest_notes` takes contexts beside notes (`contexts: [{ name, notes, reason }]`); the CLI's
  `storm suggest` takes `suggest-context` lines.
- The `storm` guide teaches it: read the board, group the events by the part of the business they belong to, name
  each group in the business's words, and suggest it with a reason.

## How a person sees and decides

- **A suggested context** shows as its faint outline with its name, in the suggestions panel among the notes, in
  timeline order of its leftmost note.
  Its row reads "Context", the name, how many notes, and the reason; pointing at it or focusing it brings the
  outline into view and draws it at full strength, and its outline on the board carries ✓ and ✕ by its name
  (default).
  Show All Suggestions changes nothing about a suggested context: it is always drawn (default).
- **Apply** keeps it as a candidate context (the suggestion mark is dropped); **Dismiss** removes it. One undoable
  step each; Apply All and Dismiss All include contexts.
- **A kept context** can be renamed (double-click its name) and deleted (select the outline, Delete).
- **Its notes change two ways** (ruled 2026-11-13: "Note menu and dragging"):
  - **The note's menu**: Add to Context (a list of the board's contexts by name) and Remove from Context.
  - **Dragging**: a note dropped inside an outline joins that context, leaving any other; a note dragged clear of
    its own outline by more than `CONTEXT_LEAVE_PX` (half a note, 100 canvas px) leaves it (default). While a
    note is dragged, the outline it would join is highlighted, so a drop is never a surprise.
  - A suggested context does not take notes by dragging until it is applied (default).

## Its outline, exactly

- **A loose hull.** The outline is the convex hull of its notes, grown by `CONTEXT_PADDING_PX` (24 canvas px) all
  round, so its corners come out round (default).
  Only its notes on visible layers count; a context with none showing draws nothing (default).
- **The wobble.** The hull is walked at a fixed step and each point is pushed in or out along the hull by a smooth,
  seeded wander of at most `CONTEXT_WOBBLE_PX` (4 canvas px), seeded by the context's id (default).
  The dash is `CONTEXT_DASH_PX` long with an equal gap, 2 px wide (default).
- **The name** sits in the middle of the shape: centred on the outline's centroid (its area's weighted centre), drawn
  over the notes on a plate of the canvas colour at 85% opacity, so it reads at any zoom (ruled 2026-11-13: "always
  be in the middle of weighted center ... inside the shape").
- **It grows as the board zooms out.** The name is `CONTEXT_NAME_PX` (15) canvas px at 100% and closer, and keeps
  that size on screen when zoomed further out, so on the canvas it grows by 1 / zoom (ruled 2026-11-13: "font size
  should grow when zooming out").
- **It keeps clear of the line.** Its plate keeps at least `CONTEXT_NAME_CLEARANCE_PX` (12 screen px) inside the
  outline on every side; when the shape is too small for that, the name shrinks until it fits, down to
  `CONTEXT_NAME_MIN_PX` (9) canvas px, and below that sits centred regardless (default).
- The same placement draws in the PNG and SVG exports, at 100% (default).
- Requested for suggested contexts and applied to every context, so the two read alike (default).
- **Ink.** A muted slate: slate-500 on the light canvas, slate-400 on the dark one, each 3:1 or more against the
  canvas (WCAG 2.2 1.4.11); the name in slate-700 and slate-200, 4.5:1 or more (default).
  A suggested outline draws at half the opacity, its name in italics followed by "· suggested" (default).
- **Overlap.** Two outlines may cross; nothing is moved to keep them apart.

## Selecting, renaming and deleting

- A kept context is selected by clicking its outline or its name, or by tabbing to its name; a selected context
  draws its outline solid in the brand colour (default).
- The selection is the context's own, not the editor's: selecting one clears the editor's selection, and selecting
  an element clears it (default).
- **Rename**: double-click the name, or Enter on a selected context, opens the name for typing; Enter or leaving
  the field keeps it, Escape puts the old name back, and an empty name is never kept (default).
- **Delete**: Delete or Backspace on a selected context removes it; its notes stay where they are.

## Selecting several and merging

Requested 2026-11-13: "shift click two (suggested) groups to select both and I should get a suggestion for merging
them".

- **Shift-click** an outline or its name, kept or suggested, adds it to the selection or takes it out; a plain click
  selects that one alone. Tabbing to a name selects that one alone (default).
- The context selection is cleared by Escape, by a click on the canvas away from every context, and by selecting an
  element (default).
- **With two or more selected**, a **Merge** offer sits between their names, above the highest:
  "Merge 2 contexts" with a ✓ (merge) and ✕ (keep them apart, which clears the selection) (default).
- **Merging** makes one context of them, in one undoable step:
  - it keeps the context with the most notes (on a tie, the leftmost), its name and its place in the board;
  - its notes are all of theirs, in order; the others are removed;
  - it stays a suggestion only when every one merged was a suggestion, its reasons joined with "; " and cut to
    `SUGGESTION_REASON_MAX`; with any kept one among them it is kept (default);
  - its name opens for typing straight away, so it can be named for what it now holds (default).
- An Editor's alone, as every act on contexts. Telemetry: `Canvas / Used / ContextsMerged`.
- Delete on a selected context still acts on that one (default).

## Joining and leaving, exactly

- **Inside** means the note's centre lies inside the outline its context's other notes make, the note left out
  (default).
- A note dropped inside more than one outline joins the smallest (default).
- A note leaves when the gap between it and the outline its context's other notes make is more than
  `CONTEXT_LEAVE_PX` (default).
- Only workshop notes join; a plain sticky, text or shape never does.
- While a drag is in hand, every outline draws as the drop would leave it: the outline a note would join takes it
  in and is highlighted in the brand colour, and the one it would leave lets it go (default).
- **Applying** a suggested context takes its notes out of any other context they joined since (default).
- Joining, leaving, renaming and deleting are each one undoable step through the ordinary choke point.

## Where it lives

- **An element.** A candidate context is a `shape` element carrying `esContext` (`notes`, the member ids, and, while
  suggested, `suggestion` with `reason` and `by`), its name as the element's `label`, so it travels by changeset,
  room, undo and merge as any element does (default).
- **No painter draws it as a shape.** The layer funnels drop it as they drop a suggestion; the canvas draws it in
  its own layer beneath the notes, and the SVG and PNG exports draw kept ones from the same outline (default).
  Text exports (Mermaid, Markdown, the views) leave it out; the board reading lists it.
- Its `x`, `y`, `width` and `height` are its notes' bounds when it was written: a snapshot that nothing draws from.
- `CONTEXT_NOTES_MAX` (400, as many notes as a domain export reads) caps its notes (default).
- The outline: `packages/document/src/candidate-context-outline.ts`; the model, membership writes and the cascade:
  `packages/document/src/candidate-contexts.ts`; the export's drawing and the inks:
  `packages/document/src/svg-render-contexts.ts`; joining by drag: `apps/live/lib/context-drop.ts`.
- On the canvas: `apps/live/components/canvas/contexts/` (drawn from `apps/live/lib/context-outlines.ts`; the lines and
  the names are two parts of one layer); the selection: `apps/live/lib/context-selection.ts`; the acts:
  `apps/live/hooks/canvas/useContextActions.ts`; the note menu's rows: `apps/live/lib/note-context-menu.ts`.
- The edit operation: `packages/edit-operations/src/operations/suggest-context.ts`; the reading's contexts:
  `packages/storm-reading/src/contexts.ts`.
- The board seeded by the end-to-end tests: `apps/live/e2e/context-board.ts`.

## In the reading and the export

- `storm.json` lists the kept contexts as `contexts`: id, ref, name and its notes in timeline order.
- `storm.md` prints them after the timeline (`contexts`, one line each: ref, name, its notes' refs); suggested ones
  print among the suggestions (`<ref> context "<name>" <refs>`, who and why).
- `CHANGES.md` reports contexts added, removed and renamed, and notes that joined or left one (default).
- The brief (`CONVERT.md`) tells the model to take each candidate context as a bounded context to group the
  aggregates, events and commands into, named as the board names it, and to weigh it as evidence, not a ruling.

## Telemetry

`Canvas / Used / ContextApplied`, `ContextDismissed`, `ContextRenamed`, `ContextDeleted`, `ContextNoteJoined` and
`ContextNoteLeft` (the menu and a drop alike); Apply All and Dismiss All stay the suggestions' events (default).

## Share roles

As suggestions: an Editor sees, applies and dismisses suggested contexts and edits kept ones; a Participant and a
Viewer see kept contexts and none of the suggested ones (default).
A Participant who moves a note changes no context: joining and leaving are an Editor's (default).
An agent suggests contexts and removes its owner's suggested ones with `rm` or `storm clear`, as with notes.
