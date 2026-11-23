# Objects

**Status: in progress.** A picture in line is held, read and written in both formats, kept in the live state, drawn,
inserted, pasted and dropped, its bytes in the gallery; it is sized, cropped and turned, and its alternative text and
media are changed.
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
  of eight colours), Adjustments (transparency 0 to 100 percent, brightness and contrast -100 to 100 percent
  (default, until a capture)), **Reset**.
- **Alt text** (⌘⌥Y): a description; "Mark as decorative".
- **Replace image** keeps the size, crop, wrap and position.
- Context menu: Crop image, Replace image, Image options, Alt text, Comment, Link, Delete.

### The model

A picture is an inline of a paragraph, beside runs, fields and notes
([Standard mapping](standard-mapping.md#the-model)).

- **`Picture`**: its media by key, the size it shows at in points (`width`, `height`), its alternative text (`alt`),
  its title, whether it is decorative, its crop, and the formatting and link of the run it sits in.
- **Crop**: the share of the picture's own width or height cut from each side (`top`, `right`, `bottom`, `left`, each
  from 0 to below 1, to four decimals); the size is that of what is left.
- **Rotation**: the angle it is turned clockwise about its centre, in degrees from 0 to below 360, to two decimals
  (default); none is 0. Its size is that of the picture unturned, as Word's extent and LibreOffice's frame hold it.
- **Recolour** (`recolour`): **greyscale**, or a **duotone** of two `#rrggbb` colours, `dark` and `light`, each pixel's
  luminance laid from the one to the other, as DrawingML's duotone; none is no recolour.
- **Adjustments**: `transparency` from 0 to 100 percent, `brightness` and `contrast` from -100 to 100 percent, each
  to three decimals (OOXML's step); none is 0. Brightness and contrast are Word's: the contrast's slope is
  1 / (1 - c) above 0 and 1 + c below, about the middle grey, half the brightness added before it and half after.
- **Placement** (`placement`): none is in line. A placed picture stands where it is placed, away from the line of
  its anchor, the character it follows; its placement holds:
  - `wrap`: `wrap` (Wrap text: the text runs around it), `break` (Break text: the text above and below only),
    `front` (In front of text) or `behind` (Behind text);
  - `margin`: the space kept clear around it, `top`, `right`, `bottom` and `left` in points, each 0 to 72 (one inch,
    Google's most); Google sets one for all four, ⅛ in (9 pt) when wrapping is chosen (default as Google's);
  - `moves`: `with-text` (Move with text: it follows its anchor's paragraph) or `page` (Fix position on page);
  - `x`, `y`: its top left corner, in points, from the left edge of its anchor's column and the top of its anchor's
    paragraph when it moves with text, else from the page's top left corner; turned, its box before the turn.
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
| Rotation         | `draw:transform` on the frame, `rotate` in radians counter-clockwise                        | `a:xfrm` `rot` in 60,000ths of a degree clockwise                 |
| Greyscale        | `draw:color-mode="greyscale"` in the graphic style                                          | `a:grayscl` in `a:blip`                                           |
| Duotone          | `livedoc:duotone="<dark> <light>"` in the graphic style (no ODF form; default)              | `a:duotone` of two `a:srgbClr` in `a:blip`                        |
| Transparency     | `draw:image-opacity`, 100% less the transparency                                            | `a:alphaModFix` `amt`, the opacity in thousandths of a percent    |
| Brightness       | `draw:luminance` in percent                                                                 | `a:lum` `bright` in thousandths of a percent                      |
| Contrast         | `draw:contrast` in percent                                                                  | `a:lum` `contrast` in thousandths of a percent                    |
| Placed           | `text:anchor-type="char"`, `svg:x` / `svg:y`, from the left and top (`style:*-pos`)         | `wp:anchor` with `wp:positionH` / `wp:positionV` `wp:posOffset`   |
| Moves with text  | `style:horizontal-rel="paragraph"`, `style:vertical-rel="paragraph"`                        | `relativeFrom="column"`, `relativeFrom="paragraph"`               |
| Fixed on page    | `style:horizontal-rel="page"`, `style:vertical-rel="page"`                                  | `relativeFrom="page"` both                                        |
| Wrap text        | `style:wrap="parallel"`, no contour                                                         | `wp:wrapSquare wrapText="bothSides"`                              |
| Break text       | `style:wrap="none"`                                                                         | `wp:wrapTopAndBottom`                                             |
| In front of text | `style:wrap="run-through"`, `style:run-through="foreground"`                                | `wp:wrapNone`, `behindDoc="0"`                                    |
| Behind text      | `style:wrap="run-through"`, `style:run-through="background"`                                | `wp:wrapNone`, `behindDoc="1"`                                    |
| Margin           | `fo:margin-top`, `-right`, `-bottom`, `-left`                                               | `distT`, `distR`, `distB`, `distL` (EMU)                          |

- **Held whole, or kept.** A picture is the model's when everything it holds is: in line, one picture of a mapped
  media type, its size, crop, rotation, recolour, adjustments, alternative text, title and whether it is decorative.
  Anything else keeps it a kept inline, as the file has it: placed in any other way (below), flipped, recoloured
  or adjusted in any other way (below), an outline or effects, a shape other than a rectangle, a link on the picture
  itself, a picture with a fallback (SVG, EMF, WMF), a linked or missing picture, a frame with a caption or text.
- **No look of its own beyond those.** ODF: the frame's graphic style may hold only margins, padding and borders of
  none, no fill, no mirror, red, green, blue, gamma and inversion at their neutral values, a vertical position on the
  baseline, and wrap and horizontal position, which a picture in line ignores. OOXML: `wp:effectExtent`, `wp:docPr`'s
  id and name, the non-visual properties, the blip's compression state and local resolution, `a:stretch` /
  `a:fillRect`, a rectangle `a:prstGeom` and an `a:ln` with no fill or no children are what a plain picture holds.
- **Read**: the media's bytes come from the package entry or the flat file's base64, are hashed, and are held once.
  An entry every reference to which a picture now holds leaves the kept entries (its image relationships too); an
  entry kept content still names stays kept, and is written once.
- **Written**: a picture's media is written at the entry it arrived in, else at `Pictures/<key>.<ext>` (ODF) or
  `word/media/<key>.<ext>` (OOXML); media no picture holds is not written.
  The ODF flat file holds the bytes as `office:binary-data`.
  ODF writes the frame's graphic style as an automatic style named by a hash of its properties, positioned on the
  baseline, its parent the `Graphics` style (written, empty, when the file holds none), as LibreOffice writes a
  picture: LibreOffice opens a frame whose automatic style has no parent as a drawing shape.
  OOXML writes Word's inline picture, its `wp:docPr` ids numbered in reading order.
- **Rotation read**: ODF's `draw:transform` of `rotate` and `translate` steps alone gives the sum of its rotations,
  turned to clockwise; its translations are where LibreOffice put the centre it turns about, which a picture in line
  takes from its line, as LibreOffice reads it. A `scale`, `skewX`, `skewY` or `matrix` step keeps it. OOXML's `rot`
  is read as it is; a flip (`flipH`, `flipV`) keeps it.
- **Rotation written** as LibreOffice and Word write a turned picture in line: ODF `translate (-w/2 -h/2) rotate (θ)
translate (w/2 h/2)` on the frame, θ the counter-clockwise radians; OOXML `rot` on `a:xfrm`, with `wp:effectExtent`
  holding how far the turned picture's bounds reach past its extent on each side, so its line makes room for them.
- **Recolour and adjustments read** as LibreOffice reads them, one to one: `bright` 20000 is `draw:luminance` 20%.
  ODF's colour modes `mono` and `watermark`, OOXML's `a:biLevel`, a duotone whose colour is a scheme or preset colour
  other than black and white or carries colour changes (Word's own colour variations), and any other blip effect
  keep the picture (default). A value out of its range keeps it. OOXML's effects are drawn in the model's order
  (recolour, then brightness and contrast, then transparency) whatever order the blip lists them in (default).
- **Recolour and adjustments written** in that order; a picture with none writes no effect and neutral values.
  LibreOffice draws a duotone in neither format: it reads `a:duotone`, and `a:lum` holding both values, into new bytes,
  and ignores `a:alphaModFix` on a Writer picture; it draws a picture with `livedoc:duotone` uncoloured and keeps the
  attribute when it saves; it holds brightness and contrast in whole percents.
- **Placement read** as LibreOffice 24.2 reads and writes it, one to one (the rows above). An anchor `paragraph` is read
  as `char` at the paragraph's start; one to the page, a frame or a heading as `as-char` or `char` else keeps it.
  Kept (default): a position by alignment (`wp:align`, `style:*-pos` other than from the left or top), any other
  `relativeFrom` or `style:*-rel` (margin, character, line, page content), a wrap on one side or the larger side
  (`left`, `right`, `largest`; `left`, `right`, `dynamic`, `biggest`), a tight, through or contour wrap, a limit on
  the paragraphs wrapped, `simplePos`. A placed picture in a table cell, a note, a header or a footer is kept too.
  The order placed pictures overlap in (`relativeHeight`, `draw:z-index`) is their reading order (default).
- **Placement written** as LibreOffice writes it: ODF `char` with the frame's offsets and its graphic style's wrap,
  margins and relations; OOXML `wp:anchor` (`simplePos="0"`, `locked="0"`, `layoutInCell="1"`,
  `allowOverlap="1"`, `relativeHeight` in reading order) with its offsets, extent, effect extent, wrap and `docPr`.
- **Names and ids** (`draw:name`, `wp:docPr` `name` and `id`) are written anew: `Picture <n>` in reading order.
- **Conversion** carries every picture and its media to the other format; a picture still kept is dropped and listed,
  as all kept content.
- **Past `TEXT_DOCUMENT_MAX_OBJECTS`** pictures in one text document, the rest stay kept inlines.

### In the editor

- The live state holds a picture as a `picture` atom inside its paragraph, its values as attributes, and each media in
  the root map `media` by key ([Live editing and storage](live-editing-and-storage.md#the-layout)).
- The editor draws a picture in line at its size, its crop cutting its media; it is one character to the caret, and
  can be selected, copied, moved and deleted, as a kept inline can.
- A turned picture is drawn turned about its centre, and its line makes room for the turned picture's bounds
  (width × |cos| + height × |sin| across, width × |sin| + height × |cos| high), as Word, LibreOffice and Google lay it
  out; the bounds sit on the baseline.
- A placed picture is drawn at its place, out of its line: its anchor is a mark of no width where it stands in the
  text. Break text keeps its height and margins clear across its column; Wrap text runs the text beside it, on the
  side of the column with more room, the other side left clear (default, until ruled; Google's runs it both sides);
  In front of text is drawn over the text and Behind text under it, neither moving it. A picture moving with text
  goes with its paragraph from page to page; one fixed on the page stays on its anchor's page.
- A recoloured or adjusted picture is drawn so: its recolour and brightness and contrast as one colour filter over its
  pixels, in sRGB, its transparency as its opacity.
- A screen reader reads its alternative text; a decorative picture reads as nothing (an empty `alt`).
- A picture whose media the state lacks shows as a grey box of its size reading "Picture, not loaded" (default).
- Media no picture holds stays in `media`, so an undo brings its picture back whole; a file never carries it.

### Where the bytes live

- **In the gallery.** A text document a room holds keeps each media's bytes as a gallery image of the person who
  brought them ([Image element + per-owner gallery](../009-elements/images.md)): its `media` entry names the image by
  id (`image`) and holds no bytes.
  The key stays the SHA-256 of the bytes, the gallery's own dedupe key, so equal bytes are one image.
- **In the state.** A text document in This Browser, one on a deployment without image storage (`images_unavailable`),
  and media the gallery refuses (`gallery_full`, `file_too_large`) keep their bytes in the entry (`bytes`), so such a
  document works whole, offline and self-hosted.
- **Opening a file** uploads each picture's media to the opener's gallery, once per key, before the state is written;
  an upload refused keeps that media's bytes in the state, logged with its reason, and the import report counts them
  (default).
  A JPEG is kept as the gallery keeps every JPEG, its metadata stripped, so it leaves a file without it.
- **Drawn** from the gallery through `/api/images/<id>?d=<document>` under its placement rules, or from the state's
  bytes; a picture the reader may not be served shows as missing.
- **Written to a file** (download, export, conversion, sync): the room reads each gallery media's bytes from image
  storage under the same placement rules as the byte endpoint, and a file written in this browser reads them through
  that endpoint; a media it cannot read leaves its picture out of the file, logged (`picture-unavailable`) and counted
  (`X-Pictures-Left-Out`), and the title row says how many pictures the download left out, never silently.
- **Referenced.** The gallery images a text document's pictures hold are its references in the
  [reference index](../009-elements/images.md#reference-index), so retention never sweeps them; media no picture
  holds is no reference.

### Inserting

- **Insert > Image**, in Google's order: **Upload from computer** opens the computer's file chooser, as Google's does;
  **Search the web** and **LiveDoc gallery** open the shared image picker on its Search or Gallery tab (its Upload tab
  there too). By URL and Camera wait for their rulings (fetching a URL needs the api's own fetcher); Drive and Photos
  are Google's own and left out. The toolbar's Insert image opens the same list.
- The picture chosen is placed in line at the caret, replacing a selection, and left selected, as Google leaves it;
  one insert is one undo step.
- **Its size** is its pixels at 96 an inch, scaled down to fit the text width and the page's text height, keeping its
  ratio, as Google places one (default).
- **Paste and drop** of picture files (PNG, JPEG, GIF, WebP) upload each and place it at the caret or the drop point;
  other files are refused as the picker refuses them, with its message.
- **Upload from computer, paste and drop** keep a picture's bytes in the state where the gallery cannot hold them: in
  This Browser, without image storage (`images_unavailable`); any other refusal (`gallery_full`, `file_too_large`, a
  type the model does not map) places nothing and says why in a note under the toolbar for 10 seconds (default), in
  the picker's words. The picker's own tabs answer in the picker.
- Copying a picture into another text document carries its media: a gallery media by its id, served there under the
  placement rules; state bytes as they are.
- Share roles: an Editor inserts, pastes and drops pictures; a Participant only as suggestions (D7); a Viewer copies.
- Telemetry: `Element · Added · TextDocumentImage<Source>` (Upload, Gallery, Search, Paste, Drop).

### Working with a picture

- **Format > Image**, with a picture selected (default order, until a capture): Crop image, Image options, Alt text,
  Replace image (Upload from computer, Search the web, LiveDoc gallery, as Insert > Image), Reset image. Each is
  dimmed while no picture is selected.
- **The context menu** on a selected picture adds, after the text items: Crop image, Replace image (the image picker,
  its Upload tab holding the computer's files), Image options, Alt text, each only while a picture is selected.
- **Alt text** (Format > Image, the context menu, ⌘⌥Y): a dialog titled "Alt text" with a Description field and "Mark
  as decorative", which empties and disables the description, as Google's; OK writes both to the picture as one undo
  step, Cancel or Escape changes nothing. A decorative picture reads as nothing to a screen reader.
- **Replace image** places the new picture's media in the old one's place, keeping its alternative text, title,
  decorative mark and width, its height following the new picture's ratio and its crop dropped (default), as one undo
  step; it is chosen, stored and refused as an inserted picture is.
- **Sizing by its handles**: a selected picture draws a box with eight square handles; a corner keeps its ratio, an
  edge stretches one side (Shift keeps the ratio), as Google's; the box follows the pointer while dragging and the
  size is written once, on release, as one undo step; Escape while dragging leaves it as it was (default). The handles
  answer the pointer alone (the panel sizes from the keyboard). A picture is never smaller than 4.5 pt a side
  (default) nor larger than the room the text has (the caret's column width and the page's text height), its crop
  scaling with it.
- **Image options** (Format > Image, the context menu) opens the right side panel with its sections in Google's order;
  **Size & rotation** holds Width and Height in the document's length unit, Scale width and Scale height in percent of
  its own size, and Lock aspect ratio (on by default, as Google's), then **Rotate**: Angle in degrees, with Rotate
  counter-clockwise 90° and Rotate clockwise 90° buttons, as Google's; each change is one undo step. Text wrapping,
  Position, Recolour and Adjustments wait for their parts.
- A field applies on Enter or when left; Scale takes 1 to 1000 percent (default); Angle takes any number, written
  as its turn from 0 to below 360 (-90 is 270), to two decimals. Its **own size** is its pixels at 96
  an inch, read from its bytes, or from the gallery image once drawn; until then Scale and Reset are dimmed.
  Without a selected picture the panel reads "Select an image to see its options." (default).
- **Reset image** (Format > Image, the panel's Reset): back to its own size fitted to the room, its crop, rotation,
  recolour and adjustments dropped, as Google's. Replace image keeps the recolour and adjustments (default).
- **Turning by its handle**: a selected picture draws a round rotation handle above the middle of its top edge, on a
  short stem, as Google's; dragging it turns the picture about its centre to follow the pointer, Shift snapping to
  15° steps, as Google's. The picture follows the pointer while dragging and the rotation is written once, on
  release, as one undo step; Escape while dragging leaves it as it was (default). The handle answers the pointer
  alone; it is not drawn while cropping.
- **Turning by the keyboard**, a picture selected: ⌥→ and ⌥← turn it 15° clockwise and counter-clockwise, ⌥⇧→ and
  ⌥⇧← 1°, as Google's; each press is one undo step. With no picture selected the keys move the caret as ever.
- A turned picture's handles and crop marks turn with it; a drag on one is read along the picture's own sides, so
  sizing and cropping work as on a picture unturned.
- **Cropping** begins with a double-click on a picture, Format > Image > Crop image or the context menu's, as Google's.
  While cropping, the picture is drawn whole at its scale, the parts cut off dimmed beyond its box (default), and its
  eight handles become crop marks: L-shaped at the corners, bars on the edges.
- Dragging a mark moves its side (a corner its two sides) over the picture as drawn: inward to cut, outward back as
  far as the picture's own edge; at least 4.5 pt is kept each way (default). The picture's scale never changes: its
  box shrinks or grows with what is left. The box follows the pointer; the crop and the size are written once, on
  release, as one undo step; Escape while dragging leaves it as it was.
- Enter, Escape, a press outside the picture, or anything that moves the selection off it ends cropping. Cropping
  answers the pointer alone; the marks are drawn only for whoever may edit.
- Share roles: an Editor alone; a Viewer and a Participant see the items dimmed (a Participant's suggestions wait for
  D7).
- Telemetry: `Element · Changed · TextDocumentImageAltText`, `TextDocumentImageReplace`, `TextDocumentImageSize`
  (handles and the panel), `TextDocumentImageReset`, `TextDocumentImageCrop` (each crop written),
  `TextDocumentImageRotate` (each rotation written: the handle, the panel, the keys).

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
`Element · Changed · TextDocumentImage<Action>` (Crop, Wrap, AltText, Replace, Recolour, Adjust). Never content.
