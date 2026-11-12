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
  | `by`       | Who suggested it: the token owner's name, as the agent's presence shows it    |

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

- **Off (the default): peek tabs.** Nothing on the board moves. Each anchor side that has suggestions shows one
  **peek tab**: a small dashed tab tucked behind the anchor on the side the suggestion would land, open where it
  meets the paper, as if the note-to-be were waiting behind this one.
  - One tab per anchor side, however many suggestions it holds; a chain (a suggestion on a suggestion) counts under
    the side its first link grows from. The tab shows the count when it holds more than one.
  - It is never paper: a dashed outline with a faint tint of the kind's hue, no solid fill.
  - Beside the note (`before`, `after`) it stays inside the gutter (three quarters of `ES_NOTE_GAP`), so it never
    lies on the note beside; above and below, where lanes leave more room, it reaches further (default).
  - It runs a quarter of the anchor's edge. Beside the note it sits towards the top, so the
    [next-note tab](event-storming.md#phase-7-shipped-re-ruled-next-note-buttons) keeps the middle of the same edge
    and both show on a selected note; above and below it is centred (default).
- **Pointing at a peek tab, or focusing it, previews the suggestion** where it would land, drawn as a placeholder
  (below) with a caption: the agent's reason in its own words and who suggested it, never a gap code.
  As the next-note tab's ghost does, the preview stands on the spot one gutter beside the anchor even when that spot
  is taken; nothing moves until it is applied, which makes room. A tab holding a chain previews the whole chain.
- **On: placeholders.** Every suggestion is drawn full size where Apply All would land it, as a **placeholder**.
  The board makes room for them as a preview, the way the Alt insertion previews: the notes that would stand aside
  are drawn shifted, the document is untouched, and switching the toggle off puts every note back.
- **A placeholder** is pale paper (the kind's paper over white, in either scheme) inside a dashed border, the kind
  named small above its words, with ✓ (apply) and ✕ (dismiss); pointing at it shows the caption.
- **The suggestions panel.** While a board has open suggestions, the top right of the canvas holds the panel,
  **collapsed by default** to a small button that says how many there are (default: collapsed again each time the
  board opens). Expanded, it lists every suggestion in timeline order (kind, words, reason, ✓ and ✕) and holds Show
  All Suggestions, Apply All and Dismiss All. Pointing at a row, or focusing it, brings its anchor and its spot into
  view (the least pan that shows both, none when they already show) (default) and previews it as a peek tab does.
  It is the only chrome the feature adds, and it is gone when the last suggestion is.
- **Colour.** A dashed stroke is non-text UI and needs 3:1 against what it stands on (WCAG 2.2 1.4.11): on the light
  canvas the kind's darker (700) shade, on the dark canvas the kind's own paper colour, which stands clear of the
  dark ground. A placeholder's stroke and kind name stand on its pale paper, so they take the darker shade in either
  scheme.
- **Keyboard.** Peek tabs, placeholders and panel rows are in the tab order. On a peek tab or a placeholder, Enter
  applies and Delete (or Backspace) dismisses; on a peek tab that holds several, the first in its chain (default).
- **Motion.** The Show All preview eases as the Alt insertion's does, and is instant under reduced motion.

## Applying and dismissing

- **Apply** turns the suggestion into an ordinary note: `esSuggestion` is dropped, and the note lands where the
  placeholder showed it, on its lane, exactly as the [next-note buttons](event-storming.md#phase-7-shipped-re-ruled-next-note-buttons)
  land one: one gutter beside its anchor for `before` and `after`, making room with the insertion ripple when the
  spot is taken; the same left edge on the lane above or below for `above` and `below`, taking the nearest free slot
  along that lane when the spot is taken. It is one undoable step through the ordinary choke point.
- **A suggestion on a suggestion** applies its anchor first, in the same step.
- **Apply All** applies every open suggestion in timeline order as one undoable step.
- **Dismiss** removes the suggestion and the suggestions chained on it; **Dismiss All** removes them all, as one
  undoable step.
- Every apply and dismiss also removes the board's orphans, in the same step.
- Nothing is offered where the change would be refused: a locked tab, a hidden or locked active layer, or a drag in
  hand hides the tabs, placeholders and panel (default).
- An applied note is selected, not opened for typing: its words were already chosen.
- **Telemetry**: `Canvas / Used / SuggestionApplied`, `SuggestionDismissed`, `SuggestionsAppliedAll`,
  `SuggestionsDismissedAll`, `SuggestionsShown` (the toggle on), and `Element / Added / Sticky` once per apply.

## Share roles

| Role        | Sees                           | May                                                                        |
| ----------- | ------------------------------ | -------------------------------------------------------------------------- |
| Editor      | peek tabs, placeholders, panel | Show All, apply, dismiss, Apply All, Dismiss All                           |
| Participant | nothing of suggestions         | nothing: applying reshapes the board, which a Participant never does       |
| Viewer      | nothing of suggestions         | nothing                                                                    |
| Agent       | the `storm` view               | suggest, and remove its own owner's suggestions with `rm` or `storm clear` |

Participants and Viewers see none of it because they could act on none of it (default).

## Design review

Four directions for the hints were rendered in the editor on a real board (ruled 2026-11-11, "render all four"):
a peek tab tucked behind the anchor, a corner dot with the preview on hover, placeholders wherever they fit without
overlap with the rest collapsing to peek tabs, and a side panel listing them by timeline.

- **Ruled 2026-11-11: "A: Peek tab, and an expand/collapse from the side panel as well. Hovering one goes to the right
  position and shows the suggestions. By default it's collapsed."** The peek tab is the hint; the side panel is the
  suggestions panel above, collapsed by default, and it replaces the separate suggestions bar first specified.
- The critique the designs answered: a hint never reads as paper; it sits on the anchor's edge at the side the note
  would land; one per anchor side with a count; it gives the next-note tab the middle of the edge; its caption is the
  reason and who, never a gap code; its dashed stroke meets 3:1.

## Where it lives

- Placement and grouping: `apps/live/lib/suggestion-hints.ts`; apply, Apply All, dismiss and the Show All preview:
  `apps/live/lib/suggestion-apply.ts`; the person's view: `apps/live/lib/suggestion-view.ts`.
- The acts: `apps/live/hooks/canvas/useSuggestionActions.ts`, composed into the editor state; the Editor gate is
  `can.suggestions` in `apps/live/lib/editor-capabilities.ts`.
- The peek tabs, placeholders and panel: `apps/live/components/canvas/suggestions/`; the Show All shift rides the
  insertion preview's `useInsertShift`.
- The seeded board the end-to-end tests use: `apps/live/e2e/suggestion-board.ts`.
