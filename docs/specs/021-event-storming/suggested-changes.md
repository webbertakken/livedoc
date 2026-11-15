# Suggested changes

A **suggested change** is a change an agent proposes to something already on an Event Storming board: another name
for a candidate context, or a change to a note.
It is offered, never imposed, as a [suggested note](suggestions.md) is: pointing at it previews it, and nothing on the
board changes until a person accepts it.

Requested 2026-11-14: "click a (suggested) context and ask for alternative names", "click two and get suggestions for
the combined name", and "suggestions for better naming of a sticky, which should also affect other stickies when
accepted, and should be show a preview when hovered".

## Name suggestions

A **name suggestion** is another name for a candidate context, or one name for several contexts merged.

- **On the context.** `esContext.names` holds them, each a `name` (up to `CONTEXT_NAME_MAX`), a `reason` and who
  suggested it (`by`), and `with`: the other contexts it names, when it is a name for a merge.
  A merge's name suggestion is held by the context the merge keeps (the most notes; on a tie, the leftmost).
- A context, kept or suggested, holds up to `CONTEXT_NAMES_MAX` (5) of them, and one name is for at most
  `NAMED_CONTEXTS_MAX` (12) contexts (default).
- **The edit operation `suggest-name`**: `suggest-name "<name>" <context>… [reason="…"]`.
  One context: a name for it. Several: a name for them merged.
  Refusals: `not_event_storming`, `name_required`, `name_too_long`, `reason_too_long`, `contexts_required`,
  `not_a_context`, `duplicate_suggestion` (its present name, or a name already suggested for the same contexts,
  ignoring case), `too_many_suggestions` (the context holds five, or the board is full), `declined_before`, and
  `element_locked` for a locked context.
- **The MCP**: `suggest_notes` takes `names: [{ name, contexts, reason }]`; the CLI's `storm suggest` takes the line.
- **It goes with its contexts.** Removing a context removes the name suggestions it holds and those that name it.
  One left behind anyway (an older copy, a merge on save) is never shown or counted, and goes with the next write.

### How a person sees and decides

- **A context that holds names says so in words**: at rest, a small dashed chip under its name ("1 name",
  "3 names"). Selected, it unfolds into the name suggestions as chips under the name, led by "Rename to", with ✕
  after them (ruled 2026-11-14: "D · Worded tab").
- **Pointing at a chip, or focusing it, previews it**: the context's name reads as the suggestion would have it, and
  a caption gives the reason and who suggested it.
  A merge's chip previews by its caption alone: the selected outlines already show what would merge (default).
- **Choosing a chip renames the context**, and drops its other name suggestions for itself, in one undoable step.
  A suggested context stays suggested under its new name (default).
- **With two or more contexts selected**, the [merge offer](candidate-contexts.md#selecting-several-and-merging)
  shows the name suggestions made for exactly those contexts as chips.
  Choosing one merges them and names the merged context, in one undoable step, without opening the name for typing
  (ruled 2026-11-14: "Picking a name for both combined will merge them automatically").
  The merged context drops its name suggestions for itself, as one renamed by a chip does (default).
  The merged context is then the one selected, and the keyboard stays on its name (default).
- ✕ after the chips dismisses those shown; Delete on a focused chip dismisses that one.
  In the merge offer the chips bring no ✕ of their own: the offer's ✕ keeps the contexts apart (default).
- The count is in the name's accessible name too ("Candidate context: Ordering, 3 names suggested").
- **In the suggestions panel**: a **Names** row per context that holds any, and a **Merge** row per set of contexts
  a name was suggested for. Pointing at a row brings its contexts into view at full strength; choosing a row selects
  its contexts, which shows their chips under the name, or the merge offer with its chips (default).
  Such a row is chosen as a whole and holds ✕ alone, which dismisses its names: it has no ✓, because which name is
  the person's to pick (default).

## Note changes

A **note change** is a change proposed to one workshop note. There are four:

| Change   | Proposes                                             | Edit operation                                              |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `reword` | other words, and optionally a term that changes      | `suggest-reword <note> "<words>" [term="<old>" to="<new>"]` |
| `kind`   | another notation kind                                | `suggest-kind <note> <kind>`                                |
| `split`  | several notes for one that holds several facts       | `suggest-split <note> "<words>" "<words>"…`                 |
| `remove` | taking the note off the board (a duplicate, a stray) | `suggest-remove <note>`                                     |

- **On the note.** `esChanges` on the sticky holds them, up to `NOTE_CHANGES_MAX` (4), each with a `reason` and `by`.
  Words a change proposes run to `NOTE_CHANGE_WORDS_MAX` (200) characters (default).
- Every operation takes `reason="…"`.
  Refusals: `not_event_storming`, `note_not_a_note` (a suggestion is not a note), `words_required`,
  `invalid_kind`, `same_kind`, `parts_required` (a split needs two to `SPLIT_PARTS_MAX`, 4, parts),
  `term_not_in_words` (the old term is not in the note's words, or the new one not in the suggested words),
  `reason_too_long`, `duplicate_suggestion` (the note already holds that change, or already says those words),
  `too_many_suggestions` (the note holds four, or the board is full), `declined_before`, and `element_locked` for a
  locked note.
- A reword that only changes the casing is a reword; `term` and `to` go together.
- **The MCP**: `suggest_notes` takes `changes: [{ note, change, … }]`; the CLI's `storm suggest` takes the lines.
- The `storm-changes` guide teaches name suggestions and note changes, apart from the `storm` guide so each
  stays within a guide's budget (default).
- Every open suggestion counts towards `SUGGESTIONS_MAX`: a suggested note, a suggested context, a name suggestion
  and a note change alike.
- A note change goes with its note: removing the note removes it.
- **Suggesting writes the suggestion alone**: a name suggestion or a note change fills nothing else in on the
  context or note that holds it, such as a text size an older board left unset (default).

### A reword ripples

Ruled 2026-11-14: "Order Created would also affect Order Closed and any other Order that's related to the same
context (possibly all contexts) if the word Order changes in that suggestion."

- A reword that names a **term** (`term="Order" to="Booking"`) proposes that change for every note that holds the
  term, not only its own note. The agent names the term; the board finds the notes
  ([Board language](board-language.md#how-a-term-is-matched)).
- **Its context first** (ruled 2026-11-14). Accepting rewords the notes of the note's own candidate context, and
  that context's name. One word can mean two things in two contexts, so the board never assumes the wider change.
  For a note in no context, the notes in no context.
- **Everywhere** is offered beside ✓ when notes outside that scope hold the term: it rewords every note and context
  name on the board that holds it.
- Which notes ripple is worked out when the reword is previewed or accepted, from the board as it then is.
- A reword without a term changes its own note alone.

### How a person sees and decides

- **A change mark.** A note that holds changes wears a worded dashed tab on its top edge at its right end, in the
  family of the [peek tab](suggestions.md#how-a-person-sees-them): it says what the first change is ("Reword",
  "Split", "Remove") and "+N" when the note holds more ("Split +1"), on a faint tint of the kind's hue; never paper
  (ruled 2026-11-14: "D · Worded tab").
  - A kind change says the kind the note would become ("To Policy"): "Kind" alone says too little (default).
  - Its words are text, so they wear an ink that reads at 4.5:1 on the tint; the dashed stroke keeps 3:1.
  - Where a suggestion waits above the note, the mark keeps clear of that peek tab, and words that no longer fit
    are cut with an ellipsis; its accessible name always says the change whole (default).
- **Pointing at the mark, or focusing it, previews the note's first change**, with a caption: what changes, the
  reason and who suggested it, ✓ and ✕, and **Everywhere** for a reword that reaches further.
  The caption sits under the note, never on its paper, so the previewed note reads whole. It is moved back
  inside the window while its note stands at an edge, and stands under the note again once it fits, as the board
  is panned or zoomed (default).
  - `reword`: the note and every note that ripples draw their new words, and the caption counts them
    ("Also rewords 4 notes in Ordering · 3 more on the board").
    Pointing at Everywhere previews the reword across the whole board (default).
  - `kind`: the note draws as the other kind's paper and silhouette.
  - `split`: the note draws its first part and the others draw as placeholders after it, the board making room
    as Show All does. With Show All on, only the first part previews: the board is already drawn as Apply All
    would leave it (default).
  - `remove`: the note draws struck through and faint.
- A preview never writes: it is drawn over an untouched board, as every preview on this board is.
  It is drawn the way a drag in hand is drawn, so the context outlines and names follow it, and it is never sent
  to a collaborator.
- **A locked note, or one on a hidden or locked layer, wears no mark** and has no row: nothing is offered where the
  change would be refused (default).
- **The suggestions panel** lists every note change in timeline order of its note (the change, the words, the reason,
  ✓ and ✕, and Everywhere); pointing at a row previews it as the mark does.
  The panel's count is its rows: a context's names are one thing to decide (default).
- **Keyboard.** The mark is in the tab order; Enter accepts the first change and Delete dismisses it.

### Accepting

Each is one undoable step through the ordinary choke point.

- `reword`: the note takes the words; the notes that ripple take the term; the note's other rewords are dropped.
- `kind`: the note changes kind as Change Kind changes it, and the note's other kind changes are dropped.
- `split`: the note keeps the first part; each further part lands as a note of the same kind after it, as an applied
  `after` suggestion lands, and joins the note's candidate context, kept or suggested.
  The note's other changes stay for the person to decide.
- `remove`: the note is removed as Delete removes it, with what was suggested on it.
- Apply All and Dismiss All include name suggestions and note changes; Apply All takes the first name suggestion of
  each context and each note's first change, a reword in its context's scope (default).
  It applies the suggested notes and contexts first, then the names, then the note changes along the timeline, each
  on the board the one before left; a merge's name is left for the person to choose (default).
- Dismissing is [remembered](asks.md#what-was-declined).

## Share roles

As [suggestions](suggestions.md#share-roles): an Editor sees, accepts and dismisses; a Participant and a Viewer see
none of it; an agent suggests, and removes its owner's with `rm` or `storm clear`.

- **Taking one back.** `rm <note> suggested` drops the changes suggested on a note and `rm <context> suggested` the
  names a context holds, the note or context staying; a target that holds none is refused as `nothing_suggested`.
  `storm clear` does it for the whole board (default).
- An agent taking its own back is no dismissal: nothing is remembered as declined.

## Telemetry

`Canvas / Used / NameSuggestionApplied`, `NameSuggestionDismissed`, `NoteChangeApplied`, `NoteChangeDismissed`, and
`ContextsMerged` when a merge's name is chosen (default).

## Design review

Four looks for the change mark and the name chips were rendered in the editor on a seeded board (2026-11-14): a corner
tab with a count, a turned corner, a round badge with a glyph, and a worded tab.

- **Ruled 2026-11-14: "D · Worded tab".** The mark says what the change is; a context says in words that names
  wait, and its chips are led by what choosing one does. The merge offer's chips stay as they were.
- The critique the looks answered: a count alone says how many, never what; a glyph has to be learnt; a mark must
  never read as paper, must stand clear of the peek tabs on the same note, and must keep a 24 px hit target at any
  zoom.

## Where it lives

- Name suggestions: the field and its cascade in `packages/document/src/candidate-contexts.ts`, its reads and writes
  in `packages/document/src/context-names.ts`.
- Note changes: `packages/document/src/note-changes.ts`; accepting one, with the reword's ripple:
  `packages/document/src/note-change-accept.ts`.
- The count every suggestion shares: `packages/document/src/open-suggestions.ts`.
- The edit operations: `packages/edit-operations/src/operations/suggest-name.ts` and
  `packages/edit-operations/src/operations/suggest-change.ts`; what every suggest operation checks alike:
  `packages/edit-operations/src/operations/suggestion-rules.ts`; taking one back:
  `packages/edit-operations/src/operations/rm.ts`.
- The view's rows: `packages/storm-reading/src/suggested-changes.ts`.
- In the editor: what a board's suggested changes are, for drawing: `apps/live/lib/suggested-changes.ts`; accepting
  on the board (a split's parts land here): `apps/live/lib/suggested-changes-apply.ts`; the preview:
  `apps/live/lib/change-preview.ts`, drawn through the offered channel of `apps/live/lib/drag-preview.ts` by
  `apps/live/hooks/canvas/useOfferedPreview.ts`; a change's words: `apps/live/lib/change-caption.ts`; the acts:
  `apps/live/hooks/canvas/useChangeActions.ts`.
- On the canvas: the mark, its caption and what a preview adds (a split's parts, a removal's strike) in
  `apps/live/components/canvas/suggestions/` (`NoteChangeMark.tsx`, `ChangeCaption.tsx`, `NoteChangeMarks.tsx`);
  what keeps the caption inside the window: `apps/live/hooks/canvas/useKeepInWindow.ts`;
  the chips: `apps/live/components/canvas/contexts/NameChips.tsx`.
- The board seeded by the end-to-end tests: `apps/live/e2e/change-board.ts`.
- Taught in the help centre by `apps/help/app/canvas/event-storming-boards/suggested-changes/page.mdx`.
