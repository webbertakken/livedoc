# Objects

**Status: in progress.** A picture in line is held, read and written in both formats, kept in the live state, and drawn.
The rest is specified.

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

### The model

A picture is an inline of a paragraph, beside runs, fields and notes ([Standard mapping](standard-mapping.md#the-model)).

- **`Picture`**: its media by key, the size it shows at in points (`width`, `height`), its alternative text (`alt`),
  its title, whether it is decorative, its crop, and the formatting and link of the run it sits in.
- **Crop**: the share of the picture's own width or height cut from each side (`top`, `right`, `bottom`, `left`, each
  from 0 to below 1, to four decimals); the size is that of what is left.
- **Media**: the document's `media`, each picture's bytes by key, the SHA-256 of its bytes as 64 lower-case hex
  characters, with its media type and the package entry it arrived in, if any.
  Two pictures of the same bytes share one media.
- **Mapped media types**: PNG, JPEG, GIF and WebP, read from the bytes' header, never from a name or a manifest.
- **A picture's own size** is its pixels at its resolution: the header's (PNG `pHYs` in metres, JPEG JFIF in inches
  or centimetres), else 96 per inch, as LibreOffice reads it.

### In the formats

| Model            | ODF                                                                                         | OOXML                                                             |
| ---------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Picture in line  | `draw:frame` with `text:anchor-type="as-char"` holding one `draw:image`                     | `w:r` holding `w:drawing` / `wp:inline` / `a:graphic` / `pic:pic` |
| Media            | `draw:image` `xlink:href` to a `Pictures/` entry, or `office:binary-data` (flat)            | `a:blip` `r:embed`, an image relationship to a `media/` part      |
| Size             | `svg:width`, `svg:height`                                                                   | `wp:extent` `cx`, `cy` (EMU), and `a:xfrm` `a:ext` the same       |
| Alternative text | `svg:desc`                                                                                  | `wp:docPr` `descr`                                                |
| Title            | `svg:title`                                                                                 | `wp:docPr` `title`                                                |
| Decorative       | `loext:decorative="true"` in the frame's graphic style                                      | `adec:decorative` `val="1"` in `wp:docPr`'s extension list        |
| Crop             | `fo:clip="rect(top, right, bottom, left)"` in the graphic style, as lengths of the own size | `a:srcRect` `t`, `r`, `b`, `l` in thousandths of a percent        |

- **Held whole, or kept.** A picture is the model's when everything it holds is: in line, one picture of a mapped
  media type, its size, crop, alternative text, title and whether it is decorative.
  Anything else keeps it a kept inline, as the file has it: anchored (wrapped, in front, behind), rotated or flipped,
  recoloured or adjusted, an outline or effects, a shape other than a rectangle, a link on the picture itself, a
  picture with a fallback (SVG, EMF, WMF), a linked or missing picture, a frame with a caption or text.
- **No look of its own beyond those.** ODF: the frame's graphic style may hold only margins, padding and borders of
  none, no fill, no mirror, colour adjustments at their neutral values, a vertical position on the baseline, and
  wrap and horizontal position, which a picture in line ignores. OOXML: `wp:effectExtent`, `wp:docPr`'s id and name,
  the non-visual properties, the blip's compression state and local resolution, `a:stretch` / `a:fillRect`, a
  rectangle `a:prstGeom` and an `a:ln` with no fill or no children are what a plain picture holds.
- **Read**: the media's bytes come from the package entry or the flat file's base64, are hashed, and are held once.
  An entry every reference to which a picture now holds leaves the kept entries (its image relationships too); an
  entry kept content still names stays kept, and is written once.
- **Written**: a picture's media is written at the entry it arrived in, else at `Pictures/<key>.<ext>` (ODF) or
  `word/media/<key>.<ext>` (OOXML); media no picture holds is not written.
  The ODF flat file holds the bytes as `office:binary-data`.
  ODF writes the frame's graphic style as an automatic style named by a hash of its properties, positioned on the
  baseline; OOXML writes Word's inline picture, its `wp:docPr` ids numbered in reading order.
- **Names and ids** (`draw:name`, `wp:docPr` `name` and `id`) are written anew: `Picture <n>` in reading order.
- **Conversion** carries every picture and its media to the other format; a picture still kept is dropped and listed,
  as all kept content.
- **Past `TEXT_DOCUMENT_MAX_OBJECTS`** pictures in one text document, the rest stay kept inlines.

### In the editor

- The live state holds a picture as a `picture` atom inside its paragraph, its values as attributes, and each media's
  bytes in the root map `media` by key ([Live editing and storage](live-editing-and-storage.md#the-layout)).
- The editor draws a picture in line at its size, its crop cutting its media; it is one character to the caret, and
  can be selected, copied, moved and deleted, as a kept inline can.
- A screen reader reads its alternative text; a decorative picture reads as nothing (an empty `alt`).
- A picture whose media the state lacks shows as a grey box of its size reading "Picture, not loaded" (default).
- Media no picture holds stays in `media`, so an undo brings its picture back whole; a file never carries it.

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

**Insert emoji using the colon character** (Preferences, on by default): `:` typed at a word's start and then letters
opens a list of emoji whose names begin so; Enter, Tab or a press inserts the one chosen in place of what was typed,
Escape leaves the text as typed.

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
