# Tables

**Status: in the model, the files and the editor.** Tables are read, written, converted, drawn, typed in and broken
between rows across pages; inserting, reshaping, properties, repeated header rows and rows breaking inside are ahead.

Tables in a [text document](text-document.md), as Google Docs has them, built on `prosemirror-tables`
([Adopt or build](../../research/docs-open-standard/adopt-or-build.md)).

## Inserting

- Insert > Table opens a grid; hovering sizes it up to 20 × 20, a press inserts it at the caret, columns sharing the
  text width equally.
  - The grid is the office shell's size grid ([Office shell](../004-interface-design/office-shell.md#menus-as-data)).
  - The text width is the caret's section's (its column's in a section of columns; the cell's own width less its
    padding in a cell, where tables nest).
  - Inserted as Google's: a new table has no header rows and a 1 pt black line round every cell `(default)`, 5 pt
    of padding on every side (Google's 0.069 in), its cells in Normal text. The caret's paragraph splits at
    the caret, leaving no empty half; the table takes an empty paragraph's place; an empty paragraph follows the table
    when its paragraph has no writing after the caret, so the writing can go on below it.
  - The caret goes to the first cell. One undo step. An Editor's only (Viewers and Participants do not see it).
  - The tool finder's Table inserts a 3 × 3 table `(default)`.
- **Table templates** (Insert > Table > Table templates): Google's set of tables with header rows and column types
  (assumed: those without chips only, under C3; each template's columns listed in the help article).

## Working in a table

- Tab and Shift+Tab move between cells; Tab in the last cell adds a row.
  - Tab selects the next cell's writing, Shift+Tab the previous cell's (Word's and Google's); Shift+Tab in the first
    cell stays. In a cell, Tab never types a tab nor indents a list `(default)`.
  - The row Tab adds copies the last row's cells (spans, lines, shading), empty; one undo step. A Viewer's Tab moves
    nothing in the writing.
- **Table navigation** (keyboard-shortcuts.md "Table navigation"): Google's Ctrl+Alt+Shift+T sequences put the caret at
  the start of a cell: the table's first or last, its column's first or last, its row's first or last, or the next or
  previous one across or down; Exit table puts it after the table (before it when nothing follows), and Ctrl+Alt+Shift+N
  or P, T in the next or previous table's first cell. A move with nowhere to go leaves the caret where it is. Anyone
  who reads the document may move; moving changes nothing.
- Insert a row above or below, a column left or right; delete a row, column or the table; **Distribute rows**,
  **Distribute columns**.
  - A row inserted copies the caret's row's cells (spans across, lines, shading), one row high and empty; a cell
    spanning down across the place grows by the row. With cells selected, as many rows as the selection spans
    `(default)`, above its first or below its last.
  - A column inserted copies the caret's column's cells, empty, at that column's width; then every column narrows in
    proportion, so the table keeps its width `(default)`. A cell spanning across the place grows by the column. With
    cells selected, as many columns as the selection spans `(default)`.
  - Delete row and Delete column delete the rows or columns the caret or the selection is in; the columns left keep
    their widths, so the table narrows `(default)`. Deleting every row or column deletes the table.
  - Delete table takes the whole table away, the caret at the start of what follows it.
  - **Distribute rows** gives the rows the caret or selection spans (every row with the caret alone) one minimum height,
    the tallest one's as drawn `(default)`. **Distribute columns** gives the columns it spans one width each, their
    widths' sum shared equally, so the table keeps its width.
  - Each is one undo step, keeps the caret in its cell where the cell remains, and is an Editor's only.
- **Merge cells** and **Unmerge cells** over a cell selection.
  - Merge cells joins a rectangle of two or more selected cells into its first, the others' writing appended to it,
    its width the columns' it covers; dimmed (and left out of the context menu) without such a selection.
  - Unmerge cells splits the caret's merged cell back into one cell per place, the writing in the first; dimmed (and left
    out of the context menu) unless the caret's cell spans more than one place.
- **Move** rows and columns by dragging their edge handle (Google's six-dot grip).
- **Resize** columns and rows by dragging their borders; a minimum of 0.1 in.
- **Sort table** ascending or descending by the column at the caret (text, then numbers, as Google sorts).
  - Format > Table > Sort table > **Sort ascending**, **Sort descending**; the cell's context menu has both as **Sort
    table ascending**, **Sort table descending** `(default)`.
  - Rows are ordered by the writing of their cell in the caret's column: cells that read as a number (`3`, `-2.5`,
    `1,200`) come first in number order, then the rest by their words, ignoring case, numbers within words in number
    order (`Item 2` before `Item 10`); empty cells last either way `(default)`. Rows that compare equal keep their
    order.
  - Header rows stay at the top, unsorted. Dimmed where a cell below the header rows spans rows, or fewer than two
    rows would move. One undo step.
- **Pin header rows**: the first n rows repeat at the top of each page.
  - Format > Table > Pin header rows > **Don't pin** and **Pin up to row** n, n the caret's row; Table properties'
    Rows section has **Pin header rows** (None, 1 to the table's rows less one, at most 10 `(default)`).
  - Pinned rows are the table's header rows: their cells are column headers (`th scope="col"`), written as each format
    holds header rows (ODF `table:table-header-rows`, OOXML `w:tblHeader`). Pinning every row is refused (a table
    keeps one row of its own). One undo step.
  - Repeating them at the top of each page the table continues on is ahead.
- **Rows that do not break across pages** (Table properties > Row > Allow row to overflow across pages, off).

## Table properties

A side panel (Google's) with sections: **Rows** (minimum height, pin header rows, allow overflow), **Columns** (width),
**Alignment** (cell vertical alignment, table alignment left, centre, right, left indent), **Colour** (border colour
and width, cell background, by the one colour picker), **Cell** (padding).

- Opened by Format > Table > Table properties or the cell's context menu, in the right side panel
  ([Office shell](../004-interface-design/office-shell.md#side-panels)); an Editor's only, as every side panel that
  changes the writing. The item is dimmed (and left out of the context menu) outside a table.
- Its sections are collapsible, each open when the panel opens `(default)`; it reads the caret's table again as the
  caret moves, and outside a table says "Put the cursor in a table to see its properties." with no fields.
- **What it changes**: the selected cells, or the caret's cell with none selected; Minimum row height the rows they
  are in; Column width the columns they are in; Table alignment and Left indent the whole table.
- **What it shows**: each field the value the cells it changes share, blank where they differ.
- **Fields** (lengths in the person's unit, as indents are, from 0 to 22 in):
  - Rows: **Minimum row height** (a row grows past it with its writing; 0 or blank is none).
  - Columns: **Column width**, at least 0.1 in; the table grows or shrinks by the change.
  - Alignment: **Cell vertical alignment** (Top, Middle, Bottom); **Table alignment** (Left, Center, Right); **Left
    indent** (Left only, dimmed otherwise).
  - Colour: **Table border** colour (the one colour picker) and width (0 pt, 0.5 pt, 1 pt, 1.5 pt, 2.25 pt, 3 pt,
    4.5 pt, 6 pt, Google's), setting every side of the cells it changes, drawn solid; 0 pt takes the lines away.
    **Cell background colour** (the one colour picker, with None).
  - Cell: **Cell padding**, every side alike.
- A choice from a list or a colour applies at once; a typed length applies on Enter or when the field is left, and an
  invalid one says so under the field and changes nothing. Each change is one undo step, its focus kept in the panel.
- Pin header rows and Allow row to overflow across pages join Rows when pinned header rows and rows that do not break
  are built (ahead).
- Telemetry: `Element · Changed · TextDocumentTableProperties` per change. Logged
  `[text-document] table-properties` with the field.

## Format > Table

`(default)`, until Webber's capture: **Table properties**; Insert row above, Insert row below, Insert column left,
Insert column right; Delete row, Delete column, Delete table; Distribute rows, Distribute columns; Merge cells,
Unmerge cells; Sort table (a submenu); Pin header rows (a submenu). Each dimmed outside a table, Merge and Unmerge as
above, Sort as above.

## Context menu

On a cell: the text menu, then Insert row above, Insert row below, Insert column left, Insert column right, Delete row,
Delete column, Delete table, Distribute rows, Distribute columns, Merge cells / Unmerge cells, Sort table ascending, Sort
table descending, Table properties. Its table items show only in a table (contextual), Merge cells only over a selection that can merge and
Unmerge cells only on a merged cell; the order is `(default)` until Webber's capture.

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

## Laying out across pages

A table breaks between rows at a page's foot; header rows repeat; a row allowed to overflow breaks between lines of
its tallest cell; otherwise it moves whole, unless it is taller than a page, when it breaks anyway.

- **Built: between rows.** A table's rows are its lines ([Page layout](page-layout.md#laying-out)): a page that
  fills inside a table ends after its last row that fits, and the next page's text area starts with the next row.
- Rows joined by a cell spanning them move together, as one line `(default)`: a page never cuts a merged cell.
- A row, or rows joined so, taller than a page's text area starts a page and runs past its foot until rows break
  inside (ahead).
- The page's foot, the ground between pages and the next page's head are drawn as a row across the table, the full
  width of the page, aria-hidden and never text; a cell keeps its own lines, so the row before the break draws its
  bottom line and the row after its top line, as each has them.
- In a section of columns a table moves to the next column or page whole, as kept content does `(default)`.
- A table's rows are not line-numbered and do not count ([Line numbers](page-layout.md#line-numbers)), as Word's.
- A footnote whose mark is in a cell is at the foot of the page its row is on.
- Ahead: header rows repeating on each page; a row breaking between its lines; a row that may not break.

## Share roles

Editors change tables; a Participant only as suggestions (D7); a Viewer reads and copies.

## Limits

20 × 20 from the grid; at most 1,000 rows and 63 columns a table (`TEXT_DOCUMENT_TABLE_MAX_ROWS`,
`TEXT_DOCUMENT_TABLE_MAX_COLUMNS`, (default), Word's column limit).

## Telemetry

`Element · Added · TextDocumentTable`, `TextDocumentTableTemplate`; `Element · Changed · TextDocumentTable<Action>`
(InsertRow, InsertColumn, DeleteRow, DeleteColumn, Delete, DistributeRows, DistributeColumns, Merge, Unmerge, Sort,
PinHeader, …). Never content. Tab adding a row is `TextDocumentTableInsertRow`.
The telemetry dashboard draws them as Text Document Tables (added) and Text Document Table Changes (changed).
