# Lane plans

A **lane plan** is a proposal to reorganise an Event Storming board into fewer lanes: top to bottom, what each lane
is called and which notes it holds.
It is a suggestion like any other: the board previews it, and no note moves until a person applies it.

Requested 2026-11-14: "have the model be able to reorganise the lanes to constrain a domain anywhere between 2 and
12 lanes (choosable by the user). And our CLI, MCP or built-in model should be able to do that."

## Who does what

Ruled 2026-11-14: "The model names lanes", the board places and checks.

- **The model says what belongs together**: which notes share a lane, what the lane is called, and the lanes' order.
  That is judgement about the domain, which is a model's to make.
- **The board places the notes**: where on its lane each note stands is geometry, which is never a model's
  ([Board reading](board-reading.md): "a model is good at domain words and poor at geometry").
- **The board checks the result**: a plan that would change what the board says is refused, whoever made it.
- **The lane count bounds the whole board** (ruled 2026-11-14): every workshop note ends on one of at most N lanes,
  N from `LANES_MIN` (2) to `LANES_MAX` (12).

## What a lane means

This is the domain knowledge a model is told ([Asks](asks.md#what-a-model-is-told)); it holds no steps.

- Time runs left to right; notes one above the other belong to one moment.
- Up and down never means later: it means at the same time, instead, or whose.
- A note stays beside what it leads to: the reading says which, and reads no further than two lanes away.
- A candidate context is one part of the business: its notes read best together.
- A pivotal event is a border every lane respects.
- Fewer lanes tell one story in order; more lanes show what runs side by side.
- A lane's name says what it holds, in the business's words.

## The plan

- **An element.** A lane plan is a `shape` element carrying `esLanePlan` (`lanes`, each a `name` and its `notes` by
  id, top to bottom, with `reason` and `by`), so it travels by changeset, room, undo and merge as any element does.
  No painter draws it; the layer funnels drop it as they drop a suggestion (default).
- **One open plan a board.** A new plan replaces the one already open (default).
- **Which notes it holds.** Every workshop note but a locked one and one placed free of the lanes (Cmd/Ctrl): those
  stay where they are, and no plan names them. A note on a hidden layer is placed as any other (default).
- Nothing but workshop notes moves, save the [lane names](board-structure.md#lane-names), which the plan rewrites.

## How an agent suggests one

- **The edit operation `suggest-lane`**, one line per lane, top to bottom; the `suggest-lane` lines of one changeset
  make one plan:
  `suggest-lane "<name>" [lanes=<n>,…] [kind=<kind>,…] [context=<context>,…] [<note>…] [reason="…"]`.
- **A line says what its lane holds four ways**, which may be mixed: notes by ref, the notes of a candidate context,
  the notes of a kind, and the notes now on a lane, by the number the reading prints for it.
- **The most specific line takes a note**: named by ref, then by context, then by kind, then by lane; between two
  lines as specific, the first (default).
- The first `reason` given is the plan's.
- **Refusals**: `not_event_storming`, `name_required`, `name_too_long` (past `LANE_NAME_MAX`, 40), `invalid_kind`,
  `not_a_context`, `lane_not_found`, `lanes_out_of_range` (fewer than 2 lanes, or more than 12), `lane_empty` (a line
  that takes no note), `lanes_incomplete` (a note no line takes, naming the first ten), `lane_blocked` (a note would
  land on a locked or free-placed one), `reading_changes` (below), `reason_too_long`.
- **The MCP**: `suggest_notes` takes `lanes: [{ name, lanes, kinds, contexts, notes }]` and `lanesReason`; the CLI's
  `storm suggest` takes the lines. The lane count a person asked for travels in the prompt, not in the operation.

## How the board places a plan

- **Lanes are consecutive**, the plan's first on the top-most lane the board's workshop notes now use (default).
- **A note keeps its place in time.** Each note keeps its x. Along a lane, notes are taken left to right; where one
  would stand on the note before it, it and every note to its right, on every lane, move right by what is missing,
  so a column too deep for the lanes opens and nothing after it changes its order or spacing (default).
- **A note stands a gutter clear** (`ES_NOTE_GAP`) of the note before it on its lane, at least.
- **Placing is pure and repeatable**: the same board and plan always place the same.
  It lives beside the lanes, in `packages/document/src/event-storming-lane-plan.ts`.

## What must stay true

Checked by the operation when a plan is suggested, and again when it is previewed and applied.

- **The board says the same.** Every relation the [reading](board-reading.md#relations) finds before is found after,
  between the same two notes, and the timeline's events keep their order.
  A plan that would lose one, point one at another note, or reorder two events is refused as `reading_changes`,
  naming the first `READING_CHANGES_SHOWN` (5) of them, so an agent can change its plan.
- **A loose note may find a partner**: a relation the board gains is no refusal; the preview counts them (default).
- **At most twelve lanes, at least two; every note on a lane; no note on another.**
- **A plan made for an older board is stale**: when a workshop note it does not hold has arrived, a note it holds
  has gone, or it no longer passes the check, it shows as stale, with Dismiss alone and "The board changed since this
  plan was made. Ask again." (default).

## The fold

The **fold** is the board's own plan, made without a model, for a deployment with none and for a model whose plan
was refused twice.

- It merges two neighbouring lanes at a time, the pair whose notes overlap least along the timeline first, until N
  lanes are left; a merged lane keeps the name of the lane that held more notes (default).
- It passes the same check. When it does not, the board says "No arrangement in N lanes keeps what the board says.
  Try more lanes." and suggests nothing.
- A board already on N lanes or fewer has nothing to fold: "The board already fits N lanes."

## How a person sees and decides

- **The suggestions panel** lists the plan first: "Lane plan", how many lanes, the reason and who, ✓ and ✕.
- **Pointing at the row, or focusing it, previews the plan**: every note draws where it would stand, the lane names
  draw at the wall's left, and the view fits the board as it would be. The caption says "Reads the same", and how
  many loose notes find a partner when any do.
- **Apply** moves the notes, writes the lane names and removes the plan, as one undoable step.
- **Dismiss** removes the plan. Apply All and Dismiss All include it; Apply All applies it first.
- Nothing is offered where the change would be refused, as with every suggestion.

## Share roles

As [suggestions](suggestions.md#share-roles): an Editor sees, applies and dismisses a plan; a Participant and a
Viewer see none of it; an agent suggests one, and removes its owner's with `rm` or `storm clear`.

## Telemetry

`Canvas / Used / LanePlanApplied`, `LanePlanDismissed` and `LanesFolded` (default).

## Where it lives

- The plan, its placing and the fold: `packages/document/src/event-storming-lane-plan.ts`.
- The check: `packages/storm-reading/src/same-reading.ts`.
- The edit operation: `packages/edit-operations/src/operations/suggest-lane.ts`.
- The preview and the acts: `apps/live/lib/lane-plan-preview.ts` and `apps/live/hooks/canvas/useLanePlanActions.ts`.
