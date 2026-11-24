# Objects

**Status: in progress.** A picture in line is held, read and written in both formats, kept in the live state, drawn,
inserted, pasted and dropped, its bytes in the gallery; it is sized, cropped and turned, and its alternative text and
media are changed.
A horizontal line, special characters and emoji are inserted, emoji also from the colon list; so are the six
building blocks and code blocks.
An equation is held, read and written in both formats, kept in the live state, drawn, inserted and written in its
box, with its toolbar.
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
    paragraph when it moves with text, else from the page's top left corner, each within 22 in (1584 pt, the widest
    page Word allows) either way (default); turned, its box before the turn.
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
  as `char` where the frame stands (LibreOffice writes it first); one to the page or a frame keeps it.
  Kept (default): a position by alignment (`wp:align`, `style:*-pos` other than from the left or top), any other
  `relativeFrom` or `style:*-rel` (margin, character, line, page content), a wrap on one side or the larger side
  (`left`, `right`, `largest`; `left`, `right`, `dynamic`, `biggest`), a tight, through or contour wrap, a limit on
  the paragraphs wrapped, `simplePos`, a hidden picture, Word's size relative to the page (`wp14:sizeRel*` other
  than 0). A placed picture in a note, a header or a footer is kept too; one in a table cell is placed from its
  cell's column and paragraph.
  The order placed pictures overlap in (`relativeHeight`, `draw:z-index`) is their reading order (default).
- **Placement written** as LibreOffice writes it: ODF `char` with the frame's offsets and its graphic style's wrap,
  margins and relations, its `draw:z-index` 0 (LibreOffice overlaps frames of one level in reading order); OOXML
  `wp:anchor` (`simplePos="0"`, `locked="0"`, `layoutInCell="1"`, `allowOverlap="1"`, `relativeHeight` its
  picture's number) with its offsets, extent, effect extent, wrap and `docPr`.
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
- The text keeps clear of a Wrap or Break picture's turned bounds and its margins, below its paragraph's top: a
  picture placed higher is drawn there, and the text makes room for what of it lies below that top (default).
- A paragraph holds its Wrap and Break pictures: the next paragraph starts below the lowest of them (default; Google
  runs the next paragraphs beside it too), and its lines down to that picture's foot stay on one page (default).
- Two Wrap or Break pictures in one paragraph stand where the first leaves room for the second: beside it, or below
  it, never over it (default).
- A picture fixed on the page is drawn at its offsets from its anchor's page's top left corner, wherever its paragraph
  stands on that page.
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
  counter-clockwise 90° and Rotate clockwise 90° buttons, as Google's; each change is one undo step. Text wrapping
  and Position wait for their parts.
- **Recolour** (look and order `(default)`, until a capture): a grid of choices, **No recolour**, then **Light 1** to
  **Light 8** and **Dark 1** to **Dark 8**, each drawn as its duotone. Light N lays the picture from its colour (dark)
  to white, Dark N from black to its colour; the colours, 1 to 8, are grey `#666666`, red `#ff0000`, orange
  `#ff9900`, yellow `#ffff00`, green `#00ff00`, cyan `#00ffff`, cornflower blue `#4a86e8` and purple `#9900ff`
  `(default)`. A picture recoloured otherwise (greyscale, or another duotone from a file) has none checked. A choice
  is one undo step.
- **Adjustments**: **Transparency**, **Brightness** and **Contrast** sliders in percent, each showing its value, in
  their ranges (above), stepping by 1; a slider shows its value as it moves, and the change is written, and the picture
  drawn so, once it is let go (the pointer released, the key released, or the slider left), one undo step `(default)`.
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

A drawing is a LiveDoc canvas inside the text document: never a second drawing tool. It is a **drawing tab**, a
general tab of the same LiveDoc document that belongs to one text document tab, shown in the writing as a picture and
worked on in the canvas editor. The rules below are LiveDoc's own where Google's dialog has no counterpart `(default)`.

### A drawing tab

- A general tab that opens in Structured mode, as Google's drawings are shapes, lines and text (its mode switch still
  offers Sketch), named **Drawing N** (N the next free number in its text document), its `drawingOf` the text
  document tab's id. It lives in the tab's body, so it goes wherever its
  text document tab goes.
- **Not listed**: the tab strip, the tab list and its stack, tab folders, Choose a Tab, Side by Side, the link
  picker's tabs, a Links card's tabs, the embed's tab switcher and a share's tab scope never show a drawing tab.
  A document whose one listed tab is a text document still hides its tab strip with drawings in it.
- **Never counted**: the document's [last tab](../006-document/document-structure.md#the-last-tab) and its first tab
  are its listed ones, so deleting its one listed text document tab deletes the document `(default)`.
- **Opened only from its picture**: there is no other way to it. A link or a stale address naming it opens its text
  document tab instead.

### Inserting and editing

- **Insert > Drawing > New** adds an empty drawing tab and opens it; **Save and close** (or Shift+Escape, ⌘Escape on
  a Mac) goes back to the text document, where the drawing is placed at the caret as an inline picture at its drawn
  size, at most the text's width, as one undo step. Closing a drawing with nothing on it places nothing and removes
  the tab.
- **Where it goes**: the caret's place (its document tab and a position that follows others' edits) is kept in this
  browser's session from New until Save and close, so a reload in between still places it `(default)`.
- **Its picture** is a PNG of the drawing at twice its size on a transparent ground, stored as an inserted picture is
  (the gallery, or its bytes in the document where the gallery cannot hold it); a drawing whose picture cannot be
  stored stays open and says why, in the words a picture refused on insert has.
- **Opening it again**: a double-click on the picture, or **Edit** on the picture's bar, opens its drawing tab, for
  anyone who sees the text document; Save and close goes back to the text document at the picture, selected. A
  drawing's picture is cropped from Format > Image or the context menu, its double-click being the drawing's
  `(default)`. Every change in the drawing tab is live (everyone's, as on any canvas).
- **The picture's bar**: under a selected drawing's picture, as Google's, a bar holds **Edit** (**Open** for anyone
  who cannot edit) `(default)`; a drawing whose tab is gone or outside the person's share has no bar and does not
  open.
- **Its picture again**: Save and close on a drawing already placed puts its new PNG in every picture naming it in
  the document tab it was opened from, each keeping its width, its height following the drawing's shape and its crop
  dropped, as Replace image does, one undo step `(default)`; a drawing whose picture was deleted meanwhile is placed
  again where the picture was.
- **Its bar**: while a drawing tab is open, a bar over the canvas names its text document (**Drawing in <name>**) with
  **Save and close**; the canvas editor's tab strip shows nothing for it.
- **One drawing, one picture**: copying a drawing's picture (copy and paste, a duplicated document tab) shares its
  drawing tab until one of them is opened; opening a picture whose drawing tab another picture also shows, or whose
  drawing tab belongs to another text document tab (a duplicated text document tab), first gives this picture its own
  copy of the tab, so an edit never changes a drawing elsewhere. The copy is a new drawing tab of this text document,
  named as a new drawing is, its elements copied with fresh ids; the picture names it from then on, as its own undo
  step `(default)`. An Editor's alone: anyone else opens the drawing as it is.
- **Insert > Drawing > From LiveDoc** lists the person's documents and places one of their tabs as a linked drawing
  ([Linked objects](#linked-objects)); it makes no drawing tab.

### Drawn

- In the writing, a drawing is drawn live from its tab as a [tab window](../009-elements/tab-window.md#the-element)
  draws a tab (its content fitted, following every change), without the window's frame or its paper: the drawing's
  elements on a transparent ground, inside the picture's box, cropped and turned as the picture is.
- While its tab loads, or where it cannot be shown (its load failed, its tab gone or outside a share), the picture
  shows the PNG last saved; a failed load offers **Retry** over it, as a tab window does `(default)`.
- Its picture is otherwise a picture: size, crop, rotation, wrapping, position and alternative text as any; Recolour,
  Adjustments and Replace image are dimmed for a drawing.

### In the file

- A drawing leaves as its picture: a PNG of the drawing at twice its size, refreshed on Save and close and before a
  download, so LibreOffice, Word and Google show it. The picture names its drawing tab: `livedoc:drawing="<tab id>"` on
  the ODF `draw:frame`, the same attribute on the OOXML `pic:cNvPr`, `livedoc` declared ignorable.
- A file read into a LiveDoc document keeps the name only while that tab is a drawing tab of the text document it is
  read into (a reload, or a copy of its own); otherwise the picture is a plain picture.

### The document around it

- **Search**: a drawing's words are the text document's; a hit opens the text document at the picture.
- **Exports**: a document export (PDF, PNG, SVG) draws a drawing tab only inside its text document, never as a tab of
  its own; an agent's views list it under its text document.
- **Copying**: Make a Copy, Duplicate and a Drive import copy drawing tabs with their text document tabs, fresh ids,
  each picture re-pointed at the copy's tab (as tab windows are). A document tab duplicated inside a text document
  shares its drawings until opened (above).
- **Sharing**: a drawing tab is shared wherever its text document tab is: sharing that tab into another document links
  its drawing tabs too. Who may open, edit or only see a drawing is who may on its text document: an Editor edits it,
  anyone else opens it to look, its bar offering **Close**.
- **Deleting**: deleting the text document tab deletes its drawing tabs, as one undo step in the editor and by the
  api for a tab deleted outside it. A drawing tab no picture in its text document
  names (the picture deleted) is kept while an undo could bring the picture back, and removed when the text document
  is next opened by an Editor, once its writing has loaded, in one change of the document's tabs. A drawing tab
  someone is in, or one waiting in this browser to be placed, is kept `(default)`.
- **Presence**: someone in a drawing tab shows as in its text document tab, wherever the document's people are
  listed by tab `(default)`.

## Charts

**Insert > Chart**: Bar, Column, Line, Pie (a new chart from a new spreadsheet) and **From spreadsheet** (a LiveDoc
spreadsheet's chart). Charts come from plan 0020's spreadsheet kind; this row waits for its charts on main.

## Linked objects

A chart or drawing placed from a LiveDoc document stays linked: when its source changes, an **Update** button shows on
it; Tools > Linked objects lists every linked object with Update and Unlink. Either way under C3 (asked with the
matrix).

## Equations

Insert > Equation, or View > Show equation toolbar: an equation at the caret, written in its own box with Google's
equation toolbar and its typed shortcuts. An equation is held as a tree of maths, MathML in ODF and OMML in OOXML.

### The equation model

An equation is an inline of a paragraph, beside runs, fields, notes and pictures
([Standard mapping](standard-mapping.md#the-model)).

- **`Equation`**: its maths (`math`), a row, and the formatting and link of the run it sits in; its maths take the
  run's size and colour, in the maths font.
- **A row** is a list of maths nodes, drawn one after another. A node is one of:
  - **Tokens**: an **identifier** (a letter, or a word such as `sin` drawn upright), a **number** (digits with a
    point), an **operator** (one character that is neither: `+`, `=`, `≤`, `→`, `(` …) or **text** (words drawn as
    text, upright, their spaces kept); each holds its characters.
  - **Fraction**: a numerator row over a denominator row.
  - **Scripts**: a base row with a subscript row, a superscript row, or both.
  - **Root**: a radicand row under the radical sign, with an index row for an nth root; none is a square root.
  - **Large operator**: an operator character (`∑`, `∏`, `∐`, `⋂`, `⋃`, `∫`, `∮` …) with a lower and an upper limit
    row, either empty for none, and the body row it applies to. Integrals take their limits as scripts beside the
    sign, the others under and over it, as Word and Google draw them.
  - **Fence**: a body row between an opening and a closing character (`(` `)`, `[` `]`, `{` `}`, `|` `|` …), either
    empty for none, drawn as tall as the body.
  - **Accent**: a base row with an accent character over it (`^`, `~`, `¯`, `→`, `˙`, `¨`).
  - **Under and over**: a base row with a row under it, a row over it, or both (`lim` with `a→b` under it).
- **Limits**: an equation holds at most 2,000 nodes, nested at most 32 deep (default); an equation past either is kept
  as its file has it.

### Equations in the formats

| Model          | ODF (MathML in `draw:object`)                                     | OOXML (OMML)                                     |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| Equation       | `draw:frame` anchored `as-char`, its `draw:object` holding `math` | `m:oMath` in the paragraph                       |
| Identifier     | `mi`                                                              | `m:r`, a word upright by `m:sty` `p`             |
| Number         | `mn`                                                              | `m:r`                                            |
| Operator       | `mo`                                                              | `m:r`                                            |
| Text           | `mtext`                                                           | `m:r` with `m:nor`                               |
| Fraction       | `mfrac`                                                           | `m:f` (`m:num`, `m:den`)                         |
| Scripts        | `msub`, `msup`, `msubsup`                                         | `m:sSub`, `m:sSup`, `m:sSubSup`                  |
| Root           | `msqrt`, `mroot`                                                  | `m:rad` (`m:degHide` without an index)           |
| Large operator | `munderover` or `msubsup` (and the one-limit forms) on its `mo`   | `m:nary` (`m:chr`, `m:limLoc`, `m:sub`, `m:sup`) |
| Fence          | `mrow` opening and closing with fence `mo`s                       | `m:d` (`m:begChr`, `m:endChr`)                   |
| Accent         | `mover` `accent="true"`                                           | `m:acc` (`m:chr`)                                |
| Under and over | `munder`, `mover`, `munderover`                                   | `m:limLow`, `m:limUpp`, one inside the other     |

- **Read, ODF**: a frame in line whose object holds MathML, in the frame (a flat file) or as its own formula part
  (`Object 1/content.xml`, its root MathML's `math`). `semantics` reads as
  its first child, its annotations (LibreOffice's StarMath) and the replacement image left behind; `mrow` reads as
  its children, or as a fence when it opens and closes with fence characters; a large operator's body is the node
  after it. A frame of any other anchor, or holding anything else, is kept.
- **Read, OOXML**: `m:oMath` in a paragraph; an `m:oMathPara` reads as its equations, its paragraph centred (as
  LibreOffice reads it). A run's characters read as tokens: digits with a point a number, a word upright (`m:sty`
  `p`) one identifier, each other letter an identifier, each other character an operator, spaces dropped; `m:nor`
  reads as text. `m:func` reads as its name then its argument. Word's run formatting inside the maths
  (`w:rPr`) gives the equation its size and colour from its first run; its maths font is left behind.
- **Kept**: an equation holding what the model does not map (a matrix, an equation array, a box, a phantom, styled
  letters other than upright words, …) is kept whole, as its file has it, and drawn as a kept inline.
- **Written, ODF**: a frame anchored `as-char` holding `math` in the MathML namespace inside its `draw:object`, its
  row in one `mrow`, in the content part (both the flat and the zipped file); no style or replacement image, which
  LibreOffice gives a formula on reading (default). LibreOffice scales a formula into its frame and works out no size
  of its own, so the frame is sized to hold the maths as LibreOffice lays them out at its base size, 12 pt, within a
  fifth (default); LibreOffice draws ODF maths at that size, whatever the run's.
- **Written, OOXML**: `m:oMath`, each token its own `m:r` in the maths font Cambria Math with the equation's size and
  colour; a paragraph that holds only equations writes them in one `m:oMathPara`, centred, as Word writes a display
  equation.
- **Conversion** carries an equation through the model: MathML to OMML and back, nothing lost that the model holds.

### Equations in the editor

- The live state holds an equation as an `equation` atom inside its paragraph, its maths and formatting as
  attributes ([Live editing and storage](live-editing-and-storage.md#the-layout)).
- The editor draws an equation in line as MathML, in the browser's own maths layout, in display style as Google
  draws it (fractions full size, limits under and over), in the maths font LiveDoc serves, STIX Two Math, so every
  screen lays it out alike (default; [Fonts](../004-interface-design/fonts.md#served-from-livedoc)); it is one
  character to the caret, and can be selected, copied, moved and deleted, as a picture can. Copied as text, it reads
  as its linear form (`a/b`, `x^2`, `√z`).
- **The equation box**: a press on an equation, or the caret moving into it with the arrow keys, puts the caret
  inside its box, a frame drawn round it; Escape, a press outside, or the arrow keys past either end leave it, the
  caret beside the equation in the text. The caret stands between two nodes of a row.
- **Typing** writes each character as a token of its own at the caret: a digit a number, a letter an identifier, any
  other character but a space an operator; a space writes nothing (it ends a shortcut) (default).
- **Moving**: Right steps over a token, into a structure's first row, from a row's end into the structure's next row,
  and from its last row out after it; Left mirrors it. Up and Down move between a fraction's numerator and
  denominator, a superscript and its subscript, and an upper and lower limit, to the end of the row (default).
- **Removing**: Backspace removes the token before the caret, or steps into the structure before it, to its last row's
  end (default); at a row's start it undoes the structure holding the row, its rows' content, in reading order,
  taking its place, the caret where this row's content now starts (default). Delete mirrors it forward. Backspace in
  an empty equation removes the equation; at the start of one that holds maths it does nothing (default).
- An empty row shows a dotted box of an em, so the caret has somewhere to stand.
- **Typed shortcuts**: `\` and a name, then a space, writes what the name stands for: the toolbar's symbols by their
  names (`\alpha`, `\leq`, `\rightarrow` …), and structures (`\frac`, `\sqrt`, `\rootof`, `\subscript`,
  `\superscript`, `\subsuperscript`, `\sum`, `\prod`, `\int`, `\oint`, `\lim`, …) with the caret in their first empty
  row, as Google's names; a name it does not know stays as typed. `^` and `_` (also after `\`, as Google's help
  gives them) make the node before the caret the base of a superscript or subscript, the caret in it; with nothing
  before the caret, its base is an empty row (default).
- **The equation toolbar**: a row under the toolbar while View > Show equation toolbar is on (off by default, kept in
  this browser as the ruler's switch is), for whoever may edit the body. It holds **New equation** (an empty equation
  at the caret, as Insert > Equation), then the menus Greek letters, Miscellaneous operations, Relations, Math
  operators and Arrows, in that order.
- **Each menu** is a grid of its symbols, each cell named by its name (`alpha`, `leq` …); Math operators' cells draw
  their structure with dotted empty rows. The sets and their order are those Google's equation commands are known by
  (default, until a capture); the grid's look is the special characters dialog's (default, until a capture).
- **A press on a cell** writes it at the caret in the equation being written, a structure with the caret in its first
  empty row; with no equation being written, a new equation holding it is put in at the caret. The writing keeps its
  focus, and the menu closes; Escape or a press outside closes it too.
- **Insert > Equation** inserts an empty equation at the caret, in place of a selection, the caret in its box, and turns
  the equation toolbar on; in the body only, as the box is (default).
- Undo takes back an equation's typing as Google's, a word at a time, as typing in text does.

## Special characters

Insert > Symbols > Special characters: the **Insert special characters** dialog; a press on a character inserts it.

- **The characters** are Unicode's, from its Character Database (`UnicodeData.txt`, `Blocks.txt`, `NameAliases.txt`)
  at the version the catalogue was generated from: every named character but controls, surrogates and private use.
  Those Unicode names by range (CJK ideographs, Hangul syllables, Tangut …) are found by codepoint only (default).
- **Browsing**: two menus pick a category and a Unicode block within it; the grid shows the block's characters of that
  category in codepoint order. The categories, after Google's (default): Symbol (maths, currency and other symbols),
  Punctuation, Number, Modifier (modifier letters and symbols, and the marks of the Combining blocks), Format &
  whitespace (spaces, separators and format characters), and Scripts (letters and their marks). It opens on Symbol,
  Arrows (default), and keeps the last pick while the document is open.
- **Search**: by name words or codepoint (`arrow`, `U+2192`); every word typed starts a word of a character's name,
  in any case. A codepoint (`U+` and 1 to 6 hex digits, or 4 to 6 hex digits alone) shows its character first, ranged
  ones too. At most 600 results are shown (default); the menus are dimmed while a search is shown.
- **A cell** shows its character; a combining mark sits on a dotted circle (◌), and a space or format character shows
  its abbreviation (NBSP, ZWJ) in a dashed box. Each cell is named by the character's name; hovering or focusing one
  shows it large beside the grid, with its name and codepoint.
- **Keyboard**: the grid is one Tab stop; the arrows move by a cell and a row, Home and End to the first and last,
  Enter or Space inserts.
- **Inserting**: the character replaces the selection, taking the caret's formatting, and the caret goes after it;
  each press is one undo step, and the dialog stays open for more (default). It inserts wherever the caret is: the
  body, a header, a footer or a note.
- **Loading**: the catalogue is fetched the first time the dialog opens, never with the editor; until then the grid
  says "Loading characters…", and if the fetch fails, "The characters could not load." with Try again.
- **Draw to find** is left out (default). If it is added later, the likely route is the handwriting reader Convert to
  Text already uses ([Ink to text](../023-draw-mode/ink-to-text.md): the read-notes reader with an in-browser
  fallback), so self-hosting still needs nothing outside.
- For an Editor; dimmed for anyone else.

## Emoji

Insert > Emoji: the **Insert emoji** dialog; a press on an emoji inserts it as text at the caret.

- **The emoji** are Unicode's fully qualified emoji, as Emojibase's English data names, tags and orders them
  (`emojibase-data`, its version the catalogue was generated from); the skin tone and hair components are left out.
- **Browsing**: tabs for **Recently used** and the nine groups, in Unicode's order: Smileys & emotion, People & body,
  Animals & nature, Food & drink, Travel & places, Activities, Objects, Symbols, Flags. It opens on Recently used when
  there are any, else on Smileys & emotion (default).
- **Search**: every word typed starts a word of an emoji's name, tags or shortcodes (`wave` finds 👋), in any case; the
  results keep Unicode's order, and the tabs are dimmed while a search is shown.
- **Skin tone**: a menu of the default yellow and the five tones; an emoji that has tones is shown and inserted in the
  tone chosen, one with two people in it in that tone for both. The tone is kept in this browser (default).
- **Recently used**: the 24 emoji inserted last, newest first, in this browser (default), each as inserted.
- **A cell** shows the emoji in the system's emoji font (one newer than that font shows as the font draws it,
  default), named by its name; hovering or focusing one shows it large with its name and first shortcode
  (`:waving_hand:`). The grid is one Tab stop, moved through as the special characters' grid is.
- **Inserting**, **loading** and who may insert are as for [special characters](#special-characters): the emoji
  replaces the selection, each press one undo step, the dialog staying open; the catalogue is fetched the first time
  the dialog opens ("Loading emoji…", "The emoji could not load." with Try again); for an Editor, dimmed otherwise.

**Insert emoji using the colon character** (Preferences, on by default): `:` typed at a word's start and then two or
more letters, digits, `_`, `+` or `-` (default) opens a list under the caret of at most 8 emoji (default) whose
shortcodes or name words begin so, shortcodes first, each in the chosen tone.

- Up and Down move through the list; Enter, Tab or a press inserts the one chosen in place of what was typed;
  Escape leaves the text as typed, and the list stays away until the word is left.
- Typing on narrows the list; a space, a character outside those, or no emoji left closes it.
- The list is a `listbox` whose options are read as their names; the writing keeps the focus
  (`aria-activedescendant`).
- An emoji from the list counts as one from the dialog does, and goes to Recently used.

## Horizontal line

Insert > Horizontal line: a paragraph whose bottom border runs across the text width.

- **The line** is an empty paragraph of the caret's paragraph's style whose bottom border is a solid line 1 pt wide,
  grey `#a6a6a6`, 1 pt below its text (default); both formats hold it as a paragraph border, so it opens as one in
  Word, LibreOffice and Google Docs.
- **Where it goes**: a selection is deleted first; at the caret the paragraph is split, the line goes between its two
  halves, and the caret starts the paragraph after it (default). At a paragraph's start the line goes before it; at
  its end, after it, with an empty paragraph after the line when none follows.
- **Removing it** is removing that paragraph: Backspace at the start of the paragraph after it takes the line away, the
  text after it keeping its own formatting, as any empty paragraph before it goes (default).
- Two lines one under the other share one border, as their formats draw paragraphs of the same borders (default).
- It is one undo step, for an Editor; it is dimmed for anyone else, and while a header, footer or note is edited.

## Building blocks

Insert > Building blocks puts one of six ready-made stretches of writing in at the caret, as Google's six do
(default, until a capture of each). Google's are tables of chips; here each is plain paragraphs and tables, every chip
written as its text (C3), so it opens alike in every suite and nothing in it needs an outside service.

- **The menu**, in Google's order: Meeting notes, Email draft, then a line, then Product roadmap, Review tracker,
  Project assets, Content launch tracker, then a line, then Code blocks ([Code blocks](#code-blocks)).
  Custom building blocks (saving one's own) is not here (an either-way row).
- **Meeting notes**: a Heading 2 line of today's date (written in the person's locale, month abbreviated, as Google's
  date chip shows it) and `|`, the caret after it for the meeting's name; a line `Attendees: `; a Heading 3
  `Notes` with one empty bulleted item; a Heading 3 `Action items` with one empty checklist item.
- **Email draft**: a table of two columns, one row each for To, Cc, Bcc and Subject, the label in its left cell in
  grey `#5f6368`, a quarter of the width; an empty paragraph after it for the message. The caret goes to To's cell.
- **The four trackers** are tables: a title row of one cell across the table, in 14 pt, shaded `#f3f3f3`; a row of
  column names in bold, shaded `#f3f3f3`; then their rows, a status written as its text. The title row and the names
  row are header rows, repeated on each page. The caret goes to the first empty cell after the names.

| Tracker                | Columns                                    | Its rows, by their status column              |
| ---------------------- | ------------------------------------------ | --------------------------------------------- |
| Product roadmap        | Project, Status, Related files, Notes      | Not started/In progress/Launched              |
| Review tracker         | Reviewer, Status, Notes                    | Not started/In progress/Under review/Approved |
| Project assets         | File, Description, Status                  | Not started/In progress/Under review/Approved |
| Content launch tracker | Type, Description, Date, Published, Outlet | No/Yes                                        |

- **Tables in a block** are lined 1 pt `#dadce0` round every cell, padded as a new table, their columns sharing the
  text width at the caret equally (a cell's, inside a table), except the email draft's labels.
- **Where it goes**, as a table does ([Tables](tables.md#inserting)): a selection is deleted first; it goes before an
  empty paragraph or one whose start has the caret, after one whose end has it (an empty paragraph following, to
  write on below), and splits a paragraph between.
- Styles the document lacks (Heading 2, Heading 3) are added, as Format > Paragraph styles adds them; the bulleted
  and checklist items start lists of their own.
- It is one undo step, for an Editor; it is dimmed for anyone else, and while a header, footer or note is edited.
- The same four tables are Google's table templates ([Tables](tables.md#inserting)); both menus share one catalogue.

## Code blocks

Insert > Building blocks > Code blocks > a language puts a code block in, as Google's does (default, until Google's
files of one are read): a grey block of monospace lines, highlighted by its language.

- **Languages**, in Google's order: C/C++, CSharp, CSS, Go, HTML, Java, JavaScript, JSON, Kotlin, PHP, Protobuf,
  Python, Rust, Shell, SQL, Textproto, TypeScript, XML.
- **The model**: a code block is one paragraph in a code style, its lines separated by line breaks; nothing else marks
  it, so both formats hold it as they hold any paragraph.
- **Code styles**: `Code`, Roboto Mono 10 pt, single line spacing, 6 pt before and after, shaded `#f1f3f4` with a line
  of the same grey 4 pt clear of the text on every side, so other suites draw it as a padded grey block; and for each
  language `Code (<Language>)` based on `Code` and carrying the same formatting itself, so a suite that drops the
  parent still draws it. The language travels in the file as its style's name; a suite shows it as that style.
- **Reading**: a paragraph whose style is named `Code` is a code block of no language, drawn without highlighting;
  `Code (<Language>)` names one of the list; another name in the brackets reads as no language. The style keeps its
  id and formatting as the file has them.
- **Putting one in**: a selection's paragraphs become one block, their texts joined by line breaks; at a caret in an
  empty paragraph, that paragraph becomes the block; elsewhere an empty block goes in at the caret as a table does
  ([Tables](tables.md#inserting)). The caret goes into the block. A code style the document lacks is added first.
  One undo step, for an Editor; dimmed for anyone else, and while a header, footer or note is edited.
- **Writing in one**: Enter starts a new line in the block, keeping the line's leading spaces and tabs; Enter on a
  last line of nothing but spaces and tabs leaves the block, that line taken away and a Normal text paragraph started
  after it; Tab types a tab. Typing aids (smart quotes, substitutions, automatic lists and links, capitals) are off in
  a block.
- **Drawn**: by its style, with rounded corners, and the language's name in small grey type at its top left;
  highlighting colours keywords, strings, comments and numbers, drawn by the editor only and never written, so a file
  holds plain monospace text. Colours are drawn for the paper (editing-surface.md "The page in the dark scheme").
- The highlighter is LiveDoc's own tokenizer, shared with the canvas's code block, loaded only when a document holds a
  code block; until it loads, a block is drawn without colours.

## Share roles

Editors insert and change objects; a Participant only as suggestions (D7); a Viewer reads, and copies pictures out.

## Limits

`TEXT_DOCUMENT_MAX_OBJECTS` objects a text document ([Text document](text-document.md#limits)); a picture is at most
the gallery's limit.

## Telemetry

`Element · Added · TextDocument<Object>` (Image, Drawing, Chart, Equation, SpecialCharacter, Emoji, HorizontalLine),
a building block as `TextDocumentBuildingBlock<Block>` (MeetingNotes, EmailDraft, ProductRoadmap, ReviewTracker,
ProjectAssets, ContentLaunchTracker), a code block as `TextDocumentCodeBlock`,
with the image source as the type's suffix (ImageUpload, ImageUrl, ImageGallery, ImageCamera, ImageSearch);
`Element · Changed · TextDocumentImage<Action>` (Crop, Wrap, AltText, Replace, Recolour, Adjust, and Drawing
for a drawing's picture made again by Save and close); a new equation from
the equation toolbar counts as Insert > Equation's, and View > Show equation toolbar as `UI · Toggled ·
TextDocumentEquationToolbar`, counted before it flips. Never content.
