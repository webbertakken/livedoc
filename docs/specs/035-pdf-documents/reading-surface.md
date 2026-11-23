# Reading surface

**Status: specified; the first slices of reading are built.** Built:

- The title row with its PDF pill and its tooltip.
- The menus and the toolbar, declared whole as data and held to this page's tables by their test: what is built is
  bound, the rest drawn dimmed, "Coming soon".
- The pages: every page a box of its true size, a whole-page picture for pages near view, let go far from it, and
  sharp tiles over the part in view where that picture is softer than the screen.
- Page display, zoom, Go to, the page bar and Rotate view.

Bound today: Download as PDF, Undo, Redo, the editing modes, Highlight, Select and Help; Page display, Zoom but for
Zoom to selection, Go to but for Previous view and Next view, and Rotate view.

Not built: a tile redrawn alone when a change touches it (a change draws its page again), the panels, find, text selection, page labels in the page bar, the accessible tree (a page is a named region whose picture is
hidden from assistive technology) and the phone layout. The pill's lock glyph waits on the shell, whose pill takes
words alone: a protected file's pill says "Protected" in its tooltip and name.

The chrome of a [PDF document](pdf-document.md) and how its pages are read: the title row, menus, toolbar, the left
panel, the pages, zoom, find and the phone layout, with final copy. It fills the
[office shell](../004-interface-design/office-shell.md): every size, colour and radius is the shell's token, none its
own. Acrobat's functions are laid out in LiveDoc's own shell; its name, logos and artwork never appear. The research
is [Rendering](../../research/pdf-documents/rendering.md) and
[The Acrobat inventory](../../research/pdf-documents/acrobat-inventory.md).

## Layout, top to bottom

| Part           | Holds                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Title row**  | The mark, the name with its **PDF** pill, star, move, save status; the editing mode switch, Share, presence |
| **Menu bar**   | File, Edit, View, Insert, Format, Pages, Tools, Help                                                        |
| **Toolbar**    | The editing mode's tools ([The toolbar](#the-toolbar))                                                      |
| **Notice bar** | At most one notice about the file: repaired, protected, signed, XFA, scanned ([Notices](#notices))          |
| **Left panel** | Thumbnails, Outline, Embedded files, Layers, Signatures, Fields: one at a time, 260 px                      |
| **The pages**  | The PDF pages on the surface's ground, scrolled                                                             |
| **Side panel** | Comments, version history, properties of what is selected, find results: one at a time, on the right        |
| **Page bar**   | Bottom centre, floating: the page field ("3 / 14"), previous and next, zoom out, the zoom field, zoom in    |

- The ground behind the pages is the shell's surface colour in both schemes; a PDF page is drawn as its file says, on
  its own paper, with a hairline edge in the shell's outline colour so a white page is told from a white ground.
- In the dark scheme the chrome is dark and the pages are as the file says until the person turns on
  [Dark pages](dark-pages.md) (ruling C3).
- The document group floats at the bottom right as over a text document
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-tab-strip)), above the page bar's line.

## The title row

The shell draws it ([Office shell](../004-interface-design/office-shell.md#title-row)); a PDF document adds:

- **The format pill** reads **PDF**, with the tooltip "PDF 1.7, 14 pages, 1.2 MB" (the file's own version, left out
  where the file names none); a protected file's pill carries a lock glyph and "Protected" in its accessible name.
- **Save status**: "Saved", "Saving…", "Offline: changes are kept in this browser", "In This Browser"; and "Uploading
  42%" while a new PDF's bytes travel, when the pages already show from the local bytes.
- **The editing mode switch** ([Editing modes](editing-modes.md#switching)), left of Share.
- **A signature chip**, left of the switch, when the file carries certificate signatures: "Signed" (all intact),
  "Signed, changed since" or "Signature problem"; a press opens the Signatures panel
  ([Signing](signing.md#the-signatures-panel)).
- **Comments** (the comments panel) and **Version history**, as a text document's.

## Menus

Declared as one catalogue ([Menus as data](../004-interface-design/office-shell.md#menus-as-data)); each item carries
the least level that sees it, and the shell draws the menus for the level of the editing mode the person is in
([Editing modes](editing-modes.md#switching)): a `participate` item shows in Reviewing and Editing, an `edit` item in
Editing. Shortcuts are in [Keyboard shortcuts](keyboard-shortcuts.md).

- **The tables below are the catalogue's source**: its test reads them and holds the catalogue to every item, in this
  order, at this level.
- A row names one item, or several, separated by commas, that share its level. **▸** marks a submenu: its **Does**
  cell lists its items, separated by semicolons, up to the first full stop; words in round brackets are a note, never
  part of a name.
- **Mode** names the first editing mode that lists the item: the mode drawn for the item's level. It is the level in
  the switch's words, never a second gate.
- An item whose function is not built is drawn dimmed, "Coming soon", as the shell draws it for every kind.
- Where the separators fall is the catalogue's.

### File

| Item                        | Does                                                                                                                               | Level       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Open                        | A LiveDoc document, or a PDF from the computer as a new PDF document                                                               | view        |
| Make a copy                 | [Copies](live-editing-and-storage.md#copies-the-trash-and-versions)                                                                | view        |
| Share ▸                     | Share with others; Copy link. Drawn for who may share the document                                                                 | edit        |
| Email ▸                     | Email this file. Where the host has email ([Files, print and sync](files-print-and-sync.md#email))                                 | view        |
| Download ▸                  | PDF; PDF, flattened; PDF without comments; Pages as pictures; Text; Field data. [Downloading](files-print-and-sync.md#downloading) | view        |
| Replace file                | Another PDF's bytes become the stored file ([Files, print and sync](files-print-and-sync.md#replacing))                            | edit        |
| Open as a text document     | A copy, through the text document's import                                                                                         | view        |
| Rename, Move, Move to trash | The document's own                                                                                                                 | edit        |
| Version history ▸           | Name current version; See version history; Previous versions                                                                       | participate |
| Make available offline      | Keeps the stored file in this browser                                                                                              | view        |
| Properties                  | Description, Security, Fonts, Size ([Document tools](document-tools.md#properties))                                                | view        |
| Print                       | [Printing](files-print-and-sync.md#printing)                                                                                       | view        |

### Edit

| Item             | Does                                                                               | Level       |
| ---------------- | ---------------------------------------------------------------------------------- | ----------- |
| Undo, Redo       | The person's own changes ([Undo](live-editing-and-storage.md#undo))                | participate |
| Cut              | The selected marks, objects, or pages in the thumbnails, onto the clipboard        | participate |
| Copy             | The selection: text, marks, objects, pages in the thumbnails                       | view        |
| Paste, Delete    | What Cut takes: marks, objects, pages in the thumbnails; never the file's own text | participate |
| Select all       | The page's text, or every mark or object of the tool in hand                       | view        |
| Find             | [Find](#find)                                                                      | view        |
| Find and replace | [Editing text](editing-text.md#find-and-replace)                                   | edit        |
| Edit text        | The text tool ([Editing text](editing-text.md))                                    | edit        |
| Edit objects     | The object tool ([Objects](objects.md))                                            | edit        |
| Take a snapshot  | Copies a dragged area of the page as a picture                                     | view        |

### View

| Item                                                            | Does                                                                                                                                                       | Level |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Mode ▸                                                          | Reviewing; Editing; Viewing. The switch's own order ([Editing modes](editing-modes.md#switching))                                                          | view  |
| Page display ▸                                                  | Single page; Continuous (default); Two pages; Two pages, continuous; Show cover page                                                                       | view  |
| Zoom ▸                                                          | Zoom in; Zoom out; Fit width (default); Fit page; Actual size; 50%; 75%; 100%; 125%; 150%; 200%; 400%; 800%; 1600%; 2400%; 3200%; 6400%; Zoom to selection | view  |
| Rotate view ▸                                                   | Clockwise; Counterclockwise. The person's view only, never the file                                                                                        | view  |
| Thumbnails, Outline, Embedded files, Layers, Signatures, Fields | Each opens its left panel                                                                                                                                  | view  |
| Comments                                                        | The comments panel                                                                                                                                         | view  |
| Marks                                                           | Shows or hides every mark, for this person                                                                                                                 | view  |
| Dark pages                                                      | A check, offered in the dark scheme only ([Dark pages](dark-pages.md))                                                                                     | view  |
| Read mode                                                       | Hides the menu bar, toolbar and panels; Escape leaves                                                                                                      | view  |
| Full screen                                                     | One page a screen, arrows to turn; Escape leaves                                                                                                           | view  |
| Go to ▸                                                         | First page; Last page; Previous page; Next page; Page…; Previous view; Next view                                                                           | view  |

- Every View item is seen by every level and changes one person's view only.
- Zoom's percentages are Acrobat's own levels from 50% `(default)`; the zoom field takes any value from 10% to 6400%.
- **Go to ▸ Page…** puts the caret in [the page bar](#the-page-bar)'s page field, its number selected.

### Insert

| Item                                                    | Does                                                                                                                                          | Level       | Mode      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| Comment                                                 | A comment on the selection, or a note where the next press lands                                                                              | participate | Reviewing |
| Highlight, Underline, Strikethrough, Squiggly underline | A text mark on the selection                                                                                                                  | participate | Reviewing |
| Text, Callout                                           | A text mark ([Marks](marks.md))                                                                                                               | participate | Reviewing |
| Drawing                                                 | Freehand                                                                                                                                      | participate | Reviewing |
| Shape ▸                                                 | Line; Arrow; Rectangle; Ellipse; Polygon; Cloud; Connected lines                                                                              | participate | Reviewing |
| Stamp ▸                                                 | Standard stamps; Dynamic stamps; Custom stamps; Manage stamps. Each opens the stamps there ([Marks](marks.md#stamps))                         | participate | Reviewing |
| Tick, Cross, Dot                                        | Fill marks for a PDF with no fields ([Fields](fields.md#a-pdf-with-no-fields))                                                                | participate | Reviewing |
| Signature ▸                                             | Drawn signature; Initials; Certificate signature; Time stamp. [Signing](signing.md)                                                           | participate | Reviewing |
| Text box                                                | New page content ([Editing text](editing-text.md))                                                                                            | edit        | Editing   |
| Picture                                                 | [Objects](objects.md#pictures)                                                                                                                | edit        | Editing   |
| Link                                                    | [Objects](objects.md#links)                                                                                                                   | edit        | Editing   |
| Field ▸                                                 | Text field; Date field; Tick box; Radio button; Dropdown; List; Picture field; Button; Signature field. [Building fields](building-fields.md) | edit        | Editing   |
| Header and footer, Page numbers, Watermark, Background  | [Document tools](document-tools.md)                                                                                                           | edit        | Editing   |
| Bookmark                                                | A bookmark to the place in view                                                                                                               | edit        | Editing   |
| Embedded file                                           | [Document tools](document-tools.md#embedded-files)                                                                                            | edit        | Editing   |

- Stamp's four entries are its categories and their keeper `(default)`: the stamps themselves are a person's own, so
  no menu lists them.

### Format

Format acts on what is selected: a mark (colour, opacity, line, fill, font of a text mark), a text box (font, size,
colour, weight, alignment, spacing), an object (arrange, align, distribute, flip, rotate, crop). An item with nothing
to act on is dimmed. Colours come from the one colour picker
([Colour picker](../004-interface-design/colour-picker.md)).

| Item                 | Does                                                                                                       | Level       | Mode      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| Colour, Fill colour  | Of the selected mark, text or shape                                                                        | participate | Reviewing |
| Opacity ▸            | 100%; 75%; 50%; 25%; 10%                                                                                   | participate | Reviewing |
| Line width ▸         | 0.5 pt; 1 pt; 2 pt; 4 pt; 8 pt; 12 pt                                                                      | participate | Reviewing |
| Line style ▸         | Solid; Dashed; Dotted; Dash dot; Long dashes                                                               | participate | Reviewing |
| Line ends ▸          | None; Arrow; Open arrow; Circle; Square; Diamond; Bar                                                      | participate | Reviewing |
| Align text ▸         | Left; Centre; Right; Justified. A Text or Callout mark's words, or a text box's                            | participate | Reviewing |
| Arrange ▸            | Bring to front; Bring forward; Send backward; Send to back                                                 | participate | Reviewing |
| Group, Ungroup, Lock | Marks ([Marks](marks.md#changing-a-mark)); Lock is a check                                                 | participate | Reviewing |
| Text ▸               | Bold; Italic; Underline; Strikethrough; Superscript; Subscript. [Editing text](editing-text.md#formatting) | edit        | Editing   |
| Spacing              | Line, paragraph and character spacing and the horizontal scale, in the side panel                          | edit        | Editing   |
| List ▸               | Bulleted; Numbered; None                                                                                   | edit        | Editing   |
| Align objects ▸      | Left; Centre; Right; Top; Middle; Bottom. [Objects](objects.md#arranging)                                  | edit        | Editing   |
| Distribute ▸         | Horizontally; Vertically                                                                                   | edit        | Editing   |
| Match size ▸         | Width; Height; Both                                                                                        | edit        | Editing   |
| Flip ▸               | Horizontally; Vertically                                                                                   | edit        | Editing   |
| Rotate ▸             | Clockwise; Counterclockwise                                                                                | edit        | Editing   |
| Crop                 | A picture ([Objects](objects.md#pictures))                                                                 | edit        | Editing   |

- The table is Format's items `(default)`: every one is a function [Marks](marks.md#changing-a-mark),
  [Editing text](editing-text.md#formatting) or [Objects](objects.md#arranging) names, and none is new here.
- A font and a size are chosen in the toolbar's fields, which no menu repeats `(default)`.
- The steps of Opacity and Line width are the menu's `(default)`; the side panel takes any value in their range.

### Pages

Each is Editing's ([Organising pages](organising-pages.md)).

| Item                                     | Does                                                                   | Level | Mode    |
| ---------------------------------------- | ---------------------------------------------------------------------- | ----- | ------- |
| Organise pages                           | [The organise view](organising-pages.md#the-organise-view)             | edit  | Editing |
| Insert ▸                                 | Blank page; From a PDF; From a LiveDoc document                        | edit  | Editing |
| Delete, Extract, Split, Replace          | The selected pages                                                     | edit  | Editing |
| Rotate ▸                                 | Clockwise; Counterclockwise; Half turn. In the file, for everyone      | edit  | Editing |
| Crop, Resize, Page labels, Combine files | [Organising pages](organising-pages.md#rotating-cropping-and-resizing) | edit  | Editing |

### Tools

| Item             | Does                                                                                  | Level       | Mode      |
| ---------------- | ------------------------------------------------------------------------------------- | ----------- | --------- |
| Select, Hand     | The pointer's tool, one of a set ([The toolbar](#the-toolbar))                        | view        | Viewing   |
| Fill in ▸        | Highlight fields; Next field; Clear all fields; Import field data; Export field data  | participate | Reviewing |
| Recognise text   | [Scans](scans.md)                                                                     | participate | Reviewing |
| Prepare fields   | [Building fields](building-fields.md)                                                 | edit        | Editing   |
| Redact ▸         | Mark for redaction; Find text to redact; Apply redactions                             | edit        | Editing   |
| Protect ▸        | Set passwords and permissions; Remove protection; Remove hidden information           | edit        | Editing   |
| Flatten ▸        | Marks; Fields; Both                                                                   | edit        | Editing   |
| Reduce file size | [Document tools](document-tools.md#reducing-file-size)                                | edit        | Editing   |
| Compare          | Two versions, or this PDF and another ([Document tools](document-tools.md#comparing)) | view        | Viewing   |

- Select and Hand are in a menu so the keyboard and the tool finder reach them `(default)`.

### Help

The shell's own.

| Item               | Does                           | Level |
| ------------------ | ------------------------------ | ----- |
| Search the menus   | The tool finder                | view  |
| Help               | The help centre's PDF articles | view  |
| Report a bug       | LiveDoc's own                  | view  |
| Keyboard shortcuts | The shell's shortcuts dialog   | view  |

## The toolbar

Declared as data ([Toolbar](../004-interface-design/office-shell.md#toolbar)). The first groups are every mode's; the
rest are the mode's own. A control past the width goes into the shell's overflow row.

| Editing mode  | Group        | Controls                                                         |
| ------------- | ------------ | ---------------------------------------------------------------- |
| Every mode    | History      | Undo; Redo                                                       |
| Every mode    | File         | Print; Find                                                      |
| Every mode    | Pointer      | Select; Hand                                                     |
| **Viewing**   | View         | Page display; Rotate view; Dark pages                            |
| **Reviewing** | Comment      | Comment                                                          |
| **Reviewing** | Marks        | Highlight; Text; Drawing; Shape; Stamp; Tick; Sign               |
| **Reviewing** | Tool in hand | Colour; Line width                                               |
| **Editing**   | Content      | Edit text; Text box; Picture; Link; Object tool; Organise pages  |
| **Editing**   | Text         | Font; Font size; Bold; Italic; Underline; Text colour; Alignment |

- **The table is the toolbar's source**: a row is one group, its controls separated by semicolons, and the toolbar's
  test reads it. A mode's own controls are at the level the mode is drawn for.
- **Undo** and **Redo** are a person who may review's, so hidden in Viewing; every other control of every mode is a
  Viewer's too.
- **Highlight** holds Underline and Strikethrough behind its chevron and remembers the last one used.
- **Colour** and **Line width** are the tool in hand's; Editing's **Text** group shows while a text box holds the
  caret. **Dark pages** is offered in the dark scheme only.
- **Select** selects text and whatever the mode may change; **Hand** drags the view. Holding Space is the hand for as
  long as it is held.
- A mark or page content tool **stays in hand** until Escape or another tool is chosen; pressing V returns to Select.
- A tool's colour and width are remembered per tool, per person, in this browser.
- The toolbar never changes height between modes, so the pages do not jump when a person switches.

## Notices

One bar under the toolbar, in the shell's notice style, dismissible per person per open; where more than one applies
they queue in this order:

| Notice                                                                                   | When                                | Action                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ |
| "This PDF was damaged. LiveDoc repaired it to show it; the file itself is unchanged."    | A repaired file                     | **Details**                    |
| "This PDF asks not to be changed."                                                       | Permissions forbid changes          | **Enter permissions password** |
| "This PDF is signed. Reviewing keeps its signatures valid."                              | Certificate signatures, all intact  | **Signatures**                 |
| "This PDF has changed since it was signed."                                              | A signature covers an earlier state | **Signatures**                 |
| "This PDF has fields you can fill in."                                                   | Fields, opened in Viewing           | **Fill in** (enters Reviewing) |
| "This form was made with XFA, an older form technology. LiveDoc shows its static pages." | XFA                                 | **Learn more**                 |
| "These pages are scans. Recognise their text to find and mark words."                    | Scanned pages without text          | **Recognise text**             |
| "Some of this PDF isn't shown: <what>."                                                  | Portfolio, rich media, 3D           | **Details**                    |

## The left panel

One panel at a time, chosen from a rail of glyph buttons at the far left (each a toggle with its name as tooltip);
the choice is remembered per person per document.

| Panel              | Shows                                                                                                  | Editing adds                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Thumbnails**     | Every page, small, with its label; the page in view outlined; people's colours on the page they are on | Drag to reorder, select many, the page menu ([Organising pages](organising-pages.md)) |
| **Outline**        | The file's bookmarks, nested; a press goes to its place; the one for the place in view is marked       | Add, rename, nest, reorder, delete                                                    |
| **Embedded files** | Name, size, type; **Save**; **Open** for an embedded PDF ([Security](security.md#embedded-files))      | Add, rename, delete                                                                   |
| **Layers**         | The file's PDF layers, each with an eye: shown or hidden for this person only                          | Nothing: authoring PDF layers is left out                                             |
| **Signatures**     | [The signatures panel](signing.md#the-signatures-panel)                                                | Nothing                                                                               |
| **Fields**         | Every field in tab order, with its type and whether it is filled; a press goes to it                   | The field list of [Building fields](building-fields.md)                               |

- **Layers** lists the file's PDF layers by name in the file's order, each shown or hidden as the file sets it; a
  layer the file locks shows its state and takes no change.
- A panel with nothing to show says so in one line ("This PDF has no bookmarks.") and, in Editing, offers the first
  one ("Add a bookmark").
- Thumbnails are drawn as the pages are scrolled to, light paper always, marks included.
- **Go to page**: the page bar's field takes a page number or a page label ("iv", "A-3"); Enter goes; a value that
  names no page shakes the field and says "There is no page iv."

## The pages

- **Drawn by the engine's worker**, never on the page's own thread: a whole-page picture first (within one draw),
  then sharp **tiles** of `PDF_TILE_PX` behind it; a tile is redrawn alone when a change touches it.
  - A page has tiles only where its whole-page picture is softer than the screen: past
    `PDF_PAGE_PICTURE_MAX_PIXELS`. They cover the part of the page in view and one tile around it `(default)`, so a
    page zoomed to 6400% draws what shows, never the page.
  - A tile is `PDF_TILE_PX` CSS pixels a side, cut at the page's edge, drawn at the screen's pixel ratio, turned as
    the page is.
  - Tiles are kept to `PDF_TILE_CACHE_BYTES`, the least lately shown let go first; a tile scrolled back to is shown
    from there, not drawn again.
  - During a zoom the tiles already there grow and shrink with the page at once; tiles at the new zoom are drawn once
    it has rested `REDRAW_SETTLE_MS` and take their place `(default)`.
- **Virtualised**: only pages near the viewport have canvases; the rest are boxes of their true size, read before
  anything is drawn.
- **Page display**: continuous (default) or one row at a time; one or two pages across, with or without a cover
  page; the gap between pages is the shell's.
  - A **row** is the pages side by side: one, or two. With **Show cover page** the first page stands alone on the
    right, as a book's cover, and the pairs start at the second; with one page across it changes nothing.
  - Two pages across meet at the row's middle, each in a place as wide as the file's widest page, so the pairs line
    up down the file `(default)`.
  - **Single page** and **Two pages** show the row in view alone. A wheel, or a key that scrolls, pushed past the
    row's end turns to the next row, and pushed past its start to the row before, at its end `(default)`. A wheel
    turns one row, then none until it has rested `PDF_WHEEL_TURN_MS`, so a trackpad's glide turns one.
  - A change of page display keeps the page in view.
- **Zoom**: 10% to 6400%, Fit width (default), Fit page, Actual size; ⌘ with the wheel and a pinch zoom about the
  pointer. A zoom gesture scales the tiles already there at once and sharpens behind, so it never waits.
  - **Fit width** fits the widest row to the view, never past `PDF_FIT_WIDTH_MAX` `(default)`, so a page on a wide
    window is not drawn larger than it reads well. **Fit page** fits the widest and the tallest row, so every row
    shows whole `(default)`. **Actual size** is 100%: a point is 1/72 inch and a CSS pixel 1/96.
  - **Zoom in** and **Zoom out** go to the next of `PDF_ZOOM_STEPS` above or below the zoom shown, whichever zoom
    that was.
  - A zoom from the menus, the keys or the page bar keeps the middle of the view where it is; the wheel and a pinch
    keep what is under the pointer.
- **The view is the person's** `(default)`: page display, zoom and the turn of Rotate view are kept while the surface
  is open, per tab, never stored and never another person's. A PDF opens in Continuous at Fit width.
- **Rotate view** turns every page a quarter for this person only; rotating a page in the file is a page operation.
  - The engine draws each page turned, so a mark, a selection and a pointer meet the page where the turned picture
    shows it; nothing is turned by the browser over an upright picture.
  - A turn keeps the page in view, its top at the view's top `(default)`.
  - Four turns are the page upright again. A thumbnail, a print, a download and another person's view are never
    turned.
- **Selecting text**: a drag selects in the file's own text order, by character; a double press a word, a triple a
  line; Shift extends; Alt with a drag selects a column. The selection is drawn by LiveDoc as rectangles over the
  glyphs.
- **Copy** puts the selected text on the clipboard as plain text, lines joined where the file broke them inside a
  paragraph; a file that asks not to be copied dims Copy ([Opening](opening.md#passwords)).
- **Links**: the pointer shows a hand and the target as a tooltip; a press follows a place in the document at once,
  and asks first for an address ([Security](security.md#links-and-actions)).
- **Previous view** and **Next view** step through the places a person jumped from and to, as a browser's history.
- **The context menu** on a page: Copy, Select all, Add comment, Highlight (and the last mark used), Find "…",
  Go to ▸, Rotate view, and the items of whatever is under the pointer (a mark, a field, an object), each only for
  the level that may.
- Memory is bounded: pages left behind are closed in the engine and tiles kept to `PDF_TILE_CACHE_BYTES`.

## The page bar

Bottom centre, floating over the pages, in the shell's tokens: a group named "Page and zoom".

| Control           | Does                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| **Previous page** | Goes to the page before the one in view; dimmed on the first page                               |
| **Page**          | The number of the page in view, with "/ 14" after it; takes a page number, and Enter goes to it |
| **Next page**     | Goes to the page after the one in view; dimmed on the last page                                 |
| **Zoom out**      | The step below the zoom shown; dimmed at 10%                                                    |
| **Zoom**          | The zoom shown, as a percentage whichever zoom it is; takes 10 to 6400, with or without a "%"   |
| **Zoom in**       | The step above the zoom shown; dimmed at 6400%                                                  |

- **The page in view** is the one under the middle of the view; of a row of two, the left one `(default)`.
- **Previous page** and **Next page** turn a row where two pages are across, as ← and → do.
- **Zoom**'s list is Fit width, Fit page, Actual size and View > Zoom's percentages, the zoom in force marked.
- A typed page that is no page of the file puts the number back and says "There is no page 99." over the bar, until
  the next key or press; a typed zoom that is none puts the zoom back, as every value field of the shell does.
- A page label typed in the field is the left panel's [Go to page](#the-left-panel).
- The bar is never under the document group: where the two would meet, the bar sits above it `(default)`.

## Find

- ⌘F opens the find field at the top right of the pages: the query, the count ("3 of 41"), Previous, Next, and
  **Options**: Match case, Whole words, Include comments and marks' text, Include bookmarks.
- Matches are tinted on the pages, the current one stronger; Enter and ⇧Enter step; the view scrolls to each.
- **All results** opens the side panel with every match in its line of text, grouped by page; a press goes to it.
- Find searches the file's text, recognised text and, where asked, comments and marks. It searches a page as soon as
  the page's text is read, so results for a large file arrive page by page, with "Searching 120 of 400 pages…".
- A PDF with scanned pages and no recognised text says "12 pages are scans and weren't searched." with **Recognise
  text**.
- Nothing is found by a regular expression `(default)`.

## Phone and tablet

- The title row is one line and the menus move into More, as the shell does
  ([Phone and tablet](../004-interface-design/office-shell.md#phone-and-tablet)); the page bar stays, and the left
  panel opens as a sheet from the bottom.
- **Pinch** zooms about the fingers; **two fingers** pan; a **double tap** zooms to the column under the finger and
  back. One finger scrolls in Viewing and with the Hand; with a mark tool in hand it draws.
- The toolbar shows the mode's first tools and puts the rest in its overflow row; every target is at least 44 px.
- A long press selects the word under the finger, with handles to extend and a small bar: Copy, Highlight, Comment.
- Reduced motion: no animated scroll to a result or a page, no zoom easing; the page appears where asked.
- Tiles are drawn at a pixel ratio capped at `PDF_PHONE_PIXEL_RATIO` and the cache is the phone's budget.

## Limits

| Constant                       | Value                                                                                                  | Why                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PDF_PAGE_PICTURE_MAX_PIXELS`  | 8,388,608                                                                                              | `(default)` A page's whole-page picture, drawn at the screen's scale up to this; sharper detail is the tiles'                            |
| `PDF_TILE_PX`                  | 512                                                                                                    | `(default)` CSS pixels a side; safe range 256 to 1,024                                                                                   |
| `PDF_TILE_CACHE_BYTES`         | 134,217,728 (128 MiB)                                                                                  | `(default)` Desktop. Set by measurement                                                                                                  |
| `PDF_TILE_PHONE_CACHE_BYTES`   | 50,331,648 (48 MiB)                                                                                    | `(default)` A phone's tiles; a phone is a device that says it has 4 GB or less, or says nothing and is touched                           |
| `PDF_PHONE_PIXEL_RATIO`        | 2                                                                                                      | `(default)` Past it a phone's canvas limits bite                                                                                         |
| `PDF_ZOOM_MIN`, `PDF_ZOOM_MAX` | 0.1, 64                                                                                                | Acrobat's range, 10% to 6400%                                                                                                            |
| `PDF_ZOOM_STEPS`               | 10, 12.5, 25, 33.3, 50, 66.7, 75, 100, 125, 150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 6400 | `(default)` Per cent: where Zoom in and Zoom out stop, Acrobat's own steps within the range (assumed, from the product as known)         |
| `PDF_FIT_WIDTH_MAX`            | 2                                                                                                      | `(default)` Fit width's ceiling, 200%; safe range 1 to 4                                                                                 |
| `PDF_WHEEL_ZOOM_RATE`          | 0.002                                                                                                  | `(default)` ⌘ with the wheel multiplies the zoom by e to this times the pixels wheeled: a notch of 100 is 22%; safe range 0.001 to 0.005 |
| `PDF_WHEEL_TURN_MS`            | 300                                                                                                    | `(default)` How long a wheel rests before it turns another row; safe range 150 to 600                                                    |
| `PDF_ZOOM_SETTLE_MS`           | 400                                                                                                    | `(default)` How long a wheel's or a pinch's zoom rests before it is told to telemetry; safe range 200 to 1,000                           |
| `PDF_FIND_MAX_RESULTS`         | 10,000                                                                                                 | `(default)` Listed results; the count still says how many more                                                                           |

## Share roles

- The surface is the same for every role; an item, a control or a panel action above the session's level is not
  drawn, and a `built` item is never shown dimmed for a level ([Office shell](../004-interface-design/office-shell.md)).
- A Viewer has the Viewing toolbar, every View item, Find, Copy, Download and Print unless the owner turned those
  off for Viewers and Participants, when they are not drawn.
- A Participant has Reviewing's menus and toolbar; an Editor all of it ([Editing modes](editing-modes.md#share-roles)).

## Accessibility

[Accessibility](accessibility.md) holds the accessible tree and keyboard-only use. For the chrome:

- Every control has a name; the page bar's field is "Page", described by "of 14"; the zoom field is "Zoom".
- The left rail is a toolbar of toggles; each panel is a region named for what it shows, its list a tree or list.
- Focus is always visible in both schemes; the chrome reflows to 400% zoom, the pages scroll in two directions.
- Every token pair meets 4.5:1 for text and 3:1 for outlines and focus, in light and dark.

## Telemetry

`Pdf · Changed · PageDisplay.<Single|Continuous|Two|TwoContinuous|CoverShown|CoverHidden>`,
`Pdf · Changed · RotateView.<Clockwise|Counterclockwise>` `(default)`,
`Pdf · Zoomed · <FitWidth|FitPage|Actual|In|Out|Custom>` (a wheel's or a pinch's zoom once, as `Custom`, when it settles),
`Pdf · Opened · Panel.<Thumbnails|Outline|EmbeddedFiles|Layers|Signatures|Fields>`, `Pdf · Searched · Find`,
`Pdf · Toggled · <MarksShown|MarksHidden|ReadMode|FullScreen>`, `Pdf · Selected · Tool.<Name>`, and the shell's own
menu and tool finder events. Never a query, a page's text or a name.

Fingerprints: `[pdf] view-display display=<name>`, `[pdf] view-zoomed zoom=<zoom> way=<way>`,
`[pdf] view-went-to page=<n>`, `[pdf] view-turned turns=<0-3>`, `[pdf] tile-failed page=<n> again=<yes|no>`.

## Errors

| When                                    | A person sees                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| A page cannot be drawn                  | Its own frame: "This page couldn't be drawn." **Try again**                   |
| A tile fails                            | The whole-page picture stays; the tile is asked for once more                 |
| The engine's worker stops while reading | The pages keep what they show; "Reading stopped. Reload this PDF." **Reload** |
| The surface's code cannot load          | "This tab couldn't load." **Try Again**, as every surface                     |
