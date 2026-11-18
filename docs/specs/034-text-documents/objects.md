# Objects

**Status: specified.** Nothing is built.

Pictures, drawings, charts, equations, special characters, emoji, horizontal lines and building blocks in a
[text document](text-document.md). An object is the text document's own, held in its model and its package; it is
never a canvas element.

## Pictures

- **Insert > Image**: Upload from computer; Search the web (LiveDoc's own image search, either way under C3); By URL
  (fetched once by the api, copied into the document, never hot-linked); Camera (either way under C3); **LiveDoc
  gallery** (the person's gallery). Drive and Photos are left out (C3).
- Paste and drop upload a picture; the gallery's existing checks apply (type sniffing, size).
- **In line** by default, as Google places them; **Wrap text** and **Break text** (the text above and below only) and
  **In front of text** and **Behind text** are the wrapping choices, with a margin (0 to 1 in) for wrap and break.
- **Position** (wrapped, in front, behind): moves with text or fixed on the page; a drag moves it, with the guides
  Google shows.
- **Size and rotation**: corner and edge handles (Shift keeps the ratio as Google does on edges), the rotation handle,
  and the panel's width, height, scale, lock aspect ratio, angle; shortcuts ⌘⌥K, J, B, I, W, Q and ⌥← / → (15°),
  ⌥⇧← / → (1°).
- **Crop**: double-click or Crop; drag the black crop handles; Enter or a press outside ends it.
- **Image options** panel: Size and rotation, Text wrapping, Position, Recolour (Google's presets: none, light and dark
  of eight colours), Adjustments (transparency, brightness, contrast, 0 to 100 percent), **Reset**.
- **Alt text** (⌘⌥Y): a description; "Mark as decorative".
- **Replace image** keeps the size, crop, wrap and position.
- Context menu: Crop image, Replace image, Image options, Alt text, Comment, Link, Delete.

## Drawings

- **Insert > Drawing > New** opens a LiveDoc canvas in a dialog (a Sketch canvas with the Structured palette, the
  Drawing reused, never a second drawing tool); **Save and close** places it as a picture with the drawing's own data
  kept, so a double-click opens it again.
- **Insert > Drawing > From LiveDoc** (in Drive's place) lists the person's documents and places one tab as a linked
  drawing ([Linked objects](#linked-objects)).
- Shift+Escape (⌘Escape on a Mac) closes the drawing dialog, as Google's.

## Charts

**Insert > Chart**: Bar, Column, Line, Pie (a new chart from a new spreadsheet) and **From spreadsheet** (a LiveDoc
spreadsheet's chart). Charts come from plan 0020's spreadsheet kind; this row waits for its charts on main.

## Linked objects

A chart or drawing placed from a LiveDoc document stays linked: when its source changes, an **Update** button shows on
it; Tools > Linked objects lists every linked object with Update and Unlink. Either way under C3 (asked with the
matrix).

## Equations

- Insert > Equation, or View > Show equation toolbar: an equation at the caret with Google's toolbar (Greek letters,
  miscellaneous operations, relations, maths operators, arrows), and its typed shortcuts (`\alpha`, `\frac`, `^`, `_`).
- Held as MathML (ODF) or OMML (OOXML), converted between them on conversion.

## Special characters

Insert > Special characters: a dialog to search by name, browse by category (symbols, punctuation, emoji, scripts …),
and **draw to find** a character; a press inserts it.

## Emoji

Insert > Emoji: LiveDoc's emoji picker, search and categories, skin tones; inserts the character.

## Horizontal line

Insert > Horizontal line: a paragraph whose bottom border runs across the text width.

## Building blocks

Either way under C3 (asked with the matrix): Google's building blocks are mostly tables of chips. If kept, each is a
template of paragraphs and tables (meeting notes with attendees as text, an email draft, a roadmap table, a review
tracker, project assets, a content launch tracker) inserted at the caret.

## Code blocks

Not in Google Docs' menus as a block (assumed: Google has "Code blocks" under Insert > Building blocks in some
locales); an arriving paragraph styled as code keeps its style.

## Share roles

Editors insert and change objects; a Participant only as suggestions (D7); a Viewer reads, and copies pictures out.

## Limits

`TEXT_DOCUMENT_MAX_OBJECTS` objects a text document ([Text document](text-document.md#limits)); a picture is at most
the gallery's limit.

## Telemetry

`Element · Added · TextDocument<Object>` (Image, Drawing, Chart, Equation, SpecialCharacter, Emoji, HorizontalLine),
with the image source as the type's suffix (ImageUpload, ImageUrl, ImageGallery, ImageCamera, ImageSearch);
`Element · Changed · TextDocumentImage<Action>` (Crop, Wrap, AltText, Replace, Recolour). Never content.
