# Data tools

**Status: partly built.** Sort Sheet, Sort Range with its Advanced Range Sorting Options, Create a Filter, Filter by Colour,
every condition of Filter by Condition, and data validation (the Data Validation Rules panel, Insert › Checkbox,
Insert › Dropdown, every criterion, kept in both file formats) and the Named Ranges panel are built; tables are built
as the sheet's model, its writes and growth, and table references in formulas, without their menus and panel yet; the
rest is specified.

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

- **Named Ranges** panel (Data › Named Ranges, and the cell menu's **Define Named Range**), for everyone: every name
  of the workbook in name order, each with its range (`A1:B4` on the open sheet, `Sheet2!A1:B4` on another). Rules
  for names as [Sheet](sheet.md#named-ranges) states, unique in the workbook.
  - Pressing a name selects its range, opening its sheet first when it is another (**Go To**).
  - An Editor's rows carry **Edit** and **Remove** (one undo step); under the list, **Add a Range**.
  - **Add a Range** and **Edit** turn the panel into a form: **Name**, then **Range** (the selection when adding, as
    the name box writes it, following cells picked in the grid until typed over; any sheet's, `Sheet2!A1:B4`, as a Dropdown from a Range's range is typed), **Cancel**
    and **Done**. Done with a name the rules refuse says why under the name (the name box's words); a range it cannot
    read says "Enter a range, like A1:B4 or Sheet2!A1:B4" under the range; either way the form stays.
  - Done renames, moves, or both, as one undo step; moving a name to another sheet takes it off one sheet and puts
    it on the other in the same change. Renaming or removing a name does not rewrite formulas
    ([Formulas](formulas.md#named-ranges)).
  - It opens on the list; an Editor in a workbook with no names opens on Add a Range, as Google's (default, D299).
  - A Participant or Viewer reads the list and goes to a range; with none, "No named ranges."; an Editor's empty
    list says "No named ranges yet."
  - The panel stays open while its Go To opens another sheet.
- **Named Functions** panel (Data › Named Functions), for everyone: the workbook's named functions in name order, each
  its call (`CONTAINS(search_query, search_range)`) and description (how they work out:
  [Formulas](formulas.md#named-functions)).
  - An Editor's rows carry **Edit** and **Remove**; under the list, **Add New Function** and **Import Function**.
  - **Add New Function** and **Edit** turn the panel into a form: **Function Name** (shown and saved in capitals),
    **Function Description**, **Argument Placeholders** (each a field with a remove button, **Add Argument** under
    them), **Formula Definition** (a formula, `=` first), and under **Argument Details**, closed until opened, each
    placeholder's **Description** and **Example**; **Cancel** and **Create** (**Update** when editing).
  - A name: letters, digits and `_`, not starting with a digit, up to 254 characters; not a built-in function's name
    ("SUM is a built-in function"), `TRUE` or `FALSE`, or one that reads as a cell reference; unique among the
    workbook's named functions, case aside ("Another named function is called that"). A placeholder: the same
    characters, not a cell reference, unique in its function; up to 20 (D302).
  - A definition that cannot be read says why under it ("That formula can't be read"), a reference in it is saved
    sheet-qualified and absolute, the open sheet's when it names none ([Formulas](formulas.md#named-functions),
    D301); a placeholder the definition never reads is allowed, as Google's.
  - Create, Update and Remove are each one undo step, on the person's timeline with their cell changes; the list is
    saved whole, so two Editors saving at once keep the later save (D303).
  - Formulas offer the workbook's named functions with the built-in ones as they are typed, with their description and
    each argument's description and example in the function help.
  - **Import Function** opens a picker of the person's other spreadsheets, as Copy To's lists them (newest first,
    searched by name; [Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar), D183), then that spreadsheet's named
    functions in name order, each its call and description and a tick, with **Import All** and **Import** (the ticked
    ones; none ticked, it is dimmed) and **Back** to the picker. Loading says "Loading its named functions…", one
    with none "That spreadsheet has no named functions.", a failed read "Its named functions could not be read."
    with **Try Again**.
  - Importing adds them as one save, one undo step; a function of a name already here takes its place, as Google's.
    A ticked function calling another of that spreadsheet's named functions that is neither ticked nor here says so
    beside it ("Calls TAX, which is not imported"), and imports all the same (its call reads `#NAME?` until it is).
  - A reference in an imported definition reads the sheet of its name here, `#REF!` while there is none, as a sheet
    copied to another spreadsheet does (D184).
  - A Participant or Viewer reads the list; with none, "No named functions."; an Editor's empty list says "No named
    functions yet."
  - Excel files carry them as named `LAMBDA`s both ways; an OpenDocument file holds none, which converting and
    downloading say first ([Named functions in the file](standard-mapping.md#named-functions-in-the-file)).

## Protected ranges

- A **protection** guards a range of a sheet, or a whole sheet (with **Except Certain Cells**: up to 50 ranges left
  open), from writes by those it does not admit. It is kept on its sheet by row and column ids, as a named range is, so
  it grows with rows and columns inserted inside it (by those it admits) and follows moves; a sheet may hold up to 100
  (default, D345).
- Its **permission** is one of three, bound to [share roles](../013-workspace/share-roles.md) (the Director's ruling,
  2026-11-27):
  - **Show a Warning When Editing This Range**: everyone who may write may write there, after a warning.
  - **Only the Owner**: only the spreadsheet's owner writes there.
  - **Editors Only**: Editors and the owner write there; a Participant never does, though it may write elsewhere.
- **Named people are a gap, by reason**: Google's Restrict Who Can Edit names people by their accounts; LiveDoc shares
  by role, through links, never by person, and its room is never told who a guest is. Naming people waits for
  per-person sharing ([Parity matrix](parity-matrix.md)).
- **Protect Sheets and Ranges** panel (Data › Protect Sheets and Ranges; a range's and a header's context menu
  **Protect Range**, a sheet tab's **Protect Sheet**), for everyone:
  - The list: each protection by its description, else its range (`Sheet1!A1:B4`) or its sheet (`Sheet1`), with its
    permission's short name (**Warning**, **Owner**, **Editors**), in sheet order then position; a click selects it.
    Empty: "No protected sheets or ranges." (an Editor's: "Nothing is protected yet."). Participants and Viewers read
    it.
  - **Add a Sheet or Range** (an Editor): **Range** or **Sheet**; Range takes the selection (or any sheet's range
    typed, `Sheet2!A1:B4`), Sheet a sheet (the active one first) with **Except Certain Cells** (a list of its ranges,
    **Add Another Range**); **Description** (up to 200 characters); **Permissions**, the three choices as radio
    buttons, Editors Only chosen first (default, D345); **Done** and **Cancel**. A range that cannot be read, or an
    exception off its sheet, says "That range can't be read".
  - **Edit** and **Remove** (trash, "Remove this protection?" with **Remove** and **Cancel**): an Editor, on a
    protection that admits them (an Only the Owner one is the owner's alone). Each change is one undo step.
- **The warning** (Show a Warning): "Heads up! You're trying to edit part of this sheet that shouldn't be changed
  accidentally. Edit anyway?" with **Cancel** and **OK**; OK lets the person write there for the rest of their visit
  to the spreadsheet (until they reload or leave it), one range at a time, as Google's (default, D353). Cancel leaves
  the cells as they were. An agent's changeset is never asked: it lands, and the room logs it
  (`[sheets] protection.warned`).
- **Refused**: a write a protection does not admit is refused whole by the room with `protected` (403) and "This
  range is protected: only the owner can change it." (or "only Editors can"), shown as a toast; the grid puts the
  cells back. The hatching never decides: the room does, for every write path (default, D347):
  - cell writes: typing, clearing, paste of every kind, fill, drag, sort of a range, find and replace, a dropdown or
    tick box, a form's response row (written as the form's owner, so admitted);
  - a protected range: a cell's value or format in it; rows or columns inserted between its first and last, or any of
    its rows or columns deleted, moved or sorted (a sort reorders rows); a merge, validation rule, format rule or
    alternating colours over any of its cells;
  - a protected sheet: every write to it but cell writes inside its exceptions: its rows, columns, title, rules,
    merges, frozen lines, filters, charts; deleting or hiding it;
  - a filter's own view (its conditions hide rows, change no cell) is anyone's who may filter; sorting from a
    filter's menu is a sort;
  - agent changesets (planned writes, checked one by one, the whole changeset refused at the first), and File ›
    Import's locations into this spreadsheet as they are built (Replace Spreadsheet, Replace Current Sheet, Append,
    Replace Data at Selected Cell).
- **Show › Protected Ranges** (View, on by default, the viewer's own) hatches every protected range and sheet the
  viewer may not write freely (a warning one included), with diagonal lines in the theme's secondary text colour at 25%
  opacity, under the selection, never the cells' text.
- A duplicated sheet, and a sheet copied to another spreadsheet, leave their protections behind, as named ranges are
  (default, D348). `CELL("protect", A1)` is 1 for a cell any protection covers, a warning one too, 0 otherwise
  ([Formulas](formulas.md), D42).
- **Files** ([Protection in the file](standard-mapping.md#protection-in-the-file)): a file's protection, a password
  hash with it or not, is read as protection with no password: LiveDoc never asks for a password nor checks one, and
  the owner (or an Editor, as the permission admits) may remove it. A hash LiveDoc read is written back to a file of
  its own format; LiveDoc never writes one it did not read. Converting and downloading to the other format list it.
- Share roles: Editor adds, edits and removes protections that admit them; Participant writes only where admitted
  (never under Editors Only or Only the Owner); Viewer reads the panel and the hatching. Telemetry:
  `Sheet · Changed · Protection`, as each sheet change names its kind.

## Tables

A **table** gives a range a name, a header row, a type per column and a look, as Google Sheets' tables do. It is the
sheet's, seen by everyone, kept by row and column ids as a named range is.

- **Convert to Table** (Format › Convert to Table, the cell and column header menus, Ctrl+Alt+T; Insert › Table on an
  empty selection), an Editor's alone: the selection (the data region around the active cell when it is one cell,
  as Create a Filter takes it) becomes a table at once, one change, one undo step:
  - its first row the **header row**, the rest its **data rows** (at least one: a one-row selection takes the row
    below as its first data row);
  - named **Table1**, **Table2**, ... (the first free in the workbook);
  - each column's type guessed from its data cells: Number, Percent, Currency, Date, Time, Date Time or Checkbox when
    every filled one is that, else Text; a column with no filled cell **None** (D381);
  - its look an [alternating colours](formatting.md#alternating-colours) banding over the table, the table's own, in
    the first default style, the header on, the footer on with a total row (D382);
  - then the **Table Settings** panel opens on it.
  - Refused, with a toast and nothing changed: a range touching another table ("Tables can't overlap"), holding a
    merge ("Unmerge cells before making a table"), touching a banding not wholly inside it ("Alternating colours
    can't overlap"; one wholly inside is replaced by the table's), or past the sheet's 50 tables (D380).
- **Names**: a table's name is 1 to 255 characters of letters, digits, underscores and spaces, not starting with a
  digit, not TRUE or FALSE, not reading as a cell (`A1`, `R1C1`); unique among the workbook's tables and named ranges,
  case aside and a space read as an underscore (Google's rules). Formulas write it with underscores (`Project_roadmap`).
- **Columns**: a column's name is its header cell's text as entered (a number's as typed), trimmed; a blank or a
  formula header reads **Column N** (N its place in the table), and a name an earlier column already has, case aside,
  takes the smallest number from 2 that frees it (`Amount2`), as Excel's (D383).
- **Column types**: None, Text, Number, Percent, Currency, Date, Time, Date Time, Dropdown (its options, as a
  dropdown rule's) and Checkbox; People and the smart chip types are left out (C3).
  - Number, Percent, Currency, Date, Time and Date Time give the column's data cells their number format when set;
    Dropdown and Checkbox draw their cells as a dropdown's chips and a tick box, as validation draws them, without a
    rule of their own.
  - A data cell whose value is not its column's type (text in a Number column, an option not in a Dropdown's) is
    **flagged and kept**, as Google's: its value stays, a warning triangle marks it and its hover card says
    "Expected a number" (a date, a time, a date and time, one of the options, a tick box value). An empty cell and an
    error are never flagged (D384).
- **Growth**: a value typed (or pasted) into the row directly below a table, inside its columns, grows the table by
  that row, as Google's; the growth and the value are one change, so one undo takes both back. A table never grows
  over a row holding a protected range or another table's cells, nor while it has a total row (the row below a total
  row is outside it). Rows inserted inside a table join it; deleted rows and columns shrink it, and a table whose
  header row or every data row is deleted goes.
- **Total row** (Table Settings): the table's last row becomes its footer, `Total` in its first column and
  `=SUBTOTAL(109, Table1[Column])` under each Number, Percent or Currency column, ordinary cells that may be changed;
  turning it off makes that row a data row again, its cells kept (D385).
- **Table menu** (a chip over the header row's first cell: the table's name and a menu): **Rename** (the name in
  place), **Table Settings**, **Select Table**, **Convert to Range** (the table goes, its cells and look kept as plain
  cells and a banding; formulas reading it read the same cells as plain ranges), **Delete Table** (its cells and
  look go); views per box 1 ([Filters, filter views and slicers](#filters-filter-views-and-slicers)).
- **Column menu** (a button on each header cell, Ctrl+Alt+\ on a cell of the table): **Edit Column Type** (the types
  as a list, a Dropdown's options as the dropdown rule's form), **Sort A to Z**, **Sort Z to A** (the data rows only,
  one undo step), **Insert 1 Column Left**, **Insert 1 Column Right**, **Delete Column**.
- **Table Settings** panel (the office shell's right panel): **Table Name**, **Range** (an A1 range, the header row
  first; refused as Convert to Table refuses), each column's **Type**, **Total Row**, and **Table Formatting** (the
  table's banding in the Alternating Colours panel); **Done** and × close it. Every change writes at once, one undo
  step each.
- **Table references** in formulas ([Formulas](formulas.md#table-references)) read and follow the table.
- **Files**: [Tables in the file](standard-mapping.md#tables-in-the-file).
- Copies: a duplicated sheet's or copied sheet's tables are renamed to the next free names; a table's banding goes
  with it; Clear Sheet leaves the tables, their cells cleared.

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
  from dropdowns and ticks tick boxes; grows a table by a value typed below it (D388), changing nothing else of it; finds; never replaces formulas or protected cells unless named.
- **Viewer**: finds, uses filter views of their own, reads named ranges and goes to them.

## Observability

- `[workbook] range sorted` with the key count and whether the data has a header row (Advanced Range Sorting
  Options).
- `[sheet] filter formula refused` with the column id, when a filter's Custom Formula Is cannot be read.
- `[workbook] named functions saved` with their count (the api), and `[workbook] named function refused` with the
  field (`name`, `description`, `argument`, `definition`) when Create or Update cannot save; a save the api refuses
  or cannot reach is toasted and the form stays open.
- `[workbook] named range moved` when a name's range moves to another sheet, and `[workbook] named range refused`
  with the reason (`name`, `range`) when Done cannot save.
- `[sheet] table refused` with the reason (`overlap`, `merge`, `banding`, `name`, `full`) when Convert to Table,
  Table Settings or a write cannot make or change a table; `[sheet] table grew` with the rows it grew by.

## Errors and limits

- Up to 200 validation rules, 100 format rules, 100 named ranges, 100 named functions, 50 filter views, 50 slicers
  and 50 tables a sheet; past one, a named rejection (`rules_full`, `names_full`, ...).
- A replace touching more than the write limit is split, one undo step.

## Telemetry

`Spreadsheet · Changed · <Kind>`: `Sort`, `Filter`, `FilterView`, `Slicer`, `Validation`, `NamedRange`,
`NamedFunction`, `Table`, `Cleanup`, `Split`, `Randomise`, `Replace`; `Spreadsheet · Opened · Find`.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D380** A sheet's tables: up to 50, as filter views and slicers, a table up to the sheet's columns wide; past it,
  `tables_full` (default).
- **D381** Convert to Table's guessed column types: a type when every filled data cell is that type, else Text; a
  column with none filled None, as Google guesses (default).
- **D382** A table's look: the alternating colours banding over it, the table's own, in the first default style; it
  grows, shrinks and goes with the table, and Table Formatting edits it (default).
- **D383** A table's column names: the header's text as entered, a blank or formula header `Column N`, a repeat
  numbered from 2, as Excel's; the header cell is never rewritten (default).
- **D384** A wrong type in a table column: flagged and kept, as Google's; empty cells and errors are never flagged
  (the Director's ruling, 2026-11-27).
- **D385** A total row: the table's last row, `Total` and `SUBTOTAL(109, ...)` under its number columns, as Excel's
  total row; its cells ordinary cells (default).
- **D386** This-row references (`[@Amount]`): read and computed, though Google reads none, so a file's formulas keep
  working (the Director's ruling, 2026-11-27).
- **D387** A table read from another app's file: its columns None, its look the file's own cell formats (default).
- **D388** Growth by a Participant's value: the value and the growth are one change, as anyone's; a Participant
  changes no other part of a table (the Director's ruling, 2026-11-27). Why: adding a row of data is the commonest
  thing a Participant does with a table; the growth is the consequence of their value, not a reshape they chose, and
  it undoes with it. Two limits keep "never reshape" true: growth only ever adds the one row the value sits in (never
  a rename, a column, a type or the total row), and never crosses into a protected range. The room judges a
  Participant's layout write as exactly the growth its own cells make, or that growth taken back by their undo
  clearing a value in the row it gives up; anything else is refused (403, `[sheets] sheet.table_growth.refused`).
- **D302** A named function's limits: a name up to 254 characters (Google's), up to 20 placeholders, a definition up
  to 2,000 characters, a description up to 1,000, an argument's description and example up to 200 each (default).
- **D345** A protection's bounds: up to 100 a sheet, 50 exceptions a protected sheet, a description up to 200
  characters; kept by row and column ids as a named range is; a new one's permission Editors Only, as Only the Owner
  would shut out the Editor making it (default).
- **D353** How long Show a Warning's OK holds: for that range, until the person reloads or leaves the spreadsheet, as
  Google's "for the rest of this session"; an agent's changeset is never asked, only logged (default).
- **D347** What a protection refuses: every write to its cells or their formats, rows or columns inserted inside it,
  its rows or columns deleted, moved or sorted, merges and rules over it; a protected sheet every write but cells in
  its exceptions; a filter's conditions pass, its sort does not (default).
- **D348** A protected sheet duplicated or copied: the copy is unprotected, as named ranges stay behind (D298)
  (default).
- **D303** Two Editors saving named functions at once: The list is saved whole and the later save stands, as File ›
  Settings' do (default).
- **D299** Where the Named Ranges panel opens: On the list; on Add a Range for an Editor while the workbook has no
  names, as Google's (default).
