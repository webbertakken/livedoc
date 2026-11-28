# Inserted objects

**Status: specified.** Insert › Checkbox and Insert › Dropdown are built (as data validation), images over cells
and in a cell, Insert › Emoji, and links; the rest is specified.

What the Insert menu puts into a [spreadsheet](spreadsheet.md) besides cells, charts and pivot tables (those have
their own pages: [Charts](charts.md), [Pivot tables](pivot-tables.md)). Its rows of the
[parity matrix](parity-matrix.md) name this page.

## Images

### Images over cells

An image floats over the cells as a chart does, one of its sheet's objects ([Sheet store](sheet-store.md#in-a-spreadsheet),
"Objects"), set whole by its id or removed, one undo step a change (default, D623).

- **The model**: its place (a [cell anchor](charts.md#the-model): the cell its top-left corner is in, by row and column
  ids, and the px into it), its width and height (px at 100%, 16 to 4,000 each), the gallery image it shows
  ([Images](../009-elements/images.md), an `imageId`), the picture's natural width and height when known, and its alt
  text (up to 1,000 characters). It counts toward the sheet's 100 objects with its charts and pivot tables.
- **Insert Image › Insert Image over Cells**, an Editor's, opens the editor's image picker (Upload, Gallery, Search,
  [Image picker modal](../009-elements/images.md#image-picker-modal)); the picked picture lands with its top-left at
  the active cell's, at its natural size scaled down, kept in proportion, to fit 600 by 400 px, and is selected. Where
  image storage is not set up (the gallery's probe answers 503) the item is dimmed, its hint "Image uploads aren't
  enabled on this deployment". A spreadsheet in This Browser has no gallery its images could stay in, so the item is
  dimmed there too, its hint "Sync Document to place images over cells" (default, D625). A sheet holding 100 objects
  refuses it with "A sheet holds up to 100 charts, pivot tables and images".
- **Selected** by a click or Tab: an outline with eight handles. Dragged, it moves, its anchor landing on the cell
  under its new top-left; a corner handle resizes it in proportion (an edge handle stretches it), each side kept to 16
  to 4,000 px; Delete or Backspace removes it; Escape returns the keys to the grid. From the keyboard, as a chart's:
  the arrow keys move it 1 px (10 with Shift), Alt and the arrow keys stretch it. Moving and resizing are one undo step
  each, as a chart's are.
- **Its menu** (the ⋮ button on the selected image, and a right-click on it): **Alt Text** (a dialog: Title and
  Description as Google's; LiveDoc keeps one text, the description, its title folded in: saved as the title, a line
  break, then the description, either alone when the other is empty, and opened again as the description, the title
  empty; OK saves, Cancel and Escape leave it), **Replace Image** (the
  picker; the new picture keeps the box's width, its height following its proportion, and its alt text goes with the
  old picture), **Delete**. Google's Edit
  Image (crop, recolour) and Assign Script are left out (crop: later; scripts: C3); **Place Image in Selected Cell**
  puts it in the active cell ([Images in a cell](#images-in-a-cell), D632).
- **Drawn** from the image's bytes (`/api/images/<id>?d=<document>`), at the grid's zoom, under frozen panes as a
  chart is, under the sheet's charts; a skeleton while its bytes are on their way; a picture that cannot be drawn
  shows the editor's broken-image state sized to the box ([Images](../009-elements/images.md), "Placeholder
  rendering").
- **Rows and columns**: it follows its anchor cell when rows and columns are inserted, deleted, moved, hidden or
  resized, as a chart does; deleting its anchor cell's row or column moves it to the nearest remaining one, as a
  chart's anchor does.
- **Where its bytes live**: in the gallery of whoever uploaded it, never in the sheet. A sheet's images are references
  of its document ([Images](../009-elements/images.md#reference-index), "A sheet's references"), served to everyone the
  document is shared with under the [placement grant](../009-elements/images.md#placement-grants) rule.
- **In the file** ([Standard mapping](standard-mapping.md), "Images"): written as the format's picture over cells, its
  bytes in the package (ODF `draw:frame` › `draw:image` in `Pictures/`, its anchor cell and offset; XLSX a
  `xdr:pic` in the sheet's drawing, its bytes in `xl/media`, a one-cell anchor), its alt text as the description;
  read back as an image over cells, its bytes stored in the gallery of whoever opens the file through the
  [Import image pipeline](../020-import-export/import-image-pipeline.md), or uploaded as it is by an agent's import;
  a picture the gallery does not take is left out and named by the read (D628).
- **Agents**: `change_sheet` `image {imageId, at, width, height, alt, replace}` places one of the caller's gallery
  pictures (`list_images`) with its top-left on the cell `at` names: both sides as given, one side and the other by
  the picture's shape, or neither and the picture fitted to 600 by 400 as Insert does (16 to 4,000 px a side, else
  `write_invalid`); `replace` sets it in the place of the sheet's image of that id, keeping the id
  (`sheet_image_not_found` for none). The gallery is read once a call that places a picture, before anything is
  written: an id it lacks is refused as the MCP refuses it on a canvas (`image_not_found`), a server keeping no images
  with `images_unavailable`. `clear_images {id}` takes one off, `{}` every one. `read_sheet` lists them
  (`images: [{id, imageId, at, width, height, alt}]`) and the outline a line each
  (`image <id> at <A1> <w>x<h> "<alt>"`); the image view of a spreadsheet tab draws them (default, D627).

### Images in a cell

A picture of the gallery held as a cell's value, as Google's in-cell image is (its Apps Script `CellImage`, "an image
value in a cell"); `IMAGE()` shows one from an address instead (S4; [Imports from the web](imports.md#image)).

- **The model**: a cell's input may be a picture: the gallery image's id ([Images](../009-elements/images.md)) and its
  alt text (up to 1,000 characters, Google's title and description folded into one as over cells). It moves, sorts,
  fills, copies, cuts and clears with its cell; typing into the cell replaces it; the cell keeps its format (default,
  D630).
- **Formulas** read it as they read an IMAGE's answer, as empty text, and a formula whose answer is the cell (`=A1`)
  or a lookup that finds it shows the picture, as a reference to an IMAGE's cell does (D72). The formula bar and the
  cell editor show nothing for it (default, D631; assumed, Google's value as a formula reads it not measured).
- **Drawn**: the picture fills its cell, kept in proportion and centred (IMAGE's mode 1), from its bytes
  (`/api/images/<id>?d=<document>`) at the grid's zoom; nothing while its bytes are on their way or when they cannot
  be drawn, as an IMAGE's. The grid's mirror announces the cell by its alt text, else "Image". An image of the sheet
  ([Previews](sheet-store.md#agents-in-a-spreadsheet)) draws it in its cell's box the same way, its bytes inlined when the
  document may serve them, else its alt text.
- **Insert Image › Insert Image in Cell**, an Editor's, opens the image picker; the picked picture becomes the active
  cell's input, one undo step. It is dimmed as Insert Image over Cells is, where image storage is not set up ("Image
  uploads aren't enabled on this deployment") and in This Browser ("Sync Document to place images in cells", D625
  widened), and refused in a cell a protection keeps from the person, as typing is.
- **Its menu**: on a cell holding a picture the cell's context menu gains **Alt Text** (the dialog of images over
  cells) and **Place Image over Cells** (the picture leaves the cell for an image over cells at the cell's top-left,
  fitted to 600 by 400 px as Insert fits one); an image over cells' menu gains **Place Image in Selected Cell** (the
  image leaves the sheet's objects and becomes the active cell's input, its alt text kept). Each is one undo step
  (default, D632).
- **Where its bytes live**: in the uploader's gallery, as an image over cells'. A sheet's cells holding pictures are
  references of its document, indexed in the room beside its images over cells ([Images](../009-elements/images.md#reference-index),
  "A sheet's references"), so everyone the document is shared with is served them (default, D633).
- **In the file** ([Standard mapping](standard-mapping.md#pictures-in-the-file)): XLSX as Excel's picture in a cell, a
  rich value; ODF a picture anchored to the cell and sized with it, LibreOffice's "To cell (resize with cell)"; read
  back as a picture in its cell (default, D634).
- **Agents**: `change_sheet` `image {imageId, at, inCell: true, alt}` sets the cell `at` to the picture (`width`,
  `height` and `replace` refused beside `inCell`, `write_invalid`), its gallery checked as an image over cells'
  is; `read_sheet`'s `images` lists a cell's picture as `{at, imageId, alt, inCell: true}`, and the outline as
  `image in <A1> "<alt>"`.

### Images, both

- Upload, a link, or the gallery of the person's images ([Images](../009-elements/images.md)); camera and Drive are
  left out (Google's services, C3).

## Drawings

- **Insert Drawing** opens a small LiveDoc canvas in a dialog (shapes, lines, text, the palette's basics), reused
  from the editor; **Save and Close** places it over the cells as an image the drawing can be reopened from.
- In a file it is written as the format's drawing shapes where they map, else as a picture with the drawing kept
  as unknown content for LiveDoc to reopen.

## Links

### A cell's link

- A cell's **link** is the whole cell's, held with its format as Google holds one (its text format's link): it stays
  on the cell while its value is changed or cleared, moves, sorts, fills and pastes with the format, Paste Format Only
  brings it and Paste Values Only leaves it, and Clear Formatting takes it off (default, D636).
- What a link may lead to (default, D637), up to 2,048 characters ("Use a shorter address"):
  - a **web or email address**: `http`, `https` or `mailto`; a bare domain becomes `https://`, a bare email address
    `mailto:`, as a text document's link editor reads one ([Links](../034-text-documents/links-and-navigation.md#links));
  - **another LiveDoc document**, by its own address in full (`https://docs.nu/document/<id>`);
  - **a sheet of this workbook**, `#gid=<sheet id>`, or **a range** on one, `#gid=<sheet id>&range=<A1 range>`, Google's
    own form, the sheet by its id so a rename keeps the link and the range by position, as Google keeps it.
  - Anything else typed is refused under Link: "Use a web, email or LiveDoc address". A file's link of another scheme
    (`file:`, a relative path) is kept as it came and written back, drawn as plain text and never opened.
- **Drawn** as a `HYPERLINK`'s label is ([Formulas](formulas.md), "Text"): what the cell shows, underlined in the
  sheet's accent unless the cell has its own text colour; a cell with nothing to show draws nothing. A cell link wins
  over a `HYPERLINK` formula in the same cell (default, D638). Ctrl/⌘ and a press opens it, and the cell menu's
  **Open Link** and Alt+Enter, as a `HYPERLINK`'s; Find's **Also Search Within Links** reads its address.

### Insert Link

- **Insert › Link**, the toolbar's **Insert Link**, the cell menu's **Insert Link** and **Ctrl+K** (⌘K), an Editor's,
  open the **link editor** under the active cell, the one a text document has, with **Text** and **Link** and
  **Apply**: Enter applies, Escape closes, the grid has the focus back either way.
- **Text** holds what the active cell shows; the cell's link fills Link when it has one. A cell holding a formula,
  and a selection of more than one cell, show no Text: each cell takes the link, its value kept (default, D639).
- Applying is one undo step: a changed Text is written into the cell as typing it would be, its Reject rule and
  protection judging it as they judge typing; an empty Text on an empty cell takes the address as its text; the
  link is set on every selected cell; an empty Link takes the link off.
- As Link is typed into, a list under it offers, in this order (default, D640): **Range** when what is typed reads
  as a range (`B2:C4`, `Sheet2!A1`), on the named sheet or this one; **Sheets in this spreadsheet**, every sheet when
  nothing is typed, else those whose titles hold every typed word; and the person's **LiveDoc documents** whose
  names hold every typed word, at most 8, newest first. Up and Down move, Enter takes one. Google's "Select a range
  of cells to link" picker is not built: a range is typed (default, D640).
- Telemetry: `Spreadsheet · Added · Link` as a link is applied to cells that had none.

### The link card

- The active cell holding a link (its own or a `HYPERLINK`'s), while it is not being edited, shows a **link card**
  under it, as Google's link preview does: its title (a LiveDoc document's name when it is one of the person's, a
  sheet's title and range for one of this workbook, else the address), a press on which opens it; **Copy Link**;
  and, for an Editor, on a cell's own link, **Edit Link** (the link editor) and **Remove Link**. It never takes the
  focus from the grid; Escape hides it until the active cell moves. It replaces the touch screen's link chip.
- **Opening** a web, email or LiveDoc address opens a new browser tab with no opener and no referrer; a sheet or
  range of this workbook opens its sheet's tab with the range selected (the sheet's top left for a sheet); a link to a
  sheet that is gone says "This sheet no longer exists".
- **Remove Link** (the card's, and the cell menu's for a selection holding one) takes the link off every selected
  cell, its text left as it is, one undo step.

### Get Link to This Cell

- The cell menu's **Get Link to This Cell** (Google's, under its more cell actions), for every role, copies the
  spreadsheet's address with the selection in its query and the sheet's tab as the editor pins one,
  `<document address>?range=<A1 range>#t=<tab id>`, and says "Link copied". Opening that address opens the tab with
  the range selected once the sheet is drawn, the range scrolled into view, and takes the range out of the address; a
  range past the sheet's edge selects what of it is on the sheet (default, D641).

### HYPERLINK

- `HYPERLINK()` as today ([Formulas](formulas.md)).

### Links, agents

- `change_sheet`'s `format` op takes `link`: an address as above, `Sheet2!A1:B4` or `Sheet2` for this workbook's range or
  sheet (written as `#gid=`), or `null` to take the link off. `read_sheet` and the cells view show a cell's link, a
  sheet's as its title and range.

## Tick boxes, dropdowns and emoji

- **Insert › Checkbox** and **Insert › Dropdown** add data validation ([Data tools](data-tools.md#data-validation)).
- **Insert › Emoji**, an Editor's, opens the emoji picker the editor already has (groups, Recently used, search, skin
  tone; [Objects](../034-text-documents/objects.md)). Each emoji picked goes into the cell being edited at its caret;
  with no cell being edited, it opens the active cell's edit with its text and the emoji after it. The picker stays
  open for more; closing it gives the edit back its keys, and Enter saves it as typing does, so a protection or a rule
  judges it then (default, D635).

## Timeline view

Left out (Webber, 2026-11-28): Google's timeline view lives on a sheet of its own, with no grid, and a spreadsheet here
has no gridless sheet kind; none is made for it. There is no Insert › Timeline. A file's sheet that another application
keeps as a timeline arrives as the grid it carries, its timeline kept as [unknown content](standard-mapping.md#unknown-content).
The Timeline **chart** type ([Charts](charts.md#chart-types)) is a chart over the cells and stays.

## Smart chips

Left out (C3): no Insert › Smart Chips, no `@` menu of chips. A chip in an arriving file is kept and shown as its
text, and written back as it came: Google Sheets exports a person chip as its email linked to `mailto:`, a file chip as
its title linked to the file, and LiveDoc keeps the link in both formats (XLSX's hyperlinks, ODF's marked cell text,
[Unknown content](standard-mapping.md#unknown-content), D376).

## Who may do what

- **Editor** inserts and edits every object here, a cell's picture too; an image over cells is selected, moved, resized and given its menu
  by an Editor alone, everyone else's pointer passing through it to the cells.
- **Participant** ticks tick boxes and picks from dropdowns; opens and copies links, gets a link to a cell.
- **Viewer** opens and copies links, gets a link to a cell, and sees the rest.

## Accessibility

- Every image and drawing carries alt text (editable through Alt Text; an image without it is announced as "Image");
  an image over cells is one stop of the grid's objects row, named by its alt text, with its keys described to a
  screen reader as a chart's are.

## Errors and limits

- An image up to 50 MB and 25 million pixels (Google's limit, assumed); larger is refused ("This image is too large").
- Up to 100 objects a sheet (images, charts and pivot tables together, the objects' cap).

## Telemetry

`Spreadsheet · Added · <Kind>` as Insert places one (`ImageInCell`, `ImageOverCells`, `Drawing`, `Link`, `Checkbox`,
`Dropdown`, `Emoji`), the action charts and pivot tables use; `Sheet · Changed · Image` for each move,
resize, alt text, replacement or delete of an image over cells, and each alt text or place change of a cell's picture.

## Defaults

- **D636** A cell's link is held with its format, as Google's text format link: kept as its value changes or is
  cleared, moved, sorted, filled and pasted with the format, left by Paste Values Only, taken off by Clear Formatting
  (default).
- **D637** A link leads to an http, https or mailto address, a LiveDoc document, or `#gid=<sheet id>[&range=<A1>]` in
  this workbook, up to 2,048 characters; a file's link of another scheme is kept, drawn plain, never opened (default).
- **D638** A cell's own link wins over a `HYPERLINK` formula in the same cell (default).
- **D639** Insert Link on a formula's cell or on more than one cell shows no Text and keeps each value; a changed
  Text is written as typing it would be (default).
- **D640** The link editor offers a typed range, then this spreadsheet's sheets, then the person's documents; no
  range picker dialog (default).
- **D641** Get Link to This Cell copies `<document address>?range=<A1 range>#t=<tab id>` (the range in the query, as
  the editor rewrites its fragment to the tab's pin); opening it selects the range on that tab, cut to the sheet's
  edge (default).
- **D642** A file's links: XLSX `hyperlinks`, one per linked cell, ODF the cell's one paragraph wholly a `text:a`;
  within the workbook by the sheet's name (standard-mapping.md "Links in the file") (default).
- **D623** An image over cells is one of its sheet's objects, placed at the active cell at its natural size scaled to
  fit 600 by 400 px, moved and resized as a chart is, its bytes in the uploader's gallery (default).
- **D627** An agent's image lands at the cell it names, offset 0, sized as given or fitted as Insert fits it; its
  gallery check is change_sheet's own, so the CLI and the MCP refuse alike (default).
- **D625** A spreadsheet in This Browser places no image over cells or in a cell (Insert Image over Cells and Insert
  Image in Cell dimmed, each hint saying to sync): a sheet holds a gallery id only, and a picture embedded in the sheet
  would leave the gallery's rules (default).
- **D635** Insert › Emoji puts each emoji picked into the open edit at its caret, opening the active cell's edit when
  none is, never saving by itself: the edit is saved as typing is (default).
- **D630** A picture in a cell is the cell's input (a gallery id and alt text), so it moves, sorts, fills, copies and
  clears with its cell as Google's in-cell image value does (default).
- **D631** A formula reads a cell's picture as empty text and a reference to it shows the picture, as an IMAGE's
  answer; the formula bar shows nothing (default; assumed).
- **D632** Alt Text and Place Image over Cells on a cell's picture, Place Image in Selected Cell on an image over cells,
  each one undo step (default).
- **D633** A cell's picture is a reference of its document, indexed in the room from the cells' inputs by triggers, as
  an image over cells is from the layout (default).
- **D634** XLSX writes a cell's picture as Excel's rich value (`_localImage`), ODF as a frame in its cell sized with
  it; ODF reads a frame in a cell at offset 0 whose end cell is its own as a cell's picture (default).
