# Selection transforms

Turning and flipping a selection: one element, or many moved as one rigid piece.
A turn or a flip never takes a selection apart; its members keep where they sit relative to one another.

## Terms

- **Turn**: a rotation of a selection by a whole number of degrees, clockwise, about its pivot.
- **Flip**: a reflection of a selection across a line through its pivot; **Flip Horizontal** mirrors left to right
  (across the vertical line), **Flip Vertical** top to bottom (across the horizontal line).
- **Members**: the selection's unlocked elements; a locked member stays as it is, as it does under a move.
- **Pivot**: the centre of the selection's frame, the box its unlocked boxed members draw (each as drawn, so turned
  corners count): a lone element's own centre, a multi-selection's dashed frame's centre.
  A selection of arrows alone pivots on the box around their free ends.
- **Reference member**: the first member, in document order, that can rotate (`supportsRotation`).

## Turning

- A turn moves every member rigidly about the pivot:
  - a boxed member's centre orbits the pivot by the turn;
  - a member that can rotate adds the turn to its own angle (normalised into `[0, 360)`, 0 stored as absent);
  - an annotation marker or a pointer note orbits upright; a pointer note's free tip turns with it about its centre;
  - a selected arrow's free ends orbit the pivot and its curve handles turn with it; a pinned end stays on its
    anchor, which turns with its element.
- A turn on one element is a turn about its own centre: its box stays and only its angle changes.
- Every turn is a whole number of degrees, so positions and angles always agree.
- A turn is one undo step and one change for collaborators.

### Rotation tiles on a multi-selection

- The Rotation category of the multi-selection menu shows the reference member's angle as its active tile.
- Choosing a tile turns the whole selection by the tile's angle less the reference member's angle: the reference
  member lands on the tile's angle and every other member keeps its angle and place relative to it.
- **0°** therefore stands the reference member upright and brings the rest round with it.
- Hovering a tile previews that same turn; leaving the tile puts the selection back.
- A single element's tiles set its angle, as they always have; the command palette's Rotate actions are unchanged.

### Rotating by hand

- Just outside each corner of a selection that can turn sits a **rotate zone**: past the corner handle, on the
  outside of the frame, turned with a lone element's box.
- Hovering a zone shows the rotate cursor, a curved two-headed arrow facing that corner.
- The corner handle itself still resizes: where handle and zone meet, the handle wins.
- Pressing a zone and dragging turns the selection about the pivot by the angle the pointer sweeps around it.
- The drag engages once the pointer travels as far as a body move needs (`DRAG_ENGAGE_PX`), so a click turns nothing.
- **Shift** held snaps the reference member's angle to 15° steps (default), and the modifier banner says so.
- The frame does not turn during the drag; it re-fits the turned selection as it goes.
- The drag draws as a preview and writes once on release, like a resize
  ([Drag preview](drag-preview.md)); **Escape** puts the selection back.
- A zone is 20 screen pixels square for a mouse or pen; on a coarse pointer it reaches 40 pixels past the
  handle's touch pad, so a finger finds it without taking the handle's press (default).
- Zones keep their screen size at every zoom, as the handles do.

#### Where zones appear

- On a lone boxed element that shows its resize handles and can rotate by hand: it supports rotation, is not an
  event-storming note and is not a chart anchored to a Sheet (the gate of the element menu's Rotation category).
- On a multi-selection that shows its frame's handles and has at least one member that can rotate.
- Never while editing text, painting, on a locked tab, or for a Participant or a Viewer (default).

## Flipping

- A flip reflects every member across the line through the pivot:
  - a boxed member's box is reflected and its angle negated;
  - a freehand stroke's points and a path's points (and their handles) are reflected inside its box;
  - a shape, text box, sticky note, image, table and every other element keep their face, so words stay readable;
  - a pointer note's free tip is reflected;
  - a selected arrow's free ends and curve handles are reflected;
  - an arrow end pinned to a flipped member moves to the mirrored anchor (`e` and `w` swap for Flip Horizontal,
    `n` and `s` for Flip Vertical, the anchors between them likewise), so it stays on the same part of the drawing.
- Flipping the same way twice restores the selection exactly.
- A flip is one undo step and one change for collaborators.
- A flip of one element flips it in place.

### Where flips live

- The element menu's **Rotation** category, single and multi, ends with a row of two buttons: **Flip Horizontal** and
  **Flip Vertical**.
- The command palette offers **Flip Horizontal** and **Flip Vertical** while the selection has an unlocked member.
- **Shift+H** flips horizontally and **Shift+V** vertically, on a diagram tab in either mode.
  As with Shift+D, a capital letter typed on a single labelled element still types into its label.
- A Participant or a Viewer is offered no flip: the menu, the commands and the keys are an Editor's (default).

## Telemetry

- A turn by hand emits `Element · Changed · RotateByHand` once, on release.
- A tile emits `Element · Changed · Rotation`, as before.
- A flip emits `Element · Changed · FlipHorizontal` or `Element · Changed · FlipVertical`.

## Implementation

- The transforms are pure: `turnSelection` and `flipSelection` in `packages/document`
  (`selection-transform.ts`), reusing `mirrorElement`'s reflection rules from [Logo pages](../007-editor/logo-pages.md).
- The rotate zones are `RotateZones` (`apps/live/components/canvas/RotateZones.tsx`), inside a frame marked
  `data-turn-frame` whose on-screen centre is the pivot the press reads (`apps/live/lib/turn-frame.ts`).
- The drag is a boxed drag in `rotate` mode, resolved by `resolveBoxedTurn`
  (`apps/live/hooks/canvas/boxed-turn-resolve.ts`).
- One element's zones show where `turnsByHand` allows; a multi-selection's where `showUnionTurn` does
  (`apps/live/lib/canvas-selection.ts`).
- The flips are `flipSelected` (`apps/live/hooks/canvas/useShapeStyleSetters.ts`) and `FlipButtons` in the menu.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.

- **ST1** What Shift does while rotating by hand: snaps the reference member's angle to 15° steps (default).
- **ST2** How big a rotate zone is: 20 screen pixels for a fine pointer, 40 pixels past the touch pad for a coarse
  one (default).
- **ST3** Who may turn by hand or flip: Editors only; a Participant changes content, not the board's shape (default).
- **ST4** What a flip does to a shape's own outline: nothing; the shape keeps its face and only its place and angle
  mirror, as Mirror Copy places one (default).
- **ST5** Which keys flip: Shift+H and Shift+V, the convention of common design tools (default).
