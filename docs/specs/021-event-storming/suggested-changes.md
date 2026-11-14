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
- A context, kept or suggested, holds up to `CONTEXT_NAMES_MAX` (5) of them.
- **The edit operation `suggest-name`**: `suggest-name "<name>" <context>… [reason="…"]`.
  One context: a name for it. Several: a name for them merged.
  Refusals: `not_event_storming`, `name_required`, `name_too_long`, `reason_too_long`, `contexts_required`,
  `not_a_context`, `duplicate_suggestion` (its present name, or a name already suggested for the same contexts,
  ignoring case), `too_many_suggestions`, `declined_before`.
- **The MCP**: `suggest_notes` takes `names: [{ name, contexts, reason }]`; the CLI's `storm suggest` takes the line.
- **It goes with its contexts.** Removing a context removes the name suggestions it holds and those that name it.

### How a person sees and decides

- **Chips under the name.** A selected context shows its name suggestions as chips under its name, with ✕ after
  them; a context that holds any wears a small count beside its name (default).
- **Pointing at a chip, or focusing it, previews it**: the context's name reads as the suggestion would have it, and
  a caption gives the reason and who suggested it.
- **Choosing a chip renames the context**, and drops its other name suggestions for itself, in one undoable step.
  A suggested context stays suggested under its new name (default).
- **With two or more contexts selected**, the [merge offer](candidate-contexts.md#selecting-several-and-merging)
  shows the name suggestions made for exactly those contexts as chips.
  Choosing one merges them and names the merged context, in one undoable step, without opening the name for typing
  (ruled 2026-11-14: "Picking a name for both combined will merge them automatically").
- ✕ dismisses the chips shown; Delete on a focused chip dismisses that one.
- **In the suggestions panel**: a **Names** row per context that holds any, and a **Merge** row per set of contexts
  a name was suggested for. Pointing at a row brings its contexts into view at full strength; choosing a Merge row
  selects its contexts, which shows the merge offer with its chips (default).

## Note changes

A **note change** is a change proposed to one workshop note. There are four:

| Change   | Proposes                                             | Edit operation                                              |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `reword` | other words, and optionally a term that changes      | `suggest-reword <note> "<words>" [term="<old>" to="<new>"]` |
| `kind`   | another notation kind                                | `suggest-kind <note> <kind>`                                |
| `split`  | several notes for one that holds several facts       | `suggest-split <note> "<words>" "<words>"…`                 |
| `remove` | taking the note off the board (a duplicate, a stray) | `suggest-remove <note>`                                     |

- **On the note.** `esChanges` on the sticky holds them, up to `NOTE_CHANGES_MAX` (4), each with a `reason` and `by`.
- Every operation takes `reason="…"`.
  Refusals: `not_event_storming`, `note_not_a_note` (a suggestion is not a note), `words_required`,
  `invalid_kind`, `same_kind`, `parts_required` (a split needs two to `SPLIT_PARTS_MAX`, 4, parts),
  `term_not_in_words` (the old term is not in the note's words, or the new one not in the suggested words),
  `reason_too_long`, `duplicate_suggestion`, `too_many_suggestions`, `declined_before`.
- **The MCP**: `suggest_notes` takes `changes: [{ note, change, … }]`; the CLI's `storm suggest` takes the lines.
- Every open suggestion counts towards `SUGGESTIONS_MAX`: a suggested note, a suggested context, a name suggestion
  and a note change alike.
- A note change goes with its note: removing the note removes it.

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

- **A change mark.** A note that holds changes wears a small dashed tab on its top right corner, in the family of
  the [peek tab](suggestions.md#how-a-person-sees-them), with the count when it holds more than one (default).
- **Pointing at the mark, or focusing it, previews the note's first change**, with a caption: what changes, the
  reason and who suggested it, ✓ and ✕, and **Everywhere** for a reword that reaches further.
  - `reword`: the note and every note that ripples draw their new words, and the caption counts them
    ("Also rewords 4 notes in Ordering · 3 more on the board").
  - `kind`: the note draws as the other kind's paper and silhouette.
  - `split`: the parts draw as placeholders after the note, the board making room as Show All does.
  - `remove`: the note draws struck through and faint.
- A preview never writes: it is drawn over an untouched board, as every preview on this board is.
- **The suggestions panel** lists every note change in timeline order of its note (the change, the words, the reason,
  ✓ and ✕, and Everywhere); pointing at a row previews it as the mark does.
- **Keyboard.** The mark is in the tab order; Enter accepts the first change and Delete dismisses it.

### Accepting

Each is one undoable step through the ordinary choke point.

- `reword`: the note takes the words; the notes that ripple take the term; the note's other rewords are dropped.
- `kind`: the note changes kind as Change Kind changes it, and the note's other kind changes are dropped.
- `split`: the note keeps the first part; each further part lands as a note of the same kind after it, as an applied
  `after` suggestion lands, and joins the note's candidate context.
- `remove`: the note is removed as Delete removes it, with what was suggested on it.
- Apply All and Dismiss All include name suggestions and note changes; Apply All takes the first name suggestion of
  each context and each note's first change, a reword in its context's scope (default).
- Dismissing is [remembered](asks.md#what-was-declined).

## Share roles

As [suggestions](suggestions.md#share-roles): an Editor sees, accepts and dismisses; a Participant and a Viewer see
none of it; an agent suggests, and removes its owner's with `rm` or `storm clear`.

## Telemetry

`Canvas / Used / NameSuggestionApplied`, `NameSuggestionDismissed`, `NoteChangeApplied`, `NoteChangeDismissed`, and
`ContextsMerged` when a merge's name is chosen (default).
