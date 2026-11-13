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
  line round some paper rather than a box; the same context always wobbles the same way. Its name sits on the
  outline's top edge. It is drawn behind the notes and never covers their words.
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
  belongs to a context), `too_many_suggestions`.
- **The MCP**: `suggest_notes` takes contexts beside notes (`contexts: [{ name, notes, reason }]`); the CLI's
  `storm suggest` takes `suggest-context` lines.
- The `storm` guide teaches it: read the board, group the events by the part of the business they belong to, name
  each group in the business's words, and suggest it with a reason.

## How a person sees and decides

- **A suggested context** shows as its faint outline with its name, in the suggestions panel among the notes, in
  timeline order of its leftmost note.
- **Apply** keeps it as a candidate context (the suggestion mark is dropped); **Dismiss** removes it. One undoable
  step each; Apply All and Dismiss All include contexts.
- **A kept context** can be renamed (double-click its name) and deleted (select the outline, Delete). How its notes
  change is the open question below.

## Share roles

As suggestions: an Editor sees, applies and dismisses suggested contexts and edits kept ones; a Participant and a
Viewer see kept contexts and none of the suggested ones (default).

## Open

- **How a kept context's notes change**: through the note's menu (Add to Context, Remove from Context), by dragging
  a note into or out of the outline, both, or only by agents.
