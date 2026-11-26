# Data tools

**Status: partly built.** Sort Sheet, Sort Range with its Advanced Range Sorting Options, Create a Filter, Filter by Colour,
every condition of Filter by Condition, and the Data Validation Rules panel with Insert › Checkbox and
Insert › Dropdown are built; the rest is specified.

Sorting, filtering, validation, names, protection, tables and clean-up in a [spreadsheet](spreadsheet.md), as
Google Sheets' Data menu does. Its rows of the [parity matrix](parity-matrix.md) name this page.

## Sort

- **Sort Sheet** A to Z, Z to A by the active column (a header row frozen stays put).
- **Sort Range** A to Z, Z to A by the active column, and **Advanced Range Sorting Options**: a dialog titled
  "Sort range from B1 to D10" (the selection's first and last cells), with **Data has header row**, then the sort keys
  in order, each a column and **A → Z** or **Z → A**, **Add Another Sort Column**, **Cancel** and **Sort**.
  - The first key is the active column when it is in the range, else the range's first column, A to Z.
  - A column is offered by its letter ("Column B"); with a header row ticked, by its header's text as shown, a blank
    header by its letter. The header row stays in place.
  - An added key ("Then by") takes the first column not yet a key (the first column once all are) and has a remove
    button ("Remove sort column 2"); the first key has none.
  - Sort runs every key at once, one undo step, the keys back in the grid; Cancel, Escape and × change nothing.
  - A range of fewer than two rows to sort changes nothing; a merge across the rows refuses, as Sort Range does.
- Text sorts by the workbook's locale, numbers before text, blanks last, as Google's.
- A whole-sheet sort is a layout write of row order; a range sort a cell write (as today, [Sheet store](sheet-store.md)).

## Filters, filter views and slicers

- **Create a Filter** (Ctrl+Alt+R in the matrix's list): a filter over the data region, its header cells with
  filter buttons; one filter a sheet, seen by everyone.
- A column's filter menu: Sort A to Z, Sort Z to A, **Filter by Colour** (fill, text), **Filter by Condition** (every
  condition of Google's list and Custom Formula), **Filter by Values** (a searchable list with counts, Select All,
  Clear).
- **Filter by Colour** lists, under **Fill Colour** and **Text Colour**, the colours the column's cells under the
  header are drawn in, once each in the order they first appear, each a swatch named by its colour. A cell's colour
  is a met format rule's over its own, a theme colour as the theme draws it; alternating colours never count (as
  Google's: they shade by position). Pressing a colour keeps only the rows drawn in it (one colour, fill or text, a
  column); pressing it again lets every colour through; OK applies it with the values and the condition, a row kept
  only when it meets all three. A column with no colour says "No colours in this column". It filters by colours
  already there, so it is not a colour picker ([Colour picker](../004-interface-design/colour-picker.md#not-colour-pickers)).
  SUBTOTAL leaves out the rows it hides, as every filtered row.
- **Filter by Condition** offers Google's list: Is Empty, Is Not Empty, Text Contains, Text Does Not Contain, Text
  Starts With, Text Ends With, Text Is Exactly, Date Is, Date Is Before, Date Is After, Greater Than, Greater Than or
  Equal To, Less Than, Less Than or Equal To, Is Equal To, Is Not Equal To, Is Between, Is Not Between, Custom
  Formula Is.
  - A date condition takes **Today**, **Tomorrow**, **Yesterday**, **In the Past Week**, **In the Past Month**, **In
    the Past Year** or **Exact Date** (then a date typed as the locale reads it; the default, as before). A period is
    its days counted from the workbook's today (the past week the 7 days before today and today; the past month and
    year from the same day a month or a year back, the last day of a shorter month); Date Is keeps a date in it, Date
    Is Before one before its first day, Date Is After one after its last.
  - Is Between and Is Not Between take two values either way round; Is Not Between keeps the numbers outside them.
  - **Custom Formula Is**: a formula written for the filter's first row under its header (`=B2>5`), read for every
    other row with its relative references moved by that row's offset, keeping the rows where it is TRUE or a non-zero
    number (an error or a text keeps none); OK with a formula it cannot read says "That formula can't be read" under
    the field and stays open. It meets the values ticked and the colour as well.
- **Filter views**: **Create Filter View** makes a named filter that changes only the viewer's view; others see it
  in Data › Filter Views and may open it. **Save as Filter View**, **Duplicate**, **Rename**, **Delete**; a link opens
  one. A Viewer may make temporary filter views of their own, as Google's.
- **Slicers**: a floating control over the grid filtering a range by one column (values or condition), Editors place
  it; it filters for everyone.
- **Group by view** (Data › Create Group by View, tables only): groups a table's rows by a column, collapsed and
  expanded per viewer.

## Data validation

Iterated from today's spec ([Data validation](data-validation.md)) to Google's panel: criteria Dropdown, Dropdown
(From a Range), Text Contains, Does Not Contain, Exactly, Is Valid Email, Is Valid URL, Date (is, before, after,
between, valid date), Greater Than and every number comparison, Checkbox (with custom ticked and unticked values),
Custom Formula Is; advanced options **Show a Warning** or **Reject the Input**, help text, and the dropdown's
display style (Chip, Arrow, Plain Text) with option colours. Dropdowns and tick boxes are validation, never chips.

## Named ranges and named functions

- **Named Ranges** panel: each name and range, **Add a Range**, edit, delete. Rules for names as today ([Sheet](sheet.md#named-ranges)),
  but scoped to the workbook.
- **Named Functions** panel: a name, argument placeholders, a definition formula that uses the placeholders by name, a description and argument hints; usable in every cell of the workbook; **Import Function**
  from another spreadsheet the person may read.

## Protected ranges

- **Protect Sheets and Ranges** panel: a range or a sheet (with **Except Certain Cells**), a description, and
  permissions: **Show a Warning When Editing This Range** or **Restrict Who Can Edit**: only the owner, only the
  Editors chosen, or as another range.
- Protection binds to share roles: a protected range is editable only by the people named on it among those whose
  role may edit; a Participant may write into a protected range only if named.
- A protected range shows hatched with View › Show › Protected Ranges.

## Tables

- **Convert to Table** (Format menu or Ctrl+Alt+T): a range becomes a named table with a header row, a column type per
  column (Text, Number, Percent, Currency, Date, Time, Date Time, Dropdown, Checkbox; People and smart chip types are
  left out, C3), alternating colours, a filter, and a total row on request.
- **Table references** in formulas: `Table1[Column]`, `Table1[#ALL]`, `Table1[#HEADERS]`, `Table1[#TOTALS]`, read and
  written as both formats hold them.

## Clean-up, split, randomise, stats

- **Clean-up Suggestions** panel: duplicates, extra spaces, inconsistent formats it finds, each with **Apply**.
- **Remove Duplicates**: columns to compare, "Data has header row"; then "N duplicate rows found and removed".
- **Trim Whitespace**: "N cells trimmed".
- **Split Text to Columns**: splits the selection by a detected separator, with a chip to choose Comma, Semicolon,
  Period, Space, Custom.
- **Randomise Range**: shuffles the rows of a range.
- **Column Stats** panel: a column's counts, sum, average, distribution chart and frequent values.

## Find and replace

- Ctrl+F finds in the sheet (a bar over the grid); Ctrl+H opens **Find and Replace**: find, replace with, search
  (All Sheets, This Sheet, Specific Range), Match Case, Match Entire Cell Contents, Search Using Regular Expressions,
  Also Search Within Formulas, Also Search Within Links; **Find**, **Replace**, **Replace All** ("Replaced N
  instances of …"), **Done**. Regular expressions are bounded as formulas' are.

## Who may do what

- **Editor**: everything here.
- **Participant**: sort and filter only through filter views of their own; writes values through validation; picks
  from dropdowns and ticks tick boxes; finds; never replaces formulas or protected cells unless named.
- **Viewer**: finds, uses filter views of their own, reads named ranges.

## Observability

- `[workbook] range sorted` with the key count and whether the data has a header row (Advanced Range Sorting
  Options).
- `[sheet] filter formula refused` with the column id, when a filter's Custom Formula Is cannot be read.

## Errors and limits

- Up to 200 validation rules, 100 format rules, 100 named ranges, 100 named functions, 50 filter views and 50 slicers
  a sheet; past one, a named rejection (`rules_full`, `names_full`, ...).
- A replace touching more than the write limit is split, one undo step.

## Telemetry

`Spreadsheet · Changed · <Kind>`: `Sort`, `Filter`, `FilterView`, `Slicer`, `Validation`, `NamedRange`,
`NamedFunction`, `Protection`, `Table`, `Cleanup`, `Split`, `Randomise`, `Replace`; `Spreadsheet · Opened · Find`.
