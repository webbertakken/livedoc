# Inserted objects

**Status: specified.** Insert › Checkbox and Insert › Dropdown are built (as data validation); the rest is specified.

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
  image storage is not set up the item is dimmed, its hint "Image uploads aren't enabled on this deployment".
- **Selected** by a click: an outline with eight handles. Dragged, it moves, its anchor landing on the cell under its
  new top-left; a corner handle resizes it in proportion (an edge handle stretches it); Delete or Backspace removes
  it; Escape returns the keys to the grid. Moving and resizing are one undo step each, as a chart's are.
- **Its menu** (the ⋮ button on the selected image, and a right-click on it): **Alt Text** (a dialog: Title and
  Description as Google's; LiveDoc keeps one text, the description, its title folded in), **Replace Image** (the
  picker; the new picture keeps the box's width, its height following its proportion), **Delete**. Google's Edit
  Image (crop, recolour) and Assign Script are left out (crop: later; scripts: C3); **Place Image in Selected Cell**
  joins when [images in a cell](#images-in-a-cell) are built.
- **Drawn** from the image's bytes (`/api/images/<id>?d=<document>`), at the grid's zoom, under frozen panes as a
  chart is; a picture that cannot be drawn shows the editor's broken-image state sized to the box
  ([Images](../009-elements/images.md), "Placeholder rendering").
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
  [Import image pipeline](../020-import-export/import-image-pipeline.md) (a picture past the caps stays kept in the
  file and is named by the read).
- **Agents**: `change_sheet` `image {imageId, at, width, height, alt, replace}` places one of the caller's gallery
  pictures (`list_images`), refused for an id the gallery lacks as the MCP refuses it on a canvas
  (`image_not_found`); `clear_images {id}`; `read_sheet` and the outline list them with their ids, places, sizes and
  alt text; the image view of a spreadsheet tab draws them.

### Images in a cell

- **Insert Image › Insert Image in Cell**: the image fills the cell, kept in proportion, moving and sorting with it;
  `IMAGE()` does the same from an address (S4; [Imports from the web](imports.md#image)).
- Both formats keep it (ODF a `draw:frame` anchored to the cell; XLSX in-cell images as rich values).

### Images, both

- Upload, a link, or the gallery of the person's images ([Images](../009-elements/images.md)); camera and Drive are
  left out (Google's services, C3).

## Drawings

- **Insert Drawing** opens a small LiveDoc canvas in a dialog (shapes, lines, text, the palette's basics), reused
  from the editor; **Save and Close** places it over the cells as an image the drawing can be reopened from.
- In a file it is written as the format's drawing shapes where they map, else as a picture with the drawing kept
  as unknown content for LiveDoc to reopen.

## Links

- **Insert Link** (Ctrl+K): a text and a link: a web address (http, https, mailto only), a sheet of this workbook,
  a range ("Select a range of cells to link"), or another LiveDoc document; the cell shows the text as a link with a
  hover card (open, copy, edit, remove). **Get Link to This Cell** copies an address that opens the workbook there.
- `HYPERLINK()` as today ([Formulas](formulas.md)).

## Tick boxes, dropdowns and emoji

- **Insert › Checkbox** and **Insert › Dropdown** add data validation ([Data tools](data-tools.md#data-validation)).
- **Insert › Emoji** opens the emoji picker the editor already has.

## Timeline view

- **Insert › Timeline**: a view of a range with a start date column (and optional end, title, colour, group, details
  columns) drawn as cards on a time axis, on its own sheet; zoom by day, week, month, quarter, year; filters and
  grouping. It reads the range live and writes nothing to cells.
- Neither format holds a timeline: it is kept as unknown content for LiveDoc, and other applications see only its
  source range.

## Smart chips

Left out (C3): no Insert › Smart Chips, no `@` menu of chips. A chip in an arriving file is kept and shown as its
text, and written back as it came: Google Sheets exports a person chip as its email linked to `mailto:`, a file chip as
its title linked to the file, and LiveDoc keeps the link in both formats (XLSX's hyperlinks, ODF's marked cell text,
[Unknown content](standard-mapping.md#unknown-content), D376).

## Who may do what

- **Editor** inserts and edits every object here.
- **Participant** ticks tick boxes and picks from dropdowns; opens links.
- **Viewer** opens links and sees the rest.

## Accessibility

- Every image and drawing carries alt text (editable through Alt Text; an image without it is announced as "Image"); a timeline is navigable by its cards
  with the arrow keys, each announced with its title and dates.

## Errors and limits

- An image up to 50 MB and 25 million pixels (Google's limit, assumed); larger is refused ("This image is too large").
- Up to 100 objects a sheet (images, charts and pivot tables together, the objects' cap).

## Telemetry

`Spreadsheet · Inserted · <Kind>` (`ImageInCell`, `ImageOverCells`, `Drawing`, `Link`, `Checkbox`, `Dropdown`,
`Emoji`, `Timeline`).

## Defaults

- **D623** An image over cells is one of its sheet's objects, placed at the active cell at its natural size scaled to
  fit 600 by 400 px, moved and resized as a chart is, its bytes in the uploader's gallery (default).
