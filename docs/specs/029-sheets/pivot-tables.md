# Pivot tables

**Status: specified.** Nothing is built.

Pivot tables in a [spreadsheet](spreadsheet.md), as Google Sheets makes them.

## What a pivot table is

- A **pivot table** reads a source range and writes a summary into a region of cells anchored at one cell: its
  output is the engine's, like a spill, and cannot be typed over ("You can't edit a pivot table's cells").
- Its model: the source range (by ids), **Rows** and **Columns** (each a source column, its order, sort by a value,
  Show Totals, Repeat Row Labels), **Values** (each a column or a calculated field, summarised by SUM, COUNTA, COUNT,
  COUNTUNIQUE, AVERAGE, MAX, MIN, MEDIAN, PRODUCT, STDEV, STDEVP, VAR, VARP, or a custom formula; **Show As**:
  Default, % of Row, % of Column, % of Grand Total), **Filters** (by values or condition), and grouping (by number
  intervals, by dates: year, quarter, month, day of week, and so on, and by custom groups).
- Calculated fields are formulas over source column names (`='Sales'*0.2`).
- ODF keeps it as a data pilot table, XLSX as a pivot cache and table, each with its output cells cached
  ([Standard mapping](standard-mapping.md)).

## Making one

- **Insert › Pivot Table**: Data Range (the selection or the data region), Insert To: **New Sheet** (the default,
  "Pivot Table 1") or **Existing Sheet** (a cell); **Create** opens the Pivot Table Editor.
- `GETPIVOTDATA(value_name, any_pivot_table_cell, [original_column, …])` reads it.

## Pivot Table Editor

A side panel: the range (editable), **Suggested** pivots, then Rows, Columns, Values and Filters, each with **Add**
listing the source columns, and each entry's options as above. Changes recalculate the output at once.

## Working with one

- A cell of the output selected shows **Edit** beside it to reopen the editor.
- A double-click on a value shows its source rows on a new sheet ("Details for …").
- The output refreshes when the source changes; a source grown past its range is read when the range was whole
  columns.

## Who may do what

- **Editor** makes and changes pivot tables; **Participant** and **Viewer** read them and their details sheets
  (a Viewer's details are their own, not saved).

## Accessibility

The output is ordinary cells to the grid's screen reader support, with its header rows and columns marked as headers.

## Errors and limits

- A source up to 1 million cells, an output up to 100,000 cells; past either, "This pivot table is too large".
- An output blocked by filled cells shows `#REF!` at its anchor ("Results would overwrite B3").

## Telemetry

`Spreadsheet · Inserted · PivotTable`; `Spreadsheet · Changed · PivotTable`.
