# Reading surface

**Status: specified; the first slices of reading are built.** Built:

- The title row with its PDF pill and its tooltip.
- The menus and the toolbar, declared whole as data and held to this page's tables by their test: what is built is
  bound, the rest drawn dimmed, "Coming soon".
- The pages: every page a box of its true size, a whole-page picture for pages near view, let go far from it, and
  sharp tiles over the part in view where that picture is softer than the screen.
- Page display, zoom, Go to, the page bar and Rotate view.
- The left panel's rail, Thumbnails, Outline, Embedded files and Layers; Go to page by a page's number or its label; following a bookmark.
- Selecting text and copying it.
- Links on the pages, a link's and a bookmark's point on its page, Previous view and Next view.
- Find, with its options and All results.
- The page's context menu.
- The chrome from the shell's tokens alone, and what LiveDoc draws on a page from the PDF's paper tokens, in both schemes.
- The notice bar, with the permissions notices.
- Read mode and Full screen.

Bound today: Download as PDF, Undo, Redo, Copy, Select all, Find, the editing modes, Highlight, Select and Help; Page display, Zoom but for
Zoom to selection, Go to, Rotate view, Thumbnails, Outline, Embedded files and Layers, Read mode and Full screen.

Not built: a tile redrawn alone when a change touches it (a change draws its page again),
Signatures and Fields, and of the phone layout all but a pinch and two fingers on the pages and reduced motion
([Accessibility](accessibility.md) holds the accessible tree). The pill's lock glyph waits on the shell, whose pill takes
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
| Read mode                                                       | Hides the menu bar, toolbar and panels; Escape leaves ([Read mode](#read-mode))                                                                            | view  |
| Full screen                                                     | One page a screen, arrows to turn; Escape leaves ([Full screen](#full-screen))                                                                             | view  |
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
- **Highlight** holds Underline and Strikethrough behind its chevron and remembers the last one used, per person,
  in this browser: the button then shows that tool, its glyph and its name `(default)`.
- **Shape** holds Line, Arrow, Rectangle and Ellipse behind its chevron the same way, remembered apart, Line until
  another is taken `(default)`.
- **Text** holds Text and Callout behind its chevron the same way, remembered apart, Text until another is taken
  `(default)`.
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

- The bar spans the pages' width under the toolbar: an info glyph, the sentence, its action, and **Dismiss** (×) at
  its end; a polite status, drawn in the shell's tokens `(default)`.

| Notice                                                                                   | When                                | Action                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ |
| "This PDF was damaged. LiveDoc repaired it to show it; the file itself is unchanged."    | A repaired file                     | **Details**                    |
| "This PDF asks not to be changed."                                                       | Permissions forbid changes          | **Enter permissions password** |
| "This PDF limits what can be done with it."                                              | Other permissions                   | **Enter permissions password** |
| "This PDF is signed. Reviewing keeps its signatures valid."                              | Certificate signatures, all intact  | **Signatures**                 |
| "This PDF has changed since it was signed."                                              | A signature covers an earlier state | **Signatures**                 |
| "This PDF has fields you can fill in."                                                   | Fields, opened in Viewing           | **Fill in** (enters Reviewing) |
| "This form was made with XFA, an older form technology. LiveDoc shows its static pages." | XFA                                 | **Learn more**                 |
| "These pages are scans. Recognise their text to find and mark words."                    | Scanned pages without text          | **Recognise text**             |
| "Some of this PDF isn't shown: <what>."                                                  | Portfolio, rich media, 3D           | **Details**                    |

## The left panel

One panel at a time, chosen from a rail of glyph buttons at the far left (each a toggle with its name as tooltip),
or from its View item; the shell's left panel ([Side panels](../004-interface-design/office-shell.md#side-panels)).

- **The rail** is a toolbar of toggles named "Panels", one glyph button a panel, in the table's order; a button is
  pressed while its panel is open, and pressing it again closes the panel. Only built panels are on the rail
  `(default)`; their View items are the rest, dimmed "Coming soon". On a phone the rail is not drawn and View opens
  the panels `(default)`.
- **Which panel is open is remembered as the shell remembers it**: per person, in this browser, for every PDF
  `(default)`, so a person who keeps the thumbnails open finds them open in the next PDF.
- ⌘⌥⇧T puts focus in the left panel open, or opens Thumbnails and puts focus there `(default)`.

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

### Thumbnails

- Every page in a column, each fitted into a box of `PDF_THUMBNAIL_BOX_PX` and centred in it, upright as the file
  has it: Rotate view never turns a thumbnail.
- Under each, its caption: the page's label where the file gives one, else its number `(default)`.
- **A thumbnail is a button** named "Page 3", or "Page 3, iv" where the label is not the number; a press goes to
  the page, as the page bar's field does. The thumbnail of the page in view is outlined in the shell's focus colour,
  marked as the current page, and scrolled into the panel's view whenever the page in view changes.
- **Keys**: the list takes one Tab stop, on the thumbnail of the page in view; ↓ and ↑ move to the next and the one
  before, Home and End to the first and the last, and Enter or Space goes to the page.
- **Drawn on the engine's one line**, behind every page and tile: a thumbnail waits while a page or a tile is asked
  for `(default)`. Only thumbnails within one panel height of view are drawn; a picture three panel heights away is
  let go, as a page's is `(default)`.
- Drawn at the screen's pixel ratio, never turned, the file's own marks in the picture and LiveDoc's live marks over
  it as on the page; a thumbnail that cannot be drawn shows its box and caption alone.
- **Presence**: a person on a page shows on its thumbnail as a dot in their colour, at most three, then "+2"; the
  thumbnail's description names them ("Ada and Ben are here").

### Outline

- The file's bookmarks as a tree, in the file's order, each with its title; the top level shows and every nested
  level starts folded `(default)`.
- **A press goes** where the bookmark leads, as a link of the file does ([Following a link](#following-a-link)).
  A bookmark to a place in the document goes to that place, as a link to it does ([Following a link](#following-a-link)).
- **The bookmark for the place in view** is the last, in the file's order, whose page is the page in view or the
  nearest before it `(default)`; it is marked as the current location, or its nearest shown parent is while folded.
- **Keys**: the tree takes one Tab stop; ↓ and ↑ move between the bookmarks shown, → unfolds a bookmark or moves to
  its first child, ← folds it or moves to its parent, Home and End go to the first and the last shown, `*` unfolds
  every bookmark, and Enter goes.
- A file with more bookmarks than `PDF_OUTLINE_MAX_ITEMS` lists that many and says "This PDF has more bookmarks
  than LiveDoc lists (20,000)." under them.
- While the outline is read the panel says "Reading bookmarks…"; one that cannot be read says "The bookmarks
  couldn't be read." and logs `[pdf] outline-failed`.

### Embedded files

The files the PDF carries inside it, as [Security](security.md#embedded-files) lists them, never opened unasked.

- A list in the file's order; each row its name ("Embedded file" where the file gives none `(default)`), its size
  as the pill writes one where the file says it, its type where named, and its description under it.
- **Save** on a row reads the file out of the PDF and downloads it under its name; nothing is decoded before.
- A file whose name's ending runs on a computer carries a warning line on its row, before Save: "This file can run
  on a computer. Save it only if you trust where this PDF came from." `(default)`.
- **Open** on a row whose name ends in `.pdf` or whose type is `application/pdf` makes it a new PDF document,
  kept where this PDF is (on LiveDoc, or in This Browser), and opens it `(default)`; its bytes are checked to be a
  PDF first, as any PDF that arrives; a refusal is said on its row by the arrival's own copy, but a file that is no PDF
  says "This file isn't a PDF." `(default)`.
- A file the PDF says, or turns out, to be larger than `PDF_EMBEDDED_FILE_MAX_BYTES` is not read: "This file is
  larger than 100 MB, the most LiveDoc reads out of a PDF." One that cannot be read: "This file couldn't be read
  out of the PDF." A list that cannot be read says "The embedded files couldn't be read." and logs
  `[pdf] embedded-list-failed`.
- A file with none says "This PDF has no embedded files."; one with more than `PDF_EMBEDDED_FILES_MAX` lists that
  many and says "This PDF holds more embedded files than LiveDoc lists (500)."
- Every role may save and open them, as a Download is everyone's ([Share roles](#share-roles)).
- Logged by the engine: `[pdf] embedded-read bytes=<n>`, `[pdf] embedded-refused reason=<reason>`; counted as
  `Pdf · Exported · EmbeddedFile` and `Pdf · Imported · EmbeddedFile`.

### Layers

- The file's PDF layers by name, in the file's order, each a toggle with an eye: pressed while the layer shows.
- **A press shows or hides the layer for this person only**: their pages and thumbnails are drawn again without it
  (or with it); the file, a download, a print, the browser's thumbnail and another person's view are as the file sets
  them. The choice is kept while the surface is open, as the view is `(default)`.
- A layer the file locks shows its state, says "Locked", and takes no press.
- The engine draws a page with this person's layers from a copy of the file whose layers are set so, made when the
  layers first differ from the file's and kept for as long as they stay the same `(default)`; the stored file is
  never touched.
- A file with none says "This PDF has no layers."; one with more than `PDF_MAX_LAYERS` lists that many and says
  "This PDF has more layers than LiveDoc lists (1,000)."
- A list that cannot be read says "The layers couldn't be read."; layers that cannot be set for the drawing say
  "These layers can't be shown or hidden here." and the pages stay as the file sets them.
- Logged: `[pdf] layer-view hidden=<n>`, `[pdf] layer-view-failed`, `[pdf] layers-failed`; counted as
  `Pdf · Toggled · Layer.<Shown|Hidden>` `(default)`.

### Following a link

A press on a bookmark, or on a link of a page ([Security](security.md#links-and-actions)):

| Leads to                                     | What happens                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A place in the document                      | Goes there at once: the place's point at the view's top left, or the page's top where the file names no point             |
| A page no longer in the document, or nowhere | Nothing; a bookmark says "Goes nowhere" after its title                                                                   |
| An `http`, `https` or `mailto` address       | Asks first, "Open this address?", with the address as text; **Open** opens it in a new tab with no opener and no referrer |
| An address that is not opened                | "This link can't be opened here." with the address as text; **Copy address**                                              |
| Another file by its path                     | "This link leads to another file, which LiveDoc can't open." with the path as text; **Copy path**                         |
| An action                                    | "This link asks for something LiveDoc never does." `(default)`                                                            |

- Each is the shell's dialog, titled "Link" `(default)`; the address and the path are plain text, never a link
  LiveDoc draws, so what is shown is what is opened.
- An address opened is logged `[pdf] link-opened scheme=<scheme>`; a link not followed
  `[pdf] link-refused kind=<kind>`; a copy the browser refuses `[pdf] link-copy-failed`.

### Go to page

- The page bar's field takes a page number or a page label ("iv", "A-3"); Enter goes.
- A number from 1 to the page count is that page; any other value is the page whose label it is, the label written
  as the file writes it first, then in any case `(default)`. The field shows the page's number, so a number typed
  means the number shown.
- A value that names no page puts the number back and says "There is no page iv." over the bar.

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
  glyphs, in the shell's focus colour.
  - With **Select** in hand, a mouse or a pen selects; a finger scrolls ([Phone and tablet](#phone-and-tablet)).
  - A drag's ends fall between characters: at the character nearest the point, a point beside a line picking that
    line first, before it or after it by the character's middle `(default)`.
  - A selection lies on one page `(default)`: a drag past the page's edge selects to the page's nearest character.
  - A word is a run of letters, marks and digits; a press on anything else selects that character. A line is the
    file's line, between two of its breaks.
  - Shift with a press extends the selection on its page from where it started; Alt with a drag selects the
    characters whose middles lie in the dragged rectangle, a run a line.
  - A press without a drag, and Escape, clear the selection; a change of the pages clears it.
  - **Select all** (⌘A on the pages, or Edit) selects the text of the page in view.
- **Copy** (⌘C, or Edit) puts the selected text on the clipboard as plain text, lines joined where the file broke them
  inside a paragraph; a file that asks not to be copied dims Copy ([Opening](opening.md#passwords)).
  - Joined `(default)`: a word the file broke with a hyphen at a line's end is one word again; a break inside one line
    (a superscript's) is dropped; a break to a line that starts within two line heights below a full line is a space;
    every other break stays a line break. A full line ends within two line heights of the furthest right of it and the
    lines either side of it, so a column beside it never counts.
  - A column's runs are joined by line breaks.
  - A file that asks not to be copied: Copy is dimmed as "Copy (this PDF asks not to be copied)", and ⌘C says
    "This PDF asks not to be copied." `(default)`. A clipboard the browser refuses says "The text couldn't be
    copied."
  - Logged `[pdf] text-copied chars=<n>`, `[pdf] text-copy-refused`, `[pdf] text-copy-failed`; a page whose text
    cannot be read `[pdf] page-text-failed page=<n>`, and selects nothing. Counted as `Pdf · Copied · Text`.
- **Links**: the pointer shows a hand and the target as a tooltip; a press follows a place in the document at once,
  and asks first for an address ([Security](security.md#links-and-actions)).
  - A link is a control over its rectangle on the page, named for where it leads, as plain text: "Link to page 3",
    "Link to https://example.com/path", "Link to another file, other.pdf", "Link to an action", "Link that goes
    nowhere". Its tooltip is its name, as every control's is, so the target shows as the pointer rests `(default)`.
  - Links take presses while Select is in hand; with a mark tool in hand a press marks `(default)`. Tab reaches them
    in the file's order on each page.
  - A link's place is reckoned through the page's matrix, so it leads to the same point however the page is turned
    or zoomed; a coordinate the file leaves out keeps the page's own edge `(default)`.
- **Previous view** and **Next view** step through the places a person jumped from and to, as a browser's history.
  - A jump is following a link or a bookmark, a thumbnail, the page bar's field, Go to > First page, Last page and
    Page…, and a find result; scrolling and turning a page are not `(default)`.
  - Each jump keeps the place in view before it, the page and the point at the view's top left; Previous view goes back
    to it, and Next view forward again, until a new jump drops what was ahead, as a browser does.
  - At most `PDF_VIEW_HISTORY_MAX` places are kept, the oldest let go first; a place kept twice in a row is kept once.
  - Previous view and Next view are dimmed with nowhere to go; ⌥← and ⌥→ are heard outside a field.
  - Logged `[pdf] view-history way=<back|forward> page=<n>`.
- **The context menu** on a page: Copy, Select all, Add comment, Highlight, Underline, Strikethrough, Find "…",
  Go to ▸, Rotate view, and the items of whatever is under the pointer (a mark, a field, an object), each only for
  the level that may.
  - It is the shell's ([Office shell](../004-interface-design/office-shell.md#context-menus)): a right-click on the
    pages, Shift+F10 or the menu key; with Shift held the browser's own shows.
  - A right-click keeps the selection where it is, so the menu acts on it wherever it was pressed `(default)`.
  - **Highlight** marks the selected text, as a drag with the Highlight tool does, and clears the selection; it is
    drawn only while text is selected and the person is in Reviewing. **Find "…"** opens Find with the selected text,
    its first 30 characters in its label `(default)`, drawn only while text is selected.
  - Add comment is drawn dimmed until [Comments](comments.md) are built; nothing is yet under the pointer to offer.
  - From the keyboard it opens at the selection's first rectangle, or the middle of the pages with none `(default)`.
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
- A page label typed in the field is the left panel's [Go to page](#go-to-page).
- The bar is never under the document group: where the two would meet, the bar sits above it `(default)`.

## Read mode

- View > Read mode (⌘⌥R) hides the menu bar, the toolbar and both side panels: the pages get the room.
- The name line and the page bar stay; where the menu bar was, one button, **Leave read mode**, is the way back.
- Escape leaves Read mode where nothing nearer takes it (a field, a dialog, the find bar) `(default)`.
- Items' keys and the tool finder still work in Read mode; a key that opens a menu or a panel does nothing `(default)`.
- Leaving shows the panel that was open, the view as it is now.
- Read mode is one person's, for this surface only, and never remembered `(default)`.
- It changes nothing anyone else sees, and nothing in the file.

## Full screen

- View > Full screen (⌘⌥F) shows the pages alone on the whole screen: Single page, at Fit page, Rotate view kept.
- Arrows, Space and the Page keys turn the pages as they do anywhere; a zoom made in full screen is its own.
- Leaving it, by Escape, the item, its key or the browser's own way, brings back the display and zoom it found.
- A browser with no full screen for part of a page (an iPhone) draws the item dimmed `(default)`.
- A browser that refuses the request leaves the view as it was and logs `[pdf] full-screen-refused`.
- Full screen is one person's, changes nothing anyone else sees, and nothing in the file.

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
- **Any script** is read, found and copied as the file maps it to Unicode: Arabic, Japanese, any other.
- A font with no map to Unicode reads as the codes it holds, as in any reader; recognising it waits on [Scans](scans.md).
- **What matches** `(default)`: the query and the text are read alike: a run of spaces or a line break is one space, a
  word the file broke with a hyphen at a line's end is one word, and the query's ends are trimmed; Match case off
  compares letters in either case. Whole words matches only where neither end is inside a word.
- A search starts once the query has rested `PDF_FIND_SETTLE_MS`, and a new query or option stops the one before.
  The first result is current; Enter and Next go to the next, ⇧Enter and Previous to the one before, round the ends.
- **The count** reads "3 of 41", "No results" once every page is searched with none, and "Searching 120 of 400
  pages…" while it runs; it is a polite live region. Past `PDF_FIND_MAX_RESULTS` it reads "10,000+" and lists that
  many.
- **Going to a result** is a jump ([Previous view](#the-pages)): its page, the match two lines below the view's top;
  a bookmark found goes where the bookmark leads.
- **Comments and marks' text** are the words of the marks the file holds; a result names its page and lies over the
  mark. **Bookmarks** found are listed first, under "Bookmarks".
- ⌘G and ⇧⌘G step while the field is open; Escape closes it, takes the tints away and gives the pages the keys.
- **All results** lists each match with up to `PDF_FIND_CONTEXT_CHARS` of its line either side, the match marked,
  under "Page 3" (the page's label where it has one); a press goes to it and makes it current.
- Every role finds ([Share roles](#share-roles)). Logged `[pdf] find-searched pages=<n> results=<n>`; counted as
  `Pdf · Searched · Find` once a search starts, never with its query.
- Not built: recognised text, and the scans' sentence, which wait on [Scans](scans.md).

## Phone and tablet

- The title row is one line and the menus move into More, as the shell does
  ([Phone and tablet](../004-interface-design/office-shell.md#phone-and-tablet)); the page bar stays.
- The left panel is the shell's on a phone: the rail is not drawn, View opens a panel, and it covers the surface until
  its × or Escape closes it, as every office kind's does.
- **Pinch** zooms the pages about the fingers, never the page around them (the pages hold `touch-action: pan-x
pan-y`); **two fingers** pan, what was under their middle staying under it, at the zoom's limits too; a pinch on the
  chrome zooms the page, as the browser does ([Accessibility](accessibility.md#seeing)). A **double tap** zooms to the
  column under the finger and back. One finger scrolls in Viewing and with the Hand; with a mark tool in hand it draws.
  - A double tap is two taps of one finger, each lifted within `PDF_DOUBLE_TAP_MS` of touching, the second touching
    within `PDF_DOUBLE_TAP_MS` of the first lifting and `PDF_DOUBLE_TAP_PX` of it `(default)`.
  - A tap moves less than `PDF_DOUBLE_TAP_PX` while down; a second finger, or a scroll the browser takes, ends it.
  - It is heard with Select in hand alone; with a mark tool in hand a finger draws `(default)`.
  - The column is the line under the finger and the lines that run on from it, read by geometry `(default)`:
    - a line is split where its characters lie more than a line height apart, as a row across two columns often is;
    - the line under the finger holds the character nearest it, the finger within a line height of the line's box;
    - a line runs on from the column when it starts within two line heights of the column's left and lies within two
      line heights above or below a line of it, so a column beside it, starting elsewhere, never joins;
    - the column's left is the least left of its lines, its right the middle of their rights, the larger of two, so
      a heading across two columns never widens it.
  - The column fills the view's width less `PDF_PAGES_PAD_PX` either side, its left at the view's left, the point
    under the finger staying at its height; within the zoom's limits, the place under the finger pans to suit.
  - With no column under the finger the pages zoom one step in about it `(default)`.
  - A double tap while the zoom is still the one a double tap made goes back to the zoom before it, about the finger.
  - Logged `[pdf] view-double-tapped column=<yes|no> back=<yes|no>`; counted as `Pdf · Zoomed · Custom`.
- The toolbar is the shell's: one row that scrolls sideways on a phone, its overflow row on a tablet.
- On a touch screen every control of the surface reaches 44 px ([Touch targets](../004-interface-design/touch-targets.md)):
  - the toolbar is 44 px tall there, so its items' pads are never clipped; the title row's pill and fields reach 44 px;
  - the page bar's buttons and fields, Find's buttons, field and options, and a notice's buttons reach 44 px down;
  - the rows of the outline, the layers and Find's results are 44 px tall, their lists without a gap between rows;
  - Find's field and the password field read at 16 px, so a phone never zooms into them.
- A long press selects the word under the finger, with handles to extend and a small bar: Copy, Highlight, Underline,
  Strikethrough, Comment.
  - A long press is one finger held `PDF_LONG_PRESS_MS` with Select in hand, moving less than `PDF_DOUBLE_TAP_PX`;
    a second finger, a lift or a scroll the browser takes ends it. The browser's own menu for it is not shown.
  - It selects as two presses in a row do: the word under the finger, or the character where no word is.
  - A selection a finger made has a handle at each end, drawn below its first and last lines in the focus colour,
    each 44 px to the finger; dragging one moves that end to the caret place under the finger, the other staying.
  - The bar floats above the selection, below it where the window's top would cut it, and follows it as the pages
    scroll or zoom; it is a toolbar named "Selection", its buttons 44 px tall.
  - Its buttons are those that can act now `(default)`: Copy (dimmed where the file asks not to be copied, as the
    menu's is), Highlight while a mark may be made, and Comment once comments are built.
  - A press elsewhere, Escape and a change of the pages clear the selection, its handles and its bar together; a
    selection a mouse or a pen made has neither handles nor bar.
  - Logged `[pdf] text-long-pressed page=<n> selected=<yes|no>`.
- Reduced motion: no animated scroll to a result or a page, no zoom easing; the page appears where asked. The surface
  never eases a scroll or a zoom, reduced or not `(default)`; the shell's own transitions stop with reduced motion.
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
| `PDF_DOUBLE_TAP_MS`            | 300                                                                                                    | `(default)` How long a tap is down, and the pause between a double tap's two; safe range 200 to 500                                      |
| `PDF_LONG_PRESS_MS`            | 500                                                                                                    | `(default)` How long a finger is held still to select a word, Android's own; safe range 400 to 800                                       |
| `PDF_DOUBLE_TAP_PX`            | 24                                                                                                     | `(default)` How far a tap moves while down, and how far apart a double tap's two are; safe range 10 to 40                                |
| `PDF_EMBEDDED_FILE_MAX_BYTES`  | 100,000,000 (100 MB)                                                                                   | `(default)` The most of an embedded file read out to be saved or opened: a stored file's cap, `FILE_TAB_MAX_BYTES`                       |
| `PDF_THUMBNAIL_BOX_PX`         | 160                                                                                                    | `(default)` CSS pixels a side of the square a thumbnail is fitted into; safe range 96 to 224                                             |
| `PDF_VIEW_HISTORY_MAX`         | 100                                                                                                    | `(default)` Places Previous view keeps, the oldest let go first; safe range 20 to 1,000                                                  |
| `PDF_PAGE_TEXTS_KEPT`          | 32                                                                                                     | `(default)` Pages whose text the surface keeps read for selecting, the least lately used let go first; safe range 8 to 256               |
| `PDF_FIND_SETTLE_MS`           | 250                                                                                                    | `(default)` How long a query rests before it is searched; safe range 100 to 600                                                          |
| `PDF_FIND_CONTEXT_CHARS`       | 40                                                                                                     | `(default)` Characters of a result's line shown either side of the match in All results; safe range 20 to 80                             |
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

### Colours

- **The chrome is the shell's tokens only** ([Office shell](../004-interface-design/office-shell.md)), in both
  schemes: no colour of its own, so the chrome's contrast is the shell's, held by its test.
- **What LiveDoc draws on a page** sits on the file's paper, not on the chrome, so its colours are the PDF's own
  tokens, the same in both schemes (`apps/live/app/pdf-document.css`) `(default)`:
  - `--pdf-paper`, the paper a page is shown on before and around its picture, and a thumbnail's;
  - `--pdf-paper-ink`, words LiveDoc writes on a page ("This page couldn't be drawn.", a thumbnail's "+2"), at
    4.5:1 on the paper;
  - `--pdf-found` and `--pdf-found-current`, Find's tints, multiplied onto the page, the current one darker;
  - `--pdf-mark-preview`, the text a Highlight drag would mark.
- **Find's match in All results** is the chrome's: its row's own ink, bold, underlined in the focus colour.
- A test holds the PDF's components to these tokens and the pairs to their contrast.

## Telemetry

`Pdf · Changed · PageDisplay.<Single|Continuous|Two|TwoContinuous|CoverShown|CoverHidden>`,
`Pdf · Changed · RotateView.<Clockwise|Counterclockwise>` `(default)`,
`Pdf · Zoomed · <FitWidth|FitPage|Actual|In|Out|Custom>` (a wheel's or a pinch's zoom once, as `Custom`, when it settles;
a double tap's as `Custom`),
`Pdf · Searched · Find`, `Pdf · Copied · Text`,
`Pdf · Toggled · <MarksShown|MarksHidden|ReadMode|FullScreen|Layer.Shown|Layer.Hidden>`, `Pdf · Selected · Tool.<Name>`, and the shell's own
menu, tool finder and panel events (`UI · Opened · PdfDocumentPanel<Thumbnails|Outline|EmbeddedFiles|Layers>`).
Never a query, a page's text or a name.

Fingerprints: `[pdf] view-display display=<name>`, `[pdf] view-zoomed zoom=<zoom> way=<way>`,
`[pdf] view-went-to page=<n>`, `[pdf] view-turned turns=<0-3>`, `[pdf] tile-failed page=<n> again=<yes|no>`,
`[pdf] thumbnail-failed page=<n>`, `[pdf] outline-failed`, `[pdf] link-opened scheme=<scheme>`,
`[pdf] link-refused kind=<kind>`, `[pdf] text-copied chars=<n>`, `[pdf] text-copy-refused`, `[pdf] text-copy-failed`,
`[pdf] page-text-failed page=<n>`, `[pdf] view-history way=<back|forward> page=<n>`, `[pdf] find-searched pages=<n> results=<n>`,
`[pdf] view-double-tapped column=<yes|no> back=<yes|no>`, `[pdf] text-long-pressed page=<n> selected=<yes|no>`,
`[pdf] read-mode on=<yes|no>`, `[pdf] full-screen on=<yes|no>`, `[pdf] full-screen-refused`.
`Pdf · Toggled · ReadMode` and `FullScreen` are sent on entering, never on leaving `(default)`.

## Errors

| When                                    | A person sees                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| A page cannot be drawn                  | Its own frame: "This page couldn't be drawn." **Try again**                   |
| A tile fails                            | The whole-page picture stays; the tile is asked for once more                 |
| The engine's worker stops while reading | The pages keep what they show; "Reading stopped. Reload this PDF." **Reload** |
| The surface's code cannot load          | "This tab couldn't load." **Try Again**, as every surface                     |
