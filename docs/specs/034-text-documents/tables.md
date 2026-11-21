# Tables

**Status: in the model, the files and the editor.** Tables are read, written, converted, drawn and typed in; inserting,
reshaping, properties and breaking across pages are ahead.

Tables in a [text document](text-document.md), as Google Docs has them, built on `prosemirror-tables`
([Adopt or build](../../research/docs-open-standard/adopt-or-build.md)).

## Inserting

- Insert > Table opens a grid; hovering sizes it up to 20 × 20, a press inserts it at the caret, columns sharing the
  text width equally.
- **Table templates** (Insert > Table > Table templates): Google's set of tables with header rows and column types
  (assumed: those without chips only, under C3; each template's columns listed in the help article).

## Working in a table

- Tab and Shift+Tab move between cells; Tab in the last cell adds a row.
- Insert a row above or below, a column left or right; delete a row, column or the table; **Distribute rows**,
  **Distribute columns**.
- **Merge cells** and **Unmerge cells** over a cell selection.
- **Move** rows and columns by dragging their edge handle (Google's six-dot grip).
- **Resize** columns and rows by dragging their borders; a minimum of 0.1 in.
- **Sort table** ascending or descending by the column at the caret (text, then numbers, as Google sorts).
- **Pin header rows**: the first n rows repeat at the top of each page.
- **Rows that do not break across pages** (Table properties > Row > Allow row to overflow across pages, off).

## Table properties

A side panel (Google's) with sections: **Rows** (minimum height, pin header rows, allow overflow), **Columns** (width),
**Alignment** (cell vertical alignment, table alignment left, centre, right, left indent), **Colour** (border colour
and width, cell background, by the one colour picker), **Cell** (padding).

## Context menu

On a cell: the text menu, then Insert row above, Insert row below, Insert column left, Insert column right, Delete row,
Delete column, Delete table, Distribute rows, Distribute columns, Merge cells / Unmerge cells, Sort table, Table
properties.

## The model

A table is a block of the body, beside paragraphs and section breaks, and may stand in a cell, a header, a footer or a
note ([Standard mapping](standard-mapping.md#the-model)).

- **`Table`**: its column widths in points (`columns`, one per grid column), its rows, how many leading rows are
  **header rows** (`headerRows`, 0 when none), its alignment (`center`, `end`; at the start when absent) and left
  indent in points, and the file's own table properties kept.
- **`TableRow`**: its cells, a minimum height in points (or an exact one, `heightRule` `exact`), whether it may
  break across pages (`breaks`, true unless the file says not), and its kept properties.
- **`TableCell`**: the blocks it holds (at least one paragraph; tables nest), how many columns and rows it spans
  (`colSpan`, `rowSpan`, 1 by default), and its formatting: a background colour, a line per side (top, bottom,
  left, right, each a width, a dash and a colour as a paragraph border's), padding per side in points, and its
  vertical alignment (`top`, `middle`, `bottom`); and its kept properties.
- A row lists only the cells that start in it: a cell spanning rows takes its columns in the rows below, as HTML and
  `prosemirror-tables` hold it. Every row covers every column (a short row is filled with empty cells on read).
- Lengths in points, colours `#rrggbb`, as the rest of the model.

## In the formats

| Model              | ODF                                                                                                                 | OOXML                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Table              | `table:table`, its style's `style:width`, `table:align` (`left`, `center`, `right`, `margins`) and `fo:margin-left` | `w:tbl`, `w:tblPr`: `w:jc` (`start`, `center`, `end`; `left`, `right` read), `w:tblInd`                       |
| Columns            | `table:table-column` (`table:number-columns-repeated`), its style's `style:column-width`                            | `w:tblGrid`, `w:gridCol w:w` (twentieths of a point)                                                          |
| Header rows        | the rows inside `table:table-header-rows`                                                                           | leading rows with `w:trPr/w:tblHeader`                                                                        |
| Row height         | the row style's `style:min-row-height`, or `style:row-height` (exact)                                               | `w:trHeight w:val`, `w:hRule` (`atLeast`, `exact`)                                                            |
| Row may break      | the row style's `fo:keep-together="always"` reads as false                                                          | `w:cantSplit` reads as false                                                                                  |
| Cell               | `table:table-cell`; `table:covered-table-cell` for a spanned place                                                  | `w:tc`; a spanned place is `w:gridSpan` and `w:vMerge` (`restart`, then continue)                             |
| Spans              | `table:number-columns-spanned`, `table:number-rows-spanned`                                                         | `w:gridSpan`; rows from the run of `w:vMerge` cells under a `restart`                                         |
| Background         | the cell style's `fo:background-color`                                                                              | `w:tcPr/w:shd w:fill`                                                                                         |
| Lines              | the cell style's `fo:border-<side>` (`fo:border` read for all four)                                                 | `w:tcBorders`; the table's `w:tblBorders` (`insideH`, `insideV` between cells) read into the cells it reaches |
| Padding            | the cell style's `fo:padding-<side>`                                                                                | `w:tcMar`; the table's `w:tblCellMar` read into each cell without its own                                     |
| Vertical alignment | the cell style's `style:vertical-align` (`top`, `middle`, `bottom`)                                                 | `w:vAlign` (`top`, `center`, `bottom`)                                                                        |

- **Written** `(default)`: ODF, a table style (width the columns' sum, its alignment and indent), a column style per
  distinct width, a row style per distinct row formatting and a cell style per distinct cell formatting, all automatic
  styles of the part they stand in, named by a hash of what they hold as LiveDoc's other automatic styles are
  (`LDTable`, `LDColumn`, `LDRow`, `LDCell`); the table named `Table<n>`, the first number no other table holds; a
  spanned place written as `table:covered-table-cell`.
  OOXML: `w:tblW` the columns' sum (`dxa`), `w:tblLayout w:type="fixed"`, each cell's `w:tcW` its columns' sum,
  its lines in `w:tcBorders` (none where it has none), padding in `w:tcMar`; a cell that continues a row span written
  `w:vMerge` with one empty paragraph, as Word writes it.
- **Kept**: a table style the model does not map (`table:template-name`, `w:tblStyle` and its conditional formatting,
  `w:tblLook`) stays on the table as kept properties, as does what else a table, row or cell element carries (in ODF
  the element's own attributes, in OOXML its properties element); a table edited keeps them while the values the model
  reads from them are unchanged ([Kept content](standard-mapping.md#kept-content)).
- **A Word table style's lines and padding**: the `w:tblBorders` and `w:tblCellMar` of the table's `w:tblStyle`
  (down its `w:basedOn`) are read under the table's own, so a table drawn by its style keeps its lines elsewhere.
- **Read leniently**: a row shorter than the grid is filled with empty cells, a longer one widens the grid with columns
  of the table's average width; a span past the table's edge is cut to it; `w:hMerge` reads as `w:gridSpan`. Each is
  reported as a repair (`table-repaired`), as is a table with no rows, which is dropped. A cell holding no paragraph
  gets an empty one. A table past the [limits](#limits) stays a kept block, reported as kept.
- A table nested in a cell is held and drawn; a table in a header, footer or note too.
- **Conversion** between the formats carries every table value; a kept table style is dropped and listed.

## In the editor

- Drawn with `prosemirror-tables`: node types `table`, `table_row`, `table_cell` and `table_header` (a header row's
  cells), each carrying the model's values as attributes (a cell its `colspan`, `rowspan`, its columns' widths in points
  in `colwidth`, its formatting and kept properties; a row its height, height rule, whether it may break, kept
  properties; a table its alignment, indent and kept properties). Its header rows are the leading rows of header
  cells, and its column widths those of its first row's cells. The live state holds the same elements, as it does
  paragraphs ([Live editing and storage](live-editing-and-storage.md)).
- A cell holds blocks as the body does: paragraphs, lists, breaks inside a paragraph, tables.
- Header rows are drawn as `th scope="col"` cells `(default)`, read by a screen reader as column headers.
- A cell side with no line shows a faint dashed guide on screen, never printed `(default)`, so a table without lines
  can be worked in, as Word's gridlines are.
- Until tables break across pages, a table moves to the next page whole, as kept content does; one taller than a page
  runs past its foot.

## Laying out across pages

A table breaks between rows at a page's foot; header rows repeat; a row allowed to overflow breaks between lines of
its tallest cell; otherwise it moves whole, unless it is taller than a page, when it breaks anyway.

## Share roles

Editors change tables; a Participant only as suggestions (D7); a Viewer reads and copies.

## Limits

20 × 20 from the grid; at most 1,000 rows and 63 columns a table (`TEXT_DOCUMENT_TABLE_MAX_ROWS`,
`TEXT_DOCUMENT_TABLE_MAX_COLUMNS`, (default), Word's column limit).

## Telemetry

`Element · Added · TextDocumentTable`, `TextDocumentTableTemplate`; `Element · Changed · TextDocumentTable<Action>`
(InsertRow, InsertColumn, Merge, Sort, PinHeader, …). Never content.
