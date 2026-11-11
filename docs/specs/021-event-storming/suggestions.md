# Suggestions

A **suggestion** is a note an agent proposes for an Event Storming board: its kind, its words, where it would go and
why. It is offered, never imposed: nothing on the board moves or changes until a person applies it.
An agent finds where the board is thin from the [board reading](board-reading.md)'s gaps, and adds what it knows
about the domain (the missing command, the policy everyone forgot, the external system nobody named).

## What a suggestion is

- **A sticky with `esSuggestion`.** It is a workshop note of its kind (`esKind`, the kind's fill and silhouette,
  the words as its label) that also carries `esSuggestion`:

  | Field      | Meaning                                                                       |
  | ---------- | ----------------------------------------------------------------------------- |
  | `anchorId` | The note it is placed against: a workshop note, or another suggestion         |
  | `side`     | `before`, `after` (same lane, left or right) or `above`, `below` (lane above) |
  | `reason`   | Why, in the agent's words, up to `SUGGESTION_REASON_MAX` (200) characters     |
  | `gap`      | The [gap](board-reading.md#gaps) code it closes, when it closes one           |
  | `by`       | Who suggested it: the agent's name as its presence shows it                   |

- **It is not board content.** A suggestion is invisible to everything that reads the board as a board: it is not
  painted as a note, not hit, not selected, not exported (SVG, PNG, Mermaid, Markdown, text), not counted by the
  lanes, the photo import, the next-note buttons, the Alt insertion, the lint or the reading.
  The layer funnels (`visibleLayerElements`, `layerBands`, `hiddenLayerElementIds`) drop it, exactly as they drop
  a hidden layer's elements, so one rule covers every painter and exporter.
- **It is an element so it travels.** Being an element, a suggestion is written by a changeset, relayed live, saved,
  merged on save, undone and reverted like any element, with no new transport.
- **Its place is derived, never stored.** Where a suggestion shows and where it lands are worked out from its anchor
  and side when needed; its stored `x` and `y` are where it would land on the board as it was when suggested.
- **It goes with its anchor.** Removing a note removes the suggestions anchored on it (and theirs), in the same
  step, as removing a box removes its pinned arrows. A suggestion whose anchor is missing anyway (an older copy,
  a merge) is an **orphan**: never shown, listed in the `storm` view, and removed by the next apply or dismiss.

## How an agent suggests

- **The edit operation `suggest`** ([Edit operations](../024-agents/edit-operations.md)):
  `suggest <kind> "<words>" before|after|above|below=<note> [reason="…"] [gap=<code>] [id=<id>]`.
  It is one changeset like any edit, attributed to the agent's owner, revertable as one unit.
- **Refusals**: `not_event_storming` (the tab is not a board), `invalid_kind`, `anchor_not_found`,
  `anchor_not_a_note` (the anchor is neither a workshop note nor a suggestion), `words_required` (a suggestion
  without words is no suggestion), `reason_too_long`, `too_many_suggestions` (the board would hold more than
  `SUGGESTIONS_MAX` (60) open suggestions).
- **One per place.** A second suggestion of the same kind, words and anchor replaces nothing and is refused as
  `duplicate_suggestion`, so an agent run twice does not stack copies.
- **The CLI**: `livedoc storm read <doc>` prints the reading with its gaps; `livedoc storm suggest <doc> -f <file>`
  applies suggest lines; `livedoc storm clear <doc>` removes the agent's open suggestions.
- **The MCP**: `read_event_storming` (the reading, gaps and open suggestions) and `suggest_notes` (up to 30
  suggestions as one changeset), and `update_document`'s ops take `suggest` too.
- The `storm` guide teaches the loop: read the board, take the gaps, add domain knowledge, suggest with a reason,
  never write notes directly when the person asked for suggestions.

## How a person sees them

Two presentations of the same suggestions, switched by one toggle, **Show All Suggestions**, which is the
person's own view (not shared, not saved with the board; off when the board opens) (default):

- **Off (the default): hints.** Nothing on the board moves. Each anchor that has suggestions shows a quiet hint at
  the side the suggestion would go; the hint names its kind by colour and its number when there are several.
  Pointing at a hint, or focusing it, previews the placeholder over the board where it would land, with its words,
  its reason and its two actions; still nothing moves.
- **On: placeholders.** Every suggestion is drawn full size where it would land, as a **placeholder**: the kind's
  paper at reduced opacity with a dashed border, its words, and its two actions. The board makes room for them as a
  preview, the way the Alt insertion previews: the notes that would stand aside are drawn shifted, the document is
  untouched, and switching the toggle off puts every note back.
- **The suggestions bar.** While a board has open suggestions, a small bar says how many and offers Show All
  Suggestions, Apply All and Dismiss All. It is the only permanent chrome the feature adds, and it is gone when the
  last suggestion is.
- The visual design of hints, placeholders and the bar is ruled in the design review recorded below.

## Applying and dismissing

- **Apply** turns the suggestion into an ordinary note: `esSuggestion` is dropped, and the note lands where the
  placeholder showed it, on its lane, exactly as the [next-note buttons](event-storming.md#phase-7-shipped-re-ruled-next-note-buttons)
  land one: one gutter beside its anchor for `before` and `after`, making room with the insertion ripple when the
  spot is taken; the same left edge on the lane above or below for `above` and `below`, taking the nearest free slot
  along that lane when the spot is taken. It is one undoable step through the ordinary choke point.
- **A suggestion on a suggestion** applies its anchor first, in the same step.
- **Apply All** applies every open suggestion in timeline order as one undoable step.
- **Dismiss** removes the suggestion; **Dismiss All** removes them all, as one undoable step.
- An applied note is selected, not opened for typing: its words were already chosen.
- **Telemetry**: `Canvas / Used / SuggestionApplied`, `SuggestionDismissed`, `SuggestionsShown` (the toggle on),
  and `Element / Added / Sticky` for an applied note.

## Share roles

| Role        | Sees                     | May                                                                        |
| ----------- | ------------------------ | -------------------------------------------------------------------------- |
| Editor      | hints, placeholders, bar | Show All, apply, dismiss, Apply All, Dismiss All                           |
| Participant | nothing of suggestions   | nothing: applying reshapes the board, which a Participant never does       |
| Viewer      | nothing of suggestions   | nothing                                                                    |
| Agent       | the `storm` view         | suggest, and remove its own owner's suggestions with `rm` or `storm clear` |

Participants and Viewers see none of it because they could act on none of it (default).

## Design review

Pending: the critique and four options for hints, placeholders and the bar, and Webber's ruling.
