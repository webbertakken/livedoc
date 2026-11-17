# Escape backs out

Escape is the way out: wherever someone is, one press backs out of the innermost transient state they are in.
A person who does not yet know a highlight, a tool or a panel is never stuck in it; Escape gets them out.
This page is the rule; each surface's own spec says only what its layer does, and links here.

## The rule

- **One layer per press.** Escape backs out of exactly one transient state, the innermost, and never two at once.
- **Never nothing.** While a transient state shows, Escape leaves one; it never falls through to do nothing.
- **Never more than out.** Escape never deletes, writes or opens anything; leaving a state is all it does.
- **The keyboard is not lost.** Where the state held focus, focus goes back to what opened it.

## The ladder

The layers, innermost first (`ESCAPE_LADDER` in `apps/live/lib/escape-ladder.ts`).
A press backs out of the first layer that is present, wherever the keyboard focus stands.

1. **`field`**: focus is in a text field (a label, an inline rename, a search, a form field).
   Escape leaves the field, by the field's own rule.
2. **`gesture`**: a drag, resize, rotate, marquee, connection, stroke or polygon is in progress.
   Escape cancels it, leaving the board as it was before it started, and no undo step.
3. **`surface`**: a menu, picker, dropdown, flyout, popover, dialog or tray is open.
   Escape closes the top one, and focus goes back to its opener.
4. **`highlight`**: a highlight, focus or filter mode is on the board (a chosen term, a rename's preview, Arrange).
   Escape lets it go, and the board is as it was.
5. **`tool`**: a tool is in hand (a canvas tool other than the resting one, an armed tile or pen, Format).
   Escape puts it down, back to the resting tool.
6. **`selection`**: elements, or candidate contexts, are selected.
   Escape clears the selection.
7. **`zen`**: Zen mode is on.
   Escape leaves it.

- **A field leaves by its own rule.** A label keeps what was typed
  ([Labels](../008-canvas/canvas-and-palette.md#labels)).
  An inline rename (a document title, a tab, a candidate context, a term) puts the old name back.
  A search field with text clears it, and the next Escape closes what holds it.
- **The resting tool** is Select on a computer and Hand on a touch screen (`restingTool`).
  Every other canvas tool is a tool in hand: Hand on a computer, Eraser, Format, Laser, Spotlight, Slide Deck,
  Isometric and Avatar (`toolInHand`).
- **A panel holding focus is a surface.** Escape in it closes it, focus back to its button.
  A docked companion panel stays open when Escape is pressed elsewhere, as a companion to the canvas
  ([Panel docking](../007-editor/panel-docking.md)).
  What a panel puts on the board (a highlight) is let go from anywhere, the panel staying open.
- **A modal dialog owns the keyboard.** Escape closes it and nothing under it.

## Where each layer lives

- Surfaces: [Menus](menus.md) (the top one closes first) and [Panel docking](../007-editor/panel-docking.md).
- Gestures, tools, selection and zen: [Keyboard](../008-canvas/canvas-and-palette.md#keyboard-shortcuts).
- Highlights on an Event Storming board: [The Language tab](../021-event-storming/board-language.md#the-language-tab),
  [Arrange](../021-event-storming/arrange.md) and [The Review panel](../021-event-storming/board-review.md#the-panel).
- Candidate contexts' selection, names and pen: [Candidate contexts](../021-event-storming/candidate-contexts.md).
- Draw mode's tools and flyouts: [Draw mode](../023-draw-mode/draw-mode.md).

## Testing

- `apps/live/lib/escape-ladder.test.ts` holds the ladder as a table: each combination of layers, and the one a press
  leaves.
- `apps/live/e2e/escape-backs-out.spec.ts` presses Escape out of each state in the audit below, in a real browser.

## The audit

Every state below is left by Escape, one press each, from where the keyboard stands after entering it.

- Diagram tab: the Search panel, the tab list, the tab menu, a tab rename, the document title, the palette search,
  More Popular, Layers, the Tab style popover, the mode chip menu, Share, Settings, the Explorer panel, the bug
  report, a tour, the element menu, a label being typed, a pending draw-to-size, a marquee, Zen, a selection.
- The canvas tools: Hand (computer), Eraser, Format, Laser, Spotlight, Slide Deck, Isometric, Avatar.
- The palette's dropdowns: the selection-mode picker and the palette category.
- Event Storming board: a chosen term and a term rename, with focus in the Review panel or on the board; the Review
  panel; the suggestions list; the Ask popover; Draw Context's pen; a candidate context's rename
  and selection; Arrange; the timer, vote and poll popovers.
