# Pivot tables

**Status: built in part** (plan 0020 Phase 11): the model ([The model](#the-model)), how a pivot table's output is
worked out from its source, calculated fields and formula filters too ([The output](#the-output)), proven against all
of Google Sheets' answers in the grid ([In the grid](#in-the-grid)), `GETPIVOTDATA`, written to both formats and read
back, and other apps' read from their standard forms ([Standard mapping](standard-mapping.md#pivot-tables-in-the-file));
the rest specified.

Pivot tables in a [spreadsheet](spreadsheet.md), as Google Sheets makes them. Research:
[Charts and pivots](../../research/sheets-open-standard/charts-and-pivots.md). Evidence: twenty pivot tables Google
Sheets made over one source, their output as Google works it out (`packages/sheets/corpus/google/pivot-answers.json`,
`pivot-cases.ts`) and the files it exports of them (`pivot-tables.xlsx`, `pivot-tables.ods`).

## What a pivot table is

- A **pivot table** reads a source range and writes a summary into a region of cells anchored at one cell: its
  output is the engine's, like a spill, and cannot be typed over ("You can't edit a pivot table's cells").
- Its model: the source range (by ids), **Rows** and **Columns** (each a source column, its order, sort by a value,
  Show Totals, Repeat Row Labels), **Values** (each a column or a calculated field, summarised by SUM, COUNTA, COUNT,
  COUNTUNIQUE, AVERAGE, MAX, MIN, MEDIAN, PRODUCT, STDEV, STDEVP, VAR, VARP, or a custom formula; **Show As**:
  Default, % of Row, % of Column, % of Grand Total), **Filters** (by values or condition), and grouping (by number
  intervals, by dates: year, quarter, month, day of week, and so on, and by custom groups).
- Calculated fields are formulas over source column names (`='Sales'*0.2`).
- ODF keeps it as a data pilot table, XLSX as a pivot cache and table, each with its output cells cached and LiveDoc's
  exact record beside it ([Pivot tables in the file](standard-mapping.md#pivot-tables-in-the-file)).

## The model

A pivot table is one of its sheet's **objects** ([Sheet store](sheet-store.md#in-a-spreadsheet), "Objects"), kept in
the sheet's layout beside its charts, set whole by its id or removed, one undo step a change (default, D378).

- **Place**: the cell its output starts at, by row and column ids; the output grows right and down from it. Deleting
  that cell's row or column deletes the pivot table, as Google Sheets does (default, D601).
- **Source**: a range of any sheet of the workbook, by that sheet's id (none: its own sheet) and row and column ids;
  its first row is the header, which names the columns. Rows and columns inserted inside it widen it, as a chart's
  range does; deleted ones shrink it, on its own sheet and on another alike, as a formula's range into that sheet
  shrinks; every cell of it deleted leaves no source (D601).
- **Fields**: each row group, column group, value and filter names its source column by the column's id, so it
  follows the column when columns move, and is dropped when the column is deleted; a group sorted by a value dropped
  so sorts by its items again (D601).
- **Bounds**: up to 100 pivot tables and charts together a sheet (the objects' cap); up to 20 row groups, 20 column
  groups, 40 values and 40 filters; a filter's values and a custom group's items as a filter's are; names up to 200
  characters. A change past them is refused as any malformed layout write is (default, D601).
- **Rows** and **Columns**: groups, outermost first; each with its order (ascending or descending), an optional
  value to sort by (a value's place among Values, its order then the group's), **Show Totals** (on), **Repeat Row
  Labels** (off; rows only), and an optional grouping (below).
- **Values**: each a source column or a **calculated field** (a name and a formula), its summary, its **Show As**,
  and an optional name; **Values as** columns (the default) or rows.
- **Filters**: each a source column with the values it shows (the rest hidden), one condition of
  [Filter by Condition](data-tools.md)'s list, or a custom formula over the source's column names (`=Units>8`).

## The output

How the engine lays the output out, from the source's values as they read now (default, D379, each rule matching
Google Sheets' answer for the evidence's cases):

- **Rows kept**: the source's rows below its header that every filter shows. A filter by values shows a row whose
  cell's shown text is among its values; a filter by condition, one the condition holds for.
- **Groups**: a row group's items are the distinct values of its column among the rows kept, a blank cell an item
  of its own shown blank. Items sort ascending by their value (numbers before text, text without case, a blank as
  empty text); descending reverses them; sorting by a value orders them by that value's summary over each item,
  ties by item; with column groups, by that value in one column item's total (by the Grand Total when none is named).
- **Grouping** turns a value into its group's item before grouping:
  - **Dates** (a number): an item of text, ordered by time, never by its text; the header reads `<column> - <rule>`.
    Rules and items (in en-US): Second `45`, Minute `45`, Hour `19`, Hour-Minute `19:45`, Hour-Minute (12 hour)
    `7:45 PM`, Day of the week `Sunday` (Sunday first), Day of the year `1`, Day of the month `1`, Day-Month
    `11-Jan`, Month `Jan`, Quarter `Q1`, Year `2025`, Year-Quarter `2025-Q1`, Year-Month `2025-Jan`,
    Year-Month-Day `2025-01-15`.
  - **Number intervals**: a size, and optionally a start and an end. Buckets start at the start (else the lowest
    value, rounded down to a whole size); each is named `<low> - <high>`, its high the next bucket's low, or one
    less when every number of the column and the size are whole (`0 - 4`, `5 - 9`); the last bucket takes in the end
    (`15 - 20`); `< start` and `> end` gather the numbers beyond them; text and blanks stay themselves, after the
    buckets. The header reads `Grouped <column>`.
  - **Custom groups**: named groups of items; an item in none stays itself. The header reads `Grouped <column>`.
- **Summaries** over a cell's rows, as the spreadsheet function of the same name over those cells: SUM, AVERAGE,
  MEDIAN, MAX, MIN, PRODUCT, STDEV, STDEVP, VAR and VARP read numbers alone; COUNT counts numbers; COUNTA counts
  cells that are not blank; COUNTUNIQUE counts distinct values that are not blank. A summary of no numbers is what
  its function answers (SUM 0, AVERAGE `#DIV/0!`). A total summarises the rows of everything it totals, never the
  summaries (an average's total is the average of all its rows).
- **Calculated fields**: summarised by SUM (or any summary), each source column name in the formula (quoted, as
  `'Units'`) reads that column's summary over the cell's rows, so `='Units'*'Price'` over a group is the group's
  units times the group's prices; summarised by Custom, a name reads the column's values over the cell's rows as an
  array (default, D600). The array reads as a range would: whole where a function or ARRAYFORMULA takes an array,
  its first value where one value goes (`=SUM(Units*Price)` multiplies the first row's), as Google Sheets reads it.
  A name is quoted (`'Unit price'`, a quote inside doubled) or bare when it reads as a name (`Units`), case aside;
  a field without a name is named `Calculated Field 1`, `2` and so on; a formula that cannot be read shows
  `#ERROR!` ("Formula parse error."); a formula's errors propagate (`'n/a'*2` is `#VALUE!`).
- **Filter by formula**: worked out for each source row, each column name reading that row's value; a row is kept
  when it answers TRUE or a number other than zero (an error or text keeps none).
- **Cells**: a cell no source row reaches is blank; one only blank cells reach holds its summary (SUM 0).
- **Show As**: % of Row divides each cell by its row's grand total, % of Column by its column's, % of Grand Total by
  the grand total; shown as a percentage.
- **Labels**: a value is named `<SUMMARY> of <column>` (`SUM of Units`), a calculated field by its name; a total
  of an outer row item `<item> Total` (`East Total`); the last row and column `Grand Total`.
- **Rows only**: a header row (each row group's column name, then each value's name), then a row per innermost
  item, an outer item's label on its first row alone unless Repeat Row Labels; after an outer item's rows, its total
  row when the group inside it shows totals (a group's totals total its items: the outermost group's is the Grand
  Total); the Grand Total row last when the outermost group shows totals. Columns' totals alike.
- **Columns too**: a first row holding the value's name (one value) or blank (two or more) over the row header, then
  each column group's name, then `Values` when there are two or more values; then a header row per column group,
  outermost first, each item over its columns and blank across the rest of its span, an outer item's total column
  (`East Total`) after its inner items when the group inside shows totals, and `Grand Total` last; with two or more
  values a last header row naming each value under each item; the row groups' names lead the last header row; then
  the rows as above.
- **Columns only**: the first column blank in the header rows, then a row per value named in the first column.
- **Values as rows**: a `Values` column after the row groups, each row item a row per value.

## In the grid

The engine places a pivot table's output in its sheet as it places a spilled array ([Formulas](formulas.md), "Arrays
and spills"), from the source's values and shown texts as they read now (default, D602):

- **Cells**: the output fills a rectangle from its place, right and down; each of its cells reads as its value to
  formulas, filters, charts, the cells view and images, as a spilled cell does. Its anchor cell is the pivot table's;
  the others are claimed while the output lands.
- **Recalculation**: any change to a source cell, its format, or the source's rows and columns works the output out
  again, and every formula reading the output with it.
- **Blocked**: a filled cell in the rectangle (not the anchor), or another spill's or pivot table's cell, keeps the
  output from landing: the anchor shows `#REF!` with "Results would overwrite B3" (its first such cell, row by row),
  and the rest stays empty; emptying it lets the output land.
- **Past the edge**: an output running past the sheet's last row or column shows `#REF!` at the anchor with "Results
  would run past the edge of the sheet".
- **No source**: a source whose sheet or every cell was deleted shows `#REF!` at the anchor with "The pivot table's
  source data was deleted".
- **Empty**: a pivot table with nothing to show (no fields) leaves its anchor blank.
- **The anchor filled**: a value or formula in the anchor cell stands, and the pivot table is not drawn until the cell
  is emptied (people and agents cannot type there: [Working with one](#working-with-one)).
- **Formats**: a value summarised by SUM, AVERAGE, MAX, MIN or MEDIAN reads in its source column's number format (the
  first cell below the header that has one), a Show As value as a percentage with two decimals, as Google Sheets
  shows them; a cell's own number format, set by a person, wins.
- **Loops**: a source that reads the pivot table's own output is read as it stands when the output is worked out;
  it never hangs the engine.

## Making one

- **Insert › Pivot Table**: Data Range (the selection or the data region), Insert To: **New Sheet** (the default,
  "Pivot Table 1") or **Existing Sheet** (a cell); **Create** opens the Pivot Table Editor.
- `GETPIVOTDATA(value_name, any_pivot_table_cell, [original_column, …])` reads it ([Formulas](formulas.md),
  "Lookup", D603).

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

## Defaults

- **D378** A pivot table is one of its sheet's objects, its fields by column id, so it follows moved columns and loses
  a deleted one's fields, as a chart's series do (default).
- **D379** The output's layout, labels, order, totals and summaries as Google Sheets' answers for the evidence's
  twenty cases (default).
- **D600** A calculated field summarised by SUM reads each named column's summary over the cell's rows; by Custom,
  the column's values as an array read as a range, as Google Sheets does; a filter's formula reads each row's own
  values (default).
- **D601** A pivot table goes with its anchor cell's row or column; its source shrinks with deleted rows and columns on
  any sheet, as a formula's range does, and its fields go with their columns (default).
- **D602** The output lands in the grid as a spilled array does, blocked by filled cells (`#REF!`, "Results would
  overwrite B3"), its numbers in their source column's number format and Show As values as percentages (default).
