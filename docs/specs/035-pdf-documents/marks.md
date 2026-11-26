# Marks

**Status: specified; a first slice is built.** Built: the four text marks (Highlight, Underline, Strikethrough,
Squiggly underline), made with the tool in hand by dragging across a line's text or from a text selection; the
Drawing, made by freehand strokes; the Line, Arrow, Rectangle and Ellipse, made by a drag; the Text and Callout,
typed onto the page; and the standard and dynamic stamps, placed by a press; each live in the document's changes once made, drawn over the page, written into the file as
standard annotations under their own ids and read back by them; each tool's colour, chosen from the one colour picker
and remembered; and the engine reads every mark a file holds, of any kind, as the file says it; a stroke shown to others as it is
drawn and words as they are typed; a face for every script; and the room's own-marks check. A tool's other looks,
snapping, every other kind made here, custom stamps and Manage stamps are not built.
Of changing a mark, selecting, moving, resizing and deleting a mark made here, and restyling its colour, opacity, line
width, line style, fill and line end, and a Text's and a Callout's size and alignment, Format > Colour and Fill
colour, the toolbar's Line width and a tool's remembered width, style and fill are built, and so are they for the
file's own marks of the kinds LiveDoc makes, as is a Text's and a Callout's font; a tool's remembered
opacity, font and size, rotating, arranging, grouping, locking, copying, Properties, Erase and the file's own marks of other
kinds are not.

A **mark** is something placed on top of a PDF page that leaves the page's own content alone: a highlight, a note, a
piece of text, a drawing, a shape, a stamp. Marks are Reviewing's ([Editing modes](editing-modes.md)); a mark with
words or replies carries a [comment](comments.md) thread. Every mark is live for everyone, undoable by its maker, and
written into the file as a standard annotation, so any reader shows it. The research is
[Comments](../../research/pdf-documents/comments.md) and [The engine](../../research/pdf-documents/engine.md).

## Kinds

| Kind                             | Made by                                                                                 | In the file                        |
| -------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| **Highlight**                    | Selecting text with the tool in hand, or the tool on a selection                        | `Highlight`                        |
| **Underline**                    | The same                                                                                | `Underline`                        |
| **Strikethrough**                | The same                                                                                | `StrikeOut`                        |
| **Squiggly underline**           | The same                                                                                | `Squiggly`                         |
| **Insert text**                  | A press between two characters; the words to insert are its comment                     | `Caret`                            |
| **Replace text**                 | Selecting text; a strikethrough and an insert, grouped as one mark                      | `StrikeOut` grouped with a `Caret` |
| **Note**                         | A press on the page; a small glyph with a comment                                       | `Text`                             |
| **Text**                         | A press or a drag; words typed straight onto the page                                   | `FreeText`                         |
| **Callout**                      | A press on what is meant, then a press for the text; a line joins them                  | `FreeText` with a callout line     |
| **Drawing**                      | Freehand strokes; strokes made within `PDF_DRAWING_JOIN_MS` are one mark                | `Ink`                              |
| **Line**, **Arrow**              | A drag                                                                                  | `Line`                             |
| **Rectangle**, **Ellipse**       | A drag; ⇧ keeps it square or round                                                      | `Square`, `Circle`                 |
| **Polygon**, **Connected lines** | A press a corner; a double press or Enter ends it                                       | `Polygon`, `PolyLine`              |
| **Cloud**                        | As a polygon, with a cloudy edge                                                        | `Polygon` with a cloudy border     |
| **Stamp**                        | Choosing a stamp, then a press                                                          | `Stamp`                            |
| **Pinned file**                  | Choosing a file, then a press; a paperclip glyph that holds the file                    | `FileAttachment`                   |
| **Tick**, **Cross**, **Dot**     | A press; fill marks for a PDF with no fields ([Fields](fields.md#a-pdf-with-no-fields)) | `Stamp`                            |
| **Area highlight**               | The highlight tool dragged where there is no text (a scan, a picture)                   | `Square`, filled                   |

- A [drawn signature](signing.md#drawn-signatures) is placed as a mark and has its own rules. A
  [redaction mark](redaction-and-protection.md#marking) is Editing's. A link is page furniture, added in Editing
  ([Objects](objects.md#links)), though the file holds it among its annotations.
- **A text mark follows its text**: it is stored as the quadrilaterals of the glyphs it covers, in page space, with
  the text it covered, so it is drawn exactly over lines that are slanted or split across columns.
- A text mark across a page break is one mark a page, grouped, with one thread.
- Kinds the file may hold that LiveDoc does not make (sound, movie, screen, 3D, rich media, printer's marks, trap
  networks, measurements) are drawn as the file's own appearance says, never selected or changed, and written back
  untouched.

## Making a mark

- **The tool stays in hand** until Escape, V or another tool, so several highlights are made in a row; a toolbar
  check "Keep tool selected" turned off returns to Select after one mark `(default: on)`.
- **From a text selection**: a small bar by the selection offers Highlight, Underline, Strikethrough, Comment, Copy
  and (Editing) Edit text; the context menu offers the same.
- **The tool's look is remembered** per kind, per person, in this browser: colour, opacity, width, line style, line
  ends, fill, font and size. A new mark takes it.
- **A tool's colour** is chosen from the toolbar's Colour, the one colour picker's swatch button: the soft and strong
  rows for light paper, then the person's own colours. **Reset** returns the kind's first look. Colour shows while a
  mark tool is in hand, its bar that tool's colour, and a pick gives the pages the keys again `(default)`; with Select
  in hand it is the selected marks' ([Changing a mark](#changing-a-mark)).
- **A tool's line** `(default)`: with the Drawing, Line, Arrow, Rectangle or Ellipse tool in hand, the toolbar's
  Line width and Format > Line width and Line style set that tool's width and style, and with the Rectangle or
  Ellipse tool in hand the toolbar's Fill, led by **None**, sets its fill; each is kept for the kind as its colour is,
  the next mark of it takes them, and a mark already made keeps its own. The tool's step is checked, and a pick gives
  the pages the keys again.
- **A highlight's first look** is the colour picker's soft Yellow for light paper, at full opacity `(default)`. A
  highlight is drawn multiplied onto the page, so the words under it keep their own colour, here as in the file's
  appearance stream.
- **The line marks' first looks** are the colour picker's strong tone for light paper, at full opacity: Underline
  Green, Strikethrough Red, Squiggly underline Blue `(default)`.
- **How a text mark is drawn**, each glyph quadrilateral on its own: a Highlight fills it; an Underline is a
  1-point line along its foot; a Strikethrough a 1-point line through its middle; a Squiggly underline a 1-point
  zigzag along its foot, its teeth `PDF_SQUIGGLE_STEP_PT` apart and as high `(default)`. Slanted text slants them.
- **The text tools** are Highlight, Underline, Strikethrough and Squiggly underline (Insert menu); the toolbar's
  Highlight holds the first three ([Reading surface](reading-surface.md#the-toolbar)); U takes Highlight in hand and
  ⇧U cycles Highlight, Underline, Strikethrough.
- **A text tool chosen with text selected** marks the selection at once and clears it, leaving the tool in hand as
  it was `(default)`; with nothing selected it takes the tool in hand.
- **A Drawing** is made by dragging with the Drawing tool in hand (D), by a mouse, a pen or one finger; each stroke is
  a line through the points it passed, its ends and corners round. A stroke begun within `PDF_DRAWING_JOIN_MS` of the
  last one's end, on the same page, joins that Drawing, as one step of undo of its own; any other starts a new one.
- A point of a stroke within `PDF_DRAWING_STEP_PT` of the one kept before it is not kept `(default)`; a stroke that
  would take a Drawing past `PDF_DRAWING_MAX_POINTS` starts a new one; a stroke of one point is a dot.
- **A Drawing's first look** is the colour picker's strong Red for light paper, 2 points wide, at full opacity
  `(default)`; its colour is chosen as a text tool's is.
- **A Line** or **an Arrow** is made by dragging with its tool in hand, from where the press lands to where it is let
  go. An Arrow's end carries an open arrowhead: two lines at 30° to it, each `PDF_ARROW_HEAD_WIDTHS` times the line's
  width long and `PDF_ARROW_HEAD_MIN_PT` at the least `(default)`.
- **A Rectangle** or **an Ellipse** is the box a drag spans, its line drawn along the box's edge, or the ellipse
  within it; ⇧ held keeps it square or round, its side the longer of the drag's two `(default)`.
- A drag spanning less than `PDF_SHAPE_MIN_PT` both ways, or a Line shorter than it, makes no mark: a press alone
  makes nothing `(default)`. A line or shape shows as it is dragged, in its tool's look.
- **The lines' and shapes' first looks** are the Drawing's: strong Red for light paper, 2 points wide, at full
  opacity, with no fill `(default)`; each kind's colour is chosen and remembered on its own.
- **The shape tools** are Line, Arrow, Rectangle and Ellipse (Insert > Shape); the toolbar's Shape holds them as
  Highlight holds the text tools ([Reading surface](reading-surface.md#the-toolbar)); ⇧D takes the next of them in
  that order, and from any other tool the one the Shape control shows `(default)`.
- **A Text** is made with the Text tool in hand: a press opens a box `PDF_TEXT_BOX_WIDTH_PT` wide whose top left is
  the press, narrowed to its longest line once typed; a drag opens a box as wide as the drag and at least as high
  `(default)`. A box opened where the page leaves too little room is moved onto it.
- **A Callout** is made with the Callout tool in hand: a press on what is meant, then a press where its words go; the
  box opens there, its top left at that press, or its top right where what is meant lies to the right `(default)`.
  Escape after the first press, or a press on another page, lets the first go.
- **A Callout's line** runs from what is meant, ending in an open arrowhead there, to a knee `PDF_CALLOUT_KNEE_PT`
  out from the middle of the box's side facing it, then on to that side; the line and the box's border are 1 point
  `(default)`.
- A new **Note**, **Text** or **Callout** opens for typing at once. Enter starts a new line; Escape, or a press
  anywhere else, ends the typing, and a press that ends it makes nothing else `(default)`. Ended with nothing typed
  but spaces, it is removed and no mark is made; else the mark is made, one step of undo.
- Its writing direction is taken from what is typed, as a [field](fields.md#filling)'s is: a paragraph whose first
  letter with a direction reads right to left is set against the box's right side `(default)`.
- **The words wrap** at the box's width, a word wider than the box broken where it meets the side, and the box grows
  down to hold them; a box that would grow past the page's foot is moved up onto it `(default)`.
- **Text's and Callout's first look** is the colour picker's strong Red for light paper, Helvetica at 12 points, lines
  1.2 times the size apart, `PDF_TEXT_PADDING_PT` inside the box, with no fill `(default)`.
- **The typing tools** are Text and Callout (Insert menu); the toolbar's Text holds both as Highlight holds the text
  tools; X takes the one the Text control shows, and ⇧X the other `(default)`.
- The words are upright on the page as the file has it, so in a turned view they are typed turned with the page
  `(default)`.
- **Snapping**: a line or shape snaps to the page's own lines and edges within `PDF_SNAP_PX`; ⌘ held turns snapping
  off for the drag.
- A mark may not leave its page: a drag past the edge stops at it, so a line or shape dragged off the page ends on its
  edge.
- A mark is made on the page as the file has it, whatever the person's rotated view or Dark pages.

## Changing a mark

- **Select** by a press; a drag from empty space selects every mark it touches; ⇧ adds to the selection.
- **Empty space** `(default)`: where a press reaches no mark and no line of text lies within a line height of it (a
  margin, a gap between columns, a page with no text). A mouse's or a pen's drag from it draws a box, a dashed line in
  the shell's focus colour, and once let go selects every mark of that page whose smallest box it touches, ⇧ adding
  them to the marks selected there, and the keys go to the first of them as a press gives them; a drag from text selects text, as before. A box shorter than `PDF_DRAG_SLOP_PX`
  is a press.
- **A finger's tap** with Select in hand selects the mark it lands on, within `PDF_MARK_TOUCH_REACH_PX` of it, as a
  press does; a tap on nothing lets the marks go and falls to the text. A finger's drag scrolls, so a mark is moved
  by a mouse, a pen or the keys `(default)`.
- A press with Select in hand, in Reviewing, for a session that may review, selects the mark it lands on; where
  marks overlap, the one drawn last, on top.
- **What a press reaches** `(default)`: a text mark's glyphs; a Drawing's, a Line's, an Arrow's, a Rectangle's and
  an Ellipse's line, within `PDF_MARK_REACH_PX` of it, so a box drawn round a paragraph leaves its text to select;
  a Text's, a Callout's and a stamp's box, and a Callout's line as a line's.
- **A press on a text mark** selects it once let go where it was pressed; a drag from it selects text, as a drag from
  anywhere else does `(default)`.
- ⇧ with a press on a selected mark takes it out of the selection `(default)`.
- **A selection holds the marks of one page**: a press on a mark of another page starts a new one there
  `(default)`.
- A press on nothing lets the marks go, ⇧ keeping them; a mark selected lets a text selection go, and text selected lets the marks
  go; Escape lets them go and gives the pages the keys.
- **A selected mark is outlined**: a dashed line in the shell's focus colour round the smallest box holding it,
  `PDF_MARK_OUTLINE_PX` out from it `(default)`.
- **A drag from a selected mark moves every mark selected**, together, held on their page, shown as they go and
  made one step of undo once let go; a pointer moved less than `PDF_DRAG_SLOP_PX` is a press `(default)`.
- **Arrow keys** move the selected marks `PDF_MARK_NUDGE_PT` the way the arrow points on screen, whatever the page's
  turn, ⇧ `PDF_MARK_NUDGE_FAR_PT`, held on their page; each press one step of undo `(default)`.
- **Handles**: one selected mark shows them, a text mark none: a box's eight, its corners and sides, round a
  Rectangle, an Ellipse, a Text, a Callout's box, a stamp and a Drawing; a Line's and an Arrow's two ends; and a
  Callout's tip and knee besides its box's; each a small square in the shell's focus colour `(default)`.
- **Dragging a box's handle** moves the sides it sits on, as they show on screen; ⇧ with a corner keeps the box's
  proportions; the box stays at least `PDF_SHAPE_MIN_PT` each way and on its page `(default)`.
- **What a box's new size does** `(default)`: a Rectangle's, an Ellipse's and a Drawing's lines stretch with it, their
  width kept; a Text's and a Callout's words wrap at its new width, and the box is never narrower than one character
  nor lower than its words, growing down to hold them; a stamp's words scale with it, in proportion; a Callout's line
  runs again from its tip, through a knee, to the middle of the side facing it, as when it was made.
- **Dragging a line's end** moves that end alone; **a Callout's tip** moves what is meant, its line following; **its
  knee** moves the knee alone; each held on the page `(default)`.
- **⌥ with the arrow keys** resizes the selected mark from its right or foot as it shows: → and ↓ larger, ← and
  ↑ smaller, by `PDF_MARK_NUDGE_PT`, ⇧⌥ by `PDF_MARK_NUDGE_FAR_PT`; for a Line or an Arrow they move its second end
  the way they point `(default)`.
- A resize is shown as it goes and made once let go, one step of undo.
- **Delete** or **Backspace**, or Edit > Delete, deletes every selected mark as one step of undo, and gives the
  pages the keys.
- **Move** by dragging; **resize** by its handles (⇧ keeps proportions); a line by its ends; a polygon by its
  corners; a callout by its text box, its knee and its end separately. A text mark (a highlight) is not moved or
  resized: it is changed by selecting other text.
- **Restyle** from the toolbar or Format menu: colour and fill from the one
  [colour picker](../004-interface-design/colour-picker.md) (the `soft` tone for highlights and fills, `strong` for
  lines and text), opacity 10% to 100%, width 0.5 to 12 points, solid or one of four dashes, line ends (none, arrow,
  open arrow, circle, square, diamond, bar), and for Text and Callout: font, size, colour, alignment.
- **The selected marks' colour** `(default)`: with Select in hand and marks selected, the toolbar's Colour is
  theirs, its bar their colour, blank where they differ; a pick gives every selected mark that colour, and **Reset**
  gives each its kind's first look's colour, a stamp its own; then the pages have the keys.
- **Format > Colour** and **Format > Fill colour** open the toolbar's Colour and Fill, whatever they are offered for
  then, and are dimmed while the toolbar offers none `(default)`.
- **The toolbar's Line width** is the selected marks' with Select in hand, the steps of Format > Line width, as the
  tool in hand's is with a line tool in hand; it is dimmed while neither has a line `(default)`.
- **Format > Opacity** gives every selected mark the opacity chosen; **Format > Line width** gives every selected
  Drawing, Line, Arrow, Rectangle and Ellipse the width chosen, the others keeping theirs `(default)`.
- A step of Opacity or Line width is checked where every selected mark it reaches holds it, and dimmed while no
  selected mark has what it sets `(default)`.
- **Format > Line style** gives every selected Drawing, Line, Arrow, Rectangle and Ellipse the style chosen: Solid,
  Dashed, Dotted, Dash dot or Long dashes; an Arrow's head stays solid `(default)`.
- **A line style's pattern** `(default)`, in lengths of its line's width and never under 1 point each: Dashed 3 drawn,
  2 apart; Dotted 1 and 1; Dash dot 3, 1, 1, 1; Long dashes 6 drawn, 2 apart; each stroke starts it afresh.
- **The selected marks' fill** `(default)`: with Select in hand and a Rectangle or an Ellipse selected, the toolbar's
  Fill is theirs, the one colour picker led by **None**; a pick fills every selected Rectangle and Ellipse inside its
  line, and None takes the fill away. A filled Rectangle or Ellipse is reached by a press anywhere inside it.
- **Format > Line ends** gives every selected Line and Arrow the end chosen at its second end, where an Arrow's head
  is, its first end staying bare; a Line's end is None and an Arrow's Open arrow until changed `(default)`.
- **How a line end is drawn** `(default)`, at the end, as big as an Arrow's head (`PDF_ARROW_HEAD_WIDTHS` widths,
  `PDF_ARROW_HEAD_MIN_PT` at the least), in the line's colour and width, solid: Open arrow its two lines; Arrow the
  same closed and filled; Circle a ring that size across and Square and Diamond its outline, each centred on the end;
  Bar a line that long square across it.
- **The selected Texts' and Callouts' size** `(default)`: with Select in hand and a Text or a Callout selected, the
  toolbar's Font size is theirs, blank where they differ; a size taken gives every selected Text and Callout that
  size, held within `PDF_TEXT_SIZE_MIN_PT` to `PDF_TEXT_SIZE_MAX_PT`, and the pages have the keys.
- **What a new size does** `(default)`: the words wrap again at the box's width, the box keeping its top, left and
  width, never narrower than one character nor lower than its words, growing down to hold them; a box that would grow
  past the page's foot is moved up onto it; a Callout's line runs again to the middle of the side facing its tip.
- **The selected Texts' and Callouts' font** `(default)`: with Select in hand and a Text or a Callout selected, the
  toolbar's Font is theirs, blank where they differ. Its menu is **Helvetica**, a separator, then the served families
  of the document fonts' menu ([Document fonts](../004-interface-design/fonts.md#document-fonts)) in alphabetical
  order, each drawn in its own face; it offers no More fonts and no recent families. A family taken gives every
  selected Text and Callout that font, Helvetica taking a chosen font away, and the pages have the keys.
- **What a new font does** is what a new size does: the words wrap again at the box's width, the box keeping its top,
  left and width and growing down to hold them, moved up onto the page where it would leave its foot, and a Callout's
  line runs again to the middle of the side facing its tip `(default)`.
- **Format > Align text** gives every selected Text and Callout the alignment chosen: Left and Right set every line
  `PDF_TEXT_PADDING_PT` in from that side, Centre midway between the two, and Justified stretches each line but a
  paragraph's last to that padding on both sides by the spaces between its words, alike in either direction
  `(default)`.
- **A Text's and a Callout's alignment until one is chosen** is its words' own: each paragraph set from its own side.
  Align text's Left is checked for it where every paragraph reads left to right, Right where every one reads right to
  left, and none where they differ `(default)`.
- Each restyle is one step of undo, and leaves the tool's remembered look as it was `(default)`.
- **Rotate**: stamps, Text and shapes turn by a handle, snapping at 15°.
- **Arrange**: bring forward, send backward, to front, to back, among the marks of its page.
- **Group**: several selected marks become one that moves and is answered as one; **Ungroup** undoes it.
  - Format > Group, with two or more marks selected, gives each the same new **group** (a fresh id), one step of
    undo; a mark already in a group leaves it for the new one. Format > Ungroup, with a selected mark in a group,
    takes every selected mark out of its group, one step. Each is shown only while it can act `(default)`.
  - A group is the marks of one page that share it, as a selection is the marks of one page; a group holding one mark
    acts as none `(default)`.
  - **A press on a grouped mark selects its group**: every mark of it on that page this session may change; ⇧ adds or
    takes out the group whole, and a box from empty space takes the whole group of any mark it takes `(default)`.
  - What a selection does a group does: moved, restyled and deleted together; a group selected shows no handles, as
    any selection of two or more does, so its marks are resized one at a time once ungrouped `(default)`.
  - A Participant groups and ungroups only marks it may change, its own, as any change ([Share roles](#share-roles)).
- **Lock**: a locked mark is not moved, changed or deleted until unlocked; anyone who may review may unlock
  `(default)`.
- **Copy, cut, paste, duplicate**: within a page, across pages and across PDF documents; a paste lands where the
  pointer is, or offset from its source.
- **Delete** removes the mark; a mark with a thread asks nothing and takes its thread to "on deleted content" in the
  comments panel ([Comments](comments.md#when-the-mark-goes)).
- **Marks the file arrived with behave the same** as marks made here: selected, moved, restyled, answered, deleted.
  Changing one is a live change naming it; the stored file is untouched until a bake. A mark saved here and opened
  again is one of them.
- **A file's mark as LiveDoc reads it** `(default)`: a mark of a kind LiveDoc makes is read from the standard's own
  entries: a text mark from `QuadPoints` and the text under it; a Drawing from `InkList`; a Line from `L` and `LE`, an
  Arrow where `IT` is `LineArrow`; a Rectangle and an Ellipse from `Rect` less half the line, and `IC`; a Text and a
  Callout from `Contents`, `DA`, `Q`, `DS`, `CL` and `RD`, its font from `DS`'s `font-family` where that names a
  family the Font menu holds, else none `(default)`; a stamp of a name LiveDoc draws from `Name` and `Contents`;
  each with its colour (black where the file names none), opacity, line width and style, author and dates, every
  value held within a mark's own bounds.
- **A file's mark LiveDoc cannot read so** (a kind it does not make yet, a stamp it does not draw, an id of characters
  or a length an id never holds, words that are only spaces) is drawn as the file says, never selected `(default)`.
- **Changing a file's mark** takes it as LiveDoc's, in one step: the mark as LiveDoc reads it, changed, under the
  file's own id, and the file's own named gone; the page then draws it as LiveDoc draws its kind, and a bake writes it
  in place of the file's own `(default)`. **Deleting** one names it gone: the page draws without it, and a bake
  removes it.
- **Properties** (the side panel, for one selected mark): its kind, author, **subject** (a short label of the
  maker's own, the kind's name until changed), when made and changed, its look, its words, Locked, its **history**
  (each state its thread was given, by whom and when), and "Make this look the default" for its kind.
- **A Note's glyph** is one of the standard's: comment (default), note, help, key, insert, paragraph, new paragraph.
- **Erase** (on the Drawing control) rubs out the strokes of a Drawing it passes over, whole strokes at a time; a
  Drawing with no strokes left is deleted.

## Stamps

- **Standard stamps**, drawn by LiveDoc in its own style, in the standard's names so other readers know them:
  Approved, Not approved, Draft, Final, Confidential, For comment, For public release, Not for public release, As is,
  Expired, Experimental, Departmental, Sold, Top secret; and **Sign here**, **Initial here**, **Witness**,
  **Accepted**, **Rejected**.
- **Dynamic stamps** carry the stamper's name and the time, written when placed: "Approved by Ada Lovelace, 21 Nov
  2026, 14:02", **Received**, **Reviewed**, **Revised**. The name is the person's display name, the time their
  browser's, said to be. **Stamp identity** (Manage stamps) adds a title and an organisation a person may fill in for
  dynamic stamps that show them; they are kept with the account and written only into stamps that person places.
- **Custom stamps**: made from a picture (PNG, JPEG, SVG drawn as a picture) or a page of a PDF, named, in a
  category; kept in this browser, or with the account when signed in; renamed, deleted and moved between categories
  in **Manage stamps**. A custom stamp's picture is a blob named in the mark.
- The Stamp control shows the last stamp used; its menu shows categories, each a grid of stamps with names.
- A stamp is placed at its natural size, at most a third of the page's width, and resized by its handles.
- **LiveDoc's style** for a standard or dynamic stamp: a box with rounded corners and a 2-point border, the stamp's
  name in capitals in Helvetica Bold at 18 points, and a dynamic stamp's second line in Helvetica at 8 points, each
  line centred, in the stamp's colour `(default)`.
- **A stamp's colour** is its own, the colour picker's strong tone for light paper: Green for Approved, Final, For
  public release, Sold and Accepted; Red for Not approved, Confidential, Not for public release, Expired, Top secret
  and Rejected; Blue for the rest `(default)`. The Colour control is not offered while the Stamp tool is in hand.
- **A dynamic stamp's second line** reads "by Ada Lovelace, 21 Nov 2026, 14:02": the display name, then the
  browser's date and 24-hour time, the month cut to its first three letters in English `(default)`.
- A stamp's words are fixed when it is placed: a dynamic stamp keeps its name and time however often it is read.
- **Placing a stamp**: with the Stamp tool in hand (K), a press places the stamp the Stamp control shows, centred on
  the press; a stamp that would leave its page is moved onto it. The tool stays in hand, as every tool does.
- **The Stamp control** holds the stamps behind its chevron as Highlight holds the text tools: a grid headed Standard
  and a grid headed Dynamic, each stamp drawn as it looks; Approved until another is taken `(default)`.
- **Insert > Stamp > Standard stamps** and **Dynamic stamps** take the Stamp tool in hand with the stamp the control
  shows where it is of that category, else that category's first, Approved `(default)`.
- No stamp carries another company's artwork.

## Words in every script

A Text's, a Callout's and a stamp's words are written into the file in every script a person types, never as a
question mark. The research is [Every script in a mark's words](../../research/pdf-documents/scripts-in-marks.md).

- **A mark is set in Helvetica** where no font is chosen for it and Helvetica writes every character of its words: the
  file names the standard's own face and holds no font, as a mark always was.
- **A mark in a chosen font** ([Changing a mark](#changing-a-mark)) is set in that family first: each character in
  the family's regular face, its Latin and Latin Extended subsets as LiveDoc serves them
  ([Document fonts](../004-interface-design/fonts.md#served-from-livedoc)), where it has it; every other character in
  the mark faces, in their order below. Never in Helvetica.
- **Otherwise the whole mark is set in the mark faces**, so one mark never mixes Helvetica with another face
  `(default)`; a stamp's name in their bold.
- **The mark faces** are Noto's, under the SIL Open Font Licence 1.1, as Fontsource serves them: each family split
  into subsets by script, each subset a file of its own, regular and, for Noto Sans, bold.
- They are looked through in this order, a character set in the first that has it `(default)`:
  1. **Noto Sans**: Latin, Latin Extended, Vietnamese, Greek, Greek Extended, Cyrillic, Cyrillic Extended and
     Devanagari.
  2. **The Noto Sans family of each further script**: Hebrew and Arabic, then Armenian, Georgian, Thai, Lao, Khmer,
     Myanmar, Ethiopic, Sinhala, Bengali, Gujarati, Gurmukhi, Kannada, Malayalam, Oriya, Tamil and Telugu; regular
     only, a bold line in them set regular.
  3. **Chinese, Japanese and Korean**: Noto Sans SC, JP or KR, by the region the mark's words show: kana Japanese,
     else Hangul Korean, otherwise Simplified Chinese `(default)`; one region a mark, its other two never looked
     through; regular only `(default)`, a bold line in it set regular.
  4. **Symbols and emoji**: Noto Sans Symbols, Noto Sans Symbols 2 (its symbols and maths subsets `(default)`) and
     Noto Emoji in Fontsource's numbered slices, in one colour, the mark's.
- **A cluster**, the characters read as one (a letter and its accents, an emoji and its modifiers, a flag, a keycap),
  is set whole in the first face that has all of it, so it is shaped as one; one no face has whole is set character
  by character.
- A cluster of no script of its own (a space, a digit, punctuation) stays in the face before it where that face has
  it, so a space does not change the font.
- Words are composed first (Unicode NFC), so a letter typed with its accent apart is one glyph where it can be.
- **A character no mark face has** is set as Noto Sans's missing-glyph box, never as a question mark, and kept whole
  in `Contents`; each bake counts them: `[pdf] glyphs-missing count=<n>`.

### Laying out

- **A mark's words are measured in the faces that set them**, on the surface and in the bake alike: each face's
  advance for each character it has is a generated table, so lines break the same everywhere, with no font loaded.
- The chosen fonts' families are measured the same, from tables of their own generated alongside.
- The table is generated from the very files LiveDoc serves: `pnpm --filter @livedoc/pdf-documents faces:generate`;
  a test fails while it and the Fontsource packages differ.
- **Chinese, Japanese and Korean are measured as one face a region** `(default)`: the characters its slices hold,
  as ranges, their common advance, and each character set otherwise; which slice holds a character is a table of
  its own a region, loaded only by a bake or a surface that sets that region.
- **The bake sets a region's run slice by slice**: each stretch of it shaped in the slice that holds it, each slice
  embedded as a face of its own.
- **The bake shapes each run** of a line (HarfBuzz): Arabic joins, Indic scripts reorder and combine, accents sit on
  their letters, and each glyph is placed where shaping puts it.
- **A line's direction** is its paragraph's: right to left where its first letter is Hebrew or Arabic, so it is set
  from the box's right side.
- **A line holding right-to-left and left-to-right words is ordered by the Unicode Bidirectional Algorithm** (UAX 9,
  bidi-js), from the line's direction, as the surface's browser orders it: each word sits where it was typed, each run
  is shaped in its own direction, and a bracket in a right-to-left run is mirrored.
- **A line shaped wider than it was measured is narrowed to its measured width**, so it never leaves its box; one
  shaped narrower is set as shaped, from its own side.
- **The surface draws the mark faces too**, as `LiveDoc Noto Sans` and its siblings, from the same files, so it
  shapes as the bake does; a face not yet arrived draws in the browser's own until it lands. A mark in a chosen font
  is drawn in `LiveDoc <family>` first, from the same files the bake embeds, added the first time a mark in it is
  drawn or the Font menu opens.
- A bold line in a family with no bold is drawn regular on the surface as in the bake, never made bold by the
  browser.
- **A mark in Chinese, Japanese or Korean is drawn in its region's family alone** (`LiveDoc Noto Sans JP` for a
  Japanese mark), so a character the three share is drawn as its region writes it; the region's slices are added to
  the page the first time a mark in it is drawn.

### In the file

- **Each face a bake uses is embedded once**, a chosen font's as a mark face's, as a subset of only the glyphs its marks use, glyph ids kept: a
  `Type0` font, `Identity-H`, over a `CIDFontType2` with its `FontFile2`, its `W` the glyphs' advances, and its
  `BaseFont` the face's name behind a six-letter tag made from the face and the glyphs it holds.
- **Its `ToUnicode` maps each glyph back to the characters it was shaped from**, a ligature to all of them, so
  copying, search and a screen reader read the words.
- A few kilobytes a face: twenty Greek and Cyrillic characters add about 4 KB to the file.

### Loading

- **Nothing loads for a mark Helvetica writes.** The faces, and the shaper, load only when a mark needs them: the
  surface's browser fetches a subset when a line on screen uses its characters; the engine fetches the subsets a
  bake's marks use, and the shaper, as it bakes.
- Every file is a hashed static asset of LiveDoc's own origin, cached for good, there for a self-hosted LiveDoc as
  for docs.nu; each well under Cloudflare Pages' 25 MiB a file. Chinese, Japanese and Korean, and Noto Emoji, come in
  Fontsource's numbered slices, so a few words fetch a few slices.
- **A face that does not load stops the bake by name** (`faces-unavailable`), never a silent question mark: "Some of
  this PDF's marks need a font that didn't load. Check your connection, then try again. Your changes are safe."
  with **Try again**.
- Fingerprints: `[pdf] faces-loaded count=<n> bytes=<n> ms=<n>` (once a bake that loads any),
  `[pdf] faces-failed face=<id>` (`shaper` for HarfBuzz or bidi-js; `picture` where a thumbnail draws in the
  browser's own; a region's face where its table of slices does not load), `[pdf] glyphs-missing count=<n>`,
  `[pdf] faces-shown count=<n>` (the surface adds the faces, once a page, and a region's slices, once a region).
- **A slice that does not load** stops the bake as any face does, named by its id (`noto-sans-jp-42-400`); a bake
  shows no progress of its own for them `(default)`: a few words fetch a few slices of about 10 to 60 KB.
- **Status**: built, every group above.

## In the file

- **Each mark is one annotation** of the kind above, with: its rectangle and geometry in page space; colour, opacity,
  border and line ends as the standard's own entries; an **appearance stream** drawn by LiveDoc, so every reader
  shows exactly what was made; `NM` its LiveDoc id; `T` its author's display name; `M` and `CreationDate`; `Contents`
  its words; the print flag set.
- **A group** is written as the standard's own: the group's first mark, in the order the page draws them, is its head;
  every other mark of it carries `IRT`, the head, and `RT` `Group` `(default)`. A file's marks grouped so are read as
  one group named for the head's id, and behave as one here.
- **Written as an addition** ([Saving](saving.md#addition-or-rewrite)): a highlight on a 1 MB paper adds about half a
  kilobyte, and every earlier signature stays valid.
- A mark changed or deleted in LiveDoc is written as the changed or removed annotation in the same addition; the
  stored file's bytes still hold the original, as an incremental update does. Removing it from the bytes for good is
  [removing hidden information](redaction-and-protection.md#removing-hidden-information).
- **A Line** is written with its two ends as `L` and its second end's look as `LE`: `None`, `ClosedArrow`,
  `OpenArrow`, `Circle`, `Square`, `Diamond` or `Butt`, **an Arrow** the same with `IT` `LineArrow`; **a Rectangle** and
  **an Ellipse** with `Rect` the box grown by half the line's width, so the line falls where it was drawn. Their
  appearance streams are drawn from what the page shows of them, line for line. A line style other than Solid is
  written as `BS` `S` `D` with `D` its pattern, a Drawing's too, and a fill as `IC`.
- **A Text** is written as a `FreeText` with `Contents` its words, `DA` its font, size and colour, `Rect` its
  box, and its alignment once chosen as `Q` (0 Left, 1 Centre, 2 Right), Justified as `Q` 0 with `DS`
  `text-align:justify`; a chosen font as `DS` `font-family:'<family>'`, `DA` naming Helvetica still, the font every
  reader holds `(default)`; **a Callout** as a `FreeText` with `IT` `FreeTextCallout`, `CL` its line's three points,
  `LE` `OpenArrow`, `Rect` the box and the line together and `RD` the box within it. Their appearance streams set the words as the page
  shows them, line for line, in Helvetica, the standard's own face every reader holds, or in the mark faces
  ([Words in every script](#words-in-every-script)).
- **A stamp** is written as a `Stamp` with `Name` the standard's name for it (`Approved`, `NotApproved`, `Draft`,
  `Final`, `Confidential`, `ForComment`, `ForPublicRelease`, `NotForPublicRelease`, `AsIs`, `Expired`,
  `Experimental`, `Departmental`, `Sold`, `TopSecret`), or LiveDoc's own name for the rest (`SignHere`,
  `InitialHere`, `Witness`, `Accepted`, `Rejected`, `Received`, `Reviewed`, `Revised`); `Contents` its words, a
  line each; `Rect` its box grown by its border; and its appearance in Helvetica Bold and Helvetica, or the mark
  faces, as the page shows it.
- **Read back the same**: a mark LiveDoc wrote and another reader changed is read by its `NM`; one without `NM` gets
  an id from its object number.
- **What is read of a mark a file holds**: its id, the file's own word for its kind, its rectangle and the
  quadrilaterals of a text mark, its colour and opacity, its author's name, its words, its subject, the dates as the
  file writes them, the mark it answers (as a reply, or grouped with it) and a state reply's state. A pop-up, a link
  and a field's place are not marks. Each is bounded on the way out: a name cut to `PDF_NAME_MAX_CHARS`, words to
  `PDF_MARK_TEXT_MAX_CHARS`, a coordinate held within `PDF_MAX_COORDINATE`, at most `PDF_PAGE_MAX_MARKS` a page.
- **What other readers cannot hold** (a mark's group beyond the standard's own, its lock beyond the standard's flag,
  a custom stamp's category) rides a private entry of LiveDoc's own in the annotation, which other readers ignore and
  keep.
- A file that claims PDF/UA has each new mark added to its structure tree
  ([Accessibility](accessibility.md#what-a-written-file-keeps)).
- **Flattening** writes marks into the page content and removes them as marks: an Editor's tool, a rewrite
  ([Document tools](document-tools.md#flattening)).

## Together

- A mark appears for everyone as it is made: a drawing as it is drawn, at the cursor's rate
  ([A mark as it is made](live-editing-and-storage.md#a-mark-as-it-is-made)); a Text's and a Callout's words as
  they are typed, keystroke by keystroke, merged by character.
- A mark someone has selected is outlined in their colour with their name, the name shown as a held mark's is
  ([Presence](live-editing-and-storage.md#presence)); two people may style one mark at once,
  the later write winning per property.
- **Who made a mark** is its author: a LiveDoc person for a mark made here (their name, colour and picture), or
  "From the file" with the file's own name for a mark that arrived ([Comments](comments.md#authors)).
- View > Marks hides every mark for one person; a filter in the comments panel shows marks by kind, author and page.

## Limits

| Constant                    | Value               | Why                                                                                             |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `PDF_MAX_MARKS`             | 20,000              | `(default)` Marks in one PDF document ([PDF document](pdf-document.md#limits))                  |
| `PDF_PAGE_MAX_MARKS`        | 5,000               | `(default)` Marks read on one page; a page past it reads its first, and the rest still draw     |
| `PDF_MARK_TEXT_MAX_CHARS`   | 10,000              | `(default)` A Text mark's or a note's words; longer belongs in a document                       |
| `PDF_DRAWING_MAX_POINTS`    | 20,000              | `(default)` One Drawing; more strokes start a new mark                                          |
| `PDF_DRAWING_JOIN_MS`       | 1,000               | `(default)` Strokes made closer in time are one Drawing; safe range 300 to 3,000                |
| `PDF_DRAWING_STEP_PT`       | 0.5                 | `(default)` A stroke's points closer than this, in points, are one; safe range 0.25 to 2        |
| `PDF_SHAPE_MIN_PT`          | 2                   | `(default)` A drag spanning less, in points, makes no line or shape; safe range 1 to 6          |
| `PDF_ARROW_HEAD_WIDTHS`     | 4                   | `(default)` An arrowhead's side, in line widths; safe range 3 to 6                              |
| `PDF_ARROW_HEAD_MIN_PT`     | 6                   | `(default)` An arrowhead's side at the least, in points; safe range 4 to 10                     |
| `PDF_TEXT_BOX_WIDTH_PT`     | 216                 | `(default)` A Text box opened by a press, in points, before it narrows; safe range 144 to 360   |
| `PDF_TEXT_PADDING_PT`       | 2                   | `(default)` Room between a Text's or a Callout's box and its words, in points; safe 0 to 6      |
| `PDF_TEXT_SIZE_MIN_PT`      | 4                   | `(default)` The smallest size a Text's or a Callout's words are set at, in points               |
| `PDF_TEXT_SIZE_MAX_PT`      | 144                 | `(default)` The largest size a Text's or a Callout's words are set at, in points                |
| `PDF_CALLOUT_KNEE_PT`       | 12                  | `(default)` How far a Callout's knee stands out from its box, in points; safe range 6 to 24     |
| `PDF_SNAP_PX`               | 6                   | `(default)` Screen pixels within which a shape snaps to the page's lines                        |
| `PDF_MARK_REACH_PX`         | 6                   | `(default)` Screen pixels from a mark's line that a press still selects it; safe range 4 to 12  |
| `PDF_MARK_TOUCH_REACH_PX`   | 22                  | `(default)` Screen pixels from a mark that a finger's tap still selects it: half a 44 px target |
| `PDF_MARK_OUTLINE_PX`       | 3                   | `(default)` Screen pixels between a selected mark and its outline; safe range 2 to 6            |
| `PDF_DRAG_SLOP_PX`          | 3                   | `(default)` Screen pixels a pointer moves before a press is a drag; safe range 2 to 6           |
| `PDF_MARK_NUDGE_PT`         | 1                   | `(default)` Points an arrow key moves a selected mark                                           |
| `PDF_MARK_NUDGE_FAR_PT`     | 10                  | `(default)` Points ⇧ with an arrow key moves it                                                 |
| `PDF_SQUIGGLE_STEP_PT`      | 2                   | `(default)` A squiggly underline's tooth, wide and high, in points; safe range 1 to 4           |
| `PDF_STAMP_LINE_MAX_CHARS`  | 300                 | `(default)` A stamp's line as placed: a display name and a time fit; safe range 100 to 1,000    |
| `PDF_STAMP_MAX_BYTES`       | 2,097,152           | `(default)` A custom stamp's picture; larger is scaled down before it is kept                   |
| `PDF_PINNED_FILE_MAX_BYTES` | 26,214,400 (25 MiB) | `(default)` A pinned file is written into the bake, which must itself fit `FILE_TAB_MAX_BYTES`  |

## Share roles

| Role            | Marks                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Makes any; changes and deletes anyone's, the file's own included; flattens                                                |
| **Participant** | Makes any; changes and deletes their own; answers anyone's; may not delete the file's own or another person's `(default)` |
| **Viewer**      | Sees them, reads their words, hides them for themselves; makes none                                                       |

Gated on the session's `can` (`pdfReviews`), and checked by the room.

- **A person's own mark** carries their key: the adder key their session holds on the document
  ([Share roles](../013-workspace/share-roles.md#integrity)), stamped as `authorKey` where the mark is made, kept
  in the live changes alone and never written into the file. In This Browser it is the person's own participant key.
- **Nobody's own**: a file's own mark, a mark that carries no key, and so every mark once the stored file is
  replaced, its marks the file's own then ([Saving](saving.md#when-the-stored-file-is-replaced)).
- **The room refuses** a Participant's update whole with `not_your_mark` where it adds a mark that does not carry
  their key, changes or deletes a mark that did not, takes their key off one, or changes or deletes a file's own
  mark (an entry of `removed`) ([The room's op kinds](live-editing-and-storage.md#the-rooms-op-kinds)). A session
  with no key owns nothing.
- **Select reaches a Participant's own marks alone**: another's mark is drawn and named as before, but a press on it
  falls to the text beneath and focusing its control selects nothing.

## Keyboard and accessibility

- Every tool has a key ([Keyboard shortcuts](keyboard-shortcuts.md#tools)); text marks act on a selection made with
  the text caret, so highlighting needs no pointer.
- Marks are in the page's tab sequence and the accessible tree
  ([Accessibility](accessibility.md#the-accessible-tree)); a selected mark is moved by arrow keys, resized with ⌥,
  deleted with Delete.
- **Each mark made here is a control** over it, in the page's tab sequence in the order marks are drawn, named for
  its kind and author, "Highlight by Ada Lovelace", and pressed while selected; Tab to one selects it alone
  `(default)`. A press of the pointer that selects a mark puts the keys on it.
- A mark's colour is never its only sign: its kind is named, and the comments panel lists it by kind.
- Handles are 24 px targets (44 on touch); a drag has a keyboard equal for every change but freehand drawing.

## Telemetry and observability

- `Pdf · Added · Mark.<Kind>`, `Pdf · Changed · Mark.<Moved|Resized|Restyled|Grouped|Ungrouped|Locked>`,
  `Pdf · Deleted · Mark.<Kind>`, `Pdf · Added · Stamp.<Standard|Dynamic|Custom>`,
  `Pdf · Created · CustomStamp`, `Pdf · Changed · ToolColour` (a tool's colour chosen or reset), `Pdf · Changed · ToolLine` (a tool's line
  width, line style or fill chosen). A stamp placed is
  counted as `Stamp.<…>` alone, never also as `Mark.Stamp`; the tool taken in hand is `Tool.Stamp`. Never a mark's
  words, a stamp's name or a file's name.
- A move is counted once a drag or a key press, `Mark.Moved`; a resize the same, `Mark.Resized`; a restyle once a
  pick or a choice, `Mark.Restyled`; a deletion once a mark, `Mark.<Kind>` of its kind.
- Fingerprints: `[pdf] mark-added kind=<kind>`, `[pdf] mark-refused name=<name>`,
  `[pdf] marks-moved count=<n>` (a drag or a key press), `[pdf] marks-boxed count=<n>` (a box drawn from empty space), `[pdf] mark-resized kind=<kind>`,
  `[pdf] marks-restyled count=<n> look=<colour|opacity|width|style|fill|end|size|align|font>` (a pick or a choice),
  `[pdf] marks-deleted count=<n>`, `[pdf] marks-grouped count=<n>`, `[pdf] marks-ungrouped count=<n>`, `[pdf] tool-look kind=<kind> look=<width|style|fill>` (a tool's line chosen),
  `[pdf] marks-read count=<n> unknown=<n>` (per open), `[pdf] drawing-joined strokes=<n>` (a stroke joined to a
  Drawing), `[pdf] typing-dropped kind=<kind>` (a Note, Text or Callout ended with nothing typed),
  `[pdf] marks-hidden count=<n>` (the file's own marks the pages are drawn without, each time they change),
  `[pdf] marks-hidden-failed reason=<reason>` (the engine was not told).

## Errors

| When                                           | A person sees                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A text tool is used where the page has no text | "This page has no text to mark. Drag to highlight an area, or recognise its text."               |
| The mark limit is reached                      | "This PDF holds the most marks LiveDoc keeps for one file (20,000)."                             |
| A Participant changes another person's mark    | The change is dropped: "You can change your own marks."                                          |
| A certified file forbids marks                 | "The person who certified this PDF doesn't allow marks." ([Signing](signing.md#certified-files)) |
| A custom stamp's picture cannot be read        | "That picture couldn't be read. Choose a PNG, JPEG or SVG."                                      |
