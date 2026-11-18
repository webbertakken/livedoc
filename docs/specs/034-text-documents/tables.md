# Tables

**Status: specified.** Nothing is built.

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

## In the formats

Tables map to `table:table` and `w:tbl` with their spans, header rows and row-break rules
([Standard mapping](standard-mapping.md#what-the-model-holds)). A table nested in a cell is held and drawn.

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
