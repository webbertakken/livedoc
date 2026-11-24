# Marks

**Status: specified; a first slice is built.** Built: the four text marks (Highlight, Underline, Strikethrough,
Squiggly underline), made with the tool in hand by dragging across a line's text or from a text selection; the
Drawing, made by freehand strokes; the Line, Arrow, Rectangle and Ellipse, made by a drag; and the Text and Callout,
typed onto the page; each live in the document's changes once made, drawn over the page, written into the file as
standard annotations under their own ids and read back by them; each tool's colour, chosen from the one colour picker
and remembered; and the engine reads every mark a file holds, of any kind, as the file says it. A stroke shown to
others as it is drawn, words shown to others as they are typed, a face for every script, a tool's other looks,
snapping, every other kind made here, changing a mark, and the room's own-marks check are not built.

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
  mark tool is in hand, its bar that tool's colour, and a pick gives the pages the keys again `(default)`.
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
- **Move** by dragging; **resize** by its handles (⇧ keeps proportions); a line by its ends; a polygon by its
  corners; a callout by its text box, its knee and its end separately. A text mark (a highlight) is not moved or
  resized: it is changed by selecting other text.
- **Restyle** from the toolbar or Format menu: colour and fill from the one
  [colour picker](../004-interface-design/colour-picker.md) (the `soft` tone for highlights and fills, `strong` for
  lines and text), opacity 10% to 100%, width 0.5 to 12 points, solid or one of four dashes, line ends (none, arrow,
  open arrow, circle, square, diamond, bar), and for Text and Callout: font, size, colour, alignment.
- **Rotate**: stamps, Text and shapes turn by a handle, snapping at 15°.
- **Arrange**: bring forward, send backward, to front, to back, among the marks of its page.
- **Group**: several selected marks become one that moves and is answered as one; **Ungroup** undoes it.
- **Lock**: a locked mark is not moved, changed or deleted until unlocked; anyone who may review may unlock
  `(default)`.
- **Copy, cut, paste, duplicate**: within a page, across pages and across PDF documents; a paste lands where the
  pointer is, or offset from its source.
- **Delete** removes the mark; a mark with a thread asks nothing and takes its thread to "on deleted content" in the
  comments panel ([Comments](comments.md#when-the-mark-goes)).
- **Marks the file arrived with behave the same** as marks made here: selected, moved, restyled, answered, deleted.
  Changing one is a live change naming it; the stored file is untouched until a bake.
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
- No stamp carries another company's artwork.

## In the file

- **Each mark is one annotation** of the kind above, with: its rectangle and geometry in page space; colour, opacity,
  border and line ends as the standard's own entries; an **appearance stream** drawn by LiveDoc, so every reader
  shows exactly what was made; `NM` its LiveDoc id; `T` its author's display name; `M` and `CreationDate`; `Contents`
  its words; the print flag set.
- **Written as an addition** ([Saving](saving.md#addition-or-rewrite)): a highlight on a 1 MB paper adds about half a
  kilobyte, and every earlier signature stays valid.
- A mark changed or deleted in LiveDoc is written as the changed or removed annotation in the same addition; the
  stored file's bytes still hold the original, as an incremental update does. Removing it from the bytes for good is
  [removing hidden information](redaction-and-protection.md#removing-hidden-information).
- **A Line** is written with its two ends as `L` and an Arrow's head as `LE` `OpenArrow`; **a Rectangle** and
  **an Ellipse** with `Rect` the box grown by half the line's width, so the line falls where it was drawn. Their
  appearance streams are drawn from what the page shows of them, line for line.
- **A Text** is written as a `FreeText` with `Contents` its words, `DA` its font, size and colour, and `Rect` its
  box; **a Callout** as a `FreeText` with `IT` `FreeTextCallout`, `CL` its line's three points, `LE` `OpenArrow`,
  `Rect` the box and the line together and `RD` the box within it. Their appearance streams set the words as the page
  shows them, line for line, in Helvetica, the standard's own face every reader holds.
- A character Helvetica cannot write (outside its Latin set) is kept whole in `Contents` and set in the appearance as
  a question mark, until LiveDoc writes a face for every script `(default)`.
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

- A mark appears for everyone as it is made: a drawing as it is drawn, at the cursor's rate; a Text mark's words as
  they are typed, merged by character.
- A mark someone has selected is outlined in their colour with their name; two people may style one mark at once,
  the later write winning per property.
- **Who made a mark** is its author: a LiveDoc person for a mark made here (their name, colour and picture), or
  "From the file" with the file's own name for a mark that arrived ([Comments](comments.md#authors)).
- View > Marks hides every mark for one person; a filter in the comments panel shows marks by kind, author and page.

## Limits

| Constant                    | Value               | Why                                                                                            |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `PDF_MAX_MARKS`             | 20,000              | `(default)` Marks in one PDF document ([PDF document](pdf-document.md#limits))                 |
| `PDF_PAGE_MAX_MARKS`        | 5,000               | `(default)` Marks read on one page; a page past it reads its first, and the rest still draw    |
| `PDF_MARK_TEXT_MAX_CHARS`   | 10,000              | `(default)` A Text mark's or a note's words; longer belongs in a document                      |
| `PDF_DRAWING_MAX_POINTS`    | 20,000              | `(default)` One Drawing; more strokes start a new mark                                         |
| `PDF_DRAWING_JOIN_MS`       | 1,000               | `(default)` Strokes made closer in time are one Drawing; safe range 300 to 3,000               |
| `PDF_DRAWING_STEP_PT`       | 0.5                 | `(default)` A stroke's points closer than this, in points, are one; safe range 0.25 to 2       |
| `PDF_SHAPE_MIN_PT`          | 2                   | `(default)` A drag spanning less, in points, makes no line or shape; safe range 1 to 6         |
| `PDF_ARROW_HEAD_WIDTHS`     | 4                   | `(default)` An arrowhead's side, in line widths; safe range 3 to 6                             |
| `PDF_ARROW_HEAD_MIN_PT`     | 6                   | `(default)` An arrowhead's side at the least, in points; safe range 4 to 10                    |
| `PDF_TEXT_BOX_WIDTH_PT`     | 216                 | `(default)` A Text box opened by a press, in points, before it narrows; safe range 144 to 360  |
| `PDF_TEXT_PADDING_PT`       | 2                   | `(default)` Room between a Text's or a Callout's box and its words, in points; safe 0 to 6     |
| `PDF_TEXT_SIZE_MIN_PT`      | 4                   | `(default)` The smallest size a Text's or a Callout's words are set at, in points              |
| `PDF_TEXT_SIZE_MAX_PT`      | 144                 | `(default)` The largest size a Text's or a Callout's words are set at, in points               |
| `PDF_CALLOUT_KNEE_PT`       | 12                  | `(default)` How far a Callout's knee stands out from its box, in points; safe range 6 to 24    |
| `PDF_SNAP_PX`               | 6                   | `(default)` Screen pixels within which a shape snaps to the page's lines                       |
| `PDF_SQUIGGLE_STEP_PT`      | 2                   | `(default)` A squiggly underline's tooth, wide and high, in points; safe range 1 to 4          |
| `PDF_STAMP_MAX_BYTES`       | 2,097,152           | `(default)` A custom stamp's picture; larger is scaled down before it is kept                  |
| `PDF_PINNED_FILE_MAX_BYTES` | 26,214,400 (25 MiB) | `(default)` A pinned file is written into the bake, which must itself fit `FILE_TAB_MAX_BYTES` |

## Share roles

| Role            | Marks                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Makes any; changes and deletes anyone's, the file's own included; flattens                                                |
| **Participant** | Makes any; changes and deletes their own; answers anyone's; may not delete the file's own or another person's `(default)` |
| **Viewer**      | Sees them, reads their words, hides them for themselves; makes none                                                       |

Gated on the session's `can` (`pdfReviews`), and checked by the room: a Participant's update that removes or changes
a mark another person made is refused with `not_your_mark`.

## Keyboard and accessibility

- Every tool has a key ([Keyboard shortcuts](keyboard-shortcuts.md#tools)); text marks act on a selection made with
  the text caret, so highlighting needs no pointer.
- Marks are in the page's tab sequence and the accessible tree
  ([Accessibility](accessibility.md#the-accessible-tree)); a selected mark is moved by arrow keys, resized with ⌥,
  deleted with Delete.
- A mark's colour is never its only sign: its kind is named, and the comments panel lists it by kind.
- Handles are 24 px targets (44 on touch); a drag has a keyboard equal for every change but freehand drawing.

## Telemetry and observability

- `Pdf · Added · Mark.<Kind>`, `Pdf · Changed · Mark.<Moved|Resized|Restyled|Grouped|Locked>`,
  `Pdf · Deleted · Mark.<Kind>`, `Pdf · Added · Stamp.<Standard|Dynamic|Custom>`,
  `Pdf · Created · CustomStamp`, `Pdf · Changed · ToolColour` (a tool's colour chosen or reset). Never a mark's words,
  a stamp's name or a file's name.
- Fingerprints: `[pdf] mark-added kind=<kind>`, `[pdf] mark-refused name=<name>`,
  `[pdf] marks-read count=<n> unknown=<n>` (per open), `[pdf] drawing-joined strokes=<n>` (a stroke joined to a
  Drawing), `[pdf] typing-dropped kind=<kind>` (a Note, Text or Callout ended with nothing typed).

## Errors

| When                                           | A person sees                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A text tool is used where the page has no text | "This page has no text to mark. Drag to highlight an area, or recognise its text."               |
| The mark limit is reached                      | "This PDF holds the most marks LiveDoc keeps for one file (20,000)."                             |
| A Participant changes another person's mark    | The change is undone: "You can change your own marks."                                           |
| A certified file forbids marks                 | "The person who certified this PDF doesn't allow marks." ([Signing](signing.md#certified-files)) |
| A custom stamp's picture cannot be read        | "That picture couldn't be read. Choose a PNG, JPEG or SVG."                                      |
