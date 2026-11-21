# Reading surface

**Status: specified.** Nothing is built.

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

- **The format pill** reads **PDF**, with the tooltip "PDF 1.7, 14 pages, 1.2 MB" (the file's own version); a
  protected file's pill carries a lock glyph and "Protected" in its accessible name.
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

### File

| Item                        | Does                                                                                                                                | Level       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Open                        | A LiveDoc document, or a PDF from the computer as a new PDF document                                                                | view        |
| Make a copy                 | [Copies](live-editing-and-storage.md#copies-the-trash-and-versions)                                                                 | view        |
| Share ▸                     | Share with others; Copy link                                                                                                        | by sharing  |
| Email ▸                     | Email this file, where the host has email ([Files, print and sync](files-print-and-sync.md#email))                                  | view        |
| Download ▸                  | PDF; PDF, flattened; PDF without comments; Pages as pictures; Text; Field data ([Downloading](files-print-and-sync.md#downloading)) | view        |
| Replace file                | Another PDF's bytes become the stored file ([Files, print and sync](files-print-and-sync.md#replacing))                             | edit        |
| Open as a text document     | A copy, through the text document's import                                                                                          | view        |
| Rename, Move, Move to trash | The document's own                                                                                                                  | edit        |
| Version history ▸           | Name current version; See version history; Previous versions                                                                        | participate |
| Make available offline      | Keeps the stored file in this browser                                                                                               | view        |
| Properties                  | Description, Security, Fonts, Size ([Document tools](document-tools.md#properties))                                                 | view        |
| Print                       | [Printing](files-print-and-sync.md#printing)                                                                                        | view        |

### Edit

| Item                     | Does                                                                     | Level       |
| ------------------------ | ------------------------------------------------------------------------ | ----------- |
| Undo, Redo               | The person's own changes ([Undo](live-editing-and-storage.md#undo))      | participate |
| Cut, Copy, Paste, Delete | The selection: text (copy only), marks, objects, pages in the thumbnails | view (Copy) |
| Select all               | The page's text, or every mark or object of the tool in hand             | view        |
| Find                     | [Find](#find)                                                            | view        |
| Find and replace         | [Editing text](editing-text.md#find-and-replace)                         | edit        |
| Edit text                | The text tool ([Editing text](editing-text.md))                          | edit        |
| Edit objects             | The object tool ([Objects](objects.md))                                  | edit        |
| Take a snapshot          | Copies a dragged area of the page as a picture                           | view        |

### View

| Item                                                            | Does                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Mode ▸                                                          | Viewing, Reviewing, Editing                                                          |
| Page display ▸                                                  | Single page; Continuous (default); Two pages; Two pages, continuous; Show cover page |
| Zoom ▸                                                          | Fit width (default); Fit page; Actual size; 50% to 6400%; Zoom to selection          |
| Rotate view ▸                                                   | Clockwise; Counterclockwise: the person's view only, never the file                  |
| Thumbnails, Outline, Embedded files, Layers, Signatures, Fields | Each opens its left panel                                                            |
| Comments                                                        | The comments panel                                                                   |
| Marks                                                           | Shows or hides every mark, for this person                                           |
| Dark pages                                                      | A check, offered in the dark scheme only ([Dark pages](dark-pages.md))               |
| Read mode                                                       | Hides the menu bar, toolbar and panels; Escape leaves                                |
| Full screen                                                     | One page a screen, arrows to turn; Escape leaves                                     |
| Go to ▸                                                         | First page; Last page; Previous page; Next page; Page…; Previous view; Next view     |

Every View item is seen by every level and changes one person's view only.

### Insert

| Item                                                    | Does                                                                                 | Level       | Mode      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- | --------- |
| Comment                                                 | A comment on the selection, or a note where the next press lands                     | participate | Reviewing |
| Highlight, Underline, Strikethrough, Squiggly underline | A text mark on the selection                                                         | participate | Reviewing |
| Text, Callout                                           | A text mark ([Marks](marks.md))                                                      | participate | Reviewing |
| Drawing                                                 | Freehand                                                                             | participate | Reviewing |
| Shape ▸                                                 | Line, Arrow, Rectangle, Ellipse, Polygon, Cloud, Connected lines                     | participate | Reviewing |
| Stamp ▸                                                 | The stamps ([Marks](marks.md#stamps))                                                | participate | Reviewing |
| Tick, Cross, Dot                                        | Fill marks for a PDF with no fields ([Fields](fields.md#a-pdf-with-no-fields))       | participate | Reviewing |
| Signature ▸                                             | Drawn signature; Initials; Certificate signature; Time stamp ([Signing](signing.md)) | participate | Reviewing |
| Text box                                                | New page content ([Editing text](editing-text.md))                                   | edit        | Editing   |
| Picture                                                 | [Objects](objects.md#pictures)                                                       | edit        | Editing   |
| Link                                                    | [Objects](objects.md#links)                                                          | edit        | Editing   |
| Field ▸                                                 | Each field type ([Building fields](building-fields.md))                              | edit        | Editing   |
| Header and footer, Page numbers, Watermark, Background  | [Document tools](document-tools.md)                                                  | edit        | Editing   |
| Bookmark                                                | A bookmark to the place in view                                                      | edit        | Editing   |
| Embedded file                                           | [Document tools](document-tools.md#embedded-files)                                   | edit        | Editing   |

### Format

Format acts on what is selected: a mark (colour, opacity, line, fill, font of a text mark), a text box (font, size,
colour, weight, alignment, spacing), an object (arrange, align, distribute, flip, rotate, crop). An item with nothing
to act on is dimmed. Colours come from the one colour picker
([Colour picker](../004-interface-design/colour-picker.md)).

### Pages

Each is Editing's ([Organising pages](organising-pages.md)), least level `edit`: Organise pages; Insert ▸ (Blank
page, From a PDF, From a LiveDoc document); Delete; Extract; Split; Replace; Rotate ▸; Crop; Resize; Page labels;
Combine files.

### Tools

| Item               | Does                                                                                  | Level       | Mode      |
| ------------------ | ------------------------------------------------------------------------------------- | ----------- | --------- |
| Fill in ▸          | Highlight fields; Next field; Clear all fields; Import and export field data          | participate | Reviewing |
| Recognise text     | [Scans](scans.md)                                                                     | participate | Reviewing |
| Prepare fields     | [Building fields](building-fields.md)                                                 | edit        | Editing   |
| Redact ▸           | Mark for redaction; Find text to redact; Apply redactions                             | edit        | Editing   |
| Protect ▸          | Set passwords and permissions; Remove protection; Remove hidden information           | edit        | Editing   |
| Flatten ▸          | Marks; Fields; Both                                                                   | edit        | Editing   |
| Reduce file size   | [Document tools](document-tools.md#reducing-file-size)                                | edit        | Editing   |
| Compare            | Two versions, or this PDF and another ([Document tools](document-tools.md#comparing)) | view        | Viewing   |
| Keyboard shortcuts | The shell's shortcuts dialog                                                          | view        | Viewing   |

Help is the shell's: Search the menus, Help, Report a bug, Keyboard shortcuts.

## The toolbar

Declared as data ([Toolbar](../004-interface-design/office-shell.md#toolbar)). The first groups are every mode's; the
rest are the mode's own. A control past the width goes into the shell's overflow row.

| Editing mode  | Groups, left to right                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every mode    | Undo, Redo (hidden in Viewing) · Print · Find · **Select** and **Hand** (one of a set)                                                                                 |
| **Viewing**   | Page display · Rotate view · Dark pages (dark scheme only)                                                                                                             |
| **Reviewing** | Comment · Highlight, Underline, Strikethrough (one control remembering the last) · Text · Drawing · Shape · Stamp · Tick · Sign · colour and width of the tool in hand |
| **Editing**   | Edit text · Text box · Picture · Link · Object tool · Organise pages · font, size, bold, italic, underline, colour, alignment (while a text box holds the caret)       |

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

- A panel with nothing to show says so in one line ("This PDF has no bookmarks.") and, in Editing, offers the first
  one ("Add a bookmark").
- Thumbnails are drawn as the pages are scrolled to, light paper always, marks included.
- **Go to page**: the page bar's field takes a page number or a page label ("iv", "A-3"); Enter goes; a value that
  names no page shakes the field and says "There is no page iv."

## The pages

- **Drawn by the engine's worker**, never on the page's own thread: a whole-page picture first (within one draw),
  then sharp **tiles** of `PDF_TILE_PX` behind it; a tile is redrawn alone when a change touches it.
- **Virtualised**: only pages near the viewport have canvases; the rest are boxes of their true size, read before
  anything is drawn.
- **Page display**: continuous (default) or one page at a time; one or two pages across, with or without a cover
  page; the gap between pages is the shell's.
- **Zoom**: 10% to 6400%, Fit width (default), Fit page, Actual size; ⌘ with the wheel and a pinch zoom about the
  pointer. A zoom gesture scales the tiles already there at once and sharpens behind, so it never waits.
- **Rotate view** turns every page a quarter for this person only; rotating a page in the file is a page operation.
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

| Constant                       | Value                 | Why                                                                     |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------- |
| `PDF_TILE_PX`                  | 512                   | `(default)` CSS pixels a side; safe range 256 to 1,024                  |
| `PDF_TILE_CACHE_BYTES`         | 134,217,728 (128 MiB) | `(default)` Desktop; 50,331,648 (48 MiB) on a phone. Set by measurement |
| `PDF_PHONE_PIXEL_RATIO`        | 2                     | `(default)` Past it a phone's canvas limits bite                        |
| `PDF_ZOOM_MIN`, `PDF_ZOOM_MAX` | 0.1, 64               | Acrobat's range, 10% to 6400%                                           |
| `PDF_FIND_MAX_RESULTS`         | 10,000                | `(default)` Listed results; the count still says how many more          |

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

`Pdf · Changed · PageDisplay.<Single|Continuous|Two|TwoContinuous>`, `Pdf · Zoomed · <FitWidth|FitPage|Actual|Custom>`,
`Pdf · Opened · Panel.<Thumbnails|Outline|EmbeddedFiles|Layers|Signatures|Fields>`, `Pdf · Searched · Find`,
`Pdf · Toggled · <MarksShown|MarksHidden|ReadMode|FullScreen>`, `Pdf · Selected · Tool.<Name>`, and the shell's own
menu and tool finder events. Never a query, a page's text or a name.

## Errors

| When                                    | A person sees                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| A page cannot be drawn                  | Its own frame: "This page couldn't be drawn." **Try again**                   |
| A tile fails                            | The whole-page picture stays; the tile is asked for once more                 |
| The engine's worker stops while reading | The pages keep what they show; "Reading stopped. Reload this PDF." **Reload** |
| The surface's code cannot load          | "This tab couldn't load." **Try Again**, as every surface                     |
