# Data tools

**Status: partly built.** Sort Sheet, Sort Range with its Advanced Range Sorting Options, Create a Filter, Filter by Colour,
every condition of Filter by Condition, and data validation (the Data Validation Rules panel, Insert › Checkbox,
Insert › Dropdown, every criterion, kept in both file formats) and the Named Ranges panel are built; tables are built
as the sheet's model, its writes and growth, and table references in formulas, without their menus and panel yet;
Remove Duplicates, Trim Whitespace, Randomise Range and Split Text to Columns are built; the rest is specified.

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
    every filled one is that, else Text; a column with no filled cell **None** (D441);
  - its look an [alternating colours](formatting.md#alternating-colours) banding over the table, the table's own, in
    the first default style, the header on, the footer on with a total row (D442);
  - then the **Table Settings** panel opens on it.
  - Refused, with a toast and nothing changed: a range touching another table ("Tables can't overlap"), holding a
    merge ("Unmerge cells before making a table"), touching a banding not wholly inside it ("Alternating colours
    can't overlap"; one wholly inside is replaced by the table's), or past the sheet's 50 tables (D440).
- **Names**: a table's name is 1 to 255 characters of letters, digits, underscores and spaces, not starting with a
  digit, not TRUE or FALSE, not reading as a cell (`A1`, `R1C1`); unique among the workbook's tables and named ranges,
  case aside and a space read as an underscore (Google's rules). Formulas write it with underscores (`Project_roadmap`).
- **Columns**: a column's name is its header cell's text as entered (a number's as typed), trimmed; a blank or a
  formula header reads **Column N** (N its place in the table), and a name an earlier column already has, case aside,
  takes the smallest number from 2 that frees it (`Amount2`), as Excel's (D443).
- **Column types**: None, Text, Number, Percent, Currency, Date, Time, Date Time, Dropdown (its options, as a
  dropdown rule's) and Checkbox; People and the smart chip types are left out (C3).
  - Number, Percent, Currency, Date, Time and Date Time give the column's data cells their number format when set;
    Dropdown and Checkbox draw their cells as a dropdown's chips and a tick box, as validation draws them, without a
    rule of their own. A column made Dropdown offers its values as they read, once each, in their order (D449).
  - The type's rule is the table's, never a rule of the sheet's: a rule the sheet holds over the same cells comes
    first, and the type's grows, shrinks and goes with the table.
  - A data cell whose value is not its column's type (text in a Number column, an option not in a Dropdown's) is
    **flagged and kept**, as Google's: its value stays, a warning triangle marks it and its hover card says
    "Expected a number" (a date, a time, a date and time, one of the options, a tick box value). An empty cell and an
    error are never flagged (D444).
- **Growth**: a value typed (or pasted) into the row directly below a table, inside its columns, grows the table by
  that row, as Google's; the growth and the value are one change, so one undo takes both back. A table never grows
  over a row holding a protected range or another table's cells, nor while it has a total row (the row below a total
  row is outside it). Rows inserted inside a table join it; deleted rows and columns shrink it, and a table whose
  header row or every data row is deleted goes.
- **Total row** (Table Settings): the row below joins the table as its total row, as Excel's, `Total` in its first
  column and `=SUBTOTAL(109, Table1[Column])` under each Number, Percent or Currency column, ordinary cells that may be
  changed, its banding's footer on; refused while that row holds anything, is another table's or a protected range's
  ("Make room below the table for its total row"). Turning it off makes that row a data row again, its cells kept
  (D445).
- **Table menu** (the Director's ruling, 2026-11-27, as Google's): a chip over the header row's first cell (on it when
  the header is the sheet's first row) with the table's name and ▾, seen by everyone. Pressing it, or Enter or Space
  on it, opens the menu, its items moved by the arrow keys: **Table Settings** (the active cell put in the table, the
  panel opened), **Rename** (the name edited in place on the chip; Enter keeps it, Escape leaves it, a name the rules
  refuse is said in a toast), **Select Table**, **Convert to Range** (the table goes, its cells and look kept as plain
  cells and a banding; formulas reading it read the same cells as plain ranges, one undo step), **Delete Table** (its
  cells and look go). Rename, Convert to Range and Delete Table are an Editor's, dimmed for anyone else; views join
  the menu with box 1 ([Filters, filter views and slicers](#filters-filter-views-and-slicers)).
- **Column menu** (a ▾ button at the right end of each header cell, seen by everyone, reached by Tab as the chip is;
  Ctrl+Alt+\ on a cell of the table opens the active cell's column's), under the column's name:
  - **Edit Column Type**: the types as a list, None first, the column's own ticked; choosing one sets it at once.
    Dropdown opens the dropdown rule's options form on the column's options (its values as they read when it has
    none, D449): each option's text and colour, reordered, removed, added; **Done** sets the type with them, refusing
    none or a repeat as the rule's form does, and **Cancel** goes back to the list.
  - **Sort A to Z**, **Sort Z to A**: the table's data rows by the column, the header and total rows staying put,
    one undo step.
  - **Insert 1 Column Left**, **Insert 1 Column Right**: a sheet column beside it, as the column header's menu
    inserts; one beside the table's first or last column joins the table, one undo step (D450).
  - **Delete Sheet Column**: the whole sheet column, as the column header's menu deletes, named so because cells
    beside the table in that column go with it; the table shrinks, and goes with its last column (D450).
  - Every item is an Editor's, dimmed for anyone else, as the table menu's are; the menu's items move by the arrow
    keys, Escape closing it.
- **Table Settings** panel (the office shell's right panel), the settings of the table holding the active cell under
  its name ("Select a cell in a table to see its settings." outside one): **Range** (an A1 range, the header row
  first; refused as Convert to Table refuses, "Type a range like A1:D20, a header row and a data row at least"),
  **Column Types** (each column's name and its type), **Total Row**, **Table Formatting** (the table's banding in the
  Alternating Colours panel); **Done** and × close it. What acts on the table is the table menu's, never repeated
  here. Every change writes at once, one undo step each; a Participant or a Viewer reads it, its fields read-only.
- **Table references** in formulas ([Formulas](formulas.md#table-references)) read and follow the table.
- **Files**: [Tables in the file](standard-mapping.md#tables-in-the-file).
- Copies: a duplicated sheet's or copied sheet's tables are renamed to the next free names, as Google's: each its own
  name, an underscore and the smallest number from 2 that frees it in the workbook (`Sales_2`, `Sales_3`, D451);
  formulas in the copy reading its tables read the copy's; a table's banding goes with it; Clear Sheet leaves the
  tables, their cells cleared.
- Pasted tables: an Editor's plain paste (Paste, Ctrl+V; never Paste Special) of copied cells holding a table's header
  row makes a new table where they land, as Google's paste does (D454): the table's copied columns, from its header
  row to the last copied row of it, with their types, dropdown options and banding colours, its total row when its
  last row was copied, named the first free `TableN` (D451); several tables copied make one each. A copy of a
  table's data rows alone makes none.
- A cut of a whole table moves it, as Excel's (D454): its id, name, types, total row and banding go with its cells,
  so formulas reading it read it where it lands, on this sheet or another; one undo puts it back. A cut of part of a
  table moves cells only, the table keeping its range.
- A new or moved table that would overlap a table, cross a merge or an alternating colours range, start in the row
  directly below a table (which grows it) or pass a sheet's 50 is not set down, the cells still pasted; a moved one
  stays where it was.

## Clean-up, split, randomise, stats

Data › Data Clean-up, Data › Split Text to Columns, Data › Randomise Range and Data › Column Stats, as Google's
(measured with the Sheets API, `plans/assets/0020/research/google-cleanup-probe.ts`, 2026-11-27, D460). Each works on
the selection's last range (the active range), one change and one undo step; a range under a protection that does not
admit the caller is refused whole with the protection's own words, as a sort is (D347).

### Remove Duplicates

- **Data › Data Clean-up › Remove Duplicates** opens a dialog titled **Remove Duplicates**: `Selected range: A1:C10`,
  **Data has header row** (unticked at first, as Google's), **Columns to analyse**
  with **Select All** and one tick box a column, `Column A` or, with a header row, `Column A - Name`; **Cancel** and
  **Remove Duplicates** (dimmed while no column is ticked).
- One cell selected: the range is the filled block around it, as Create a Filter's.
- Rows compare by the ticked columns' values, as Google's: text case aside (`A` is `a`), a number by its value
  whether typed or worked out (`1`, `=0+1`), spaces counting (`a ` is not `a`), an empty cell equal to an empty cell,
  so blank rows are duplicates of each other; the first row of each set is kept.
- The kept rows move up inside the range in their order and the rows left at its foot are cleared (values, formulas
  and formats); cells beside the range never move. A formula moving up is shifted with its row, as Sort Range's.
- Then the dialog says `3 duplicate rows found and removed. 7 unique rows remain.` (singular `1 duplicate row`, none
  `No duplicate rows found.`) with **OK**.
- A merge across the range's rows refuses, as Sort Range does.

### Trim Whitespace

- **Data › Data Clean-up › Trim Whitespace** trims every cell of the range that holds typed text, as Google's: spaces
  at either end go, runs of spaces inside become one, other Unicode spaces at the ends go too (an em space), a
  no-break space, a tab and a line break inside are kept, a formula is left as it is, and text stays text (`' 7 `
  becomes the text `7`, never the number).
- A toast says `3 cells trimmed` (`1 cell trimmed`, none `No whitespace to trim`) (D461).

### Split Text to Columns

- **Data › Split Text to Columns** splits the selected column's cells into the columns to their right, at once, by
  the separator found (Detect Automatically), and shows a **Separator** chip under the range's last cell: **Detect
  Automatically**, **Comma**, **Semicolon**, **Period**, **Space**, **Custom**. Choosing one splits the original text
  again: rows it leaves whole get their text back and the earlier split's cells clear; each choice is a change of its
  own, Undo stepping back through them (D468). Custom shows a text field (`Custom separator`) that splits on Enter.
  The chip shows while the active cell stays in the range on that sheet; Escape in it or another split puts it away.
- More than one column refuses with Google's words: `You cannot split data that spans more than one column.`
- Detect Automatically splits at commas only, as Google's (`a;b` stays whole); a space after a comma goes with it
  (`a, b` becomes `a` and `b`) (D462). Space makes each space a separator (`a  b` gives `a`, an empty cell, `b`).
- A piece in double quotes keeps its separators (`"x,y"` gives `x,y`); each piece is read as if typed (`1` a number,
  `2024-01-05` a date); a formula is split by its value and replaced by the pieces; a number or a cell with no
  separator stays as it is.
- The block to the right is written as wide as the most pieces a row has: shorter rows clear the rest of it. When that
  block holds anything, a dialog asks first: **Replace Data?**, `Splitting will replace data in the cells to the
right.`, **Cancel** and **Replace** (D463). A block reaching past the sheet's last column adds the columns, as a
  paste does, up to the sheet's column limit, past which it refuses: `There is not enough room to split this data.`
  A choice on the chip asks the same only for cells past the block the earlier split wrote.

### Randomise Range

- **Data › Randomise Range** (and the cell and column context menus' View More Actions) shuffles the range's rows,
  each row's cells moving together, inside the range only, as Google's: a one-column range shuffles that column.
- A range of fewer than two rows changes nothing; a merge across its rows refuses, as Sort Range does.
- The shuffle draws from `crypto.getRandomValues`, so every order is equally likely (D464).

### Column Stats

- **Data › Column Stats** (and the context menus) opens the **Column Stats** panel on the right for the active
  column: a column switcher (`Column B`, with the header's text beside it; previous and next buttons), **Ignore
  rows** (header rows left out, a stepper from 0, starting at the sheet's frozen rows), then:
  - **Count** (cells filled), **Empty**, **Unique** (case aside, as Remove Duplicates compares);
  - for a column holding numbers: **Sum**, **Average**, **Median**, **Min**, **Max**, over its numbers only;
  - **Distribution**: a bar chart of the most frequent values (up to 10 bars, the rest as `Other`), or, for a column
    mostly numbers, a histogram of 10 equal bins;
  - **Frequency**: the values and their counts, most frequent first, up to 20, with **Most Frequent** and **Least
    Frequent** to turn the order (D465).
- It reads the column's values as shown (a formula's result), follows edits as they land, and changes nothing.
- An empty column says `This column is empty.`

### Clean-up Suggestions

- **Data › Data Clean-up › Clean-up Suggestions** opens the **Clean-up Suggestions** panel on the right over the open
  sheet's used range below its frozen rows: one card a kind found, each with what it found, **Apply** and a ×
  to set it aside until the panel next opens (D466):
  - `Remove duplicates`: `3 duplicate rows in A1:C10`; Apply runs Remove Duplicates over that range, every column
    compared.
  - `Trim whitespace`: `5 cells with extra spaces in A1:C10`; Apply runs Trim Whitespace over it.
  - `Inconsistent number format`: `4 numbers stored as text in column B`, for a column whose filled cells are mostly
    numbers yet some hold a number as text; Apply reads those as typed (they become numbers).
- With nothing found: `No suggestions right now. Your data looks clean.` The panel follows edits as they land.
- A link at the foot, **Column Stats**, opens that panel.

### Limits and words

- Each works within the sheet's limits ([Sheet store](sheet-store.md)); a write past them is refused with its named
  rejection, nothing changed.
- Remove Duplicates compares up to the sheet's cells (50,000), keyed by a string per row, linear in the range.
- Column Stats and Clean-up Suggestions read at most the used range, recomputed once a change lands, never per
  keystroke.

## Find and replace

- **Ctrl+F** opens the **Find** bar on the open sheet, a Plan Sheet's ([Find](sheet.md#find)), with **More Options**
  (⋮) opening Find and Replace on what it holds.
- **Ctrl+H** (⌘+Shift+H on a Mac) and **Edit › Find and Replace** open the **Find and Replace** dialog: **Find**,
  **Replace With**, **Search** (**All Sheets**, **This Sheet**, **Specific Range**, the last with a range field holding
  the selection, as `Sheet1!A1:D10`), **Match Case**, **Match Entire Cell Contents**, **Search Using Regular
  Expressions**, **Also Search Within Formulas**, **Also Search Within Links**; **Find**, **Replace**, **Replace All**
  and **Done** (Escape too). It stays open as sheets change, and keeps what was typed while the spreadsheet is open.
- What matches, as Google's (D455):
  - Case aside unless Match Case, a regular expression too.
  - Find looks in what a cell shows; with Also Search Within Formulas, in a formula's text too; with Also Search
    Within Links, in a link's address (a `HYPERLINK`'s, D459).
  - Match Entire Cell Contents: the whole text must match (a regular expression whole: `a+` matches `aaa`, never
    `banana`), and the whole is replaced.
  - Regular expressions are RE2's, as `REGEXMATCH` reads them, bounded as formulas' are; in Replace With `$0` is
    the match, `$1` on its groups, `$$` a dollar sign, a backslash plain text (D456). A pattern RE2 refuses says
    "Enter a valid regular expression" under Find, and Find, Replace and Replace All dim.
- Replace changes what a cell holds, as its edit text (a number as `101`, a date as typed), read again as typed: `101`
  with each 1 replaced by 2 is the number 202, text replaced by `42` the number 42. A formula changes only with Also
  Search Within Formulas, in its text; a formula's result is never replaced, so Replace passes over a match only in
  one.
- **Find** goes to the next match after the active cell, row by row, the open sheet first, then (All Sheets) the next
  in the sheet bar's order, hidden sheets passed over; past the last it starts again at the first, saying "No more
  results, looping around"; with none, `No results for "pen"` (D457).
- **Replace** replaces in the match it is on and goes to the next; with none found yet it finds first.
- **Replace All** replaces every match the search reaches, hidden sheets too, as Google's does, as one change and one
  undo step across sheets, and says `Replaced 12 instances of "a" with "X"`, counting each match in each cell as
  Google counts; with none, `No results for "a"`. Values are checked against the sheets' validation
  ([Where values are checked](data-validation.md#where-values-are-checked)).
- An Editor finds and replaces; a Participant replaces values only (Also Search Within Formulas finds, never
  replaces); anyone's cells under a protection that does not admit them are left as they are and counted after the
  line (`2 protected cells were left as they were`, D458); a Viewer's dialog has Find and Done only.

## Who may do what

- **Editor**: everything here.
- **Participant**: sort and filter only through filter views of their own; writes values through validation; picks
  from dropdowns and ticks tick boxes; grows a table by a value typed below it (D448), changing nothing else of it;
  finds; replaces values, never formulas, and never in cells a protection keeps from them (D458); reads Column Stats.
  Remove Duplicates, Trim Whitespace, Split Text to Columns, Randomise Range and Clean-up Suggestions are an
  Editor's, as they move or rewrite cells and formulas (D467).
- **Viewer**: finds, uses filter views of their own, reads named ranges and goes to them, reads Column Stats.

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
  Table Settings, a paste or a write cannot make or change a table (a paste's also with `paste`); `[sheet] table
grew` with the rows it grew by.
- `[sheet] duplicates removed` with the rows compared, the columns ticked, the rows removed and whether a header row
  was kept; `[sheet] whitespace trimmed` with the cells trimmed; `[sheet] text split` with the separator, the rows
  and the widest row's pieces; `[sheet] range randomised` with the rows; `[sheet] clean-up refused` with the tool
  and the reason (`columns`, `merge`, `protected`, `full`); `[sheet] clean-up suggested` with each kind's count
  when the panel opens.
- `[workbook] find replaced` with the instances, cells and sheets changed, the protected cells left and whether a
  regular expression searched (never the text); `[workbook] find refused` with the reason (`regex`, `costly`).

## Errors and limits

- Up to 200 validation rules, 100 format rules, 100 named ranges, 100 named functions, 50 filter views, 50 slicers
  and 50 tables a sheet; past one, a named rejection (`rules_full`, `names_full`, ...).
- A replace touching more than the write limit is split, one undo step.

## Telemetry

`Spreadsheet · Changed · <Kind>`: `Sort`, `Filter`, `FilterView`, `Slicer`, `Validation`, `NamedRange`,
`NamedFunction`, `Table`, `Cleanup` (Remove Duplicates, Trim Whitespace, a suggestion applied), `Split`,
`Randomise`, `Replace`; `Spreadsheet · Opened · Find`.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D440** A sheet's tables: up to 50, as filter views and slicers, a table up to the sheet's columns wide; past it,
  `tables_full` (default).
- **D441** Convert to Table's guessed column types: a type when every filled data cell is that type, else Text; a
  column with none filled None, as Google guesses (default).
- **D442** A table's look: the alternating colours banding over it, the table's own, in the first default style; it
  grows, shrinks and goes with the table, and Table Formatting edits it (default).
- **D443** A table's column names: the header's text as entered, a blank or formula header `Column N`, a repeat
  numbered from 2, as Excel's; the header cell is never rewritten (default).
- **D444** A wrong type in a table column: flagged and kept, as Google's; empty cells and errors are never flagged
  (the Director's ruling, 2026-11-27).
- **D445** A total row: the row below the table joins it, `Total` and `SUBTOTAL(109, ...)` under its number columns,
  as Excel's total row; its cells ordinary cells (default).
- **D446** This-row references (`[@Amount]`): read and computed, though Google reads none, so a file's formulas keep
  working (the Director's ruling, 2026-11-27).
- **D447** A table read from another app's file: its columns None, its look the file's own cell formats (default).
- **D448** Growth by a Participant's value: the value and the growth are one change, as anyone's; a Participant
  changes no other part of a table (the Director's ruling, 2026-11-27). Why: adding a row of data is the commonest
  thing a Participant does with a table; the growth is the consequence of their value, not a reshape they chose, and
  it undoes with it. Two limits keep "never reshape" true: growth only ever adds the one row the value sits in (never
  a rename, a column, a type or the total row), and never crosses into a protected range. The room judges a
  Participant's layout write as exactly the growth its own cells make, or that growth taken back by their undo
  clearing a value in the row it gives up; anything else is refused (403, `[sheets] sheet.table_growth.refused`).
- **D449** A column made Dropdown: its options are its data cells' values as they read, once each (case aside), in
  their order, up to a dropdown's 500 (default).
- **D450** The column menu's Insert 1 Column Left and Right insert a whole sheet column, as the column header's menu
  does, one beside the table's first or last column joining the table; Delete Sheet Column deletes the whole sheet
  column, its label saying so, so nobody loses cells beside the table by surprise (LiveDoc's own; the Director's
  ruling, 2026-11-27). Evidence: Google's help ("Use tables in Google Sheets") names the column menu but not what its
  insert and delete reach, and the Sheets API has no table-column request: a table's own cells deleted or inserted
  with `deleteRange`/`insertRange` (shifting columns) shrink or widen the table (an inserted column reads
  `Column 1`) and shift the cells beside it in those rows (`plans/assets/0020/research/google-table-probe.ts`,
  2026-11-27).
- **D451** A copied table's name, as Google's: its own name, an underscore and the smallest number from 2 that frees it
  among the workbook's tables and named ranges (`Sales` to `Sales_2`, then `Sales_3`); a table's whole range pasted
  elsewhere makes a new table named the first free `TableN`. Evidence: the Sheets API's `duplicateSheet` of a sheet
  holding `Sales` twice gave `Sales_2` and `Sales_3`; `copyPaste` of the table's range gave `Table1`
  (`plans/assets/0020/research/google-table-probe.ts`, 2026-11-27).
- **D454** Which pastes make or move a table. A copy, as Google's: a plain paste of cells holding a table's header row
  makes the next `TableN` over the table's copied columns from its header to the last copied row, types, dropdown
  options, banding and total row kept; data rows alone, Paste Special's items and a paste onto a table make none.
  Evidence: the Sheets API's `copyPaste` of `Sales` A1:B4: whole, A1:B2, A1:A4, A1:B1 and A1:C4 each made the next
  `TableN` over the table's part, types and banding kept; A2:B3 and B2 made none; `PASTE_VALUES`, `PASTE_FORMAT`,
  `PASTE_FORMULA`, `TRANSPOSE` and `PASTE_NO_BORDERS` made none; onto A2 it grew `Sales`
  (`plans/assets/0020/research/google-table-paste-probe.ts`, 2026-11-27). A cut, LiveDoc's own (the Director's
  ruling, 2026-11-27): a whole table moves, as Excel's, since a person who cuts expects it to leave and an emptied
  table left behind would point every `Table1[Col]` at blanks; a part moves cells only. The API's `cutPaste` made a
  new `Table3` and left `Sales` emptied, but it is a range operation, not what the editor does; Google's editor is
  unverified, and a capture that differs reopens this. Not measured, LiveDoc's own: a paste starting in the row
  directly below a table grows it and makes none, and a paste repeated over a larger selection sets its tables down
  once, at its first copy (default).
- **D455** What Find and Replace matches, as Google's: case aside unless Match Case, regular expressions too; Replace in
  the cell's edit text read again as typed (a number stays a number, a date moves by its text); formulas only with
  Also Search Within Formulas; Match Entire Cell Contents whole cells; Replace All counts matches, not cells; All
  Sheets reaches hidden sheets. Evidence: the Sheets API's `findReplace` on a probe workbook (`101` to `202`,
  `2024-01-05` to `1999-01-05`, `="a"&"b"` untouched without `includeFormulas`, `a` over six cells counted 12
  occurrences, a hidden sheet replaced) (`plans/assets/0020/research/google-find-replace-probe.ts`, 2026-11-27).
- **D456** Replace With's grammar under regular expressions, as Google's: `$0` the match, `$1` on its groups, `$$` a
  dollar sign, a backslash and any other `$` plain text. Evidence: `(an)` replaced by `<$0|\1|$$>` gave
  `<an|\1|$>` (the same probe). A `$` and a number past the pattern's groups is plain text (default).
- **D457** Find's order and words: row by row from the active cell, the open sheet then the sheet bar's order,
  hidden sheets passed over, looping at the end; "No more results, looping around" and `No results for "x"`
  (default; the Sheets API has no Find to measure).
- **D458** Replace and who may write: a Participant replaces values only, never a formula's text; anyone's cells under a
  protection that does not admit them are left and counted, so a Replace All still replaces the rest, as typing would
  refuse them one by one (default).
- **D459** Also Search Within Links: finds a cell by its link's address, a `HYPERLINK`'s worked out; the address
  changes only as formula text, under Also Search Within Formulas, as Google's `findReplace` changed
  `http://a.example` only with `includeFormulas` (the same probe; default for finding).
- **D460** Data clean-up, split and randomise as Google's, measured with the Sheets API's `deleteDuplicates`,
  `trimWhitespace`, `textToColumns` and `randomizeRange` (`plans/assets/0020/research/google-cleanup-probe.ts` and
  its `.out.txt`, 2026-11-27): duplicates removed 5 of `a,1 A,1 a␠,1 a,'1 a,=0+1 blank blank a,1 b,2`, leaving
  `a,1 a␠,1 blank b,2`, a cell beside the range unmoved; trim changed 4 of 8 cells, keeping a no-break space, a
  tab, a line break inside and a formula; split refused two columns in Google's words, kept quotes, typed a date,
  cleared a shorter row's cell; randomise moved rows whole inside the range.
- **D461** Trim Whitespace's words: a toast, `3 cells trimmed`, `1 cell trimmed`, `No whitespace to trim`
  (default; the API answers a count only).
- **D462** Detect Automatically splits at commas only, a space after a comma going with it, as the probe gave
  (`a, b` to `a`, `b`); Comma, Semicolon, Period and Custom keep a piece's spaces (default for those four).
- **D463** Split Text to Columns asks before it writes over cells to the right (**Replace Data?**), as no change in
  LiveDoc loses data unasked; the API writes over them (default).
- **D464** Randomise Range draws from `crypto.getRandomValues` (Fisher-Yates), every order equally likely (default).
- **D465** Column Stats' figures, chart and list sizes: up to 10 bars (the rest `Other`), 10 histogram bins, 20
  frequent values, a column mostly numbers when more than half its filled cells are (default).
- **D466** Clean-up Suggestions looks over the used range below the frozen rows, three kinds (duplicates, extra
  spaces, numbers stored as text), a set-aside card staying aside until the panel opens again (default).
- **D467** Who cleans up: an Editor; a Participant and a Viewer read Column Stats only, since each tool moves or
  rewrites cells and formulas as a sort does (default).
- **D468** Each separator chosen on the chip is its own change (Undo steps back through them), splitting the text the
  first split started from; Custom splits on Enter, not as typed, so a half-typed separator makes no change (default;
  Google's chip is unmeasured, the API has no chip).
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
