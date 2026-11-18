# Inserted objects

**Status: specified.** Nothing is built.

What the Insert menu puts into a [spreadsheet](spreadsheet.md) besides cells, charts and pivot tables (those have
their own pages: [Charts](charts.md), [Pivot tables](pivot-tables.md)). Its rows of the
[parity matrix](parity-matrix.md) name this page.

## Images

- **Insert Image › In Cell**: the image fills the cell, kept in proportion, moving and sorting with it; `IMAGE()` does
  the same from an address (S4).
- **Insert Image › Over Cells**: a floating image anchored at a cell's corner with an offset, moved and resized by an
  Editor; its menu: Edit (crop, replace), Alt Text, Place Image in Selected Cell, Delete.
- Upload, a link, or the gallery of the person's images ([Images](../009-elements/images.md)); camera and Drive are
  left out (Google's services, C3).
- Both formats keep both kinds (ODF `draw:image`; XLSX pictures, in-cell images as rich values).

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
text, and written back as it came.

## Who may do what

- **Editor** inserts and edits every object here.
- **Participant** ticks tick boxes and picks from dropdowns; opens links.
- **Viewer** opens links and sees the rest.

## Accessibility

- Every image and drawing carries alt text (asked for on insert, editable); a timeline is navigable by its cards
  with the arrow keys, each announced with its title and dates.

## Errors and limits

- An image up to 50 MB and 25 million pixels (Google's limit, assumed); larger is refused ("This image is too large").
- Up to 1,000 floating objects a sheet.

## Telemetry

`Spreadsheet · Inserted · <Kind>` (`ImageInCell`, `ImageOverCells`, `Drawing`, `Link`, `Checkbox`, `Dropdown`,
`Emoji`, `Timeline`).
