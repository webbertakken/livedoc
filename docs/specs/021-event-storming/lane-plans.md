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
- **A plan keeps each note's x** (ruled 2026-11-14: "Keep each note's x"). Laying the board out afresh along the
  timeline is a separate act, [Arrange and Reorder](arrange.md).

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
- **One open plan a board.** A new plan replaces the one already open, and an open plan counts as one suggestion
  towards the board's limit (default).
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
- **A plan is made for the board its changeset leaves**: the lines are settled after the changeset's last
  operation, so a changeset that also adds or removes a note plans for the board as it will be (default).
- **Refusals**: `not_event_storming`, `name_required`, `name_too_long` (past `LANE_NAME_MAX`, 40), `invalid_kind`,
  `not_a_context`, `lane_not_found`, `lanes_out_of_range` (fewer than 2 lanes, or more than 12), `lane_empty` (a line
  that takes no note), `lanes_incomplete` (a note no line takes, naming the first ten), `lane_blocked` (a note would
  land on a locked or free-placed one, or a line names a free-placed note by ref), `element_locked` (a line names a
  locked note by ref, as every operation refuses one; default), `reading_changes` (below), `reason_too_long`.
  A line that names a kind, a context or a lane simply does not take a locked or free-placed note.
- **The MCP**: `suggest_notes` takes `lanes: [{ name, lanes, kinds, contexts, notes }]` and `lanesReason`; the CLI's
  `storm suggest` takes the lines. The lane count a person asked for travels in the prompt, not in the operation.
- **The `storm` view** lists the open plan under "lane plan": its ref, its lanes top to bottom with how many notes
  each holds, who and why, and `stale` when the board changed since it was made (default).
- The `storm-lanes` guide teaches what a lane means, the line, the refusals to act on, and `arrange`.

## How the board places a plan

- **Lanes are consecutive**, the plan's first on the top-most lane the notes it holds now stand on (default).
- **A note keeps its place in time** (ruled 2026-11-14). Each note keeps its x. Along a lane, notes are taken left
  to right; where one would stand on the note before it, it and every note to its right, on every lane, move right
  by what is missing, so a column too deep for the lanes opens and nothing after it changes its order or spacing.
- **Left to right is by a note's moment**: its centre, then the lane it came from, then its place in the document
  (default). Notes differ in width, so a column taken by its centres opens as it reads: actor, command, event.
- **A note stands a gutter clear** (`ES_NOTE_GAP`) of the note before it on its lane, at least.
- **Placing is pure and repeatable**: the same board and plan always place the same.

## What must stay true

Checked by the operation when a plan is suggested, and again when it is previewed and applied.

- **The board says the same.** Every relation the [reading](board-reading.md#relations) finds before is found after,
  between the same two notes, and the timeline's events keep their order.
  A plan that would lose one, point one at another note, or reorder two events is refused as `reading_changes`,
  naming the first `READING_CHANGES_SHOWN` (5) of them, so an agent can change its plan.
- **The events' order is the timeline's**: by moment, then by lane. A plan that swaps the lanes of two events of
  one moment reorders them, and is refused (default).
- **A loose note may find a partner**: a relation the board gains is no refusal; the preview counts them (default).
- **At most twelve lanes, at least two; every note on a lane; no note on another.**
- **A plan made for an older board is stale**: when a workshop note it does not hold has arrived, a note it holds
  has gone, or it no longer passes the check, it shows as stale, with Dismiss alone and "The board changed since this
  plan was made. Ask again." (default).

## The fold

The **fold** is the board's own plan, made without a model, for a deployment with none and for a model whose plan
was refused twice.

- It merges two neighbouring lanes at a time, the pair whose notes overlap least along the timeline first, until N
  lanes are left; a merged lane keeps the name of the lane that held more notes, the upper on a tie (default).
- **Each merge is checked**: a pair whose merge would change what the board says is passed over for the next least
  overlapping one (default). A lane with no name is "Lane N", by the number the reading prints for it (default).
- It passes the same check. When no pair does, the board says "No arrangement in N lanes keeps what the board says.
  Try more lanes." and suggests nothing.
- A board already on N lanes or fewer has nothing to fold: "The board already fits N lanes."

## How a person sees and decides

- **The suggestions panel** lists the plan first: "Lane plan", how many lanes, the reason and who, ✓ and ✕.
  The row says the reason whole, with who suggested it beneath: a plan has no caption on the board to say them
  (default).
- **Pointing at the row, or focusing it, previews the plan**: every note draws where it would stand, the lane names
  draw at the wall's left, and the view fits the board as it would be. The caption says "Reads the same", and how
  many loose notes find a partner when any do.
- **The caption is a bar** at the bottom of the canvas, "2 lanes · Reads the same", with nothing to press: the row
  decides (default). The notes glide to where they would stand and back; under reduced motion they jump.
- **While a plan is previewed the board shows the plan alone**: the peek tabs, placeholders and change marks stand
  down, and the panel stays, its row keeping the keyboard (default).
- **Apply** moves the notes, writes the lane names and removes the plan, as one undoable step.
- **Dismiss** removes the plan, and nothing is remembered as declined: a plan is for the board as it stood.
  Apply All and Dismiss All include it; Apply All applies it first, and leaves a stale one for its row to say so
  (default).
- **A plan is never on the board to select**: no marquee, Select All or key reaches it.
- Nothing is offered where the change would be refused, as with every suggestion.

## Share roles

As [suggestions](suggestions.md#share-roles): an Editor sees, applies and dismisses a plan; a Participant and a
Viewer see none of it; an agent suggests one, and removes its owner's with `rm` or `storm clear`.

## Telemetry

`Canvas / Used / LanePlanApplied`, `LanePlanDismissed` and `LanesFolded` (default). `LanesFolded` is counted where a
person is given the fold, by an [ask](asks.md).

## Where it lives

- The plan a board holds, and which notes a plan may hold: `packages/document/src/event-storming-lane-plan.ts`.
- Resolving an agent's lines to notes: `packages/storm-reading/src/lanes/resolve.ts`; placing:
  `packages/storm-reading/src/lanes/place.ts`; what is in the way: `packages/storm-reading/src/lanes/blocked.ts`.
- The check, and a change in a person's words: `packages/storm-reading/src/lanes/same-reading.ts`; the verdict and
  applying: `packages/storm-reading/src/lanes/check.ts`; writing the lane names:
  `packages/storm-reading/src/lanes/names.ts`; the fold: `packages/storm-reading/src/lanes/fold.ts`.
- The `storm` view's line: `packages/storm-reading/src/lanes/view.ts`.
- The edit operation, settled after its changeset's last line:
  `packages/edit-operations/src/operations/suggest-lane.ts`.
- The MCP's `lanes` and the CLI's lines: `packages/agent-verbs/src/storm/storm-calls.ts`.
- In the editor: the board as a plan would leave it, and the plan's row: `apps/live/lib/board-offer.ts`; what the
  bar says: `apps/live/lib/board-offer-words.ts`; the bar:
  `apps/live/components/canvas/suggestions/BoardOfferBar.tsx`, shown by
  `apps/live/components/canvas/suggestions/BoardOffers.tsx`; applying and dismissing:
  `apps/live/hooks/canvas/useLaneActions.ts`; the glide: `apps/live/hooks/canvas/useOfferGlide.ts`.
- Proven in a browser by `apps/live/e2e/event-storming-lane-plans.spec.ts`, on the kitchen of
  `apps/live/e2e/lane-board.ts`.
