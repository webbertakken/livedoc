# Formulas

A [sheet](sheet.md)'s cells hold **inputs**; what they show are **values**. A formula is an input that starts with
`=` and works its value out from other cells, other sheets on the tab and the document's Plan cards. The language
is the one people already write in Google Sheets and Excel: the same operators, references and function names, so
a formula pasted from either works here when it uses what this page lists.

Values are worked out in the browser (and by the api and MCP for images and agents) by the same pure engine, so
everyone sees the same values for the same inputs; only number formats differ by the viewer's locale.

## Values

A value is one of:

| Kind        | Is                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------- |
| **empty**   | A cell with no input; reads as `0` in arithmetic and `""` in text                        |
| **number**  | A double; dates and times are numbers (days since 30 December 1899, the time a fraction) |
| **text**    | A string, up to 10,000 characters                                                        |
| **boolean** | `TRUE` or `FALSE`                                                                        |
| **error**   | One of the errors below                                                                  |
| **array**   | Rows of values, from a range or a function; shown by spilling (below)                    |

### Errors

| Error     | When                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `#NULL!`  | An intersection of references that share no cell                                                                          |
| `#DIV/0!` | Division by zero                                                                                                          |
| `#VALUE!` | A value of the wrong kind (`="a"+1`)                                                                                      |
| `#REF!`   | A reference to a cell that was deleted, a sheet not there, a circular formula, or an array result blocked by filled cells |
| `#NAME?`  | A function or name the engine does not know                                                                               |
| `#N/A`    | A lookup found nothing; `NA()`                                                                                            |
| `#NUM!`   | A number out of range (`=SQRT(-1)`, a result too large)                                                                   |
| `#ERROR!` | A formula that cannot be read (only from an agent or a paste: the editor refuses one)                                     |

- An error flows through: a formula reading an error shows it, except the functions that test for errors
  (`IFERROR`, `IFNA`, `ISERROR`, `ISNA`, `ERROR.TYPE`).
- A **circular** formula (one that reads itself, directly or through others) shows `#REF!` in every cell of the
  loop, and hovering says "Circular dependency detected: B2 → C2 → B2", unless the spreadsheet's iterative
  calculation is on ([Settings](settings.md)), when the loop is worked out again up to its most iterations.
- `ERROR.TYPE` numbers the errors as Google does: `#NULL!` 1, `#DIV/0!` 2, `#VALUE!` 3, `#REF!` 4, `#NAME?` 5,
  `#NUM!` 6, `#N/A` 7, any other 8.
- A file that arrives holding Excel's `#SPILL!` (or another error Google does not have) reads it as `#REF!` until
  its formula is worked out here.

## What a typed input becomes

What is typed into a cell (or pasted, imported or written by an agent) is read once, when it is saved, and stored
as what it means, never as the text typed, so everyone reads it the same whatever their locale:

| Typed                                   | Stored as                                         | Format it takes (if Automatic) |
| --------------------------------------- | ------------------------------------------------- | ------------------------------ |
| `=…`                                    | A formula                                         | (the formula's)                |
| `12`, `-3.5`, `1,234.5`, `1.2e3`        | A number                                          | Automatic                      |
| `12%`                                   | `0.12`                                            | Percent                        |
| `£12`, `$1,200.50`, `€3`, `-£4`         | A number                                          | Currency, with that symbol     |
| `8/10/2026`, `2026-10-08`, `8 Oct 2026` | A date number (day and month in the locale order) | Date                           |
| `14:30`, `2:30 pm`, `14:30:15`          | A time fraction                                   | Time                           |
| `2026-10-08 14:30`                      | A date and time number                            | Date Time                      |
| `true`, `FALSE` (any case)              | A boolean                                         | Automatic                      |
| `'anything`                             | The text after the `'`                            | Automatic                      |
| Anything else                           | Text                                              | Automatic                      |

- **The formula's format** is the format of what its outermost function returns: a date from `TODAY`, `DATE`,
  `DATEVALUE`, `EDATE`, `EOMONTH` or `WORKDAY` is Date, `NOW` is Date Time, `TIME` and `TIMEVALUE` are Time, and so
  is one of them plus or minus a plain number (`=TODAY()+7`); any other formula (arithmetic with a cell, `=A1+7`, or
  between dates, `=A1-TODAY()`, which is a number of days) stays Automatic. It is taken only by a cell whose format is
  Automatic, however the formula arrives (typed, pasted, or written by an agent), so a cell someone formatted keeps
  its format. `=TODAY()` drew as `46314` before this.
- A cell already formatted as **Plain Text** keeps whatever is typed as text.
- Separators are read in the typist's locale (`1.234,5` is a number to someone whose locale writes it so).
- The formula bar shows a stored number unformatted (`0.12`, or the date in the locale's short form).

## References

- **A1 references**: `B4`; absolute parts with `$` (`$B$4`, `B$4`, `$B4`), which do not shift when the formula is
  copied, filled or pasted.
- **Ranges**: `A1:C5`, whole columns `A:C`, whole rows `2:4`, and open ends of a filled column (`A2:A`).
- A reference past the grid (`ZZ1` on a 26-column sheet) is `#REF!`.
- References are not case sensitive; they are stored upper case.

### Other sheets

- `'Sheet title'!B4` (quotes needed when the title holds a space or a symbol; `Budget!B4` otherwise) reads a cell
  of another sheet **on the same tab**, by its title; a range too (`'Q3 Costs'!A1:D20`).
- Renaming a sheet rewrites every formula on the tab that names it; a reference to a title no sheet on the tab has
  (deleted, or never there) is `#REF!` until a sheet of that title is there again.
- Inserting or deleting rows and columns in a sheet rewrites references to it in every sheet on the tab: a range in
  another sheet with a corner in deleted rows or columns shrinks to what is left, as the sheet's own ranges do
  (`=SUM(Costs!A1:A3)` with Costs' row 1 deleted reads `Costs!A1:A2`); a single cell reads `#REF!`. The shrink is
  part of the same change, so one undo puts it back, and it stays linear in the references on the tab.
- Sheets on other tabs and other documents are out of reach.

### Named ranges

- A **named range** gives a cell or a range of a sheet a name (`TaxRate`, `Q3_Sales`): `=B2*TaxRate` reads it, and
  as a name never shifts, filling or copying the formula keeps reading the same cells (what `$B$1` does, readably).
- A name is read as its range: a single cell as its value, a range where a range goes (`=SUM(Q3_Sales)`).
- A name is looked up in the formula's own sheet first, then in the one other sheet on the tab that has it; one that
  none has, or that several other sheets have, is `#NAME?` ("Unknown name TAXRATE"). Names are not case sensitive.
- Names follow their cells: rows and columns inserted inside a named range grow it, moved ones carry it; a range
  whose cells are all deleted loses its name, and formulas using it read `#NAME?`.
- A name in a formula is kept as typed; renaming or removing a name does not rewrite formulas.

### Plan cards

Four functions read the document's [items](../026-plan/items.md) (its cards), every live card (not archived, not in
the Trash), whatever board they are on, as a [plan view](../026-plan/plan-views.md) reads them:

| Function                                | Gives                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `CARDCOUNT([field, value, …])`          | How many cards match every `field, value` pair                                     |
| `CARDSUM(sum_field, [field, value, …])` | The sum of a number field over the matching cards                                  |
| `CARD(number, field)`                   | One field of card `#number`                                                        |
| `CARDS(fields, [field, value, …])`      | A spilled table: a header row of `fields`, then a row per matching card, by number |

- A **field** is named as the card panel names it, case ignored: `"Title"`, `"State"` (or `"Status"`),
  `"Assignee"`, `"Priority"`, `"Estimate"`, `"Due"`, `"Start"`, `"Labels"`, `"Type"`, `"Number"`, or a custom
  field's name. `fields` in `CARDS` is one text of names separated by commas (`"Number, Title, State"`).
- A **value** matches as a criterion does in `COUNTIF` (`"Done"`, `">3"`, `"<>"`, `"*login*"`).
- Values read as: State by its column name, Assignee by the person's name, Labels joined with `, `, dates as date
  numbers, Type by the card type's name, Number as the number.
- An unknown field is `#NAME?` (hovering names it); a card number no card has is `#N/A`.
- A sheet using these functions loads the document's items, as a board does; until they arrive the cells show
  **Loading…**. They recalculate as cards change, live for everyone.
- Outside the editor (exports, images, agents), they read the items the api reads; a named tab's image reads only
  the items that tab shows ([Sheet](sheet.md) "Exports and images").

## Operators

In order of precedence, highest first; same as Google Sheets:

| Operator                   | Does                                 |
| -------------------------- | ------------------------------------ |
| `:`                        | Range                                |
| `-` (prefix)               | Negation                             |
| `%` (postfix)              | Divide by 100                        |
| `^`                        | Power                                |
| `*` `/`                    | Multiply, divide                     |
| `+` `-`                    | Add, subtract                        |
| `&`                        | Join text                            |
| `=` `<>` `<` `>` `<=` `>=` | Compare; text compares ignoring case |

- Brackets group. Text is in double quotes, a quote inside doubled (`"say ""hi"""`).
- Arrays are written in braces, commas between columns and semicolons between rows (`{1, 2; 3, 4}`); a slot holds any
  value, reference or formula, and ranges and arrays in it are joined side by side or stacked (`={A1:A3, C1:C3}`,
  `={A1:A3; C1:C3}`). Parts that do not line up are `#VALUE!` ("In ARRAY_LITERAL, an Array Literal was missing
  values for one or more rows.").
- Arithmetic reads text that looks like a number as the number (`="3"+1` is `4`, `=" 3 "+1` and `="50%"*1`
  too); other text is `#VALUE!`. Booleans are 1 and 0, an empty cell 0 (or `""` beside `&`).
- `&` writes a boolean as `TRUE` or `FALSE` (`=1&TRUE` is `1TRUE`), and comparing across kinds orders numbers
  before text before booleans (`="z"<TRUE` is TRUE), as Google does where LibreOffice holds booleans as numbers.
- A formula is at most 8,000 characters and nests functions at most 64 deep.

## Reference operators

- `:` joins two references into the rectangle spanning both, and either side may be anything that gives a reference:
  `=SUM(A2:INDEX(A:A, 5))`, `=SUM(TaxRate:C9)`, `=SUM(OFFSET(A1, 1, 1):C9)`.
- Google refuses the intersection and union operators; LiveDoc reads both as Excel writes them, so a formula from a
  file stays editable (default, D30): a space between two references is the cells they share (`=SUM(A1:C3 B2:D4)`, and
  `#NULL!` when they share none); a comma between references in brackets is their union (`=SUM((A1:A3, C1:C3))`),
  read by the functions that take references (`SUM`, `COUNT`, `AREAS`, `INDEX`, `LARGE`, ...) and `#VALUE!` elsewhere.

## Arrays and spills

- **Implicit intersection**: outside an array context, a range where one value goes (an operator's operand, a
  function's single-value argument) reads the one cell of it in the formula's row (a range one column wide) or
  column (one row high): in row 3, `=A1:A5*2` is `A3*2`. A range with no such cell is `#VALUE!` ("An array value could
  not be found").
- An **array context** takes ranges and arrays whole: inside `ARRAYFORMULA(…)`, in an array literal, and in an argument
  a function reads as an array (`SUMPRODUCT`'s, `FILTER`'s, `INDEX`'s range, ...). There, operators and single-value
  functions work cell by cell: `=ARRAYFORMULA(A1:A5*2)` spills five values. A formula that is only a range
  (`=A1:C3`) or a function giving an array (`=SEQUENCE(5)`) spills as it is.
- A Plan Sheet keeps working every formula in an array context (as it did before spreadsheets), so its values do not
  move; the migration wraps each of its spilling formulas in `ARRAYFORMULA` (default, D34).
- A formula whose value is an array (`=ARRAYFORMULA(A1:A5*2)`, `=FILTER(…)`, `=SORT(…)`, `=SEQUENCE(5)`, `=CARDS(…)`) **spills**:
  its first value shows in its cell and the rest fill the cells below and to the right. Spilled cells are drawn
  as values with no input of their own; selecting one shows the formula greyed in the bar.
- A spill blocked by a cell with an input shows `#REF!` in the formula's cell ("Array result was not expanded because
  it would overwrite data in B3.", Google's words); emptying the blocker lets it spill. One running past the grid
  shows `#REF!` too ("Array result was not expanded because it would run past the edge of the sheet.").
- A reference to a spilling cell followed by `#` (`=SUM(B2#)`) reads its whole spilled range.
- Spilled cells are worked out, never stored: a CSV export and an agent read their values; an import or paste
  writes inputs only into cells it covers.

## Functions

The engine knows the functions below today (and only these: any other name is `#NAME?`); the [function catalogue](#function-catalogue) is what it grows to. Arguments in brackets are
optional. Each behaves as its Google Sheets namesake; where Sheets and Excel differ, Sheets wins.

**Maths**: `SUM`, `SUMIF`, `SUMIFS`, `SUMPRODUCT`, `PRODUCT`, `ABS`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`,
`TRUNC`, `MOD`, `POWER`, `SQRT`, `EXP`, `LN`, `LOG`, `LOG10`, `PI`, `SIGN`, `CEILING`, `FLOOR`, `MROUND`, `RAND`,
`RANDBETWEEN`, `QUOTIENT`, `GCD`, `LCM`, `FACT`.

**Operators**: `ADD`, `MINUS`, `MULTIPLY`, `DIVIDE`, `POW`, `CONCAT`, `EQ`, `NE`, `GT`, `GTE`, `LT`, `LTE`,
`UMINUS`, `UPLUS`, `UNARY_PERCENT`, `ISBETWEEN`: each operator by name, lifted over arrays as the operator is.

**Statistics**: `AVERAGE`, `AVERAGEIF`, `AVERAGEIFS`, `MEDIAN`, `MODE`, `MIN`, `MAX`, `MINIFS`, `MAXIFS`, `COUNT`,
`COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `LARGE`, `SMALL`, `RANK`, `PERCENTILE`, `QUARTILE`, `STDEV`,
`STDEV.P`, `VAR`, `VAR.P`, `CORREL`.

**Logic**: `IF`, `IFS`, `SWITCH`, `AND`, `OR`, `XOR`, `NOT`, `TRUE`, `FALSE`, `IFERROR`, `IFNA`.

**Information**: `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISLOGICAL`, `ISERROR`, `ISNA`, `ISFORMULA`, `ERROR.TYPE`, `NA`,
`N`, `TYPE`.

**Lookup**: `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `LOOKUP`, `INDEX`, `MATCH`, `XMATCH`, `CHOOSE`, `ROW`, `ROWS`, `COLUMN`,
`COLUMNS`, `OFFSET`, `INDIRECT` (an A1 text on this sheet or another on the tab).

**Text**: `CONCATENATE`, `TEXTJOIN`, `LEFT`, `RIGHT`, `MID`, `LEN`, `UPPER`, `LOWER`, `PROPER`, `TRIM`,
`CLEAN`, `SUBSTITUTE`, `REPLACE`, `FIND`, `SEARCH`, `REPT`, `EXACT`, `TEXT`, `VALUE`, `CHAR`, `CODE`, `SPLIT`,
`JOIN`, `REGEXMATCH`, `REGEXEXTRACT`, `REGEXREPLACE`, `HYPERLINK`.

- `SPLIT` reads each part as Google Sheets does: one that reads as a number (or a percentage) is that number, and one
  written as an ISO date, `YYYY-MM-DD` (a time after it allowed, `2026-10-26 12:00`), is that date. Other
  date-looking text (`26/10/2026`, `Oct 26 2026`, `2026-1-5`) stays text, as its day and month read differently by
  locale; so does an ISO date that is no date (`2026-02-30`). A blank part stays text.

**Date and time**: `TODAY`, `NOW`, `DATE`, `TIME`, `DATEVALUE`, `TIMEVALUE`, `YEAR`, `MONTH`, `DAY`, `HOUR`,
`MINUTE`, `SECOND`, `WEEKDAY`, `WEEKNUM`, `ISOWEEKNUM`, `EDATE`, `EOMONTH`, `DATEDIF`, `DAYS`, `NETWORKDAYS`,
`WORKDAY`, `YEARFRAC`.

**Arrays**: `FILTER`, `SORT`, `SORTBY`, `UNIQUE`, `SEQUENCE`, `TRANSPOSE`, `ARRAYFORMULA`.

**Finance**: `PMT`, `FV`, `PV`, `NPV`, `IRR`, `RATE`, `NPER`.

**Plan cards**: `CARDCOUNT`, `CARDSUM`, `CARD`, `CARDS`.

- **Criteria** (`COUNTIF`, `SUMIFS`, ... and the card functions) take a value to equal, or a text starting with a
  comparison (`">=10"`, `"<>Done"`), with `*` and `?` as wildcards and `~` to escape them; text matches ignore
  case.
- `TEXT(value, format)` takes the spreadsheet format codes people use (`"0.00"`, `"#,##0"`, `"0%"`, `"dd/mm/yyyy"`,
  `"mmm yyyy"`, `"hh:mm"`, `"[h]:mm"`, `"£#,##0.00"`, `"@"`).
- `HYPERLINK(url, [label])` shows the label as a link; Ctrl/⌘ and a click opens it in a new tab (http, https and
  mailto only).
  - The cell's **value is the label** (or the url when there is none), so sorting, CSV, charts, `read_sheet` and
    every formula that reads the cell see text, as in other spreadsheets. Where it goes is read from the formula
    (`Workbook.hyperlinkOf`): only a formula that **is** a `HYPERLINK` call at its top links; one nested inside
    another function (`=UPPER(HYPERLINK(…))`) shows its value as plain text.
  - The url argument is worked out in the cell, so it may be built from references (`=HYPERLINK(A2&"?ref=sheet",
"Open")`) and follows them. A target that is not an http, https or mailto address (a `javascript:` or `data:`
    one, a relative path, an address over 2,048 characters) is dropped (`safeHyperlink`): the label draws as plain
    text and nothing opens.
  - **Drawing**: the label underlined, in the sheet's accent (its `focus` colour) unless the cell has its own text
    colour, kept readable on the cell's fill like any ink. Images and exports draw it the same way, and an SVG export
    keeps it a link (`<a href target="_blank" rel="noopener noreferrer">`, escaped).
  - **Opening**: Ctrl/⌘ and a press on the cell opens it in a new tab with no opener (`noopener,noreferrer`); on any
    other cell Ctrl/⌘ still adds to the selection, and a plain press on a link only selects it. The pointer's tooltip
    under a link shows its address and "⌘Click to open" (Ctrl+Click elsewhere). The cell menu offers **Open Link** for
    the active cell's link, for every role: opening changes nothing, and it is the way in on a touch screen.
  - Telemetry: `Sheet / Opened / Hyperlink`, never the address.
- `REGEX…` functions take JavaScript regular expressions. A regular expression cannot be stopped once it runs, so
  its cost is bounded before it starts: a pattern whose repeats could backtrack for more than a moment on the cell's
  text (a repeat of a repeat such as `(a+)+`, or three or more open-ended repeats side by side on long text) answers
  `#VALUE!` "This pattern is too costly to run on this text" instead of freezing the sheet for everyone on it.
  `SEARCH`'s `*` wildcards are held to the same bound.
- `TODAY`, `NOW`, `RAND`, `RANDBETWEEN`, `OFFSET` and `INDIRECT` are **volatile**: they recalculate on every
  change to the sheet. With nothing changed they are worked out again on a clock: a Plan Sheet's once a minute, a
  spreadsheet's as its Recalculation setting says ([Settings](settings.md): on change only, or every minute or hour).
  The clock runs while the document is open and its page visible; a tick missed while hidden runs as the page shows
  (default, D37). `RAND` is worked out in each browser, so two people see different numbers, as in a spreadsheet
  shared live.

## Function catalogue

Every function a [spreadsheet](spreadsheet.md) answers, the target of the overhaul: Google's 514, the 29
OpenFormula functions Google lacks, and LiveDoc's four card functions (sources and method:
[Function catalogue research](../../research/sheets-open-standard/function-catalogue.md)).

- **Authority**: whose meaning the grid follows. Google wins wherever Google has the function (S6, ruled 2026-11-18); a
  function only OpenFormula defines follows OpenFormula Part 4; the card functions are LiveDoc's own.
- **ODF name**: how an ODF file writes it ([Standard mapping](standard-mapping.md#formulas-in-the-files-own-syntax));
  **S5** marks the Google-only names written by S5's convention. An XLSX file writes Excel's name, with `_xlfn.` where
  Excel asks for it, and S5's convention for the same Google-only names.
- **Status**: **built** (in the engine today, re-proven against the oracle), **planned**, **planned (S4)**
  (fetches through the api Worker), **left out (C3)**, or left
  out with a reason. A left-out function in an arriving file keeps its formula text and shows its cached value.
- Every built or planned row is proven by the oracle (below) before it reads built.

| Name                  | Category    | Syntax (Google's)                                                                                              | Authority   | ODF name                         | Status                                                        |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------- | ------------------------------------------------------------- |
| `ABS`                 | Math        | `ABS(value)`                                                                                                   | Google      | `ABS`                            | built                                                         |
| `ACCRINT`             | Financial   | `ACCRINT(issue, first_payment, settlement, rate, redemption, frequency, [day_count_convention])`               | Google      | `ACCRINT`                        | planned                                                       |
| `ACCRINTM`            | Financial   | `ACCRINTM(issue, maturity, rate, [redemption], [day_count_convention])`                                        | Google      | `ACCRINTM`                       | planned                                                       |
| `ACOS`                | Math        | `ACOS(value)`                                                                                                  | Google      | `ACOS`                           | planned                                                       |
| `ACOSH`               | Math        | `ACOSH(value)`                                                                                                 | Google      | `ACOSH`                          | planned                                                       |
| `ACOT`                | Math        | `ACOT(value)`                                                                                                  | Google      | `ACOT`                           | planned                                                       |
| `ACOTH`               | Math        | `ACOTH(value)`                                                                                                 | Google      | `ACOTH`                          | planned                                                       |
| `ADD`                 | Operator    | `ADD(value1, value2)`                                                                                          | Google      | S5                               | built                                                         |
| `ADDRESS`             | Lookup      | `ADDRESS(row, column, [absolute_relative_mode], [use_a1_notation], [sheet])`                                   | Google      | `ADDRESS`                        | planned                                                       |
| `AMORLINC`            | Financial   | `AMORLINC(cost, purchase_date, first_period_end, salvage, period, rate, [basis])`                              | Google      | `AMORLINC`                       | planned                                                       |
| `AND`                 | Logical     | `AND(logical_expression1, [logical_expression2, ...])`                                                         | Google      | `AND`                            | built                                                         |
| `ARABIC`              | Text        | `ARABIC(roman_numeral)`                                                                                        | Google      | `ARABIC`                         | planned                                                       |
| `AREAS`               | OpenFormula |                                                                                                                | OpenFormula | `AREAS`                          | planned                                                       |
| `ARRAYFORMULA`        | Google      | `ARRAYFORMULA(array_formula)`                                                                                  | Google      | S5                               | built                                                         |
| `ARRAY_CONSTRAIN`     | Array       | `ARRAY_CONSTRAIN(input_range, num_rows, num_cols)`                                                             | Google      | S5                               | planned                                                       |
| `ASC`                 | Text        | `ASC(text)`                                                                                                    | Google      | `ASC`                            | planned                                                       |
| `ASIN`                | Math        | `ASIN(value)`                                                                                                  | Google      | `ASIN`                           | planned                                                       |
| `ASINH`               | Math        | `ASINH(value)`                                                                                                 | Google      | `ASINH`                          | planned                                                       |
| `ATAN`                | Math        | `ATAN(value)`                                                                                                  | Google      | `ATAN`                           | planned                                                       |
| `ATAN2`               | Math        | `ATAN2(x, y)`                                                                                                  | Google      | `ATAN2`                          | planned                                                       |
| `ATANH`               | Math        | `ATANH(value)`                                                                                                 | Google      | `ATANH`                          | planned                                                       |
| `AVEDEV`              | Statistical | `AVEDEV(value1, [value2, ...])`                                                                                | Google      | `AVEDEV`                         | planned                                                       |
| `AVERAGE`             | Statistical | `AVERAGE(value1, [value2, ...])`                                                                               | Google      | `AVERAGE`                        | built                                                         |
| `AVERAGE.WEIGHTED`    | Statistical | `AVERAGE.WEIGHTED(values, weights, [additional values], [additional weights])`                                 | Google      | S5                               | planned                                                       |
| `AVERAGEA`            | Statistical | `AVERAGEA(value1, [value2, ...])`                                                                              | Google      | `AVERAGEA`                       | planned                                                       |
| `AVERAGEIF`           | Statistical | `AVERAGEIF(criteria_range, criterion, [average_range])`                                                        | Google      | `AVERAGEIF`                      | built                                                         |
| `AVERAGEIFS`          | Statistical | `AVERAGEIFS(average_range, criteria_range1, criterion1, [criteria_range2, criterion2, ...])`                   | Google      | `AVERAGEIFS`                     | built                                                         |
| `BASE`                | Math        | `BASE(value, base, [min_length])`                                                                              | Google      | `BASE`                           | planned                                                       |
| `BESSELI`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELI`                        | planned                                                       |
| `BESSELJ`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELJ`                        | planned                                                       |
| `BESSELK`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELK`                        | planned                                                       |
| `BESSELY`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELY`                        | planned                                                       |
| `BETA.DIST`           | Statistical | `BETA.DIST(value, alpha, beta, cumulative, lower_bound, upper_bound)`                                          | Google      | `COM.MICROSOFT.BETA.DIST`        | planned                                                       |
| `BETA.INV`            | Statistical | `BETA.INV(probability, alpha, beta, lower_bound, upper_bound)`                                                 | Google      | `COM.MICROSOFT.BETA.INV`         | planned                                                       |
| `BETADIST`            | Statistical | `BETADIST(value, alpha, beta, lower_bound, upper_bound)`                                                       | Google      | `BETADIST`                       | planned                                                       |
| `BETAINV`             | Statistical | `BETAINV(probability, alpha, beta, lower_bound, upper_bound)`                                                  | Google      | `BETAINV`                        | planned                                                       |
| `BIN2DEC`             | Engineering | `BIN2DEC(signed_binary_number)`                                                                                | Google      | `BIN2DEC`                        | planned                                                       |
| `BIN2HEX`             | Engineering | `BIN2HEX(signed_binary_number, [significant_digits])`                                                          | Google      | `BIN2HEX`                        | planned                                                       |
| `BIN2OCT`             | Engineering | `BIN2OCT(signed_binary_number, [significant_digits])`                                                          | Google      | `BIN2OCT`                        | planned                                                       |
| `BINOM.DIST`          | Statistical | `BINOM.DIST(num_successes, num_trials, prob_success, cumulative)`                                              | Google      | `COM.MICROSOFT.BINOM.DIST`       | planned                                                       |
| `BINOM.DIST.RANGE`    | OpenFormula |                                                                                                                | OpenFormula | `BINOM.DIST.RANGE`               | planned                                                       |
| `BINOM.INV`           | Statistical | `BINOM.INV(num_trials, prob_success, target_prob)`                                                             | Google      | `COM.MICROSOFT.BINOM.INV`        | planned                                                       |
| `BINOMDIST`           | Statistical | `BINOMDIST(num_successes, num_trials, prob_success, cumulative)`                                               | Google      | `BINOMDIST`                      | planned                                                       |
| `BITAND`              | Engineering | `BITAND(value1, value2)`                                                                                       | Google      | `BITAND`                         | planned                                                       |
| `BITLSHIFT`           | Engineering | `BITLSHIFT(value, shift_amount)`                                                                               | Google      | `BITLSHIFT`                      | planned                                                       |
| `BITOR`               | Engineering | `BITOR(value1, value2)`                                                                                        | Google      | `BITOR`                          | planned                                                       |
| `BITRSHIFT`           | Engineering | `BITRSHIFT(value, shift_amount)`                                                                               | Google      | `BITRSHIFT`                      | planned                                                       |
| `BITXOR`              | Engineering | `BITXOR(value1, value2)`                                                                                       | Google      | `BITXOR`                         | planned                                                       |
| `BYCOL`               | Array       | `BYCOL(array_or_range, LAMBDA)`                                                                                | Google      | `COM.MICROSOFT.BYCOL`            | planned                                                       |
| `BYROW`               | Array       | `BYROW(array_or_range, LAMBDA)`                                                                                | Google      | `COM.MICROSOFT.BYROW`            | planned                                                       |
| `CARD`                | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CARDCOUNT`           | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CARDS`               | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CARDSUM`             | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CEILING`             | Math        | `CEILING(value, [factor])`                                                                                     | Google      | `CEILING`                        | built                                                         |
| `CEILING.MATH`        | Math        | `CEILING.MATH(number, [significance], [mode])`                                                                 | Google      | `COM.MICROSOFT.CEILING.MATH`     | planned                                                       |
| `CEILING.PRECISE`     | Math        | `CEILING.PRECISE(number, [significance])`                                                                      | Google      | `COM.MICROSOFT.CEILING.PRECISE`  | planned                                                       |
| `CELL`                | Info        | `CELL(info_type, reference)`                                                                                   | Google      | `CELL`                           | planned                                                       |
| `CHAR`                | Text        | `CHAR(table_number)`                                                                                           | Google      | `CHAR`                           | built                                                         |
| `CHIDIST`             | Statistical | `CHIDIST(x, degrees_freedom)`                                                                                  | Google      | `LEGACY.CHIDIST`                 | planned                                                       |
| `CHIINV`              | Statistical | `CHIINV(probability, degrees_freedom)`                                                                         | Google      | `LEGACY.CHIINV`                  | planned                                                       |
| `CHISQ.DIST`          | Statistical | `CHISQ.DIST(x, degrees_freedom, cumulative)`                                                                   | Google      | `COM.MICROSOFT.CHISQ.DIST`       | planned                                                       |
| `CHISQ.DIST.RT`       | Statistical | `CHISQ.DIST.RT(x, degrees_freedom)`                                                                            | Google      | `COM.MICROSOFT.CHISQ.DIST.RT`    | planned                                                       |
| `CHISQ.INV`           | Statistical | `CHISQ.INV(probability, degrees_freedom)`                                                                      | Google      | `COM.MICROSOFT.CHISQ.INV`        | planned                                                       |
| `CHISQ.INV.RT`        | Statistical | `CHISQ.INV.RT(probability, degrees_freedom)`                                                                   | Google      | `COM.MICROSOFT.CHISQ.INV.RT`     | planned                                                       |
| `CHISQ.TEST`          | Statistical | `CHISQ.TEST(observed_range, expected_range)`                                                                   | Google      | `COM.MICROSOFT.CHISQ.TEST`       | planned                                                       |
| `CHISQDIST`           | OpenFormula |                                                                                                                | OpenFormula | `CHISQDIST`                      | planned                                                       |
| `CHISQINV`            | OpenFormula |                                                                                                                | OpenFormula | `CHISQINV`                       | planned                                                       |
| `CHITEST`             | Statistical | `CHITEST(observed_range, expected_range)`                                                                      | Google      | `LEGACY.CHITEST`                 | planned                                                       |
| `CHOOSE`              | Lookup      | `CHOOSE(index, choice1, [choice2, ...])`                                                                       | Google      | `CHOOSE`                         | built                                                         |
| `CHOOSECOLS`          | Array       | `CHOOSECOLS(array, col_num1, [col_num2])`                                                                      | Google      | `COM.MICROSOFT.CHOOSECOLS`       | planned                                                       |
| `CHOOSEROWS`          | Array       | `CHOOSEROWS(array, row_num1, [row_num2])`                                                                      | Google      | `COM.MICROSOFT.CHOOSEROWS`       | planned                                                       |
| `CLEAN`               | Text        | `CLEAN(text)`                                                                                                  | Google      | `CLEAN`                          | built                                                         |
| `CODE`                | Text        | `CODE(string)`                                                                                                 | Google      | `CODE`                           | built                                                         |
| `COLUMN`              | Lookup      | `COLUMN([cell_reference])`                                                                                     | Google      | `COLUMN`                         | built                                                         |
| `COLUMNS`             | Lookup      | `COLUMNS(range)`                                                                                               | Google      | `COLUMNS`                        | built                                                         |
| `COMBIN`              | Math        | `COMBIN(n, k)`                                                                                                 | Google      | `COMBIN`                         | planned                                                       |
| `COMBINA`             | Math        | `COMBINA(n, k)`                                                                                                | Google      | `COMBINA`                        | planned                                                       |
| `COMPLEX`             | Engineering | `COMPLEX(real_part, imaginary_part, [suffix])`                                                                 | Google      | `COMPLEX`                        | planned                                                       |
| `CONCAT`              | Operator    | `CONCAT(value1, value2)`                                                                                       | Google      | `COM.MICROSOFT.CONCAT`           | built                                                         |
| `CONCATENATE`         | Text        | `CONCATENATE(string1, [string2, ...])`                                                                         | Google      | `CONCATENATE`                    | built                                                         |
| `CONFIDENCE`          | Statistical | `CONFIDENCE(alpha, standard_deviation, pop_size)`                                                              | Google      | `CONFIDENCE`                     | planned                                                       |
| `CONFIDENCE.NORM`     | Statistical | `CONFIDENCE.NORM(alpha, standard_deviation, pop_size)`                                                         | Google      | `COM.MICROSOFT.CONFIDENCE.NORM`  | planned                                                       |
| `CONFIDENCE.T`        | Statistical | `CONFIDENCE.T(alpha, standard_deviation, size)`                                                                | Google      | `COM.MICROSOFT.CONFIDENCE.T`     | planned                                                       |
| `CONVERT`             | Parser      | `CONVERT(value, start_unit, end_unit)`                                                                         | Google      | `CONVERT`                        | planned                                                       |
| `CORREL`              | Statistical | `CORREL(data_y, data_x)`                                                                                       | Google      | `CORREL`                         | built                                                         |
| `COS`                 | Math        | `COS(angle)`                                                                                                   | Google      | `COS`                            | planned                                                       |
| `COSH`                | Math        | `COSH(value)`                                                                                                  | Google      | `COSH`                           | planned                                                       |
| `COT`                 | Math        | `COT(angle)`                                                                                                   | Google      | `COT`                            | planned                                                       |
| `COTH`                | Math        | `COTH(value)`                                                                                                  | Google      | `COTH`                           | planned                                                       |
| `COUNT`               | Statistical | `COUNT(value1, [value2, ...])`                                                                                 | Google      | `COUNT`                          | built                                                         |
| `COUNTA`              | Statistical | `COUNTA(value1, [value2, ...])`                                                                                | Google      | `COUNTA`                         | built                                                         |
| `COUNTBLANK`          | Math        | `COUNTBLANK(range)`                                                                                            | Google      | `COUNTBLANK`                     | built                                                         |
| `COUNTIF`             | Math        | `COUNTIF(range, criterion)`                                                                                    | Google      | `COUNTIF`                        | built                                                         |
| `COUNTIFS`            | Math        | `COUNTIFS(criteria_range1, criterion1, [criteria_range2, criterion2, ...])`                                    | Google      | `COUNTIFS`                       | built                                                         |
| `COUNTUNIQUE`         | Math        | `COUNTUNIQUE(value1, [value2, ...])`                                                                           | Google      | S5                               | planned                                                       |
| `COUPDAYBS`           | Financial   | `COUPDAYBS(settlement, maturity, frequency, [day_count_convention])`                                           | Google      | `COUPDAYBS`                      | planned                                                       |
| `COUPDAYS`            | Financial   | `COUPDAYS(settlement, maturity, frequency, [day_count_convention])`                                            | Google      | `COUPDAYS`                       | planned                                                       |
| `COUPDAYSNC`          | Financial   | `COUPDAYSNC(settlement, maturity, frequency, [day_count_convention])`                                          | Google      | `COUPDAYSNC`                     | planned                                                       |
| `COUPNCD`             | Financial   | `COUPNCD(settlement, maturity, frequency, [day_count_convention])`                                             | Google      | `COUPNCD`                        | planned                                                       |
| `COUPNUM`             | Financial   | `COUPNUM(settlement, maturity, frequency, [day_count_convention])`                                             | Google      | `COUPNUM`                        | planned                                                       |
| `COUPPCD`             | Financial   | `COUPPCD(settlement, maturity, frequency, [day_count_convention])`                                             | Google      | `COUPPCD`                        | planned                                                       |
| `COVAR`               | Statistical | `COVAR(data_y, data_x)`                                                                                        | Google      | `COVAR`                          | planned                                                       |
| `COVARIANCE.P`        | Statistical | `COVARIANCE.P(data_y, data_x)`                                                                                 | Google      | `COM.MICROSOFT.COVARIANCE.P`     | planned                                                       |
| `COVARIANCE.S`        | Statistical | `COVARIANCE.S(data_y, data_x)`                                                                                 | Google      | `COM.MICROSOFT.COVARIANCE.S`     | planned                                                       |
| `CRITBINOM`           | Statistical | `CRITBINOM(num_trials, prob_success, target_prob)`                                                             | Google      | `CRITBINOM`                      | planned                                                       |
| `CSC`                 | Math        | `CSC(angle)`                                                                                                   | Google      | `CSC`                            | planned                                                       |
| `CSCH`                | Math        | `CSCH(value)`                                                                                                  | Google      | `CSCH`                           | planned                                                       |
| `CUMIPMT`             | Financial   | `CUMIPMT(rate, number_of_periods, present_value, first_period, last_period, end_or_beginning)`                 | Google      | `CUMIPMT`                        | planned                                                       |
| `CUMPRINC`            | Financial   | `CUMPRINC(rate, number_of_periods, present_value, first_period, last_period, end_or_beginning)`                | Google      | `CUMPRINC`                       | planned                                                       |
| `DATE`                | Date        | `DATE(year, month, day)`                                                                                       | Google      | `DATE`                           | built                                                         |
| `DATEDIF`             | Date        | `DATEDIF(start_date, end_date, unit)`                                                                          | Google      | `DATEDIF`                        | built                                                         |
| `DATEVALUE`           | Date        | `DATEVALUE(date_string)`                                                                                       | Google      | `DATEVALUE`                      | built                                                         |
| `DAVERAGE`            | Database    | `DAVERAGE(database, field, criteria)`                                                                          | Google      | `DAVERAGE`                       | planned                                                       |
| `DAY`                 | Date        | `DAY(date)`                                                                                                    | Google      | `DAY`                            | built                                                         |
| `DAYS`                | Date        | `DAYS(end_date, start_date)`                                                                                   | Google      | `DAYS`                           | built                                                         |
| `DAYS360`             | Date        | `DAYS360(start_date, end_date, [method])`                                                                      | Google      | `DAYS360`                        | planned                                                       |
| `DB`                  | Financial   | `DB(cost, salvage, life, period, [month])`                                                                     | Google      | `DB`                             | planned                                                       |
| `DCOUNT`              | Database    | `DCOUNT(database, field, criteria)`                                                                            | Google      | `DCOUNT`                         | planned                                                       |
| `DCOUNTA`             | Database    | `DCOUNTA(database, field, criteria)`                                                                           | Google      | `DCOUNTA`                        | planned                                                       |
| `DDB`                 | Financial   | `DDB(cost, salvage, life, period, [factor])`                                                                   | Google      | `DDB`                            | planned                                                       |
| `DDE`                 | OpenFormula |                                                                                                                | OpenFormula | `DDE`                            | left out: kept as text with its cached value (no live source) |
| `DEC2BIN`             | Engineering | `DEC2BIN(decimal_number, [significant_digits])`                                                                | Google      | `DEC2BIN`                        | planned                                                       |
| `DEC2HEX`             | Engineering | `DEC2HEX(decimal_number, [significant_digits])`                                                                | Google      | `DEC2HEX`                        | planned                                                       |
| `DEC2OCT`             | Engineering | `DEC2OCT(decimal_number, [significant_digits])`                                                                | Google      | `DEC2OCT`                        | planned                                                       |
| `DECIMAL`             | Math        | `DECIMAL(value, base)`                                                                                         | Google      | `DECIMAL`                        | planned                                                       |
| `DEGREES`             | Math        | `DEGREES(angle)`                                                                                               | Google      | `DEGREES`                        | planned                                                       |
| `DELTA`               | Engineering | `DELTA(number1, [number2])`                                                                                    | Google      | `DELTA`                          | planned                                                       |
| `DETECTLANGUAGE`      | Google      | `DETECTLANGUAGE(text_or_range)`                                                                                | Google      | S5                               | left out (C3)                                                 |
| `DEVSQ`               | Statistical | `DEVSQ(value1, value2)`                                                                                        | Google      | `DEVSQ`                          | planned                                                       |
| `DGET`                | Database    | `DGET(database, field, criteria)`                                                                              | Google      | `DGET`                           | planned                                                       |
| `DISC`                | Financial   | `DISC(settlement, maturity, price, redemption, [day_count_convention])`                                        | Google      | `DISC`                           | planned                                                       |
| `DIVIDE`              | Operator    | `DIVIDE(dividend, divisor)`                                                                                    | Google      | S5                               | built                                                         |
| `DMAX`                | Database    | `DMAX(database, field, criteria)`                                                                              | Google      | `DMAX`                           | planned                                                       |
| `DMIN`                | Database    | `DMIN(database, field, criteria)`                                                                              | Google      | `DMIN`                           | planned                                                       |
| `DOLLAR`              | Text        | `DOLLAR(number, [number_of_places])`                                                                           | Google      | `DOLLAR`                         | planned                                                       |
| `DOLLARDE`            | Financial   | `DOLLARDE(fractional_price, unit)`                                                                             | Google      | `DOLLARDE`                       | planned                                                       |
| `DOLLARFR`            | Financial   | `DOLLARFR(decimal_price, unit)`                                                                                | Google      | `DOLLARFR`                       | planned                                                       |
| `DPRODUCT`            | Database    | `DPRODUCT(database, field, criteria)`                                                                          | Google      | `DPRODUCT`                       | planned                                                       |
| `DSTDEV`              | Database    | `DSTDEV(database, field, criteria)`                                                                            | Google      | `DSTDEV`                         | planned                                                       |
| `DSTDEVP`             | Database    | `DSTDEVP(database, field, criteria)`                                                                           | Google      | `DSTDEVP`                        | planned                                                       |
| `DSUM`                | Database    | `DSUM(database, field, criteria)`                                                                              | Google      | `DSUM`                           | planned                                                       |
| `DURATION`            | Financial   | `DURATION(settlement, maturity, rate, yield, frequency, [day_count_convention])`                               | Google      | `DURATION`                       | planned                                                       |
| `DVAR`                | Database    | `DVAR(database, field, criteria)`                                                                              | Google      | `DVAR`                           | planned                                                       |
| `DVARP`               | Database    | `DVARP(database, field, criteria)`                                                                             | Google      | `DVARP`                          | planned                                                       |
| `EASTERSUNDAY`        | OpenFormula |                                                                                                                | OpenFormula | `EASTERSUNDAY`                   | planned                                                       |
| `EDATE`               | Date        | `EDATE(start_date, months)`                                                                                    | Google      | `EDATE`                          | built                                                         |
| `EFFECT`              | Financial   | `EFFECT(nominal_rate, periods_per_year)`                                                                       | Google      | `EFFECT`                         | planned                                                       |
| `ENCODEURL`           | Web         | `ENCODEURL(text)`                                                                                              | Google      | `COM.MICROSOFT.ENCODEURL`        | planned                                                       |
| `EOMONTH`             | Date        | `EOMONTH(start_date, months)`                                                                                  | Google      | `EOMONTH`                        | built                                                         |
| `EPOCHTODATE`         | Date        | `EPOCHTODATE(timestamp, [unit])`                                                                               | Google      | S5                               | planned                                                       |
| `EQ`                  | Operator    | `EQ(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `ERF`                 | Engineering | `ERF(lower_bound, [upper_bound])`                                                                              | Google      | `ERF`                            | planned                                                       |
| `ERF.PRECISE`         | Engineering | `ERF.PRECISE(lower_bound, [upper_bound])`                                                                      | Google      | `COM.MICROSOFT.ERF.PRECISE`      | planned                                                       |
| `ERFC`                | Math        | `ERFC(z)`                                                                                                      | Google      | `ERFC`                           | planned                                                       |
| `ERFC.PRECISE`        | Math        | `ERFC.PRECISE(z)`                                                                                              | Google      | `COM.MICROSOFT.ERFC.PRECISE`     | planned                                                       |
| `ERROR.TYPE`          | Info        | `ERROR.TYPE(reference)`                                                                                        | Google      | `ERROR.TYPE`                     | built                                                         |
| `EUROCONVERT`         | OpenFormula |                                                                                                                | OpenFormula | `EUROCONVERT`                    | planned                                                       |
| `EVEN`                | Math        | `EVEN(value)`                                                                                                  | Google      | `EVEN`                           | planned                                                       |
| `EXACT`               | Text        | `EXACT(string1, string2)`                                                                                      | Google      | `EXACT`                          | built                                                         |
| `EXP`                 | Math        | `EXP(exponent)`                                                                                                | Google      | `EXP`                            | built                                                         |
| `EXPON.DIST`          | Statistical | `EXPON.DIST(x, LAMBDA, cumulative)`                                                                            | Google      | `COM.MICROSOFT.EXPON.DIST`       | planned                                                       |
| `EXPONDIST`           | Statistical | `EXPONDIST(x, LAMBDA, cumulative)`                                                                             | Google      | `EXPONDIST`                      | planned                                                       |
| `F.DIST`              | Statistical | `F.DIST(x, degrees_freedom1, degrees_freedom2, cumulative)`                                                    | Google      | `FDIST`                          | planned                                                       |
| `F.DIST.RT`           | Statistical | `F.DIST.RT(x, degrees_freedom1, degrees_freedom2)`                                                             | Google      | `COM.MICROSOFT.F.DIST.RT`        | planned                                                       |
| `F.INV`               | Statistical | `F.INV(probability, degrees_freedom1, degrees_freedom2)`                                                       | Google      | `FINV`                           | planned                                                       |
| `F.INV.RT`            | Statistical | `F.INV.RT(probability, degrees_freedom1, degrees_freedom2)`                                                    | Google      | `COM.MICROSOFT.F.INV.RT`         | planned                                                       |
| `F.TEST`              | Statistical | `F.TEST(range1, range2)`                                                                                       | Google      | `COM.MICROSOFT.F.TEST`           | planned                                                       |
| `FACT`                | Math        | `FACT(value)`                                                                                                  | Google      | `FACT`                           | built                                                         |
| `FACTDOUBLE`          | Math        | `FACTDOUBLE(value)`                                                                                            | Google      | `FACTDOUBLE`                     | planned                                                       |
| `FALSE`               | Logical     | `FALSE()`                                                                                                      | Google      | `FALSE`                          | built                                                         |
| `FDIST`               | Statistical | `FDIST(x, degrees_freedom1, degrees_freedom2)`                                                                 | Google      | `FDIST`                          | planned                                                       |
| `FILTER`              | Filter      | `FILTER(range, condition1, [condition2])`                                                                      | Google      | `COM.MICROSOFT.FILTER`           | built                                                         |
| `FIND`                | Text        | `FIND(search_for, text_to_search, [starting_at])`                                                              | Google      | `FIND`                           | built                                                         |
| `FINDB`               | Text        | `FINDB(search_for, text_to_search, [starting_at])`                                                             | Google      | `FINDB`                          | planned                                                       |
| `FINV`                | Statistical | `FINV(probability, degrees_freedom1, degrees_freedom2)`                                                        | Google      | `FINV`                           | planned                                                       |
| `FISHER`              | Statistical | `FISHER(value)`                                                                                                | Google      | `FISHER`                         | planned                                                       |
| `FISHERINV`           | Statistical | `FISHERINV(value)`                                                                                             | Google      | `FISHERINV`                      | planned                                                       |
| `FIXED`               | Text        | `FIXED(number, [number_of_places], [suppress_separator])`                                                      | Google      | `FIXED`                          | planned                                                       |
| `FLATTEN`             | Array       | `FLATTEN(range1,[range2,...])`                                                                                 | Google      | S5                               | planned                                                       |
| `FLOOR`               | Math        | `FLOOR(value, [factor])`                                                                                       | Google      | `FLOOR`                          | built                                                         |
| `FLOOR.MATH`          | Math        | `FLOOR.MATH(number, [significance], [mode])`                                                                   | Google      | `COM.MICROSOFT.FLOOR.MATH`       | planned                                                       |
| `FLOOR.PRECISE`       | Math        | `FLOOR.PRECISE(number, [significance])`                                                                        | Google      | `COM.MICROSOFT.FLOOR.PRECISE`    | planned                                                       |
| `FORECAST`            | Statistical | `FORECAST(x, data_y, data_x)`                                                                                  | Google      | `FORECAST`                       | planned                                                       |
| `FORECAST.LINEAR`     | Statistical | `FORECAST.LINEAR(x, data_y, data_x)`                                                                           | Google      | `COM.MICROSOFT.FORECAST.LINEAR`  | planned                                                       |
| `FORMULA`             | OpenFormula |                                                                                                                | OpenFormula | `FORMULA`                        | planned                                                       |
| `FORMULATEXT`         | Lookup      | `FORMULATEXT(cell)`                                                                                            | Google      | S5                               | planned                                                       |
| `FREQUENCY`           | Array       | `FREQUENCY(data, classes)`                                                                                     | Google      | `FREQUENCY`                      | planned                                                       |
| `FTEST`               | Statistical | `FTEST(range1, range2)`                                                                                        | Google      | `FTEST`                          | planned                                                       |
| `FV`                  | Financial   | `FV(rate, number_of_periods, payment_amount, [present_value], [end_or_beginning])`                             | Google      | `FV`                             | built                                                         |
| `FVSCHEDULE`          | Financial   | `FVSCHEDULE(principal, rate_schedule)`                                                                         | Google      | `FVSCHEDULE`                     | planned                                                       |
| `GAMMA`               | Statistical | `GAMMA(number)`                                                                                                | Google      | `GAMMA`                          | planned                                                       |
| `GAMMA.DIST`          | Statistical | `GAMMA.DIST(x, alpha, beta, cumulative)`                                                                       | Google      | `COM.MICROSOFT.GAMMA.DIST`       | planned                                                       |
| `GAMMA.INV`           | Statistical | `GAMMA.INV(probability, alpha, beta)`                                                                          | Google      | `COM.MICROSOFT.GAMMA.INV`        | planned                                                       |
| `GAMMADIST`           | Statistical | `GAMMADIST(x, alpha, beta, cumulative)`                                                                        | Google      | `GAMMADIST`                      | planned                                                       |
| `GAMMAINV`            | Statistical | `GAMMAINV(probability, alpha, beta)`                                                                           | Google      | `GAMMAINV`                       | planned                                                       |
| `GAMMALN`             | Math        | `GAMMALN(value)`                                                                                               | Google      | `GAMMALN`                        | planned                                                       |
| `GAMMALN.PRECISE`     | Math        | `GAMMALN.PRECISE(value)`                                                                                       | Google      | `COM.MICROSOFT.GAMMALN.PRECISE`  | planned                                                       |
| `GAUSS`               | Statistical | `GAUSS(z)`                                                                                                     | Google      | `GAUSS`                          | planned                                                       |
| `GCD`                 | Math        | `GCD(value1, value2)`                                                                                          | Google      | `GCD`                            | built                                                         |
| `GEOMEAN`             | Statistical | `GEOMEAN(value1, value2)`                                                                                      | Google      | `GEOMEAN`                        | planned                                                       |
| `GESTEP`              | Engineering | `GESTEP(value, [step])`                                                                                        | Google      | `GESTEP`                         | planned                                                       |
| `GETPIVOTDATA`        | Lookup      | `GETPIVOTDATA(value_name, any_pivot_table_cell, [original_column, ...], [pivot_item, ...]`                     | Google      | `GETPIVOTDATA`                   | planned                                                       |
| `GOOGLEFINANCE`       | Google      | `GOOGLEFINANCE(ticker, [attribute], [start_date], [end_date\|num_days], [interval])`                           | Google      | S5                               | left out (C3)                                                 |
| `GOOGLETRANSLATE`     | Google      | `GOOGLETRANSLATE(text, [source_language], [target_language])`                                                  | Google      | S5                               | left out (C3)                                                 |
| `GROWTH`              | Array       | `GROWTH(known_data_y, [known_data_x], [new_data_x], [b])`                                                      | Google      | `GROWTH`                         | planned                                                       |
| `GT`                  | Operator    | `GT(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `GTE`                 | Operator    | `GTE(value1, value2)`                                                                                          | Google      | S5                               | built                                                         |
| `HARMEAN`             | Statistical | `HARMEAN(value1, value2)`                                                                                      | Google      | `HARMEAN`                        | planned                                                       |
| `HEX2BIN`             | Engineering | `HEX2BIN(signed_hexadecimal_number, [significant_digits])`                                                     | Google      | `HEX2BIN`                        | planned                                                       |
| `HEX2DEC`             | Engineering | `HEX2DEC(signed_hexadecimal_number)`                                                                           | Google      | `HEX2DEC`                        | planned                                                       |
| `HEX2OCT`             | Engineering | `HEX2OCT(signed_hexadecimal_number, significant_digits)`                                                       | Google      | `HEX2OCT`                        | planned                                                       |
| `HLOOKUP`             | Lookup      | `HLOOKUP(search_key, range, index, [is_sorted])`                                                               | Google      | `HLOOKUP`                        | built                                                         |
| `HOUR`                | Date        | `HOUR(time)`                                                                                                   | Google      | `HOUR`                           | built                                                         |
| `HSTACK`              | Array       | `HSTACK(range1; [range2, …])`                                                                                  | Google      | `COM.MICROSOFT.HSTACK`           | planned                                                       |
| `HYPERLINK`           | Web         | `HYPERLINK(url, [link_label])`                                                                                 | Google      | `HYPERLINK`                      | built                                                         |
| `HYPGEOM.DIST`        | Statistical | `HYPGEOM.DIST(num_successes, num_draws, successes_in_pop, pop_size)`                                           | Google      | `COM.MICROSOFT.HYPGEOM.DIST`     | planned                                                       |
| `HYPGEOMDIST`         | Statistical | `HYPGEOMDIST(num_successes, num_draws, successes_in_pop, pop_size)`                                            | Google      | `HYPGEOMDIST`                    | planned                                                       |
| `IF`                  | Logical     | `IF(logical_expression, value_if_true, value_if_false)`                                                        | Google      | `IF`                             | built                                                         |
| `IFERROR`             | Logical     | `IFERROR(value, [value_if_error])`                                                                             | Google      | `IFERROR`                        | built                                                         |
| `IFNA`                | Logical     | `IFNA(value, value_if_na)`                                                                                     | Google      | `IFNA`                           | built                                                         |
| `IFS`                 | Logical     | `IFS(condition1, value1, [condition2, value2], …)`                                                             | Google      | `COM.MICROSOFT.IFS`              | built                                                         |
| `IMABS`               | Engineering | `IMABS(number)`                                                                                                | Google      | `IMABS`                          | planned                                                       |
| `IMAGE`               | Google      | `IMAGE(url, [mode], [height], [width])`                                                                        | Google      | S5                               | planned (S4)                                                  |
| `IMAGINARY`           | Engineering | `IMAGINARY(complex_number)`                                                                                    | Google      | `IMAGINARY`                      | planned                                                       |
| `IMARGUMENT`          | Engineering | `IMARGUMENT(number)`                                                                                           | Google      | `IMARGUMENT`                     | planned                                                       |
| `IMCONJUGATE`         | Engineering | `IMCONJUGATE(number)`                                                                                          | Google      | `IMCONJUGATE`                    | planned                                                       |
| `IMCOS`               | Engineering | `IMCOS(number)`                                                                                                | Google      | `IMCOS`                          | planned                                                       |
| `IMCOSH`              | Engineering | `IMCOSH(number)`                                                                                               | Google      | `IMCOSH`                         | planned                                                       |
| `IMCOT`               | Engineering | `IMCOT(number)`                                                                                                | Google      | `IMCOT`                          | planned                                                       |
| `IMCOTH`              | Engineering | `IMCOTH(number)`                                                                                               | Google      | S5                               | planned                                                       |
| `IMCSC`               | Engineering | `IMCSC(number)`                                                                                                | Google      | `IMCSC`                          | planned                                                       |
| `IMCSCH`              | Engineering | `IMCSCH(number)`                                                                                               | Google      | `IMCSCH`                         | planned                                                       |
| `IMDIV`               | Engineering | `IMDIV(dividend, divisor)`                                                                                     | Google      | `IMDIV`                          | planned                                                       |
| `IMEXP`               | Engineering | `IMEXP(exponent)`                                                                                              | Google      | `IMEXP`                          | planned                                                       |
| `IMLN`                | Math        | `IMLN(complex_value)`                                                                                          | Google      | `IMLN`                           | planned                                                       |
| `IMLOG`               | Engineering | `IMLOG(value, base)`                                                                                           | Google      | S5                               | planned                                                       |
| `IMLOG10`             | Engineering | `IMLOG10(value)`                                                                                               | Google      | `IMLOG10`                        | planned                                                       |
| `IMLOG2`              | Engineering | `IMLOG2(value)`                                                                                                | Google      | `IMLOG2`                         | planned                                                       |
| `IMPORTDATA`          | Web         | `IMPORTDATA(url)`                                                                                              | Google      | S5                               | planned (S4)                                                  |
| `IMPORTFEED`          | Web         | `IMPORTFEED(url, [query], [headers], [num_items])`                                                             | Google      | S5                               | planned (S4)                                                  |
| `IMPORTHTML`          | Web         | `IMPORTHTML(url, query, index)`                                                                                | Google      | S5                               | planned (S4)                                                  |
| `IMPORTRANGE`         | Web         | `IMPORTRANGE(spreadsheet_url, range_string)`                                                                   | Google      | S5                               | planned                                                       |
| `IMPORTXML`           | Web         | `IMPORTXML(url, xpath_query)`                                                                                  | Google      | S5                               | planned (S4)                                                  |
| `IMPOWER`             | Math        | `IMPOWER(complex_base, exponent)`                                                                              | Google      | `IMPOWER`                        | planned                                                       |
| `IMPRODUCT`           | Engineering | `IMPRODUCT(factor1, [factor2, ...])`                                                                           | Google      | `IMPRODUCT`                      | planned                                                       |
| `IMREAL`              | Engineering | `IMREAL(complex_number)`                                                                                       | Google      | `IMREAL`                         | planned                                                       |
| `IMSEC`               | Engineering | `IMSEC(number)`                                                                                                | Google      | `IMSEC`                          | planned                                                       |
| `IMSECH`              | Engineering | `IMSECH(number)`                                                                                               | Google      | `IMSECH`                         | planned                                                       |
| `IMSIN`               | Engineering | `IMSIN (number)`                                                                                               | Google      | `IMSIN`                          | planned                                                       |
| `IMSINH`              | Engineering | `IMSINH(number)`                                                                                               | Google      | `IMSINH`                         | planned                                                       |
| `IMSQRT`              | Math        | `IMSQRT(complex_number)`                                                                                       | Google      | `IMSQRT`                         | planned                                                       |
| `IMSUB`               | Engineering | `IMSUB(first_number, second_number)`                                                                           | Google      | `IMSUB`                          | planned                                                       |
| `IMSUM`               | Engineering | `IMSUM(value1, [value2, ...])`                                                                                 | Google      | `IMSUM`                          | planned                                                       |
| `IMTAN`               | Engineering | `IMTAN(number)`                                                                                                | Google      | `IMTAN`                          | planned                                                       |
| `IMTANH`              | Engineering | `IMTANH(number)`                                                                                               | Google      | S5                               | planned                                                       |
| `INDEX`               | Lookup      | `INDEX(reference, [row], [column])`                                                                            | Google      | `INDEX`                          | built                                                         |
| `INDIRECT`            | Lookup      | `INDIRECT(cell_reference_as_string, [is_A1_notation])`                                                         | Google      | `INDIRECT`                       | built                                                         |
| `INFO`                | OpenFormula |                                                                                                                | OpenFormula | `INFO`                           | planned                                                       |
| `INT`                 | Math        | `INT(value)`                                                                                                   | Google      | `INT`                            | built                                                         |
| `INTERCEPT`           | Statistical | `INTERCEPT(data_y, data_x)`                                                                                    | Google      | `INTERCEPT`                      | planned                                                       |
| `INTRATE`             | Financial   | `INTRATE(buy_date, sell_date, buy_price, sell_price, [day_count_convention])`                                  | Google      | `INTRATE`                        | planned                                                       |
| `IPMT`                | Financial   | `IPMT(rate, period, number_of_periods, present_value, [future_value], [end_or_beginning])`                     | Google      | `IPMT`                           | planned                                                       |
| `IRR`                 | Financial   | `IRR(cashflow_amounts, [rate_guess])`                                                                          | Google      | `IRR`                            | built                                                         |
| `ISBETWEEN`           | Operator    | `ISBETWEEN(value_to_compare, lower_value, upper_value, lower_value_is_inclusive, upper_value_is_inclusive)`    | Google      | S5                               | built                                                         |
| `ISBLANK`             | Info        | `ISBLANK(value)`                                                                                               | Google      | `ISBLANK`                        | built                                                         |
| `ISDATE`              | Info        | `ISDATE(value)`                                                                                                | Google      | S5                               | planned                                                       |
| `ISEMAIL`             | Info        | `ISEMAIL(value)`                                                                                               | Google      | S5                               | planned                                                       |
| `ISERR`               | Info        | `ISERR(value)`                                                                                                 | Google      | `ISERR`                          | planned                                                       |
| `ISERROR`             | Info        | `ISERROR(value)`                                                                                               | Google      | `ISERROR`                        | built                                                         |
| `ISEVEN`              | Math        | `ISEVEN(value)`                                                                                                | Google      | `ISEVEN`                         | planned                                                       |
| `ISFORMULA`           | Info        | `ISFORMULA(cell)`                                                                                              | Google      | `ISFORMULA`                      | built                                                         |
| `ISLOGICAL`           | Info        | `ISLOGICAL(value)`                                                                                             | Google      | `ISLOGICAL`                      | built                                                         |
| `ISNA`                | Info        | `ISNA(value)`                                                                                                  | Google      | `ISNA`                           | built                                                         |
| `ISNONTEXT`           | Info        | `ISNONTEXT(value)`                                                                                             | Google      | `ISNONTEXT`                      | planned                                                       |
| `ISNUMBER`            | Info        | `ISNUMBER(value)`                                                                                              | Google      | `ISNUMBER`                       | built                                                         |
| `ISO.CEILING`         | Math        | `ISO.CEILING(number, [significance])`                                                                          | Google      | `COM.MICROSOFT.ISO.CEILING`      | planned                                                       |
| `ISODD`               | Math        | `ISODD(value)`                                                                                                 | Google      | `ISODD`                          | planned                                                       |
| `ISOWEEKNUM`          | Date        | `ISOWEEKNUM(date)`                                                                                             | Google      | `ISOWEEKNUM`                     | built                                                         |
| `ISPMT`               | Financial   | `ISPMT(rate, period, number_of_periods, present_value)`                                                        | Google      | `ISPMT`                          | planned                                                       |
| `ISREF`               | Info        | `ISREF(value)`                                                                                                 | Google      | `ISREF`                          | planned                                                       |
| `ISTEXT`              | Info        | `ISTEXT(value)`                                                                                                | Google      | `ISTEXT`                         | built                                                         |
| `ISURL`               | Web         | `ISURL(value)`                                                                                                 | Google      | S5                               | planned                                                       |
| `JIS`                 | OpenFormula |                                                                                                                | OpenFormula | `JIS`                            | planned                                                       |
| `JOIN`                | Text        | `JOIN(delimiter, value_or_array1, [value_or_array2, ...])`                                                     | Google      | S5                               | built                                                         |
| `KURT`                | Statistical | `KURT(value1, value2)`                                                                                         | Google      | `KURT`                           | planned                                                       |
| `LAMBDA`              | Logical     | `LAMBDA(name, formula_expression)`                                                                             | Google      | `COM.MICROSOFT.LAMBDA`           | planned                                                       |
| `LARGE`               | Statistical | `LARGE(data, n)`                                                                                               | Google      | `LARGE`                          | built                                                         |
| `LCM`                 | Math        | `LCM(value1, value2)`                                                                                          | Google      | `LCM`                            | built                                                         |
| `LEFT`                | Text        | `LEFT(string, [number_of_characters])`                                                                         | Google      | `LEFT`                           | built                                                         |
| `LEFTB`               | Text        | `LEFTB(string, num_of_bytes)`                                                                                  | Google      | `LEFTB`                          | planned                                                       |
| `LEGACY.CHIDIST`      | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.CHIDIST`                 | planned                                                       |
| `LEGACY.CHIINV`       | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.CHIINV`                  | planned                                                       |
| `LEGACY.CHITEST`      | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.CHITEST`                 | planned                                                       |
| `LEGACY.FDIST`        | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.FDIST`                   | planned                                                       |
| `LEGACY.FINV`         | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.FINV`                    | planned                                                       |
| `LEGACY.NORMSDIST`    | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.NORMSDIST`               | planned                                                       |
| `LEGACY.NORMSINV`     | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.NORMSINV`                | planned                                                       |
| `LEGACY.TDIST`        | OpenFormula |                                                                                                                | OpenFormula | `LEGACY.TDIST`                   | planned                                                       |
| `LEN`                 | Text        | `LEN(text)`                                                                                                    | Google      | `LEN`                            | built                                                         |
| `LENB`                | Text        | `LENB(string)`                                                                                                 | Google      | `LENB`                           | planned                                                       |
| `LET`                 | Logical     | `LET(name1, value_expression1, [name2, …], [value_expression2, …], formula_expression )`                       | Google      | `COM.MICROSOFT.LET`              | planned                                                       |
| `LINEST`              | Array       | `LINEST(known_data_y, [known_data_x], [calculate_b], [verbose])`                                               | Google      | `LINEST`                         | planned                                                       |
| `LN`                  | Math        | `LN(value)`                                                                                                    | Google      | `LN`                             | built                                                         |
| `LOG`                 | Math        | `LOG(value, base)`                                                                                             | Google      | `LOG`                            | built                                                         |
| `LOG10`               | Math        | `LOG10(value)`                                                                                                 | Google      | `LOG10`                          | built                                                         |
| `LOGEST`              | Array       | `LOGEST(known_data_y, [known_data_x], [b], [verbose])`                                                         | Google      | `LOGEST`                         | planned                                                       |
| `LOGINV`              | Statistical | `LOGINV(x, mean, standard_deviation)`                                                                          | Google      | `LOGINV`                         | planned                                                       |
| `LOGNORM.DIST`        | Statistical | `LOGNORM.DIST(x, mean, standard_deviation)`                                                                    | Google      | `COM.MICROSOFT.LOGNORM.DIST`     | planned                                                       |
| `LOGNORM.INV`         | Statistical | `LOGNORM.INV(x, mean, standard_deviation)`                                                                     | Google      | `COM.MICROSOFT.LOGNORM.INV`      | planned                                                       |
| `LOGNORMDIST`         | Statistical | `LOGNORMDIST(x, mean, standard_deviation)`                                                                     | Google      | `LOGNORMDIST`                    | planned                                                       |
| `LOOKUP`              | Lookup      | `LOOKUP(search_key, search_range\|search_result_array, [result_range])`                                        | Google      | `LOOKUP`                         | built                                                         |
| `LOWER`               | Text        | `LOWER(text)`                                                                                                  | Google      | `LOWER`                          | built                                                         |
| `LT`                  | Operator    | `LT(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `LTE`                 | Operator    | `LTE(value1, value2)`                                                                                          | Google      | S5                               | built                                                         |
| `MAKEARRAY`           | Array       | `MAKEARRAY(rows, columns, LAMBDA)`                                                                             | Google      | `COM.MICROSOFT.MAKEARRAY`        | planned                                                       |
| `MAP`                 | Array       | `MAP(array1, [array2, ...], LAMBDA)`                                                                           | Google      | `COM.MICROSOFT.MAP`              | planned                                                       |
| `MARGINOFERROR`       | Statistical | `MARGINOFERROR(range, confidence)`                                                                             | Google      | S5                               | planned                                                       |
| `MATCH`               | Lookup      | `MATCH(search_key, range, [search_type])`                                                                      | Google      | `MATCH`                          | built                                                         |
| `MAX`                 | Statistical | `MAX(value1, [value2, ...])`                                                                                   | Google      | `MAX`                            | built                                                         |
| `MAXA`                | Statistical | `MAXA(value1, value2)`                                                                                         | Google      | `MAXA`                           | planned                                                       |
| `MAXIFS`              | Statistical | `MAXIFS(range, criteria_range1, criterion1, [criteria_range2, criterion2], …)`                                 | Google      | `COM.MICROSOFT.MAXIFS`           | built                                                         |
| `MDETERM`             | Array       | `MDETERM(square_matrix)`                                                                                       | Google      | `MDETERM`                        | planned                                                       |
| `MDURATION`           | Financial   | `MDURATION(settlement, maturity, rate, yield, frequency, [day_count_convention])`                              | Google      | `MDURATION`                      | planned                                                       |
| `MEDIAN`              | Statistical | `MEDIAN(value1, [value2, ...])`                                                                                | Google      | `MEDIAN`                         | built                                                         |
| `MID`                 | Text        | `MID(string, starting_at, extract_length)`                                                                     | Google      | `MID`                            | built                                                         |
| `MIDB`                | Text        | `MIDB(string)`                                                                                                 | Google      | `MIDB`                           | planned                                                       |
| `MIN`                 | Statistical | `MIN(value1, [value2, ...])`                                                                                   | Google      | `MIN`                            | built                                                         |
| `MINA`                | Statistical | `MINA(value1, value2)`                                                                                         | Google      | `MINA`                           | planned                                                       |
| `MINIFS`              | Statistical | `MINIFS(range, criteria_range1, criterion1, [criteria_range2, criterion2], …)`                                 | Google      | `COM.MICROSOFT.MINIFS`           | built                                                         |
| `MINUS`               | Operator    | `MINUS(value1, value2)`                                                                                        | Google      | S5                               | built                                                         |
| `MINUTE`              | Date        | `MINUTE(time)`                                                                                                 | Google      | `MINUTE`                         | built                                                         |
| `MINVERSE`            | Array       | `MINVERSE(square_matrix)`                                                                                      | Google      | `MINVERSE`                       | planned                                                       |
| `MIRR`                | Financial   | `MIRR(cashflow_amounts, financing_rate, reinvestment_return_rate)`                                             | Google      | `MIRR`                           | planned                                                       |
| `MMULT`               | Array       | `MMULT(matrix1, matrix2)`                                                                                      | Google      | `MMULT`                          | planned                                                       |
| `MOD`                 | Math        | `MOD(dividend, divisor)`                                                                                       | Google      | `MOD`                            | built                                                         |
| `MODE`                | Statistical | `MODE(value1, [value2, ...])`                                                                                  | Google      | `MODE`                           | built                                                         |
| `MODE.MULT`           | Statistical | `MODE.MULT(value1, value2)`                                                                                    | Google      | `COM.MICROSOFT.MODE.MULT`        | planned                                                       |
| `MODE.SNGL`           | Statistical | `MODE.SNGL(value1, [value2, ...])`                                                                             | Google      | `COM.MICROSOFT.MODE.SNGL`        | planned                                                       |
| `MONTH`               | Date        | `MONTH(date)`                                                                                                  | Google      | `MONTH`                          | built                                                         |
| `MROUND`              | Math        | `MROUND(value, factor)`                                                                                        | Google      | `MROUND`                         | built                                                         |
| `MULTINOMIAL`         | Math        | `MULTINOMIAL(value1, value2)`                                                                                  | Google      | `MULTINOMIAL`                    | planned                                                       |
| `MULTIPLE.OPERATIONS` | OpenFormula |                                                                                                                | OpenFormula | `MULTIPLE.OPERATIONS`            | planned                                                       |
| `MULTIPLY`            | Operator    | `MULTIPLY(factor1, factor2)`                                                                                   | Google      | S5                               | built                                                         |
| `MUNIT`               | Math        | `MUNIT(dimension)`                                                                                             | Google      | `MUNIT`                          | planned                                                       |
| `N`                   | Info        | `N(value)`                                                                                                     | Google      | `N`                              | built                                                         |
| `NA`                  | Info        | `NA()`                                                                                                         | Google      | `NA`                             | built                                                         |
| `NE`                  | Operator    | `NE(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `NEGBINOM.DIST`       | Statistical | `NEGBINOM.DIST(num_failures, num_successes, prob_success)`                                                     | Google      | `COM.MICROSOFT.NEGBINOM.DIST`    | planned                                                       |
| `NEGBINOMDIST`        | Statistical | `NEGBINOMDIST(num_failures, num_successes, prob_success)`                                                      | Google      | `NEGBINOMDIST`                   | planned                                                       |
| `NETWORKDAYS`         | Date        | `NETWORKDAYS(start_date, end_date, [holidays])`                                                                | Google      | `NETWORKDAYS`                    | built                                                         |
| `NETWORKDAYS.INTL`    | Date        | `NETWORKDAYS.INTL(start_date, end_date, [weekend], [holidays])`                                                | Google      | `COM.MICROSOFT.NETWORKDAYS.INTL` | planned                                                       |
| `NOMINAL`             | Financial   | `NOMINAL(effective_rate, periods_per_year)`                                                                    | Google      | `NOMINAL`                        | planned                                                       |
| `NORM.DIST`           | Statistical | `NORM.DIST(x, mean, standard_deviation, cumulative)`                                                           | Google      | `COM.MICROSOFT.NORM.DIST`        | planned                                                       |
| `NORM.INV`            | Statistical | `NORM.INV(x, mean, standard_deviation)`                                                                        | Google      | `COM.MICROSOFT.NORM.INV`         | planned                                                       |
| `NORM.S.DIST`         | Statistical | `NORM.S.DIST(x)`                                                                                               | Google      | `COM.MICROSOFT.NORM.S.DIST`      | planned                                                       |
| `NORM.S.INV`          | Statistical | `NORM.S.INV(x)`                                                                                                | Google      | `COM.MICROSOFT.NORM.S.INV`       | planned                                                       |
| `NORMDIST`            | Statistical | `NORMDIST(x, mean, standard_deviation, cumulative)`                                                            | Google      | `NORMDIST`                       | planned                                                       |
| `NORMINV`             | Statistical | `NORMINV(x, mean, standard_deviation)`                                                                         | Google      | `NORMINV`                        | planned                                                       |
| `NORMSDIST`           | Statistical | `NORMSDIST(x)`                                                                                                 | Google      | `LEGACY.NORMSDIST`               | planned                                                       |
| `NORMSINV`            | Statistical | `NORMSINV(x)`                                                                                                  | Google      | `LEGACY.NORMSINV`                | planned                                                       |
| `NOT`                 | Logical     | `NOT(logical_expression)`                                                                                      | Google      | `NOT`                            | built                                                         |
| `NOW`                 | Date        | `NOW()`                                                                                                        | Google      | `NOW`                            | built                                                         |
| `NPER`                | Financial   | `NPER(rate, payment_amount, present_value, [future_value], [end_or_beginning])`                                | Google      | `NPER`                           | built                                                         |
| `NPV`                 | Financial   | `NPV(discount, cashflow1, [cashflow2, ...])`                                                                   | Google      | `NPV`                            | built                                                         |
| `NUMBERVALUE`         | OpenFormula |                                                                                                                | OpenFormula | `NUMBERVALUE`                    | planned                                                       |
| `OCT2BIN`             | Engineering | `OCT2BIN(signed_octal_number, [significant_digits])`                                                           | Google      | `OCT2BIN`                        | planned                                                       |
| `OCT2DEC`             | Engineering | `OCT2DEC(signed_octal_number)`                                                                                 | Google      | `OCT2DEC`                        | planned                                                       |
| `OCT2HEX`             | Engineering | `OCT2HEX(signed_octal_number, [significant_digits])`                                                           | Google      | `OCT2HEX`                        | planned                                                       |
| `ODD`                 | Math        | `ODD(value)`                                                                                                   | Google      | `ODD`                            | planned                                                       |
| `ODDFPRICE`           | OpenFormula |                                                                                                                | OpenFormula | `ODDFPRICE`                      | planned                                                       |
| `ODDFYIELD`           | OpenFormula |                                                                                                                | OpenFormula | `ODDFYIELD`                      | planned                                                       |
| `ODDLPRICE`           | OpenFormula |                                                                                                                | OpenFormula | `ODDLPRICE`                      | planned                                                       |
| `ODDLYIELD`           | OpenFormula |                                                                                                                | OpenFormula | `ODDLYIELD`                      | planned                                                       |
| `OFFSET`              | Lookup      | `OFFSET(cell_reference, offset_rows, offset_columns, [height], [width])`                                       | Google      | `OFFSET`                         | built                                                         |
| `OR`                  | Logical     | `OR(logical_expression1, [logical_expression2, ...])`                                                          | Google      | `OR`                             | built                                                         |
| `PDURATION`           | Financial   | `PDURATION(rate, present_value, future_value)`                                                                 | Google      | `PDURATION`                      | planned                                                       |
| `PEARSON`             | Statistical | `PEARSON(data_y, data_x)`                                                                                      | Google      | `PEARSON`                        | planned                                                       |
| `PERCENTILE`          | Statistical | `PERCENTILE(data, percentile)`                                                                                 | Google      | `PERCENTILE`                     | built                                                         |
| `PERCENTILE.EXC`      | Statistical | `PERCENTILE.EXC(data, percentile)`                                                                             | Google      | `COM.MICROSOFT.PERCENTILE.EXC`   | planned                                                       |
| `PERCENTILE.INC`      | Statistical | `PERCENTILE.INC(data, percentile)`                                                                             | Google      | `COM.MICROSOFT.PERCENTILE.INC`   | planned                                                       |
| `PERCENTRANK`         | Statistical | `PERCENTRANK(data, value, [significant_digits])`                                                               | Google      | `PERCENTRANK`                    | planned                                                       |
| `PERCENTRANK.EXC`     | Statistical | `PERCENTRANK.EXC(data, value, [significant_digits])`                                                           | Google      | `COM.MICROSOFT.PERCENTRANK.EXC`  | planned                                                       |
| `PERCENTRANK.INC`     | Statistical | `PERCENTRANK.INC(data, value, [significant_digits])`                                                           | Google      | `COM.MICROSOFT.PERCENTRANK.INC`  | planned                                                       |
| `PERMUT`              | Statistical | `PERMUT(n, k)`                                                                                                 | Google      | `PERMUT`                         | planned                                                       |
| `PERMUTATIONA`        | Statistical | `PERMUTATIONA(number, number_chosen)`                                                                          | Google      | `PERMUTATIONA`                   | planned                                                       |
| `PHI`                 | Statistical | `PHI(x)`                                                                                                       | Google      | `PHI`                            | planned                                                       |
| `PI`                  | Math        | `PI()`                                                                                                         | Google      | `PI`                             | built                                                         |
| `PMT`                 | Financial   | `PMT(rate, number_of_periods, present_value, [future_value], [end_or_beginning])`                              | Google      | `PMT`                            | built                                                         |
| `POISSON`             | Statistical | `POISSON(x, mean, cumulative)`                                                                                 | Google      | `POISSON`                        | planned                                                       |
| `POISSON.DIST`        | Statistical | `POISSON.DIST(x, mean, [cumulative])`                                                                          | Google      | `COM.MICROSOFT.POISSON.DIST`     | planned                                                       |
| `POW`                 | Operator    | `POW(base, exponent)`                                                                                          | Google      | S5                               | built                                                         |
| `POWER`               | Math        | `POWER(base, exponent)`                                                                                        | Google      | `POWER`                          | built                                                         |
| `PPMT`                | Financial   | `PPMT(rate, period, number_of_periods, present_value, [future_value], [end_or_beginning])`                     | Google      | `PPMT`                           | planned                                                       |
| `PRICE`               | Financial   | `PRICE(settlement, maturity, rate, yield, redemption, frequency, [day_count_convention])`                      | Google      | `PRICE`                          | planned                                                       |
| `PRICEDISC`           | Financial   | `PRICEDISC(settlement, maturity, discount, redemption, [day_count_convention])`                                | Google      | `PRICEDISC`                      | planned                                                       |
| `PRICEMAT`            | Financial   | `PRICEMAT(settlement, maturity, issue, rate, yield, [day_count_convention])`                                   | Google      | `PRICEMAT`                       | planned                                                       |
| `PROB`                | Statistical | `PROB(data, probabilities, low_limit, [high_limit])`                                                           | Google      | `PROB`                           | planned                                                       |
| `PRODUCT`             | Math        | `PRODUCT(factor1, [factor2, ...])`                                                                             | Google      | `PRODUCT`                        | built                                                         |
| `PROPER`              | Text        | `PROPER(text_to_capitalize)`                                                                                   | Google      | `PROPER`                         | built                                                         |
| `PV`                  | Financial   | `PV(rate, number_of_periods, payment_amount, [future_value], [end_or_beginning])`                              | Google      | `PV`                             | built                                                         |
| `QUARTILE`            | Statistical | `QUARTILE(data, quartile_number)`                                                                              | Google      | `QUARTILE`                       | built                                                         |
| `QUARTILE.EXC`        | Statistical | `QUARTILE.EXC(data, quartile_number)`                                                                          | Google      | `COM.MICROSOFT.QUARTILE.EXC`     | planned                                                       |
| `QUARTILE.INC`        | Statistical | `QUARTILE.INC(data, quartile_number)`                                                                          | Google      | `COM.MICROSOFT.QUARTILE.INC`     | planned                                                       |
| `QUERY`               | Google      | `QUERY(data, query, [headers])`                                                                                | Google      | S5                               | planned                                                       |
| `QUOTIENT`            | Math        | `QUOTIENT(dividend, divisor)`                                                                                  | Google      | `QUOTIENT`                       | built                                                         |
| `RADIANS`             | Math        | `RADIANS(angle)`                                                                                               | Google      | `RADIANS`                        | planned                                                       |
| `RAND`                | Math        | `RAND()`                                                                                                       | Google      | `RAND`                           | built                                                         |
| `RANDARRAY`           | Math        | `RANDARRAY(rows, columns)`                                                                                     | Google      | `COM.MICROSOFT.RANDARRAY`        | planned                                                       |
| `RANDBETWEEN`         | Math        | `RANDBETWEEN(low, high)`                                                                                       | Google      | `RANDBETWEEN`                    | built                                                         |
| `RANK`                | Statistical | `RANK(value, data, [is_ascending])`                                                                            | Google      | `RANK`                           | built                                                         |
| `RANK.AVG`            | Statistical | `RANK.AVG(value, data, [is_ascending])`                                                                        | Google      | `COM.MICROSOFT.RANK.AVG`         | planned                                                       |
| `RANK.EQ`             | Statistical | `RANK.EQ(value, data, [is_ascending])`                                                                         | Google      | `COM.MICROSOFT.RANK.EQ`          | planned                                                       |
| `RATE`                | Financial   | `RATE(number_of_periods, payment_per_period, present_value, [future_value], [end_or_beginning], [rate_guess])` | Google      | `RATE`                           | built                                                         |
| `RECEIVED`            | Financial   | `RECEIVED(settlement, maturity, investment, discount, [day_count_convention])`                                 | Google      | `RECEIVED`                       | planned                                                       |
| `REDUCE`              | Array       | `REDUCE(initial_value, array_or_range, LAMBDA)`                                                                | Google      | `COM.MICROSOFT.REDUCE`           | planned                                                       |
| `REGEXEXTRACT`        | Text        | `REGEXEXTRACT(text, regular_expression)`                                                                       | Google      | S5                               | built                                                         |
| `REGEXMATCH`          | Text        | `REGEXMATCH(text, regular_expression)`                                                                         | Google      | S5                               | built                                                         |
| `REGEXREPLACE`        | Text        | `REGEXREPLACE(text, regular_expression, replacement)`                                                          | Google      | S5                               | built                                                         |
| `REPLACE`             | Text        | `REPLACE(text, position, length, new_text)`                                                                    | Google      | `REPLACE`                        | built                                                         |
| `REPLACEB`            | Text        | `REPLACEB(text, position, num_bytes, new_text)`                                                                | Google      | `REPLACEB`                       | planned                                                       |
| `REPT`                | Text        | `REPT(text_to_repeat, number_of_repetitions)`                                                                  | Google      | `REPT`                           | built                                                         |
| `RIGHT`               | Text        | `RIGHT(string, [number_of_characters])`                                                                        | Google      | `RIGHT`                          | built                                                         |
| `RIGHTB`              | Text        | `RIGHTB(string, num_of_bytes)`                                                                                 | Google      | `RIGHTB`                         | planned                                                       |
| `ROMAN`               | Text        | `ROMAN(number, [rule_relaxation])`                                                                             | Google      | `ROMAN`                          | planned                                                       |
| `ROUND`               | Math        | `ROUND(value, [places])`                                                                                       | Google      | `ROUND`                          | built                                                         |
| `ROUNDDOWN`           | Math        | `ROUNDDOWN(value, [places])`                                                                                   | Google      | `ROUNDDOWN`                      | built                                                         |
| `ROUNDUP`             | Math        | `ROUNDUP(value, [places])`                                                                                     | Google      | `ROUNDUP`                        | built                                                         |
| `ROW`                 | Lookup      | `ROW([cell_reference])`                                                                                        | Google      | `ROW`                            | built                                                         |
| `ROWS`                | Lookup      | `ROWS(range)`                                                                                                  | Google      | `ROWS`                           | built                                                         |
| `RRI`                 | Financial   | `RRI(number_of_periods, present_value, future_value)`                                                          | Google      | `RRI`                            | planned                                                       |
| `RSQ`                 | Statistical | `RSQ(data_y, data_x)`                                                                                          | Google      | `RSQ`                            | planned                                                       |
| `SCAN`                | Array       | `SCAN(initial_value, array_or_range, LAMBDA)`                                                                  | Google      | `COM.MICROSOFT.SCAN`             | planned                                                       |
| `SEARCH`              | Text        | `SEARCH(search_for, text_to_search, [starting_at])`                                                            | Google      | `SEARCH`                         | built                                                         |
| `SEARCHB`             | Text        | `SEARCHB(search_for, text_to_search, [starting_at])`                                                           | Google      | `SEARCHB`                        | planned                                                       |
| `SEC`                 | Math        | `SEC(angle)`                                                                                                   | Google      | `SEC`                            | planned                                                       |
| `SECH`                | Math        | `SECH(value)`                                                                                                  | Google      | `SECH`                           | planned                                                       |
| `SECOND`              | Date        | `SECOND(time)`                                                                                                 | Google      | `SECOND`                         | built                                                         |
| `SEQUENCE`            | Math        | `SEQUENCE(rows, columns, start, step)`                                                                         | Google      | `COM.MICROSOFT.SEQUENCE`         | built                                                         |
| `SERIESSUM`           | Math        | `SERIESSUM(x, n, m, a)`                                                                                        | Google      | `SERIESSUM`                      | planned                                                       |
| `SHEET`               | Lookup      | `SHEET(value)`                                                                                                 | Google      | `SHEET`                          | planned                                                       |
| `SHEETS`              | Info        | `SHEETS(reference)`                                                                                            | Google      | `SHEETS`                         | planned                                                       |
| `SIGN`                | Math        | `SIGN(value)`                                                                                                  | Google      | `SIGN`                           | built                                                         |
| `SIN`                 | Math        | `SIN(angle)`                                                                                                   | Google      | `SIN`                            | planned                                                       |
| `SINH`                | Math        | `SINH(value)`                                                                                                  | Google      | `SINH`                           | planned                                                       |
| `SKEW`                | Statistical | `SKEW(value1, value2)`                                                                                         | Google      | `SKEW`                           | planned                                                       |
| `SKEW.P`              | Statistical | `SKEW.P(value1, value2)`                                                                                       | Google      | S5                               | planned                                                       |
| `SKEWP`               | OpenFormula |                                                                                                                | OpenFormula | `SKEWP`                          | planned                                                       |
| `SLN`                 | Financial   | `SLN(cost, salvage, life)`                                                                                     | Google      | `SLN`                            | planned                                                       |
| `SLOPE`               | Statistical | `SLOPE(data_y, data_x)`                                                                                        | Google      | `SLOPE`                          | planned                                                       |
| `SMALL`               | Statistical | `SMALL(data, n)`                                                                                               | Google      | `SMALL`                          | built                                                         |
| `SORT`                | Filter      | `SORT(range, sort_column, is_ascending, [sort_column2], [is_ascending2])`                                      | Google      | `COM.MICROSOFT.SORT`             | built                                                         |
| `SORTBY`              | Arrays      |                                                                                                                | OpenFormula | `COM.MICROSOFT.SORTBY`           | built                                                         |
| `SORTN`               | Filter      | `SORTN(range, [n], [display_ties_mode], [sort_column1, is_ascending1], ...)`                                   | Google      | S5                               | planned                                                       |
| `SPARKLINE`           | Google      | `SPARKLINE(data, [options])`                                                                                   | Google      | S5                               | planned                                                       |
| `SPLIT`               | Text        | `SPLIT(text, delimiter, [split_by_each], [remove_empty_text])`                                                 | Google      | S5                               | built                                                         |
| `SQRT`                | Math        | `SQRT(value)`                                                                                                  | Google      | `SQRT`                           | built                                                         |
| `SQRTPI`              | Math        | `SQRTPI(value)`                                                                                                | Google      | `SQRTPI`                         | planned                                                       |
| `STANDARDIZE`         | Statistical | `STANDARDIZE(value, mean, standard_deviation)`                                                                 | Google      | `STANDARDIZE`                    | planned                                                       |
| `STDEV`               | Statistical | `STDEV(value1, [value2, ...])`                                                                                 | Google      | `STDEV`                          | built                                                         |
| `STDEV.P`             | Statistical | `STDEV.P(value1, [value2, ...])`                                                                               | Google      | `COM.MICROSOFT.STDEV.P`          | built                                                         |
| `STDEV.S`             | Statistical | `STDEV.S(value1, [value2, ...])`                                                                               | Google      | `COM.MICROSOFT.STDEV.S`          | planned                                                       |
| `STDEVA`              | Statistical | `STDEVA(value1, value2)`                                                                                       | Google      | `STDEVA`                         | planned                                                       |
| `STDEVP`              | Statistical | `STDEVP(value1, value2)`                                                                                       | Google      | `STDEVP`                         | planned                                                       |
| `STDEVPA`             | Statistical | `STDEVPA(value1, value2)`                                                                                      | Google      | `STDEVPA`                        | planned                                                       |
| `STEYX`               | Statistical | `STEYX(data_y, data_x)`                                                                                        | Google      | `STEYX`                          | planned                                                       |
| `SUBSTITUTE`          | Text        | `SUBSTITUTE(text_to_search, search_for, replace_with, [occurrence_number])`                                    | Google      | `SUBSTITUTE`                     | built                                                         |
| `SUBTOTAL`            | Math        | `SUBTOTAL(function_code, range1, [range2, ...])`                                                               | Google      | `SUBTOTAL`                       | planned                                                       |
| `SUM`                 | Math        | `SUM(value1, [value2, ...])`                                                                                   | Google      | `SUM`                            | built                                                         |
| `SUMIF`               | Math        | `SUMIF(range, criterion, [sum_range])`                                                                         | Google      | `SUMIF`                          | built                                                         |
| `SUMIFS`              | Math        | `SUMIFS(sum_range, criteria_range1, criterion1, [criteria_range2, criterion2, ...])`                           | Google      | `SUMIFS`                         | built                                                         |
| `SUMPRODUCT`          | Array       | `SUMPRODUCT(array1, [array2, ...])`                                                                            | Google      | `SUMPRODUCT`                     | built                                                         |
| `SUMSQ`               | Math        | `SUMSQ(value1, [value2, ...])`                                                                                 | Google      | `SUMSQ`                          | planned                                                       |
| `SUMX2MY2`            | Array       | `SUMX2MY2(array_x, array_y)`                                                                                   | Google      | `SUMX2MY2`                       | planned                                                       |
| `SUMX2PY2`            | Array       | `SUMX2PY2(array_x, array_y)`                                                                                   | Google      | `SUMX2PY2`                       | planned                                                       |
| `SUMXMY2`             | Array       | `SUMXMY2(array_x, array_y)`                                                                                    | Google      | `SUMXMY2`                        | planned                                                       |
| `SWITCH`              | Logical     | `SWITCH(expression, case1, value1, [default or case2, value2], …)`                                             | Google      | `COM.MICROSOFT.SWITCH`           | built                                                         |
| `SYD`                 | Financial   | `SYD(cost, salvage, life, period)`                                                                             | Google      | `SYD`                            | planned                                                       |
| `T`                   | Text        | `T(value)`                                                                                                     | Google      | `T`                              | planned                                                       |
| `T.DIST`              | Statistical | `T.DIST(x, degrees_freedom, cumulative)`                                                                       | Google      | `COM.MICROSOFT.T.DIST`           | planned                                                       |
| `T.DIST.2T`           | Statistical | `T.DIST.2T(x, degrees_freedom)`                                                                                | Google      | `COM.MICROSOFT.T.DIST.2T`        | planned                                                       |
| `T.DIST.RT`           | Statistical | `T.DIST.RT(x, degrees_freedom)`                                                                                | Google      | `COM.MICROSOFT.T.DIST.RT`        | planned                                                       |
| `T.INV`               | Statistical | `T.INV(probability, degrees_freedom)`                                                                          | Google      | `COM.MICROSOFT.T.INV`            | planned                                                       |
| `T.INV.2T`            | Statistical | `T.INV.2T(probability, degrees_freedom)`                                                                       | Google      | `COM.MICROSOFT.T.INV.2T`         | planned                                                       |
| `T.TEST`              | Statistical | `T.TEST(range1, range2, tails, type)`                                                                          | Google      | `COM.MICROSOFT.T.TEST`           | planned                                                       |
| `TAN`                 | Math        | `TAN(angle)`                                                                                                   | Google      | `TAN`                            | planned                                                       |
| `TANH`                | Math        | `TANH(value)`                                                                                                  | Google      | `TANH`                           | planned                                                       |
| `TBILLEQ`             | Financial   | `TBILLEQ(settlement, maturity, discount)`                                                                      | Google      | `TBILLEQ`                        | planned                                                       |
| `TBILLPRICE`          | Financial   | `TBILLPRICE(settlement, maturity, discount)`                                                                   | Google      | `TBILLPRICE`                     | planned                                                       |
| `TBILLYIELD`          | Financial   | `TBILLYIELD(settlement, maturity, price)`                                                                      | Google      | `TBILLYIELD`                     | planned                                                       |
| `TDIST`               | Statistical | `TDIST(x, degrees_freedom, tails)`                                                                             | Google      | `LEGACY.TDIST`                   | planned                                                       |
| `TEXT`                | Text        | `TEXT(number, format)`                                                                                         | Google      | `TEXT`                           | built                                                         |
| `TEXTJOIN`            | Text        | `TEXTJOIN(delimiter, ignore_empty, text1, [text2], …)`                                                         | Google      | `COM.MICROSOFT.TEXTJOIN`         | built                                                         |
| `TIME`                | Date        | `TIME(hour, minute, second)`                                                                                   | Google      | `TIME`                           | built                                                         |
| `TIMEVALUE`           | Date        | `TIMEVALUE(time_string)`                                                                                       | Google      | `TIMEVALUE`                      | built                                                         |
| `TINV`                | Statistical | `TINV(probability, degrees_freedom)`                                                                           | Google      | `TINV`                           | planned                                                       |
| `TOCOL`               | Array       | `TOCOL(array_or_range, [ignore], [scan_by_column])`                                                            | Google      | `COM.MICROSOFT.TOCOL`            | planned                                                       |
| `TODAY`               | Date        | `TODAY()`                                                                                                      | Google      | `TODAY`                          | built                                                         |
| `TOROW`               | Array       | `TOROW(array_or_range, [ignore], [scan_by_column])`                                                            | Google      | `COM.MICROSOFT.TOROW`            | planned                                                       |
| `TO_DATE`             | Parser      | `TO_DATE(value)`                                                                                               | Google      | S5                               | planned                                                       |
| `TO_DOLLARS`          | Parser      | `TO_DOLLARS(value)`                                                                                            | Google      | S5                               | planned                                                       |
| `TO_PERCENT`          | Parser      | `TO_PERCENT(value)`                                                                                            | Google      | S5                               | planned                                                       |
| `TO_PURE_NUMBER`      | Parser      | `TO_PURE_NUMBER(value)`                                                                                        | Google      | S5                               | planned                                                       |
| `TO_TEXT`             | Parser      | `TO_TEXT(value)`                                                                                               | Google      | S5                               | planned                                                       |
| `TRANSPOSE`           | Array       | `TRANSPOSE(array_or_range)`                                                                                    | Google      | `TRANSPOSE`                      | built                                                         |
| `TREND`               | Array       | `TREND(known_data_y, [known_data_x], [new_data_x], [b])`                                                       | Google      | `TREND`                          | planned                                                       |
| `TRIM`                | Text        | `TRIM(text)`                                                                                                   | Google      | `TRIM`                           | built                                                         |
| `TRIMMEAN`            | Statistical | `TRIMMEAN(data, exclude_proportion)`                                                                           | Google      | `TRIMMEAN`                       | planned                                                       |
| `TRUE`                | Logical     | `TRUE()`                                                                                                       | Google      | `TRUE`                           | built                                                         |
| `TRUNC`               | Math        | `TRUNC(value, [places])`                                                                                       | Google      | `TRUNC`                          | built                                                         |
| `TTEST`               | Statistical | `TTEST(range1, range2, tails, type)`                                                                           | Google      | `TTEST`                          | planned                                                       |
| `TYPE`                | Info        | `TYPE(value)`                                                                                                  | Google      | `TYPE`                           | built                                                         |
| `UMINUS`              | Operator    | `UMINUS(value)`                                                                                                | Google      | S5                               | built                                                         |
| `UNARY_PERCENT`       | Operator    | `UNARY_PERCENT(percentage)`                                                                                    | Google      | S5                               | built                                                         |
| `UNICHAR`             | Text        | `UNICHAR(number)`                                                                                              | Google      | `UNICHAR`                        | planned                                                       |
| `UNICODE`             | Text        | `UNICODE(text)`                                                                                                | Google      | `UNICODE`                        | planned                                                       |
| `UNIQUE`              | Filter      | `UNIQUE(range)`                                                                                                | Google      | `COM.MICROSOFT.UNIQUE`           | built                                                         |
| `UPLUS`               | Operator    | `UPLUS(value)`                                                                                                 | Google      | S5                               | built                                                         |
| `UPPER`               | Text        | `UPPER(text)`                                                                                                  | Google      | `UPPER`                          | built                                                         |
| `VALUE`               | Text        | `VALUE(text)`                                                                                                  | Google      | `VALUE`                          | built                                                         |
| `VAR`                 | Statistical | `VAR(value1, [value2, ...])`                                                                                   | Google      | `VAR`                            | built                                                         |
| `VAR.P`               | Statistical | `VAR.P(value1, [value2, ...])`                                                                                 | Google      | `COM.MICROSOFT.VAR.P`            | built                                                         |
| `VAR.S`               | Statistical | `VAR.S(value1, [value2, ...])`                                                                                 | Google      | `COM.MICROSOFT.VAR.S`            | planned                                                       |
| `VARA`                | Statistical | `VARA(value1, value2)`                                                                                         | Google      | `VARA`                           | planned                                                       |
| `VARP`                | Statistical | `VARP(value1, value2)`                                                                                         | Google      | `VARP`                           | planned                                                       |
| `VARPA`               | Statistical | `VARPA(value1, value2,...)`                                                                                    | Google      | `VARPA`                          | planned                                                       |
| `VDB`                 | Financial   | `VDB(cost, salvage, life, start_period, end_period, [factor], [no_switch])`                                    | Google      | `VDB`                            | planned                                                       |
| `VLOOKUP`             | Lookup      | `VLOOKUP(search_key, range, index, [is_sorted])`                                                               | Google      | `VLOOKUP`                        | built                                                         |
| `VSTACK`              | Array       | `VSTACK(range1; [range2, …])`                                                                                  | Google      | `COM.MICROSOFT.VSTACK`           | planned                                                       |
| `WEEKDAY`             | Date        | `WEEKDAY(date, [type])`                                                                                        | Google      | `WEEKDAY`                        | built                                                         |
| `WEEKNUM`             | Date        | `WEEKNUM(date, [type])`                                                                                        | Google      | `WEEKNUM`                        | built                                                         |
| `WEIBULL`             | Statistical | `WEIBULL(x, shape, scale, cumulative)`                                                                         | Google      | `WEIBULL`                        | planned                                                       |
| `WEIBULL.DIST`        | Statistical | `WEIBULL.DIST(x, shape, scale, cumulative)`                                                                    | Google      | `COM.MICROSOFT.WEIBULL.DIST`     | planned                                                       |
| `WORKDAY`             | Date        | `WORKDAY(start_date, num_days, [holidays])`                                                                    | Google      | `WORKDAY`                        | built                                                         |
| `WORKDAY.INTL`        | Date        | `WORKDAY.INTL(start_date, num_days, [weekend], [holidays])`                                                    | Google      | `COM.MICROSOFT.WORKDAY.INTL`     | planned                                                       |
| `WRAPCOLS`            | Array       | `WRAPCOLS(range, wrap_count, [pad_with])`                                                                      | Google      | `COM.MICROSOFT.WRAPCOLS`         | planned                                                       |
| `WRAPROWS`            | Array       | `WRAPROWS(range, wrap_count, [pad_with])`                                                                      | Google      | `COM.MICROSOFT.WRAPROWS`         | planned                                                       |
| `XIRR`                | Financial   | `XIRR(cashflow_amounts, cashflow_dates, [rate_guess])`                                                         | Google      | `XIRR`                           | planned                                                       |
| `XLOOKUP`             | Lookup      | `XLOOKUP(search_key, lookup_range, result_range, missing_value, [match_mode], [search_mode])`                  | Google      | `COM.MICROSOFT.XLOOKUP`          | built                                                         |
| `XMATCH`              | Lookup      |                                                                                                                | OpenFormula | `COM.MICROSOFT.XMATCH`           | built                                                         |
| `XNPV`                | Financial   | `XNPV(discount, cashflow_amounts, cashflow_dates)`                                                             | Google      | `XNPV`                           | planned                                                       |
| `XOR`                 | Logical     | `XOR(logical_expression1, [logical_expression2, ...])`                                                         | Google      | `XOR`                            | built                                                         |
| `YEAR`                | Date        | `YEAR(date)`                                                                                                   | Google      | `YEAR`                           | built                                                         |
| `YEARFRAC`            | Date        | `YEARFRAC(start_date, end_date, [day_count_convention])`                                                       | Google      | `YEARFRAC`                       | built                                                         |
| `YIELD`               | Financial   | `YIELD(settlement, maturity, rate, price, redemption, frequency, [day_count_convention])`                      | Google      | `YIELD`                          | planned                                                       |
| `YIELDDISC`           | Financial   | `YIELDDISC(settlement, maturity, price, redemption, [day_count_convention])`                                   | Google      | `YIELDDISC`                      | planned                                                       |
| `YIELDMAT`            | Financial   | `YIELDMAT(settlement, maturity, issue, rate, price, [day_count_convention])`                                   | Google      | `YIELDMAT`                       | planned                                                       |
| `Z.TEST`              | Statistical | `Z.TEST(data, value, [standard_deviation])`                                                                    | Google      | `COM.MICROSOFT.Z.TEST`           | planned                                                       |
| `ZTEST`               | Statistical | `ZTEST(data, value, [standard_deviation])`                                                                     | Google      | `ZTEST`                          | planned                                                       |

## Other workbooks

- `IMPORTRANGE(spreadsheet_url, range_string)` reads a range of another LiveDoc spreadsheet by its document address,
  with the reader's own access: a reader who may not open that spreadsheet sees `#REF!` ("You need access to …").
- The first use in a spreadsheet asks an Editor to **Allow Access** (Google's consent), recorded for the pair of
  documents; until allowed it shows `#REF!` with the button in its hover card.
- Values refresh when the source changes, at most once a minute per pair; a file keeps the last values as cached.
- Addresses of other services read `#REF!` ("Only LiveDoc spreadsheets can be imported").

## The oracle

- Each function is measured against an **oracle corpus**: OpenFormula's own test cases, values LibreOffice
  calculates headless from the same inputs, and the values Google Sheets gives the same workbook.
- The corpus is **cases by category** (the catalogue's categories, and `Syntax` for the language itself): each case
  a formula over its category's fixture, and the rows and columns its answer fills (one cell unless it spills).
- **Answers** are kept per source beside the cases, made by a script from the source itself, never typed by hand:
  LibreOffice's by converting the category's workbook headless with every formula worked out afresh; Google's by
  the same workbook opened in Google Sheets and downloaded again. An answer a source documents (OpenFormula's own
  test cases, Google's help pages) may be written in its case instead, citing where.
- A case holds to the answer of its function's **Authority** above; until Google's answer is in, a Google case holds
  to LibreOffice's and is counted as provisional (default, D31). A case LibreOffice answers otherwise than Google
  documents waits for Google's answer, counted, held to none (default, D32).
- Where two sources answer differently, the case names the difference and why; an unnamed difference fails.
- Numbers agree to one part in a billion (a case may loosen it to one in a million, saying why); text and booleans
  exactly; errors by their code, never their wording.
- The corpus runs in `en-US`, in UTC, at a fixed now (default, D33); volatile functions are held by their own tests.
- CI runs the corpus on every change, with no LibreOffice needed; a function reads **built** only while its cases pass,
  and every function the engine knows has at least one case.

## Recalculation

- A change recalculates only the cells that depend on it (directly or through others), plus volatile ones.
- A read works out what a formula names cell by cell first, deepest first, so each formula of a long chain of
  references is worked out once, however long the chain.
- A sheet's values are worked out the first time it is drawn, and kept while its document is open.
- A loop is found whole: every formula that reads itself through the others is one loop, however the reading starts,
  so every cell of it shows the same `#REF!`, a cell catching errors (`IFERROR`) too; a formula that only reads
  the loop is not in it.
- With iterative calculation on ([Settings](settings.md)) a loop is worked out in rounds instead: the first round
  reads each loop cell as the value it last settled to (empty the first time), each later round as the value the round
  before gave it, a cell already worked out in the round giving its new value. The rounds stop at Max Number of
  Iterations, or after a round where no value moved by the Threshold or more; the last round's values stand, and the
  next recalculation starts from them (verified: Google stops "when results from successive calculations differ by
  less than that threshold value"; the loop starting from its last values is inferred from Google's self-reading
  timestamp formulas, D35).
- A recalculation that would take longer than a frame is done in parts, values filling in as they are ready; cells
  waiting show their last value, faded.
- The engine bounds its work: a formula reading more than 1,000,000 cells, or a recalculation of more than
  5,000,000 cell reads, stops with `#NUM!` in the cells it did not reach and says "This sheet is too large to
  recalculate at once".

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D1** How row and column ids are made: 6-character random base-36 ids, made by the client; a collision is refused
  (default).
- **D2** A write's byte size: 1 MB, so one D1 parameter stays well under its 2 MB value limit (default).
- **D3** Largest array a formula may return: 100,000 values (default).
- **D4** How the regex time limit is enforced: A work estimate (text length × pattern length) up to 10,000,000
  (default).
- **D14** Two-digit years: Below 70 are 20xx, else 19xx (default).
- **D30** The intersection and union operators: Read as Excel writes them, a superset of Google's (default).
- **D31** A Google case before Google's answer is in: Held to LibreOffice's, counted as provisional (default).
- **D32** A case LibreOffice answers otherwise, before Google's answer: Waits, counted, held to none (default).
- **D33** The oracle's locale, zone and now: `en-US`, UTC, a fixed now (default).
- **D34** Plan Sheets' arrays until their migration: Every formula an array context, as before (default).
- **D35** Where a loop's first round starts: The values its cells last settled to, kept by cell for the open document,
  forgotten when the cell is retyped; a document opened afresh starts its loops from empty (default).
- **D36** A loop longer than the read stack (250 formulas): `#REF!` with iterative calculation on as well (default).
- **D37** Volatile ticks while the page is hidden: Held, one tick as the page shows again (default).
