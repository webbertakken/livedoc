# Formulas

**Status: built** (plan 0020 Phase 6): the language, the recalculation engine (in a Web Worker in the browser), the
catalogue's functions marked **built** below, each held by [the oracle](#the-oracle), [other workbooks](#other-workbooks)
and the [locale](#locale). The engine is the pure `@livedoc/sheets` package, shared by every kind that holds a table
of formulas.

A [sheet](sheet.md)'s cells hold **inputs**; what they show are **values**. A formula is an input that starts with
`=` and works its value out from other cells, other sheets on the tab and the document's Plan cards. The language
is the one people already write in Google Sheets and Excel: the same operators, references and function names, so
a formula pasted from either works here when it uses what this page lists.

Values are worked out in the browser (and by the api and MCP for images and agents) by the same pure engine, so
everyone sees the same values for the same inputs. A spreadsheet reads and shows them in its own locale, the same for
everyone ([Locale](#locale)); a Plan Sheet in the viewer's, so only its number formats differ from person to person.

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
  `DATEVALUE`, `EDATE`, `EOMONTH`, `WORKDAY`, `WORKDAY.INTL`, `TO_DATE`, `COUPPCD` or `COUPNCD` is Date, `NOW` and
  `EPOCHTODATE` are Date Time, `TIME` and `TIMEVALUE` are Time, `TO_DOLLARS` Currency in US dollars and `TO_PERCENT`
  Percent, and so is one of them plus or minus a plain number (`=TODAY()+7`); any other formula (arithmetic with a
  cell, `=A1+7`, or between dates, `=A1-TODAY()`, which is a number of days) stays Automatic. It is taken only by a
  cell whose format is Automatic, however the formula arrives (typed, pasted, or written by an agent), so a cell
  someone formatted keeps its format. `=TODAY()` drew as `46314` before this.
- A cell already formatted as **Plain Text** keeps whatever is typed as text.
- Separators are read in the locale ([Locale](#locale)): `1.234,5` is a number where the locale writes it so.
- The formula bar shows a stored number unformatted (`0.12`, or the date in the locale's short form).

## Locale

A spreadsheet's **locale** and **time zone** are its own ([Settings](settings.md)), so everyone working on it reads,
types and sees it alike, wherever they are (verified: Google's "Set a spreadsheet's location & calculation
settings"). A Plan Sheet has none of its own: it reads as the viewer's browser does (default, D79).

- **Inputs** are read in the locale: its decimal mark and grouping, its day and month order, its currency symbol
  ([What a typed input becomes](#what-a-typed-input-becomes)); so are text read as a number or a date by a formula
  (`VALUE`, `DATEVALUE`, `="1,5"+1`, `ISDATE`) and imported values ([Imports](imports.md)).
- **Values** are drawn in the locale: number formats, dates, `DOLLAR`'s and `FIXED`'s text.
- **Separators in formulas** follow the locale's decimal mark (verified: Google's "Using arrays in Google Sheets"):

  | The locale writes decimals | Decimal in a formula | Between arguments | Between columns in `{}` | Between rows in `{}` |
  | -------------------------- | -------------------- | ----------------- | ----------------------- | -------------------- |
  | with a point (en, ja, ...) | `1.5`                | `,`               | `,`                     | `;`                  |
  | with a comma (de, fr, ...) | `1,5`                | `;`               | `\`                     | `;`                  |

  So `=ROUND(1.5, 0)` and `={1, 2; 3, 4}` in en-US are `=ROUND(1,5; 0)` and `={1\2; 3\4}` in de-DE. Which group
  a locale is in is its own decimal mark, as the browser's Intl writes it (default, D78).

- In a decimal-comma locale a comma outside a number, and a point in a number, cannot be read: the formula is
  refused where they are (default, D78). Text in quotes and quoted sheet names are never touched.
- **Formulas are stored in one syntax**, English with points and commas, whatever the locale: changing a
  spreadsheet's locale changes how every formula reads and is typed, never what it means. The formula bar, find and
  replace in formulas, a rule's custom formula, the function hints and `FORMULATEXT` show the locale's separators.
- Agents, files and the api read and write the stored syntax (an agent types as `en-GB`, [Sheet store](sheet-store.md)).
- **Function names** are English in every locale (Display Language is English only, [Settings](settings.md)). A
  function's name is not case sensitive and is kept in capitals (`=sum(a1)` reads `=SUM(A1)`), as the catalogue
  and Google's help write them; a name no function has keeps the case it was typed in (default, D80).
  Named ranges and `LET` and `LAMBDA` names keep theirs too.
- **The time zone** is the wall clock `NOW` and `TODAY` read, for everyone, and the date Ctrl+; types. A time
  zone the browser does not know reads as UTC, and a locale it does not know as `en` (default, D81).
- A change of locale or time zone (an Editor's Save Settings, an agent's) is seen by everyone at once: each open page
  works every value out again in the new ones.

## References

- **A1 references**: `B4`; absolute parts with `$` (`$B$4`, `B$4`, `$B4`), which do not shift when the formula is
  copied, filled or pasted.
- **Ranges**: `A1:C5`, whole columns `A:C`, whole rows `2:4`, and open ends of a filled column (`A2:A`).
- A reference past the grid (`ZZ1` on a 26-column sheet) is `#REF!`.
- References are not case sensitive; they are stored upper case.

### Other sheets

- `'Sheet title'!B4` (quotes needed when the title holds a space or a symbol; `Budget!B4` otherwise) reads a cell
  of another sheet **on the same tab**, by its title; a range too (`'Q3 Costs'!A1:D20`).
- In a spreadsheet the tab is the whole workbook: its sheets are the document's tabs ([Spreadsheet](spreadsheet.md)),
  so a reference reads any of them, and renaming or deleting one acts on every sheet's formulas.
- Renaming a sheet rewrites every formula on the tab that names it; a reference to a title no sheet on the tab has
  (deleted, or never there) is `#REF!` "Unresolved sheet name 'Title'." until a sheet of that title is there again
  (verified: Google's words, its forums).
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

### Named functions

- A **named function** is a spreadsheet's own function, made in Data › Named Functions
  ([Data tools](data-tools.md#named-ranges-and-named-functions)): a name, its argument placeholders and a definition
  formula reading them by name. With `CONTAINS(search_query, search_range)` defined as
  `=NOT(ISERROR(MATCH(search_query, search_range, 0)))`, `=CONTAINS(B3, B3:B14)` works out the definition with
  `search_query` read as `B3` and `search_range` as `B3:B14`. Every sheet of the spreadsheet may call it; a Plan
  Sheet has none.
- An argument is passed as it is worked out: a range stays a range, a value a value, a `LAMBDA` a `LAMBDA`. Inside
  the definition a placeholder hides a named range of its name, as a `LET` name does; the caller's `LET` and
  `LAMBDA` names are not seen.
- Called with another count of values it is `#N/A` ("Wrong number of arguments to CONTAINS. Expected exactly 2
  arguments, but got 1 argument."). Handed to a helper without brackets (`=MAP(A1:A9, DOUBLE)`), it is applied as a
  `LAMBDA` of its placeholders.
- A definition may call other named functions, and itself: each call counts against the recalculation budget as a
  `LAMBDA`'s does, and calls nested deeper than 100 are `#NUM!` ("This named function calls itself too deeply")
  (default, D300).
- A definition reads cells through its placeholders, named ranges and references of its own (`A1`, `Sheet2!B:B`).
  As Google's, a reference in a definition is kept as an absolute reference to its sheet: `A1` typed while Sheet1 is
  open is saved, and shown again, as `Sheet1!$A$1`, whichever sheet calls the function (D301, ruled 2026-11-26).
  It is held as a formula's references are, by its sheet's, rows' and columns' ids, so it follows that sheet's
  renames and its rows and columns inserted or moved; rows or columns deleted inside a range shrink it, as a range
  read from another sheet shrinks ("Other sheets"); a cell deleted, or a range all deleted, is `#REF!`, and so is
  every reference once its sheet is deleted.
- Changing or removing a named function works every formula out again; a call to one removed is `#NAME?` ("Unknown
  function CONTAINS"), as any unknown function is.

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
- In an array context, a function that reads some arguments whole still works cell by cell over a single-value
  argument given many values: `=ARRAYFORMULA(VLOOKUP(A2:A5, D:E, 2, FALSE))` looks up four keys. These lift so: the
  criterion of `SUMIF` and `COUNTIF`, the criteria of `COUNTIFS`, the key of `VLOOKUP`, `HLOOKUP` and `MATCH`, and
  the k of `LARGE` and `SMALL`. `SUMIFS`, `AVERAGEIF` and `AVERAGEIFS` do not: they give one value, a criteria
  range read at the formula's own row or column (none there: an empty criterion), an array criterion by its first
  value (D67).
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

## LAMBDA and LET

- `LET(name1, value1, [name2, value2, …], expression)` names values inside one formula: each value is worked out once,
  in order, and later values and the expression read the names before them. A value that is a range stays a range
  (`=LET(r, A1:A9, ROWS(r))` is 9).
- A **name** is case-insensitive, made of letters, digits, `_` and `.`, not starting with a digit and not a cell
  reference (`A1`, `x1`): any other is `#VALUE!` ("Argument 1 of function LET is not a valid name.") (default, D68). A name
  hides a named range or function of the same name inside its formula; one read before it is declared is `#NAME?`.
- `LAMBDA(name1, [name2, …], expression)` makes a function of its names. It is called by brackets after it
  (`=LAMBDA(x, x*2)(5)` is 10), by a `LET` name (`=LET(double, LAMBDA(x, x*2), double(5))`), or handed to a
  helper below. Called with another count of values it is `#N/A` ("Wrong number of arguments to LAMBDA. Expected 1
  argument, but got 2 arguments."). Left uncalled, as a cell's value or where a value goes, it is `#VALUE!` ("The
  LAMBDA wasn't called with its values.") (default, D68).
- The **helpers** apply a `LAMBDA` (or a named function, without brackets) over arrays; a last argument that is not
  one is `#VALUE!` ("Argument must be a LAMBDA."), and one taking another count of names `#N/A` as above:
  - `MAP(array1, [array2, …], LAMBDA)`: each value with its fellows at the same place in the other arrays, one name
    each; arrays of other sizes are `#VALUE!` ("Array arguments to MAP are of different size.").
  - `REDUCE(initial_value, array_or_range, LAMBDA)`: the accumulator and each value row by row, giving the last
    accumulator, which may be an array; `SCAN` gives every accumulator, in the shape of the array.
  - `BYROW(array_or_range, LAMBDA)` and `BYCOL`: each row (or column) as one value, a range of the range when it is
    one, giving a column (or row) of results.
  - `MAKEARRAY(rows, columns, LAMBDA)`: each row and column number from 1; a count below 1 is `#VALUE!`.
  - A `MAP`, `BYROW`, `BYCOL`, `SCAN` or `MAKEARRAY` step that gives an array is `#VALUE!` ("Single value
    expected. Nested array results are not supported."); a step's error stays in its place.
- A formula applies a `LAMBDA` at most `LAMBDA_CALLS_MAX` times in all (the recalculation budget); past it the
  formula is `#NUM!` ("This formula calls its LAMBDA too many times") (default, D68).

## QUERY

`QUERY(data, query, [headers])` runs a query in Google's Visualization API Query Language over a range or an array,
as Google Sheets does, and spills its table.

- **Columns** are named by the sheet's column letters when `data` is a range (`select C` reads the sheet's column
  C), and `Col1`, `Col2`, ... by place in either case; a name in back-quotes is read as written (`` `A` ``).
- **Header rows**: `headers` rows at the top are labels, joined with a space when several; left out or -1, the first
  row is a header when each of its filled cells is text and a column below it holds a value that is not (default, D69).
- **Types**: each column is a number, text or boolean column by the type most of its values have (dates and times are
  numbers); a value of another type, or an empty cell, is null (Google's rule).
- **Clauses**, each optional, in this order: `select` (`*`, columns, aggregates, scalar functions, arithmetic,
  literals), `where`, `group by`, `pivot`, `order by` (`asc`, `desc`), `limit`, `offset` (applied before
  `limit`), `label`, `format`, `options`. Keywords ignore case; column names and text do not.
- **Conditions**: `= != <> < <= > >=`, `is null`, `is not null`, `and`, `or`, `not`, brackets, and on text
  `contains`, `starts with`, `ends with`, `like` (`%` any run, `_` one character) and `matches` (the whole
  text against a regular expression). Text compares case-sensitively; a comparison with null, or between two types,
  is false.
- **Aggregates** `avg`, `count`, `max`, `min`, `sum` take one column and skip nulls; `avg` and `sum` read numbers
  only, `max` and `min` of no values are null. **Scalar functions**: `year`, `month` (from 0), `day`, `hour`,
  `minute`, `second`, `millisecond`, `quarter`, `dayOfWeek` (Sunday 1), `now`, `dateDiff`, `toDate`, `upper`,
  `lower`; `+ - * /` on numbers, null for null or a division by zero. Literals: text in single or double quotes,
  numbers, `true`, `false`, `date 'yyyy-MM-dd'`, `timeofday 'HH:mm:ss'`, `datetime 'yyyy-MM-dd HH:mm:ss'`.
- **Grouping**: `group by` gives a row for each distinct key, sorted by the keys unless `order by` says otherwise;
  every selected column is grouped or aggregated. `pivot` gives a column for each distinct value (in order) of its
  columns for each aggregate, labelled with the values (joined by `,`), then the aggregate and its column's label when
  more than one aggregate is selected; without `group by`, one row, and none when no row passes `where`, as Google
  gives it (measured).
- **Labels**: the first row of the result is the labels when `data` had header rows or an aggregate is selected:
  a column's header text, an aggregate's `sum Price` (its name and its column's label), a scalar function's
  `year(A)`; `label` sets one, and when every label is empty the row is left out.
- `format` is read and kept for the files, but the spilled values show without it until a formula's spill can carry
  formats; `options` is read and changes nothing (default, D69).
- **Errors**: a query that does not parse, names an unknown column, groups wrongly or uses a column of the wrong type
  is `#VALUE!` ("Unable to parse query string for Function QUERY parameter 2: …"); a result with no rows and no
  labels is `#N/A` ("Query completed with an empty output."). Its result holds at most `ARRAY_CELLS_MAX` values.

## Functions

The engine knows the functions below today (and only these: any other name is `#NAME?`); the [function catalogue](#function-catalogue) is what it grows to. Arguments in brackets are
optional. Each behaves as its Google Sheets namesake; where Sheets and Excel differ, Sheets wins.

**Maths**: `SUM`, `SUMIF`, `SUMIFS`, `SUMPRODUCT`, `PRODUCT`, `ABS`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`,
`TRUNC`, `MOD`, `POWER`, `SQRT`, `EXP`, `LN`, `LOG`, `LOG10`, `PI`, `SIGN`, `CEILING`, `FLOOR`, `MROUND`, `RAND`,
`RANDBETWEEN`, `QUOTIENT`, `GCD`, `LCM`, `FACT`, `SIN`, `COS`, `TAN`, `COT`, `SEC`, `CSC`, `ASIN`, `ACOS`, `ATAN`,
`ACOT`, `ATAN2`, `SINH`, `COSH`, `TANH`, `COTH`, `SECH`, `CSCH`, `ASINH`, `ACOSH`, `ATANH`, `ACOTH`, `DEGREES`,
`RADIANS`, `CEILING.MATH`, `FLOOR.MATH`, `CEILING.PRECISE`, `FLOOR.PRECISE`, `ISO.CEILING`, `EVEN`, `ODD`, `ISEVEN`,
`ISODD`, `COMBIN`, `COMBINA`, `FACTDOUBLE`, `MULTINOMIAL`, `SERIESSUM`, `SUMSQ`, `SQRTPI`, `GAMMALN`,
`GAMMALN.PRECISE`, `ERFC`, `ERFC.PRECISE`, `BASE`, `DECIMAL`, `IMLN`, `IMPOWER`, `IMSQRT`, `SUBTOTAL`.

- `CEILING` and `FLOOR` with two arguments are Google's (Excel's): a negative factor turns the direction for a
  negative value (`CEILING(-2.5, -1)` is -3), and a positive value with a negative factor is `#NUM!`. With a third
  argument, the mode, they are OpenFormula's (D38): value and factor of one sign, mode 0 rounding toward +∞
  (`CEILING`) or −∞ (`FLOOR`), any other mode a negative value away from zero (`CEILING`) or toward it (`FLOOR`).
- `SUBTOTAL(code, range, …)` works out code 1 to 11 (`AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`,
  `STDEV`, `STDEV.P`, `SUM`, `VAR`, `VAR.P`) without the rows the sheet's filter hides, and 101 to 111 without the
  rows hidden by hand as well. A cell whose own formula calls `SUBTOTAL` is left out, so subtotals are not counted
  twice. An array or a value is taken whole; it has no rows to hide.
- A value outside a trigonometric function's domain, or at a pole (`COT(0)`, `ACOTH(0.5)`), is `#NUM!`;
  `ATAN2(0, 0)` is 0, as LibreOffice's.
- `BASE` writes 0 to 2^53 in bases 2 to 36, padded with zeros to `min_length` (at most 255); `DECIMAL` reads the same
  digits in any case, a hexadecimal text may start `0x`, and empty text is 0.
- `COUNTUNIQUE` counts distinct values, empty cells aside; a number and its text (`1`, `"1"`) are two, and text
  keeps its case, as `UNIQUE` does (default, D45).
- `MUNIT(n)` is the n by n identity matrix; `RANDARRAY([rows], [columns])` is random numbers from 0 to 1, volatile.

**Complex numbers**: `IMLN`, `IMPOWER` and `IMSQRT` read a number, or text `a`, `bi`, `a+bi` or `a-bi` with `i`
or `j` (`3+4i`, `2-j`, `-4.6`); any other text is `#NUM!`. They write each part to 15 significant digits, `i` for
`1i`, and keep the input's unit, but `IMLN` always writes `i`, as Google's examples show. A whole power is multiplied
out (`IMPOWER("5+2i", 3)` is exactly `65+142i`), any other in polar form; `IMSQRT` is exact for squares (`2i` for -4).

**Operators**: `ADD`, `MINUS`, `MULTIPLY`, `DIVIDE`, `POW`, `CONCAT`, `EQ`, `NE`, `GT`, `GTE`, `LT`, `LTE`,
`UMINUS`, `UPLUS`, `UNARY_PERCENT`, `ISBETWEEN`: each operator by name, lifted over arrays as the operator is.

**Statistics**: `AVERAGE`, `AVERAGEIF`, `AVERAGEIFS`, `MEDIAN`, `MODE`, `MIN`, `MAX`, `MINIFS`, `MAXIFS`, `COUNT`,
`COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `LARGE`, `SMALL`, `RANK`, `PERCENTILE`, `QUARTILE`, `STDEV`, `STDEV.P`,
`VAR`, `VAR.P`, `CORREL`, `COUNTUNIQUE`, `AVERAGEA`, `AVERAGE.WEIGHTED`, `GEOMEAN`, `HARMEAN`, `TRIMMEAN`, `MAXA`,
`MINA`, `MODE.SNGL`, `MODE.MULT`, `RANK.EQ`, `RANK.AVG`, `PERCENTILE.INC`, `PERCENTILE.EXC`, `QUARTILE.INC`,
`QUARTILE.EXC`, `PERCENTRANK`, `PERCENTRANK.INC`, `PERCENTRANK.EXC`, `STDEV.S`, `STDEVP`, `STDEVA`, `STDEVPA`, `VAR.S`,
`VARP`, `VARA`, `VARPA`, `DEVSQ`, `AVEDEV`, `SKEW`, `SKEW.P`, `KURT`, `STANDARDIZE`, `FISHER`, `FISHERINV`, `PEARSON`,
`RSQ`, `COVAR`, `COVARIANCE.P`, `COVARIANCE.S`, `SLOPE`, `INTERCEPT`, `STEYX`, `FORECAST`, `FORECAST.LINEAR`, `PROB`,
`PERMUT`, `PERMUTATIONA`, `BETA.DIST`, `BETADIST`, `BETA.INV`, `BETAINV`, `BINOM.DIST`, `BINOMDIST`, `BINOM.INV`,
`CRITBINOM`, `CHIDIST`, `CHIINV`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `CHISQ.TEST`, `CHITEST`,
`CONFIDENCE`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `EXPON.DIST`, `EXPONDIST`, `F.DIST`, `F.DIST.RT`, `FDIST`, `F.INV`,
`F.INV.RT`, `FINV`, `F.TEST`, `FTEST`, `GAMMA`, `GAMMA.DIST`, `GAMMADIST`, `GAMMA.INV`, `GAMMAINV`, `GAUSS`,
`HYPGEOM.DIST`, `HYPGEOMDIST`, `LOGINV`, `LOGNORM.DIST`, `LOGNORM.INV`, `LOGNORMDIST`, `MARGINOFERROR`, `NEGBINOM.DIST`,
`NEGBINOMDIST`, `NORM.DIST`, `NORMDIST`, `NORM.INV`, `NORMINV`, `NORM.S.DIST`, `NORMSDIST`, `NORM.S.INV`, `NORMSINV`,
`PHI`, `POISSON`, `POISSON.DIST`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `TINV`, `TDIST`, `T.TEST`,
`TTEST`, `WEIBULL`, `WEIBULL.DIST`, `Z.TEST`, `ZTEST`, `BINOM.DIST.RANGE`, `CHISQDIST`, `CHISQINV`.

- OpenFormula's `CHISQDIST(x, df, [cumulative])` is cumulative when left out and 0 at or below 0; `CHISQINV` takes a
  probability from 0 to below 1. `BINOM.DIST.RANGE(n, p, s, [s2])` adds the chances of s to s2 successes.
- The A forms (`AVERAGEA`, `MAXA`, `MINA`, `STDEVA`, `STDEVPA`, `VARA`, `VARPA`) read text in a range as 0 and
  `TRUE` and `FALSE` as 1 and 0, empty cells left out. Typed in, text that reads as a number is that number; other
  text is refused (`#VALUE!`), as Google gives it (measured), and 0 in OpenFormula's meaning (the file's meaning).
- The population forms (`VARP`, `VAR.P`, `STDEVP`, `STDEV.P`, `STDEVPA`, `VARPA`) of one number are 0, and of none
  `#DIV/0!`, as Google gives them (measured; its help says otherwise); `DEVSQ` of fewer than two is 0. `AVEDEV` of
  no numbers is `#DIV/0!`.
- `GEOMEAN` and `HARMEAN` take only numbers above 0 (else `#NUM!`), as Google gives them; in OpenFormula's meaning
  `GEOMEAN` of numbers with a 0 is 0 (Part 4 §6.18.34). `TRIMMEAN`
  leaves out ⌊p·n / 2⌋ numbers at each end. `SKEW` needs three numbers, `SKEW.P` two and `KURT` four, else
  `#DIV/0!`, as when every number is the same.
- `AVERAGE.WEIGHTED(values, weights, …)` takes ranges in pairs of one size (else `#VALUE!`), counting a value where
  it and its weight are numbers; a negative weight is `#NUM!`, no positive one `#DIV/0!` (default, D56).
- The paired functions (`CORREL`, `PEARSON`, `RSQ`, `COVAR`, `COVARIANCE.P`, `COVARIANCE.S`, `SLOPE`,
  `INTERCEPT`, `STEYX`, `FORECAST`, `FORECAST.LINEAR`) read data_y and data_x pair by pair, keeping the pairs of
  two numbers: ranges of two sizes are `#N/A`, and x values all alike `#DIV/0!`. No pair is `#DIV/0!` for `CORREL`,
  `PEARSON` and the covariances, `#N/A` for the line's (`RSQ`, `SLOPE`, `INTERCEPT`, `STEYX`, `FORECAST`), as
  Google gives them (measured). `COVARIANCE.S` of one pair is `#NUM!`; `STEYX` needs three pairs (`#DIV/0!`).
- `LARGE` and `SMALL` truncate their rank, as Google (measured); a rank outside the data is `#NUM!`. `MEDIAN`,
  the percentiles and `TRIMMEAN` of no numbers are `#NUM!`.
- `MODE` and `MODE.SNGL` give the most common number that comes first; `MODE.MULT` every most common number, a
  column from the least, as Google gives it (measured). With no number repeated each is `#N/A`.
- `PERCENTILE.EXC` and `QUARTILE.EXC` place fraction k at k·(n + 1) among the numbers in order, `#NUM!` outside 1
  to n; quartile numbers are truncated (1 to 3 for `QUARTILE.EXC`, 0 to 4 for the others).
- `PERCENTRANK`, `PERCENTRANK.INC` and `PERCENTRANK.EXC` interpolate between neighbours and round to
  significant_digits (3; fewer than 1 is 3, Google's help); a value outside the data is `#N/A` (default, D57).
- `PROB`'s probabilities add up to 1 (to 1e-7), else `#VALUE!`; Google checks no single one, nor swaps limits given
  high to low, which hold no value (measured). `PERMUTATIONA(n, k)` needs n and k from 1, else `#NUM!`, k past n
  allowed (measured); both standards take n and k from 0 (the file's meaning).
- The distributions truncate degrees of freedom and counts to whole numbers; degrees of freedom run from 1 to 10^10.
  An inverse over the whole line (`NORM.INV`, `T.INV`) takes a probability strictly between 0 and 1; one over
  [0, ∞) also takes the end whose answer is 0 (`CHISQ.INV(0, …)`, `F.INV(0, …)`, `GAMMA.INV(0, …)` and the upper
  tails' `CHIINV(1, …)`, `CHISQ.INV.RT`, `F.INV.RT`, `FINV`, `T.INV.2T`, `TINV`), as Google gives them
  (measured). `BETA.INV` takes above 0 to 1, `BINOM.INV` and `CRITBINOM` a probability and alpha strictly
  between 0 and 1, as Google and Excel; OpenFormula's `BETAINV` and `CRITBINOM` take 0 and 1 (the file's meaning).
  Any other refusal of a parameter is `#NUM!`.
- The arities are Excel's, as Google's: `BINOM.DIST`, `BINOMDIST` and `POISSON.DIST` need cumulative,
  `NEGBINOMDIST` and `NORMSDIST` take none (more is `#N/A`). Left out, cumulative is FALSE for `NEGBINOM.DIST` and
  `HYPGEOM.DIST`, and TRUE for `NORM.S.DIST` and `LOGNORM.DIST`. OpenFormula's longer forms Google refuses hold
  (D38): `F.DIST`, `POISSON` and `LOGNORMDIST` cumulative when left out (`FDIST`'s TRUE), `HYPGEOMDIST` and
  `LOGNORMDIST` with a cumulative, `BETADIST` with its sixth.
- `HYPGEOMDIST`'s mass is Google's COMBIN(K, k) COMBIN(N - K, n - k) / COMBIN(N, n), each COMBIN truncating its own
  arguments (`HYPGEOMDIST(4.9, 12, 20, 40)` is 0.0672, measured); Excel truncates every argument first (0.1092, the
  file's meaning), which `HYPGEOM.DIST` follows in an ODF file too.
- `BETA.DIST` is Excel's, cumulative fourth and x within the bounds; `BETADIST` is OpenFormula's, cumulative last.
  Outside the bounds Google refuses x; OpenFormula's `BETADIST` is 0 below and 1 above (the file's meaning).
  `GAMMA` takes only numbers above 0; `GAMMA.DIST` refuses a density at 0 where the shape is at most 1 (Google's
  help); `CHISQ.DIST`'s density at 0 is 0, but `#NUM!` for 2 degrees of freedom (measured). `EXPON.DIST`,
  `EXPONDIST`, `LOGNORM.DIST` and `LOGNORMDIST` refuse x below their support, as Google; OpenFormula's
  `EXPONDIST` and `LOGNORMDIST` are 0 there (the file's meaning). `CHIDIST`, `F.DIST`, `T.DIST.2T`, `TDIST` and
  `WEIBULL` refuse a negative x. `POISSON` of a mean of 0 puts everything at 0 (measured).
- `T.TEST` pairs cells for type 1 (sizes must match, `#N/A`); types 2 and 3 take each range's numbers. `F.TEST`
  needs two numbers with some spread in each range (`#DIV/0!`, as Google's). `Z.TEST` takes a given deviation as
  it is: 0 leaves the mean infinitely far, 0 or 1, and at the mean itself `#NUM!`; its own needs two numbers
  (`#DIV/0!`). `CONFIDENCE.T` of a size of 1 is `#NUM!`, and `STANDARDIZE` needs a deviation above 0 (measured). `CHISQ.TEST` has
  (rows - 1)(columns - 1) degrees of freedom, or one fewer than the count for a single row or column.
- `MARGINOFERROR(range, confidence)` is `CONFIDENCE.T(1 - confidence, STDEV(range), COUNT(range))` (Google's help).

**Database**: `DSUM`, `DAVERAGE`, `DCOUNT`, `DCOUNTA`, `DGET`, `DMAX`, `DMIN`, `DPRODUCT`, `DSTDEV`, `DSTDEVP`,
`DVAR`, `DVARP`: each `(database, field, criteria)`.

- The database's first row names its fields, each further row is a record. `field` is a label, case ignored, or a
  column's number, rounded toward zero; any other is `#VALUE!`.
- The criteria's first row names fields (a name not in the database matches no record, 0); each further row is a
  filter, and criteria with none are `#VALUE!`. A filter holds when each of its non-empty cells holds for the record,
  read as `COUNTIF`'s criteria, but text matches every value it begins (`"Apple"` matches `Apple pie`), case
  ignored, as Google and Excel read it (measured); a record passes when any filter holds. An empty filter passes
  every record.
- The aggregates read the numbers of the field (text, booleans and empty cells left out). With none, `DSUM`, `DMAX`,
  `DMIN` and `DPRODUCT` are 0, `DAVERAGE` is `#DIV/0!`; `DSTDEV` and `DVAR` need two numbers, `DSTDEVP` and
  `DVARP` one, else `#DIV/0!`, as their plain namesakes.
- `DCOUNT` counts the numbers, `DCOUNTA` the values; with `field` left empty (`DCOUNT(A1:D9, , F1:F2)`, OOXML's and
  OpenFormula's wider form, D38) each counts the matching records.
- `DGET` gives the field of the one matching record, empty when it is empty; none is `#VALUE!`, more than one `#NUM!`.

**Logic**: `IF`, `IFS`, `SWITCH`, `AND`, `OR`, `XOR`, `NOT`, `TRUE`, `FALSE`, `IFERROR`, `IFNA`.

**Lambdas** ([above](#lambda-and-let)): `LAMBDA`, `LET`, `MAP`, `REDUCE`, `SCAN`, `BYROW`, `BYCOL`, `MAKEARRAY`.

- `IFERROR(value, [value_if_error])` gives a blank for an error when it has no fallback, as Google's does.

**Information**: `ISBLANK`, `ISNUMBER`, `ISTEXT`, `ISNONTEXT`, `ISLOGICAL`, `ISERROR`, `ISERR`, `ISNA`, `ISREF`,
`ISDATE`, `ISEMAIL`, `ISFORMULA`, `ERROR.TYPE`, `NA`, `N`, `TYPE`, `CELL`, `SHEETS`, `INFO`, `AREAS`.

- `INFO(type)` answers as D58; `AREAS(reference)` counts a union's parts, 1 for one range.
- `ISDATE` is TRUE for text that reads as a date in the spreadsheet's locale (a time after it allowed), and for a
  number read from a cell drawn as a date (a Date, Date Time or Custom format that shows a day, a month or a year).
  A number worked out in the formula itself (`ISDATE(DATE(2026, 1, 1))`) is no date (default, D39). A range is TRUE
  only when every cell in it is a date.
- `ISEMAIL` reads an address as a Text Is Valid Email rule does ([Data validation](data-validation.md)).
- `CELL(info_type, [reference])` tells of the top-left cell of the reference, or of its own cell when there is none
  (OpenFormula's, D38): Google's `"address"`, `"col"`, `"color"`, `"contents"`, `"prefix"`, `"row"`, `"sheet"`
  (the sheet's name), `"type"` and `"width"`, and OpenFormula's `"format"`, `"parentheses"`, `"filename"` and
  `"protect"`. Any other is `#VALUE!`; a reference that is no reference is `#N/A`, as Google gives it.
  - `"width"` counts characters as an XLSX file does (ECMA-376 Part 1, 18.3.1.13): the column's pixels past 5 of
    padding, over a 7-pixel digit, to the nearest whole character, as Google gives it (D40, measured).
  - `"format"` names a format by OpenFormula's codes (`G`, `F2`, `,2`, `C2`, `P2`, `S2`, `D1` to `D9`, then
    `-` and `()`). LiveDoc's own: Automatic `G` (`F` and its decimals when set), Number `,`, Currency and
    Accounting `C`, Percent `P`, Scientific `S`, Date and Date Time `D4`, Time and Duration `D8`; a Custom
    format by what its code draws, dates as Excel names them (default, D41).
  - `"filename"` is empty text, as OpenFormula has it for a file never saved: a LiveDoc document is no file; and
    `"protect"` is 1 only for a cell a protected range or sheet covers (default, D42).
- `SHEETS([reference])` counts the spreadsheet's sheets, hidden ones too, or the sheets a reference spans.

**Lookup**: `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `LOOKUP`, `INDEX`, `MATCH`, `XMATCH`, `CHOOSE`, `ROW`, `ROWS`, `COLUMN`,
`COLUMNS`, `OFFSET`, `INDIRECT`, `ADDRESS`, `SHEET`, `FORMULATEXT`, `MULTIPLE.OPERATIONS`.

- `INDIRECT` reads an A1 text, or an R1C1 text when `is_A1_notation` is FALSE (`R2C3`, `R[-1]C[2]` from its own
  cell, `R2` a row, `C3` a column), on its own sheet or another of the spreadsheet named before `!`.
- `MULTIPLE.OPERATIONS(formula_cell, row_cell, row_replacement, [column_cell, column_replacement])` (OpenFormula's)
  works the formula cell out afresh with each cell read as its replacement's value, and every formula between them,
  those reading the replaced cells however indirectly; the workbook's own values stay. Every argument is one cell, else
  `#VALUE!`; a column cell without its replacement is `#N/A`. A range holding a replaced cell reads the
  replacement (LibreOffice refuses it), a spill's other cells read as they stand, and a chain deeper than 250 formulas
  is `#NUM!` (default, D60). One inside the chain replaces before the one asking.
- `INDEX` takes OOXML's fourth argument, the area of a union it picks from (`INDEX((A1:B2, D1:E2), 1, 1, 2)`), which
  Google refuses (D38).
- `SHEET` counts a sheet's place in the order the spreadsheet holds its sheets, the sheet bar's.
- `FORMULATEXT` gives a formula as the formula bar shows it, `#N/A` for a cell without one.

**Text**: `CONCATENATE`, `TEXTJOIN`, `LEFT`, `RIGHT`, `MID`, `LEN`, `UPPER`, `LOWER`, `PROPER`, `TRIM`, `CLEAN`,
`SUBSTITUTE`, `REPLACE`, `FIND`, `SEARCH`, `REPT`, `EXACT`, `TEXT`, `VALUE`, `CHAR`, `CODE`, `SPLIT`, `JOIN`,
`REGEXMATCH`, `REGEXEXTRACT`, `REGEXREPLACE`, `T`, `UNICHAR`, `UNICODE`, `ASC`, `LENB`, `LEFTB`, `RIGHTB`,
`MIDB`, `REPLACEB`, `FINDB`, `SEARCHB`, `DOLLAR`, `FIXED`, `ROMAN`, `ARABIC`, `JIS`, `NUMBERVALUE`.

- `JIS` writes half-width ASCII and katakana full-width, the reverse of `ASC`. `NUMBERVALUE(text, [decimal],
[group])` reads text with the locale's separators unless given, each trailing % dividing by 100.
- `SPLIT` reads each part as Google Sheets does: one that reads as a number (or a percentage) is that number, and one
  written as an ISO date, `YYYY-MM-DD` (a time after it allowed, `2026-10-26 12:00`), is that date. Other
  date-looking text (`26/10/2026`, `Oct 26 2026`, `2026-1-5`) stays text, as its day and month read differently by
  locale; so does an ISO date that is no date (`2026-02-30`). A blank part stays text.
- `CONCATENATE` takes ranges, read across rows (Google's); `JOIN` takes one row or one column an argument, a table is
  `#VALUE!`.
- `REGEXMATCH`, `REGEXEXTRACT` and `REGEXREPLACE` read text only: a number is `#VALUE!`, as Google's help says.
  `REGEXEXTRACT` gives the whole match, its one capture group, or its capture groups one column each; a group that
  took no part is empty text.
- Their patterns are **RE2's**, as Google's are, less RE2's Unicode classes (`\p`, `\P`), which Google leaves out:
  - RE2's own syntax reads: flags `(?i)` (case), `(?m)` (lines), `(?s)` (`.` takes `\n`) and `(?U)` (lazy
    by default), cleared with `-` (`(?i-s)`) and scoped as `(?i:…)`; named groups `(?P<name>…)` and
    `(?<name>…)`; `\Q…\E` literal text; ASCII classes `[[:alpha:]]` and `[[:^alpha:]]`; `\A` and `\z`;
    octal `\123`, hex `\x7F` and `\x{10FFFF}`; a `{` that starts no count is a `{`.
  - RE2's meanings hold: `\d`, `\s` (`[\t\n\f\r ]`), `\w` and `\b` are ASCII; `.` is any character but
    `\n`; in lines mode `^` and `$` break at `\n` only; `(?i)` folds case as Unicode does, `k` with `K` and
    the Kelvin sign.
  - What RE2 refuses is refused: lookarounds, backreferences (`\1`, `(?P=name)`), possessive and atomic forms,
    comments, `\Z`, `\G`, `\C`, `\cK`, `\e`, any other letter escape RE2 does not name, a repeat of a repeat
    (`a**`), a count past 1,000 (nested counts multiplied), a repeat of nothing, an unbalanced bracket. Such a
    pattern is `#REF!` "Function REGEXMATCH parameter 2 value "…" is not a valid regular expression.", Google's words.
- `REGEXREPLACE`'s replacement is Google's own syntax: `$0` is the match and `$1` on its groups, the longest number
  that names a group (`$12` with fewer than 12 groups is group 1, then "2"); a `$` before no digit is a `$`; a
  backslash makes the next character plain (`\$1`, `\\`). A `$` naming no group is `#N/A` once the pattern
  matches; a group that took no part is empty text; a backslash ending the replacement stays (default, D70).
- The byte functions (`LENB`, `LEFTB`, `RIGHTB`, `MIDB`, `REPLACEB`, `FINDB`, `SEARCHB`) count an East Asian wide or
  full-width character (CJK, kana, Hangul, the full-width forms) and half-width katakana as 2 bytes, any other as 1
  (D43). As Google's examples have it, a starting position counts characters, and a character a window
  of bytes starts or reaches is kept whole (`MIDB("熊本=熊本", 2, 4)` is `本=熊`).
- `LEN` counts UTF-16 units as Google does (an emoji is 2), and characters in OpenFormula's meaning (the file's
  meaning). `LEFT`, `MID`, `RIGHT` and `REPLACE` count characters in every meaning and never split one, where
  Google may cut an emoji in two (default, D102).
- `ASC` turns full-width ASCII and katakana half-width, a voiced kana into the kana and its mark (`ガ` to `ｶﾞ`).
- `UNICHAR` of a number with no character (0, a surrogate half, an unassigned code point) is `#VALUE!`: Google gives a
  lone surrogate half for 55296, which no LiveDoc text holds.
- `DOLLAR` and `FIXED` write in the spreadsheet's locale, rounded half away from zero, left of the point for a
  negative number of places; `DOLLAR` in the locale's currency, US dollars where the locale names no region LiveDoc
  knows (default, D44). Past 127 places is `#VALUE!`, Excel's limit.
- `ROMAN` and `ARABIC` write and read Roman numerals as LibreOffice does: `ROMAN` 0 to 3999 (0 is empty text) with a
  relaxation from 0 to 4; `ARABIC` any case, empty text 0, and a numeral no relaxation writes (`MMMM`) `#VALUE!`.

**Date and time**: `TODAY`, `NOW`, `DATE`, `TIME`, `DATEVALUE`, `TIMEVALUE`, `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`,
`SECOND`, `WEEKDAY`, `WEEKNUM`, `ISOWEEKNUM`, `EDATE`, `EOMONTH`, `DATEDIF`, `DAYS`, `NETWORKDAYS`, `NETWORKDAYS.INTL`,
`WORKDAY`, `WORKDAY.INTL`, `YEARFRAC`, `DAYS360`, `EPOCHTODATE`, `EASTERSUNDAY`.

- `EASTERSUNDAY(year)` is Gregorian Easter as a date; a two-digit year is 2000 to 2029 or 1930 to 1999, and only
  1583 to 9956 are reckoned (else `#NUM!`).
- `NETWORKDAYS.INTL` and `WORKDAY.INTL` take a weekend as a number (1 Saturday and Sunday ... 7 Friday and Saturday,
  11 Sunday alone ... 17 Saturday alone) or seven 0s and 1s from Monday, 1 a day off (`"0000011"`); seven 1s, or
  any other text, is `#NUM!`, as Google's.
- `EPOCHTODATE(timestamp, [unit])` reads a Unix time in UTC, in seconds (1), milliseconds (2) or microseconds (3),
  fractions of a millisecond dropped; a negative timestamp is `#NUM!`.

**Arrays**: `FILTER`, `SORT`, `SORTN`, `SORTBY`, `UNIQUE`, `SEQUENCE`, `TRANSPOSE`, `ARRAYFORMULA`, `QUERY` ([above](#query)), `MUNIT`,
`RANDARRAY`, `CHOOSECOLS`, `CHOOSEROWS`, `HSTACK`, `VSTACK`, `TOCOL`, `TOROW`, `WRAPROWS`, `WRAPCOLS`, `FLATTEN`,
`FREQUENCY`, `MMULT`, `MDETERM`, `MINVERSE`, `SUMX2MY2`, `SUMX2PY2`, `SUMXMY2`, `LINEST`, `LOGEST`, `TREND`, `GROWTH`.

- `SORT` and `SORTN` sort by a column of the range by its number, or by a column beside it as tall as the range
  (Google's); rows equal under every key keep their order. `SORT` with four arguments is OOXML's
  `SORT(array, sort_index, sort_order, by_col)`, which Google refuses (D38): 1 ascending, -1 descending, `by_col`
  sorting the columns by a row.
- `SORTN(range, [n], [display_ties_mode], ...)` gives the first `n` rows (1 by default) once sorted, by every column
  first to last when no key is given. Rows tie when their keys are equal: mode 1 adds the rows tied with the last,
  mode 2 drops the rows tied with one before them, mode 3 gives every row of the first `n` keys.
- `FILTER` with a single value after one condition longer than one is OOXML's `FILTER(array, include, if_empty)`
  (D38): that value is what it gives when nothing passes, where it would be `#N/A`.
- An empty cell an array function hands on stays empty in its result, and `TRUE` stays a boolean.
- `CHOOSECOLS` and `CHOOSEROWS` count a negative number from the end; an array of numbers picks each, text that
  is `#VALUE!` (Google's), and 0 or a number past the array is `#VALUE!`.
- `HSTACK` and `VSTACK` pad an array shorter than the tallest (or narrower than the widest) with `#N/A`.
- `TOCOL` and `TOROW` read row by row, or column by column with `scan_by_column`; `ignore` 1 leaves out
  empty cells, 2 errors, 3 both, any other but 0 is `#VALUE!`; nothing left is `#REF!`, as Google's; one value is an
  array of one.
- `WRAPROWS` and `WRAPCOLS` wrap one row or column (a table is `#VALUE!`) by `wrap_count` rounded down (under 1
  is `#NUM!`), the last line padded with `pad_with`, `#N/A` by default.
- `FLATTEN` puts every value of its arguments in one column, by argument, then row, then column; empties are kept.
- `FREQUENCY` counts the numbers of `data` (text and booleans left out) into its classes, in the classes' order:
  each counts the values above the next smaller class up to itself, a repeated class at its first place only, and a
  last row counts the values above every class; `TRUE` counts as 1, as Google and LibreOffice count it. Classes with no
  number count every value in one row (default, D46).
- `MMULT`, `MDETERM` and `MINVERSE` take only numbers (anything else is `#VALUE!`, an error its own);
  `MDETERM` and `MINVERSE` a square, and a singular matrix has no inverse, `#NUM!`.
- `SUMX2MY2`, `SUMX2PY2` and `SUMXMY2` take two arrays of as many values (else `#N/A`, as Google's) and leave out
  a pair that is not two numbers.
- `LINEST`, `LOGEST`, `TREND` and `GROWTH` fit least squares: y down a column takes each column of x as a
  variable, y along a row each row, a table of y one x of its shape (x is 1, 2, 3, ... by default; any other shape
  is `#REF!`). `LOGEST` and `GROWTH` fit ln y, so a y of 0 or below is `#NUM!`. Collinear x values have no single
  fit, `#N/A` (D47). `LINEST` and `LOGEST` give the slopes last variable first, then b; verbose adds
  Excel's four rows of statistics, `#N/A` where there is none. An exact fit's errors are 0 and its F `#NUM!`
  (D48). `TREND` and `GROWTH` answer in the shape of the new x values for one variable, a value per row
  (y down a column) or per column (y along a row) for several.

**Finance**: `PMT`, `FV`, `PV`, `NPV`, `IRR`, `RATE`, `NPER`, `IPMT`, `PPMT`, `CUMIPMT`, `CUMPRINC`, `ISPMT`,
`PDURATION`, `RRI`, `EFFECT`, `NOMINAL`, `DOLLARDE`, `DOLLARFR`, `MIRR`, `XNPV`, `XIRR`, `FVSCHEDULE`, `SLN`, `SYD`,
`DB`, `DDB`, `VDB`, `AMORLINC`, `COUPDAYBS`, `COUPDAYS`, `COUPDAYSNC`, `COUPNCD`, `COUPNUM`, `COUPPCD`, `PRICE`,
`YIELD`, `DURATION`, `MDURATION`, `ACCRINT`, `ACCRINTM`, `PRICEMAT`, `YIELDMAT`, `DISC`, `PRICEDISC`, `YIELDDISC`,
`INTRATE`, `RECEIVED`, `TBILLPRICE`, `TBILLYIELD`, `TBILLEQ`, `ODDFPRICE`, `ODDFYIELD`, `ODDLPRICE`, `ODDLYIELD`.

- Money paid out is negative. Dates are whole days; text that reads as a date is one ("7/20/1969").
- The day count convention is 0 US (NASD) 30/360, 1 Actual/Actual, 2 Actual/360, 3 Actual/365 or 4 European 30/360,
  its fraction dropped; a coupon frequency is 1, 2 or 4. Any other, or settlement not before maturity, is `#NUM!`.
- Coupon dates count back from maturity in steps of 12 / frequency months; a maturity on a month's last day puts
  every coupon on a month's last day. `COUPPCD` and `COUPNCD` give a date (default, D54).
- `PRICE`, `YIELD` and `DURATION` count years as `YEARFRAC`. The securities (`ACCRINTM`, `INTRATE`, `RECEIVED`,
  `PRICEDISC`, `DISC`, `YIELDDISC`, `PRICEMAT`, `YIELDMAT`) count as Google (measured): basis 0 by `DAYS360`'s US
  method, an end on February's last day also the 30th after a start on one; basis 1 split by calendar year, each
  year's days over its own length; basis 4 by `DAYS360`'s European method. In OpenFormula's meaning they count as
  `YEARFRAC` (Part 4 §4.11.7; the file's meaning).
- `ACCRINT` accrues from issue: up to the first interest date by the securities' count, Actual/Actual over the coupon
  period that date ends; past it, bases 0 and 4 by `DAYS360`'s European method (measured), the others by the
  securities' count, as Google's there follows no day count found (default, D103). OpenFormula sums `YEARFRAC` over
  the periods (Part 4 §6.12.2; the file's meaning). It takes OOXML's eighth argument, calc_method (D38), and accrues
  from issue either way; `ACCRINTM`'s redemption is 1000 when left out.
- `COUPDAYBS` counts US 30/360 by `DAYS360` (from 28 February, the 30th, to that day is -2), and `COUPDAYSNC` there
  is the period's days less those before settlement; European days are counted directly (measured). OpenFormula counts
  both by its procedure A (Part 4 §4.11.7.3; the file's meaning).
- `CUMIPMT` reads fractional periods inward (2.1 to 4.9 is periods 3 and 4), as Google documents; `CUMPRINC` counts
  from the first as it is in steps of one to the last step before last + 1 (2.1, 3.1, 4.1 and 5.1), as Google gives
  it (measured); OOXML truncates both (the file's meaning). Any type but 0 is payments at the beginning.
- `DB` takes a salvage above the cost (a negative rate) and refuses a period past the life, as Google; both standards
  take the part year after it when the first year is short (the file's meaning). `DDB` takes the period a fraction
  falls in (2.5 is the third) and writes nothing off when the salvage passes the cost; with a rate of 1 or more Google
  keeps the rate (`DDB(2400, 300, 2, 2, 3)` is -1800), where both standards write the value off in the first period
  (the file's meaning). From a fraction of a period, `VDB` steps whole periods from it unless told not to switch
  (measured); OpenFormula takes the fraction off the whole periods around it (the file's meaning).
- `EFFECT` needs a nominal rate above 0 and `FVSCHEDULE` a number for every rate (`#VALUE!`), as Google and Excel;
  OpenFormula takes a rate of 0 and skips text (the file's meaning). `ISPMT` and `RRI` of no periods are `#DIV/0!`. `AMORLINC` reads a period between 0 and 1 as 1 and drops a larger one's fraction (Google's help).
- The treasury bills count Actual/360 days, as Google's help makes `TBILLPRICE` `PRICEDISC` and `TBILLYIELD`
  `YIELDDISC` with those conventions; `TBILLEQ` too (default, D53). A bill maturing past a year is `#NUM!`.
- `DOLLARDE` and `DOLLARFR` write the fraction in as many decimal places as the unit has digits (100.01 in eighths is
  100 1/80), as Google gives it (measured) and OpenFormula says; in wholes (unit 1) it is the decimal itself (default,
  D51).
- `MIRR` and `IRR` skip text and empty cells; `XNPV` and `XIRR` take as many amounts as dates, every one a number,
  else `#NUM!` or `#VALUE!` (default, D55); `XIRR` needs two, `XNPV` gives a single amount as it is.
- `ODDFPRICE`, `ODDFYIELD`, `ODDLPRICE` and `ODDLYIELD` (OpenFormula's, which leaves their sums open) sum an odd
  period over its quasi-coupon periods as ECMA-376 and Excel do; LibreOffice leaves the first two unbuilt and counts
  an odd last period as one span (default, D59). Rate, price and redemption are positive and yield not negative, the
  dates in order (maturity, first coupon, settlement, issue; maturity, settlement, last interest), else `#NUM!`.

**Web**: `HYPERLINK` (above), `ENCODEURL`, `ISURL`, `IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML`, `IMPORTXML`,
`IMPORTRANGE`, `SPARKLINE` (its chart in [Charts](charts.md#sparklines)), `IMAGE`.

- `ENCODEURL(text)` writes each byte of the text's UTF-8 as `%XX` but letters, digits, `-` and `_`, as LibreOffice
  and Excel keep them (`"hello, world!"` is `hello%2C%20world%21`, Google's example).
- `ISURL(value)` reads an address as a Text Is Valid URL rule does ([Data validation](data-validation.md)); a number
  is none.
- The four imports fetch through the api Worker, once an Editor allows access: [Imports from the web](imports.md).
- `IMAGE` shows a picture of the web in its cell, fetched the same way: [Imports from the web](imports.md#image).
- `IMPORTRANGE` reads a range of another LiveDoc spreadsheet: [Other workbooks](#other-workbooks).

**Engineering**: `BIN2OCT`, `BIN2HEX`, `BIN2DEC`, `OCT2BIN`, `OCT2HEX`, `OCT2DEC`, `HEX2BIN`, `HEX2OCT`, `HEX2DEC`,
`DEC2BIN`, `DEC2OCT`, `DEC2HEX`, `BITAND`, `BITOR`, `BITXOR`, `BITLSHIFT`, `BITRSHIFT`, `DELTA`, `GESTEP`, `ERF`,
`ERF.PRECISE`, `COMPLEX`, `IMREAL`, `IMAGINARY`, `IMABS`, `IMARGUMENT`, `IMCONJUGATE`, `IMSUM`, `IMSUB`, `IMPRODUCT`,
`IMDIV`, `IMEXP`, `IMLOG`, `IMLOG10`, `IMLOG2`, `IMSIN`, `IMSINH`, `IMCOS`, `IMCOSH`, `IMTAN`, `IMTANH`, `IMCOT`,
`IMCOTH`, `IMSEC`, `IMSECH`, `IMCSC`, `IMCSCH`, `BESSELJ`, `BESSELY`, `BESSELI`, `BESSELK`.

- `BESSELJ`, `BESSELY`, `BESSELI` and `BESSELK` take a whole order n (truncated; below 0 `#NUM!`);
  `BESSELY` and `BESSELK` need x above 0. They are worked out to about 15 digits (LibreOffice's `BESSELK` to 8).
- `BIN2DEC`, `DEC2HEX` and the other conversions read and write signed numbers of at most ten digits: 10 bits in
  binary, 30 in octal, 40 in hexadecimal, the top bit the sign, so a negative number is ten digits of two's complement
  (`DEC2BIN(-1)` is `1111111111`). A number given is read by its digits (`BIN2DEC(101)` is 5); TRUE or an empty
  value is `#VALUE!`, and `HEX2DEC` reads a leading `0x`, as Google's (measured); a decimal's fraction is dropped. More than ten digits, a digit outside the radix, or a number that does not fit is
  `#NUM!`. `significant_digits` pads with zeros, is rounded toward zero, is `#NUM!` below 0, past 10 or too few for
  the digits, and is ignored for a negative number.
- `BITAND`, `BITOR`, `BITXOR`, `BITLSHIFT` and `BITRSHIFT` take whole numbers from 0 to 2^48 - 1 (a fraction or
  anything else is `#NUM!`, as Google's), and so is a shifted value; a shift is at most 53 places either way, a
  negative one shifting the other way.
- `DELTA` is 1 when two numbers are exactly equal, `GESTEP` when the value is at least the step; each compares with 0
  by default. `ERF` and `ERF.PRECISE` integrate from 0 to one bound, or between two.
- `COMPLEX(real, imaginary, [suffix])` writes a complex number as `IMLN` does; the suffix is `"i"` (by default) or
  `"j"`, any other `#VALUE!`. The `IM` functions read their numbers as `IMLN` does and write `IMLN`'s way, keeping the
  unit the inputs name. Numbers naming `i` and `j` together are `#VALUE!` (Google: "you can't"). `IMARGUMENT(0)` is
  `#DIV/0!`; a pole (`IMCOT(0)`, `IMCSCH(0)`), division by 0 or a logarithm of 0 is `#NUM!`. `IMLOG`'s base is a
  positive number other than 1. Tangents and cotangents are worked from double angles, so a small part keeps its digits.

**Parser**: `CONVERT`, `TO_DATE`, `TO_DOLLARS`, `TO_PERCENT`, `TO_PURE_NUMBER`, `TO_TEXT`, `EUROCONVERT`.

- `EUROCONVERT(value, from, to, [full_precision], [triangulation_precision])` converts between the euro and the 21
  currencies it replaced at their fixed rates, rounded to the target's decimals unless full precision; triangulation
  rounds the euro amount to at least 3 decimals. Any other currency is `#VALUE!`.
- `CONVERT(value, start_unit, end_unit)` knows Excel's and OpenFormula's units, the wider form of Google's list (D38):
  mass, distance, time, pressure, force, energy, power, magnetism, temperature, volume, area, speed and information,
  names case kept (`"m^2"` or `"m2"`). A metric unit takes a metric prefix (`"km"`, `"kcal"`, a squared or cubed one
  squared or cubed: `"cm^3"`), bits and bytes a binary one (`"Gibyte"`). Each unit is sized by its exact definition
  (NIST SP 811: a pound is 0.45359237 kg, a horsepower 550 foot-pounds-force a second; default, D50). An unknown unit,
  or two of different kinds, is `#N/A`.
- `TO_DATE`, `TO_DOLLARS` and `TO_PERCENT` hand a number on, its formula's format Date (default, D49), Currency in
  US dollars, and Percent; `TO_PURE_NUMBER` hands it on with none. `TO_TEXT` gives a number as the text its cell
  shows (a percentage as `25.00%`), a number typed in the formula as `TEXT` would write it plainly. Each hands any
  other value on unchanged.

**Plan cards**: `CARDCOUNT`, `CARDSUM`, `CARD`, `CARDS`.

- **Criteria** (`COUNTIF`, `SUMIFS`, ... and the card functions) take a value to equal, or a text starting with a
  comparison (`">=10"`, `"<>Done"`), with `*` and `?` as wildcards and `~` to escape them; text matches ignore
  case.
- `TEXT(value, format)` takes the spreadsheet format codes people use (`"0.00"`, `"#,##0"`, `"0%"`, `"dd/mm/yyyy"`,
  `"mmm yyyy"`, `"hh:mm"`, `"[h]:mm"`, `"£#,##0.00"`, `"@"`).
- `HYPERLINK(url, [label])` shows the label as a link; Ctrl/⌘ and a click opens it in a new tab (http, https and
  mailto only).
  - The cell's **value is the label** (the url when there is none or it reads an empty cell; an empty text shows
    nothing, as Google's help has it; a number stays a number), so sorting, CSV, charts, `read_sheet` and
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
    the active cell's link, for every role: opening changes nothing.
  - **On a touch screen**: Ctrl/⌘ held with a tap opens the link as a click does (a tablet with a keyboard), and a
    plain tap on a link selects it and shows its address under the cell with **Open**, as Google Sheets' link chip
    does; the chip goes when the selection moves, and a pen works as a mouse.
  - Telemetry: `Sheet / Opened / Hyperlink`, never the address.
- `REGEX…` functions run their RE2 pattern as a JavaScript regular expression of the same meaning, written from it
  (Google's runs in time linear in the text; this one backtracks). A regular expression cannot be stopped once it
  runs, so its cost is bounded before it starts: a pattern whose repeats could backtrack for more than a moment on
  the cell's text (a repeat of a repeat such as `(a+)+`, or three or more open-ended repeats side by side on long
  text) answers `#VALUE!` "This pattern is too costly to run on this text" instead of freezing the sheet for
  everyone on it. `SEARCH`'s `*` wildcards are held to the same bound.
- `TODAY`, `NOW`, `RAND`, `RANDBETWEEN`, `OFFSET` and `INDIRECT` are **volatile**: they recalculate on every
  change to the sheet. With nothing changed they are worked out again on a clock: a Plan Sheet's once a minute, a
  spreadsheet's as its Recalculation setting says ([Settings](settings.md): on change only, or every minute or hour).
  The clock runs while the document is open and its page visible; a tick missed while hidden runs as the page shows
  (default, D37). `RAND` is worked out in each browser, so two people see different numbers, as in a spreadsheet
  shared live.

## Function catalogue

Every function a [spreadsheet](spreadsheet.md) answers, the target of the overhaul: Google's 514, the 19
OpenFormula functions Google lacks, and LiveDoc's four card functions (sources and method:
[Function catalogue research](../../research/sheets-open-standard/function-catalogue.md)).

- **Authority**: whose meaning the grid follows. Google wins wherever Google has the function (S6, ruled 2026-11-18); a
  function only OpenFormula defines follows OpenFormula Part 4; the card functions are LiveDoc's own.
- **Where Google and the standards differ** (D38): a formula Google accepts follows Google (S6); a formula Google
  refuses but OpenFormula or OOXML defines (more arguments, a range where Google takes one value) follows that
  standard, in every document. So a file's formula keeps its meaning (C1) and nothing Google accepts changes. `CONCAT`
  is the first: Google's joins two values, the standards' any number, ranges whole; LiveDoc's is the standards'.
  Measured so: `TREND` without known x, `DCOUNT` and `DCOUNTA` without a field, `CEILING` and `FLOOR` with a mode,
  `SORT`'s by_col, `CELL`'s OpenFormula types, `SHEETS` of a reference, `CONVERT`'s `m/hr`, `F.DIST` and `POISSON`
  without a cumulative, `HYPGEOMDIST` and `LOGNORMDIST` with one, `BETADIST` with its sixth argument.
- **The file's meaning** (Webber, 2026-11-21): a formula Google and the file's own standard both accept but answer
  differently keeps the meaning of the standard of the format the spreadsheet arrived in: OOXML's for one opened from
  `.xlsx`, OpenFormula's for one opened from `.ods` or `.fods`. A spreadsheet made in LiveDoc follows Google's (S6).
  Nothing changes a value silently.
- An ODF file names Excel's later functions under `COM.MICROSOFT.` (`SORT`, `STDEV.P`): theirs is OOXML's meaning, in
  either format.
- Where the standard leaves the answer to the application (OpenFormula's "evaluators may", an implementation-defined
  character set, a conversion to integer it does not name) or refuses the formula, Google's answer stands.
- The meaning is the spreadsheet's, set once when it opens from a file, and kept by its copies; a spreadsheet opened
  from a file before this rule keeps Google's, the answers it has always shown (default, D101).
- A formula pasted or moved from another spreadsheet takes the meaning of the one it lands in, as its text does.
- Converting (C1) a spreadsheet that has a file's meaning gives it the new format's; one with Google's keeps it. Each
  formula calling a function the table below answers differently in the spreadsheet's meaning and the new format's
  standard is listed among the conversion's losses before it runs, and is never rewritten, as few rewrites keep the
  value in every case (default, D100). Writing a spreadsheet to a file lists those its format's standard answers
  differently from its meaning in the same way, among the file's losses (`answers_differ`).
- **Both accept, answered differently**: the answer in each meaning, each case the oracle's (`oracle/cases/`). "Google's"
  is Google's answer; LibreOffice's answers OpenFormula's where the standard and it agree (measured).

  | Formula                                                                  | Google                                          | `.xlsx` (OOXML)                               | `.ods` (OpenFormula)                       | Case                                      |
  | ------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
  | `CELL("sheet", A1)`                                                      | the sheet's name                                | Google's (Excel has no "sheet")               | its number (§6.13.3)                       | Info CELL.9                               |
  | `SORT(range, 1, -1)`                                                     | -1 is TRUE: ascending                           | descending (sort_order)                       | descending (`COM.MICROSOFT.SORT`)          | Filter SORT.8                             |
  | `ADDRESS(2, 3, 1, TRUE, "Data")`                                         | `Data!$C$2`                                     | Google's                                      | `Data.$C$2` (§6.14.2)                      | Lookup ADDRESS.7                          |
  | `CEILING(-2.5, -1)`, `FLOOR(-2.5, -1)`                                   | -3, -2: away from and toward zero               | Google's                                      | -2, -3: toward +∞ and −∞ (§6.17.1)         | Math CEILING.4, FLOOR.4                   |
  | `DECIMAL("0x1F", 16)`                                                    | `#NUM!`                                         | Google's                                      | 31: a leading `0x` read (§6.19.9)          | Math DECIMAL.7                            |
  | `2^3^2`                                                                  | 512: from the right                             | 64: from the left                             | 64: from the left (§6.4.2)                 | Syntax precedence.2                       |
  | `CONCAT(A1:B1, "x")`                                                     | the range's first value                         | every value of the range                      | every value (`COM.MICROSOFT.CONCAT`)       | Operator CONCAT.5                         |
  | `FILTER(range, test, "none")`                                            | a second condition: `#N/A`                      | if_empty: `"none"` when none passes           | if_empty (`COM.MICROSOFT.FILTER`)          | Filter FILTER.6, .7                       |
  | `SUMPRODUCT(A10:F10, A1:F1)` over `TRUE`, `"5"`                          | 88: TRUE 1, "5" 5                               | 71: non-numbers 0                             | Google's (§6.16.64 silent)                 | Array SUMPRODUCT.6                        |
  | `YEARFRAC(DATE(2024,1,1), DATE(2025,6,30), 1)`                           | 1.49315: whole years and the rest               | Google's (the basis named, not its procedure) | 1.49384: procedure E (§4.11.7.7)           | Date YEARFRAC.7                           |
  | `LEN("😀")`                                                              | 2: UTF-16 units                                 | Google's                                      | 1: characters (§6.20.12)                   | Text LEN.5                                |
  | `ARABIC("IIII")`                                                         | `#VALUE!`                                       | Google's                                      | 4 (§6.20.2)                                | Text ARABIC.5                             |
  | `ROMAN(0)`                                                               | `#VALUE!`                                       | Google's                                      | empty text (§6.20.19)                      | Text ROMAN.7                              |
  | `CONVERT(1, "ly", "m")`                                                  | 9.46073E15: rounded                             | Google's                                      | 9460730472580800: the IAU light year       | Parser CONVERT.34                         |
  | `CUMIPMT(r, n, pv, 2.1, 4.9, 0)`                                         | periods 3 and 4                                 | periods 2 to 4: truncated                     | Google's (no rounding named)               | Financial CUMIPMT.4                       |
  | `CUMPRINC(r, n, pv, 2.1, 4.9, 0)`                                        | 2.1, 3.1, 4.1 and 5.1                           | periods 2 to 4: truncated                     | Google's (no rounding named)               | Financial CUMPRINC.4                      |
  | `ACCRINT(…, DATE(2012,12,31), 0.05, 100, 4)`, basis 0                    | 14.986: 30/360 European past the first interest | Google's                                      | 15: YEARFRAC over the periods (§6.12.2)    | Financial ACCRINT.1, .3                   |
  | `PRICEMAT`, `INTRATE` and the securities, basis 1 across a new year      | each year's days over its length                | Google's                                      | YEARFRAC's procedure E (§4.11.7.7)         | Financial PRICEMAT.2, INTRATE.6           |
  | `COUPDAYBS(DATE(2011,2,28), …, 2, 0)`, `COUPDAYSNC`                      | -2, 182: DAYS360 from the 30th                  | Google's                                      | 0, 181: procedure A (§4.11.7.3)            | Financial COUPDAYBS.20, COUPDAYSNC.20     |
  | `DB(1000000, 100000, 6, 7, 7)`                                           | `#NUM!`: past the life                          | the short first year's rest                   | the rest (§6.12.13)                        | Financial DB.4, .11                       |
  | `DDB(2400, 300, 2, 2, 3)`                                                | -1800: the rate kept above 1                    | 0: written off in period 1                    | 0 (§6.12.14)                               | Financial DDB.11                          |
  | `VDB(2400, 300, 10, 1.5, 4.25)`                                          | 787.968: whole steps from 1.5                   | Google's                                      | 794.112: the fraction taken off (§6.12.50) | Financial VDB.9                           |
  | `EFFECT(0, 4)`                                                           | `#NUM!`                                         | Google's                                      | 0 (§6.12.19: rate ≥ 0)                     | Financial EFFECT.4                        |
  | `FVSCHEDULE(1000, rates)`, a rate text                                   | `#VALUE!`                                       | Google's                                      | the text skipped (§6.12.21)                | Financial FVSCHEDULE.3                    |
  | `DEVSQ(A1:A2)` over text                                                 | 0                                               | Google's                                      | `#DIV/0!`: AVERAGE of none (§6.18.20)      | Statistical DEVSQ.4                       |
  | `MAXA(1, "x")`, `AVERAGEA`, `MINA`, `STDEVA`, `STDEVPA`, `VARA`, `VARPA` | `#VALUE!`                                       | Google's                                      | the text as 0 (§6.18.4, §6.18.46)          | Statistical MAXA.4, AVERAGEA.4            |
  | `PERCENTRANK(data, 8, 0)`                                                | 0.286: 0 digits read as 3                       | `#NUM!`: significance < 1                     | `#NUM!` (§6.18.58)                         | Statistical PERCENTRANK.8                 |
  | `PERMUTATIONA(0, 2)`, `PERMUTATIONA(3, 0)`                               | `#NUM!`                                         | 0, 1                                          | 0, 1 (§6.18.60)                            | Statistical PERMUTATIONA.3, .6            |
  | `GEOMEAN(2, 0)`                                                          | `#NUM!`                                         | Google's                                      | 0 (§6.18.34)                               | Statistical GEOMEAN.3                     |
  | `BETAINV(0, 3, 2)`, `BETADIST(2, 3, 8)`                                  | `#NUM!`                                         | Google's                                      | 0, 1 (§6.18.8, §6.18.7)                    | Statistical BETAINV.4, BETADIST.6         |
  | `CRITBINOM(10, 0.5, 0)`, alpha 1, probability 0                          | `#NUM!`                                         | Google's                                      | 0, 10, 0 (§6.18.19)                        | Statistical CRITBINOM.3, .4, .7           |
  | `EXPONDIST(-1, 0.5, TRUE)`, `LOGNORMDIST(0, 4, 6)`                       | `#NUM!`                                         | Google's                                      | 0 (§6.18.21, §6.18.44)                     | Statistical EXPONDIST.3, LOGNORMDIST.4    |
  | `HYPGEOMDIST(4.9, 12, 20, 40)`, `HYPGEOM.DIST`                           | 0.0672: each COMBIN truncates                   | 0.1092: every argument truncated              | Google's; `HYPGEOM.DIST` Excel's           | Statistical HYPGEOMDIST.6, HYPGEOM.DIST.6 |

  OpenFormula's sections are Part 4 of ODF 1.3; Excel's answers are Microsoft's help pages, each cited in its case.

- **Google's in every meaning**: where LibreOffice answers otherwise but neither standard says so, Google's stands.

  | Formula                                                                                               | Google                                    | LibreOffice                           | Why Google's stands                                                 | Case                                      |
  | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
  | `TIME(1.9, 0, 0)`                                                                                     | 1:00, the hour truncated                  | 1:54, the fraction kept               | "Evaluators may first perform INT()"                                | Date TIME.4                               |
  | `YEAR(-1)`                                                                                            | `#NUM!`                                   | 1899                                  | negative serials an evaluator "may" support                         | Date YEAR.3                               |
  | `NETWORKDAYS.INTL(a, b, "1111111")`, `WORKDAY.INTL(a, b, "11")`                                       | `#NUM!`                                   | 0, `#VALUE!`                          | no weekend of seven days is named                                   | Date NETWORKDAYS.INTL.4, WORKDAY.INTL.4   |
  | `FORMULATEXT(B1)`, `CELL("address", B3)`                                                              | as Google writes them                     | in LibreOffice's syntax (`$Data.A1`)  | the text's syntax is the application's                              | Lookup FORMULATEXT.1, Info CELL.2         |
  | `CODE("熊")`                                                                                          | Unicode: 29066                            | an 8-bit code page: 231               | past 127 implementation-defined                                     | Text CODE.3                               |
  | `MIDB("熊本=熊本", 2, 4)`, `REPLACEB`, `LEFTB`, `RIGHTB`                                              | start in characters, a cut character kept | start in bytes, half a space          | the bytes' character set is not named                               | Text MIDB.2, LEFTB.6                      |
  | `IMLN("4+2j")`                                                                                        | `…i`: i always                            | `…j`: the input's unit                | COMPLEX's default unit, i                                           | Math IMLN.2                               |
  | `IMPOWER("5+2i", 3)`                                                                                  | `65+142i`                                 | `64.9999999999999+142i`               | rounding, not meaning                                               | Math IMPOWER.1                            |
  | `UNICHAR(0)`                                                                                          | `#VALUE!`                                 | empty text                            | no text holds U+0000                                                | Text UNICHAR.3                            |
  | `CHAR(0)`, `CODE("")`                                                                                 | `#NUM!`, `#VALUE!`                        | empty text, 0                         | no character 0 or first character                                   | Text CHAR.2, CODE.2                       |
  | `FIND("", "abc")`, `SEARCH("", "abc")`                                                                | 1                                         | `#VALUE!`                             | an empty search text is not named                                   | Text FIND.5, SEARCH.7                     |
  | `AND("TRUE", 1)`                                                                                      | TRUE: the text read                       | `#VALUE!`                             | text to a logical is implementation-defined (§6.3.12)               | Logical AND.8                             |
  | `SUM(1, "2", TRUE)`, `AVERAGE`, `MAX(1, "3")`, `AVERAGEA(1, TRUE, "3")`                               | "2" is 2                                  | `#VALUE!`, or 0                       | text to a number is implementation-defined (§6.3.5)                 | Math SUM.2, Statistical AVERAGE.3         |
  | `"z" < TRUE`                                                                                          | TRUE: booleans after text                 | FALSE                                 | the order of two types is implementation-defined (§6.4.9)           | Syntax compare.4                          |
  | `SUM(1:2)` over booleans                                                                              | booleans skipped                          | booleans counted                      | a reference's logicals are the application's                        | Syntax range.3                            |
  | `IFNA(A4, 1)`, `HYPERLINK(url, A1)`, A4 and A1 empty                                                  | empty, the url                            | 0                                     | an empty value's type is not named                                  | Logical IFNA.4, Web HYPERLINK.4           |
  | `TRANSPOSE(A1:A3)` over an empty cell, `HSTACK(1, "a", TRUE)`, `ARRAYFORMULA(A1:A2=B1:B2)`            | empty, TRUE                               | 0, 1                                  | an array's empty and logical cells are not named                    | Array TRANSPOSE.2, HSTACK.2               |
  | `ADDRESS(1, 1, 5)`                                                                                    | `#NUM!`                                   | `$A$1`                                | mode 5 is no mode named                                             | Lookup ADDRESS.9                          |
  | `UNIQUE({"a"; "A"})`                                                                                  | two values, case kept                     | one, case ignored                     | its sameness is not named                                           | Filter UNIQUE.4                           |
  | `AMORLINC(…, 0.5, …)`                                                                                 | period 0.5 is period 1                    | period 0                              | no rounding named                                                   | Financial AMORLINC.8                      |
  | `TBILLYIELD(DATE(2008,1,1), …, 99)`                                                                   | 0.0404: Actual/360                        | 0.03996: 30/360 plus one              | OpenFormula gives no formula                                        | Financial TBILLYIELD.2                    |
  | `TBILLPRICE(s, m, 9%)`, maturity past a year                                                          | `#NUM!`                                   | 89.45                                 | the standard's constraint refuses it                                | Financial TBILLPRICE.4                    |
  | `XNPV(9%, amounts, dates)`, a date that is text                                                       | `#VALUE!`                                 | a number                              | the standard's constraint refuses it                                | Financial XNPV.5                          |
  | `CUMIPMT(r, n, pv, 13, 24, 2)`, `CUMPRINC`                                                            | any type but 0 is 1                       | Err:502                               | the standard's constraint refuses it                                | Financial CUMIPMT.8                       |
  | `DDB(2400, 300, 10, 2.5)`, `DDB(2400, 3000, 10, 2)`                                                   | 307.2: period 3; 0                        | 343.46; Err:502                       | a fraction a "may"; the constraint refuses salvage past cost        | Financial DDB.10, .9                      |
  | `ISPMT(0.1, 1, 0, 8000)`, `RRI(0, 10, 11)`                                                            | `#DIV/0!`                                 | `#NUM!`                               | an error in both; its code not named                                | Financial ISPMT.4, RRI.5                  |
  | `PERCENTRANK(data, 30)`, `.INC`, `.EXC`, past data                                                    | `#N/A`                                    | `#VALUE!`                             | an error in both; its code not named                                | Statistical PERCENTRANK.5                 |
  | `PERCENTRANK.INC(data, 8, 0)`, `.EXC`                                                                 | 3 digits, as PERCENTRANK                  | Err:502                               | Excel's name; its help names no significance below 1                | Statistical PERCENTRANK.INC.8             |
  | `LARGE(data, 9)`, `SMALL(data, 0)`, `MEDIAN`, `TRIMMEAN` of none, `MODE(1, 2, 3)`                     | `#NUM!`, `#N/A`                           | `#VALUE!`                             | an error in both; its code not named                                | Statistical LARGE.2, MEDIAN.3, MODE.2     |
  | `LARGE(data, 2.5)`                                                                                    | the 2nd: truncated                        | the 3rd: rounded up                   | the standard asks for a whole k                                     | Statistical LARGE.5                       |
  | `MODE.MULT({3, 3, 1, 1, 2, 2})`                                                                       | from the least                            | in the order they come                | its order is not named                                              | Statistical MODE.MULT.5                   |
  | `PROB({1, 2}, {1.5, -0.5}, 1)`, `PROB(data, p, 3, 2)`                                                 | 1.5, 0                                    | `#VALUE!`, 0.4                        | the standard's constraint refuses it; a high-to-low span holds none | Statistical PROB.6, .7                    |
  | `AVEDEV`, `CORREL`, `COVAR`, `F.TEST`, `STEYX`, `SLOPE`, `CONFIDENCE.T`, `STANDARDIZE` at their edges | `#DIV/0!`, `#N/A`, `#NUM!`                | `#NUM!`, `#VALUE!`, `#DIV/0!`         | an error in both; its code not named                                | Statistical CORREL.6, SLOPE.6             |
  | `NORMINV(0, 0, 1)`, `CHIDIST(-1, 2)`, `GAMMADIST(-1, 2, 2, TRUE)`, `GAMMA(-1.5)`                      | `#NUM!`                                   | `#VALUE!`, 1, 0, 2.363                | Google refuses; the standards' constraints too                      | Statistical NORMINV.4, CHIDIST.4, GAMMA.4 |
  | `GAMMA.DIST(0, 1, 2, FALSE)`, `CHISQ.DIST(0, 2, FALSE)`                                               | `#NUM!`                                   | 0.5, 0                                | Excel's names; their help refuses the density at 0                  | Statistical GAMMA.DIST.3, CHISQ.DIST.6    |
  | `BETA.INV(0, 3, 2)`, `BINOM.INV(10, 0.5, 0)`, `EXPON.DIST(-1, 0.5, TRUE)`                             | `#NUM!`                                   | 0, 0, 0                               | Excel's names; Microsoft's help refuses them                        | Statistical BETA.INV.4, BINOM.INV.3       |
  | `POISSON(0, 0, FALSE)`, `Z.TEST(data, 10, 0)`, `F.INV(0, 2, 3)`                                       | 1, 0, 0                                   | Err:502                               | the standards' constraints refuse them                              | Statistical POISSON.3, Z.TEST.5           |
  | `HYPGEOM.DIST`, `LOGNORM.DIST`, `NEGBINOM.DIST`, without cumulative                                   | Google's shorter form read                | Err:511                               | Excel's names; Excel refuses the form                               | Statistical HYPGEOM.DIST.1                |
  | `TOCOL` with nothing left, `TOCOL(5)`                                                                 | `#REF!`, a column of one                  | `#N/A`, Err:504                       | Excel's names; its help names neither                               | Array TOCOL.9, .8                         |
  | `SUMX2MY2(a, b)` of two sizes, `SUMXMY2` over text                                                    | `#N/A`, the pair left out                 | `#VALUE!`                             | an error in both; text in a pair not named                          | Array SUMX2MY2.3, SUMXMY2.4               |
  | `FREQUENCY(data, classes)`, no class a number; `MMULT` over TRUE                                      | every value counted (D46); `#VALUE!`      | `#VALUE!`; 2                          | not named                                                           | Array FREQUENCY.5, MMULT.4                |
  | `LINEST(y, x)`, collinear x; an exact fit's F                                                         | `#N/A`; `#NUM!`                           | coefficients past 1e13; `#N/A`        | no fit and its F are not named                                      | Array LINEST.12, .10                      |
  | `DSUM(A1:D7, "Qty", {"Qty"; 10})`, `DGET` of an empty field                                           | the records of 10; empty                  | every record; `#VALUE!`               | an array's criteria and an empty field are not named                | Database DSUM.12, DGET.4                  |
  | `DSUM(…, criteria)`: "Apple"; a label the table lacks; no row under the labels                        | values that begin "Apple"; 0; `#VALUE!`   | the whole cell; Err:504; every record | Google's and Excel's criteria                                       | Database DSUM.4, .6, .9                   |
  | `DSTDEV` of one value, `DVARP` of none                                                                | `#DIV/0!`                                 | `#NUM!`                               | an error in both; its code not named                                | Database DSTDEV.2, DVARP.2                |
  | `BITLSHIFT(1, 54)`, `BITAND(1.5, 1)`, `IMSUM("4+3i", "1+2j")`                                         | `#NUM!`                                   | a number, 5+5i                        | the conversion to integer and mixed units are not named             | Engineering BITLSHIFT.6, IMSUM.4          |
  | `BIN2DEC(TRUE)`, `HEX2DEC("0xff")`                                                                    | `#VALUE!`, 255                            | 1, Err:502                            | not named                                                           | Engineering BIN2DEC.7, HEX2DEC.6          |
  | `CONVERT(1, "lbm", "kg")` and 13 more units; `"MTON"`, `"admkn"`, `"flb"`                             | the exact definition (D50)                | a rounded factor; another size        | rounding, not meaning                                               | Parser CONVERT.4, .59                     |
  | `ARRAYFORMULA(SUMIFS(B1:B10, A1:A10, A1:A3))`                                                         | one value (D67)                           | three, lifted                         | Google's own function                                               | Google ARRAYFORMULA.30                    |
  | `LET(x, 1, y, LET(z, 2, x+z), x+y)`                                                                   | 4                                         | `#NAME?`                              | LibreOffice's own limit                                             | Logical LET.1, LET.4                      |

- Where LibreOffice answers otherwise than both Google and the standard, the case names it and no table lists it:
  `1&TRUE` is `1TRUE`, as a logical's text is TRUE (§6.3.14), where LibreOffice writes `11`.

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
| `ACCRINT`             | Financial   | `ACCRINT(issue, first_payment, settlement, rate, redemption, frequency, [day_count_convention])`               | Google      | `ACCRINT`                        | built                                                         |
| `ACCRINTM`            | Financial   | `ACCRINTM(issue, maturity, rate, [redemption], [day_count_convention])`                                        | Google      | `ACCRINTM`                       | built                                                         |
| `ACOS`                | Math        | `ACOS(value)`                                                                                                  | Google      | `ACOS`                           | built                                                         |
| `ACOSH`               | Math        | `ACOSH(value)`                                                                                                 | Google      | `ACOSH`                          | built                                                         |
| `ACOT`                | Math        | `ACOT(value)`                                                                                                  | Google      | `ACOT`                           | built                                                         |
| `ACOTH`               | Math        | `ACOTH(value)`                                                                                                 | Google      | `ACOTH`                          | built                                                         |
| `ADD`                 | Operator    | `ADD(value1, value2)`                                                                                          | Google      | S5                               | built                                                         |
| `ADDRESS`             | Lookup      | `ADDRESS(row, column, [absolute_relative_mode], [use_a1_notation], [sheet])`                                   | Google      | `ADDRESS`                        | built                                                         |
| `AMORLINC`            | Financial   | `AMORLINC(cost, purchase_date, first_period_end, salvage, period, rate, [basis])`                              | Google      | `AMORLINC`                       | built                                                         |
| `AND`                 | Logical     | `AND(logical_expression1, [logical_expression2, ...])`                                                         | Google      | `AND`                            | built                                                         |
| `ARABIC`              | Text        | `ARABIC(roman_numeral)`                                                                                        | Google      | `ARABIC`                         | built                                                         |
| `AREAS`               | OpenFormula |                                                                                                                | OpenFormula | `AREAS`                          | built                                                         |
| `ARRAYFORMULA`        | Google      | `ARRAYFORMULA(array_formula)`                                                                                  | Google      | S5                               | built                                                         |
| `ARRAY_CONSTRAIN`     | Array       | `ARRAY_CONSTRAIN(input_range, num_rows, num_cols)`                                                             | Google      | S5                               | planned                                                       |
| `ASC`                 | Text        | `ASC(text)`                                                                                                    | Google      | `ASC`                            | built                                                         |
| `ASIN`                | Math        | `ASIN(value)`                                                                                                  | Google      | `ASIN`                           | built                                                         |
| `ASINH`               | Math        | `ASINH(value)`                                                                                                 | Google      | `ASINH`                          | built                                                         |
| `ATAN`                | Math        | `ATAN(value)`                                                                                                  | Google      | `ATAN`                           | built                                                         |
| `ATAN2`               | Math        | `ATAN2(x, y)`                                                                                                  | Google      | `ATAN2`                          | built                                                         |
| `ATANH`               | Math        | `ATANH(value)`                                                                                                 | Google      | `ATANH`                          | built                                                         |
| `AVEDEV`              | Statistical | `AVEDEV(value1, [value2, ...])`                                                                                | Google      | `AVEDEV`                         | built                                                         |
| `AVERAGE`             | Statistical | `AVERAGE(value1, [value2, ...])`                                                                               | Google      | `AVERAGE`                        | built                                                         |
| `AVERAGE.WEIGHTED`    | Statistical | `AVERAGE.WEIGHTED(values, weights, [additional values], [additional weights])`                                 | Google      | S5                               | built                                                         |
| `AVERAGEA`            | Statistical | `AVERAGEA(value1, [value2, ...])`                                                                              | Google      | `AVERAGEA`                       | built                                                         |
| `AVERAGEIF`           | Statistical | `AVERAGEIF(criteria_range, criterion, [average_range])`                                                        | Google      | `AVERAGEIF`                      | built                                                         |
| `AVERAGEIFS`          | Statistical | `AVERAGEIFS(average_range, criteria_range1, criterion1, [criteria_range2, criterion2, ...])`                   | Google      | `AVERAGEIFS`                     | built                                                         |
| `BASE`                | Math        | `BASE(value, base, [min_length])`                                                                              | Google      | `BASE`                           | built                                                         |
| `BESSELI`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELI`                        | built                                                         |
| `BESSELJ`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELJ`                        | built                                                         |
| `BESSELK`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELK`                        | built                                                         |
| `BESSELY`             | OpenFormula |                                                                                                                | OpenFormula | `BESSELY`                        | built                                                         |
| `BETA.DIST`           | Statistical | `BETA.DIST(value, alpha, beta, cumulative, lower_bound, upper_bound)`                                          | Google      | `COM.MICROSOFT.BETA.DIST`        | built                                                         |
| `BETA.INV`            | Statistical | `BETA.INV(probability, alpha, beta, lower_bound, upper_bound)`                                                 | Google      | `COM.MICROSOFT.BETA.INV`         | built                                                         |
| `BETADIST`            | Statistical | `BETADIST(value, alpha, beta, lower_bound, upper_bound)`                                                       | Google      | `BETADIST`                       | built                                                         |
| `BETAINV`             | Statistical | `BETAINV(probability, alpha, beta, lower_bound, upper_bound)`                                                  | Google      | `BETAINV`                        | built                                                         |
| `BIN2DEC`             | Engineering | `BIN2DEC(signed_binary_number)`                                                                                | Google      | `BIN2DEC`                        | built                                                         |
| `BIN2HEX`             | Engineering | `BIN2HEX(signed_binary_number, [significant_digits])`                                                          | Google      | `BIN2HEX`                        | built                                                         |
| `BIN2OCT`             | Engineering | `BIN2OCT(signed_binary_number, [significant_digits])`                                                          | Google      | `BIN2OCT`                        | built                                                         |
| `BINOM.DIST`          | Statistical | `BINOM.DIST(num_successes, num_trials, prob_success, cumulative)`                                              | Google      | `COM.MICROSOFT.BINOM.DIST`       | built                                                         |
| `BINOM.DIST.RANGE`    | OpenFormula |                                                                                                                | OpenFormula | `BINOM.DIST.RANGE`               | built                                                         |
| `BINOM.INV`           | Statistical | `BINOM.INV(num_trials, prob_success, target_prob)`                                                             | Google      | `COM.MICROSOFT.BINOM.INV`        | built                                                         |
| `BINOMDIST`           | Statistical | `BINOMDIST(num_successes, num_trials, prob_success, cumulative)`                                               | Google      | `BINOMDIST`                      | built                                                         |
| `BITAND`              | Engineering | `BITAND(value1, value2)`                                                                                       | Google      | `BITAND`                         | built                                                         |
| `BITLSHIFT`           | Engineering | `BITLSHIFT(value, shift_amount)`                                                                               | Google      | `BITLSHIFT`                      | built                                                         |
| `BITOR`               | Engineering | `BITOR(value1, value2)`                                                                                        | Google      | `BITOR`                          | built                                                         |
| `BITRSHIFT`           | Engineering | `BITRSHIFT(value, shift_amount)`                                                                               | Google      | `BITRSHIFT`                      | built                                                         |
| `BITXOR`              | Engineering | `BITXOR(value1, value2)`                                                                                       | Google      | `BITXOR`                         | built                                                         |
| `BYCOL`               | Array       | `BYCOL(array_or_range, LAMBDA)`                                                                                | Google      | `COM.MICROSOFT.BYCOL`            | built                                                         |
| `BYROW`               | Array       | `BYROW(array_or_range, LAMBDA)`                                                                                | Google      | `COM.MICROSOFT.BYROW`            | built                                                         |
| `CARD`                | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CARDCOUNT`           | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CARDS`               | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CARDSUM`             | Plan cards  |                                                                                                                | LiveDoc     | S5                               | built; kept (C6)                                              |
| `CEILING`             | Math        | `CEILING(value, [factor])`                                                                                     | Google      | `CEILING`                        | built                                                         |
| `CEILING.MATH`        | Math        | `CEILING.MATH(number, [significance], [mode])`                                                                 | Google      | `COM.MICROSOFT.CEILING.MATH`     | built                                                         |
| `CEILING.PRECISE`     | Math        | `CEILING.PRECISE(number, [significance])`                                                                      | Google      | `COM.MICROSOFT.CEILING.PRECISE`  | built                                                         |
| `CELL`                | Info        | `CELL(info_type, reference)`                                                                                   | Google      | `CELL`                           | built                                                         |
| `CHAR`                | Text        | `CHAR(table_number)`                                                                                           | Google      | `CHAR`                           | built                                                         |
| `CHIDIST`             | Statistical | `CHIDIST(x, degrees_freedom)`                                                                                  | Google      | `LEGACY.CHIDIST`                 | built                                                         |
| `CHIINV`              | Statistical | `CHIINV(probability, degrees_freedom)`                                                                         | Google      | `LEGACY.CHIINV`                  | built                                                         |
| `CHISQ.DIST`          | Statistical | `CHISQ.DIST(x, degrees_freedom, cumulative)`                                                                   | Google      | `COM.MICROSOFT.CHISQ.DIST`       | built                                                         |
| `CHISQ.DIST.RT`       | Statistical | `CHISQ.DIST.RT(x, degrees_freedom)`                                                                            | Google      | `COM.MICROSOFT.CHISQ.DIST.RT`    | built                                                         |
| `CHISQ.INV`           | Statistical | `CHISQ.INV(probability, degrees_freedom)`                                                                      | Google      | `COM.MICROSOFT.CHISQ.INV`        | built                                                         |
| `CHISQ.INV.RT`        | Statistical | `CHISQ.INV.RT(probability, degrees_freedom)`                                                                   | Google      | `COM.MICROSOFT.CHISQ.INV.RT`     | built                                                         |
| `CHISQ.TEST`          | Statistical | `CHISQ.TEST(observed_range, expected_range)`                                                                   | Google      | `COM.MICROSOFT.CHISQ.TEST`       | built                                                         |
| `CHISQDIST`           | OpenFormula |                                                                                                                | OpenFormula | `CHISQDIST`                      | built                                                         |
| `CHISQINV`            | OpenFormula |                                                                                                                | OpenFormula | `CHISQINV`                       | built                                                         |
| `CHITEST`             | Statistical | `CHITEST(observed_range, expected_range)`                                                                      | Google      | `LEGACY.CHITEST`                 | built                                                         |
| `CHOOSE`              | Lookup      | `CHOOSE(index, choice1, [choice2, ...])`                                                                       | Google      | `CHOOSE`                         | built                                                         |
| `CHOOSECOLS`          | Array       | `CHOOSECOLS(array, col_num1, [col_num2])`                                                                      | Google      | `COM.MICROSOFT.CHOOSECOLS`       | built                                                         |
| `CHOOSEROWS`          | Array       | `CHOOSEROWS(array, row_num1, [row_num2])`                                                                      | Google      | `COM.MICROSOFT.CHOOSEROWS`       | built                                                         |
| `CLEAN`               | Text        | `CLEAN(text)`                                                                                                  | Google      | `CLEAN`                          | built                                                         |
| `CODE`                | Text        | `CODE(string)`                                                                                                 | Google      | `CODE`                           | built                                                         |
| `COLUMN`              | Lookup      | `COLUMN([cell_reference])`                                                                                     | Google      | `COLUMN`                         | built                                                         |
| `COLUMNS`             | Lookup      | `COLUMNS(range)`                                                                                               | Google      | `COLUMNS`                        | built                                                         |
| `COMBIN`              | Math        | `COMBIN(n, k)`                                                                                                 | Google      | `COMBIN`                         | built                                                         |
| `COMBINA`             | Math        | `COMBINA(n, k)`                                                                                                | Google      | `COMBINA`                        | built                                                         |
| `COMPLEX`             | Engineering | `COMPLEX(real_part, imaginary_part, [suffix])`                                                                 | Google      | `COMPLEX`                        | built                                                         |
| `CONCAT`              | Operator    | `CONCAT(value1, value2)`                                                                                       | Google      | `COM.MICROSOFT.CONCAT`           | built                                                         |
| `CONCATENATE`         | Text        | `CONCATENATE(string1, [string2, ...])`                                                                         | Google      | `CONCATENATE`                    | built                                                         |
| `CONFIDENCE`          | Statistical | `CONFIDENCE(alpha, standard_deviation, pop_size)`                                                              | Google      | `CONFIDENCE`                     | built                                                         |
| `CONFIDENCE.NORM`     | Statistical | `CONFIDENCE.NORM(alpha, standard_deviation, pop_size)`                                                         | Google      | `COM.MICROSOFT.CONFIDENCE.NORM`  | built                                                         |
| `CONFIDENCE.T`        | Statistical | `CONFIDENCE.T(alpha, standard_deviation, size)`                                                                | Google      | `COM.MICROSOFT.CONFIDENCE.T`     | built                                                         |
| `CONVERT`             | Parser      | `CONVERT(value, start_unit, end_unit)`                                                                         | Google      | `CONVERT`                        | built                                                         |
| `CORREL`              | Statistical | `CORREL(data_y, data_x)`                                                                                       | Google      | `CORREL`                         | built                                                         |
| `COS`                 | Math        | `COS(angle)`                                                                                                   | Google      | `COS`                            | built                                                         |
| `COSH`                | Math        | `COSH(value)`                                                                                                  | Google      | `COSH`                           | built                                                         |
| `COT`                 | Math        | `COT(angle)`                                                                                                   | Google      | `COT`                            | built                                                         |
| `COTH`                | Math        | `COTH(value)`                                                                                                  | Google      | `COTH`                           | built                                                         |
| `COUNT`               | Statistical | `COUNT(value1, [value2, ...])`                                                                                 | Google      | `COUNT`                          | built                                                         |
| `COUNTA`              | Statistical | `COUNTA(value1, [value2, ...])`                                                                                | Google      | `COUNTA`                         | built                                                         |
| `COUNTBLANK`          | Math        | `COUNTBLANK(range)`                                                                                            | Google      | `COUNTBLANK`                     | built                                                         |
| `COUNTIF`             | Math        | `COUNTIF(range, criterion)`                                                                                    | Google      | `COUNTIF`                        | built                                                         |
| `COUNTIFS`            | Math        | `COUNTIFS(criteria_range1, criterion1, [criteria_range2, criterion2, ...])`                                    | Google      | `COUNTIFS`                       | built                                                         |
| `COUNTUNIQUE`         | Math        | `COUNTUNIQUE(value1, [value2, ...])`                                                                           | Google      | S5                               | built                                                         |
| `COUPDAYBS`           | Financial   | `COUPDAYBS(settlement, maturity, frequency, [day_count_convention])`                                           | Google      | `COUPDAYBS`                      | built                                                         |
| `COUPDAYS`            | Financial   | `COUPDAYS(settlement, maturity, frequency, [day_count_convention])`                                            | Google      | `COUPDAYS`                       | built                                                         |
| `COUPDAYSNC`          | Financial   | `COUPDAYSNC(settlement, maturity, frequency, [day_count_convention])`                                          | Google      | `COUPDAYSNC`                     | built                                                         |
| `COUPNCD`             | Financial   | `COUPNCD(settlement, maturity, frequency, [day_count_convention])`                                             | Google      | `COUPNCD`                        | built                                                         |
| `COUPNUM`             | Financial   | `COUPNUM(settlement, maturity, frequency, [day_count_convention])`                                             | Google      | `COUPNUM`                        | built                                                         |
| `COUPPCD`             | Financial   | `COUPPCD(settlement, maturity, frequency, [day_count_convention])`                                             | Google      | `COUPPCD`                        | built                                                         |
| `COVAR`               | Statistical | `COVAR(data_y, data_x)`                                                                                        | Google      | `COVAR`                          | built                                                         |
| `COVARIANCE.P`        | Statistical | `COVARIANCE.P(data_y, data_x)`                                                                                 | Google      | `COM.MICROSOFT.COVARIANCE.P`     | built                                                         |
| `COVARIANCE.S`        | Statistical | `COVARIANCE.S(data_y, data_x)`                                                                                 | Google      | `COM.MICROSOFT.COVARIANCE.S`     | built                                                         |
| `CRITBINOM`           | Statistical | `CRITBINOM(num_trials, prob_success, target_prob)`                                                             | Google      | `CRITBINOM`                      | built                                                         |
| `CSC`                 | Math        | `CSC(angle)`                                                                                                   | Google      | `CSC`                            | built                                                         |
| `CSCH`                | Math        | `CSCH(value)`                                                                                                  | Google      | `CSCH`                           | built                                                         |
| `CUMIPMT`             | Financial   | `CUMIPMT(rate, number_of_periods, present_value, first_period, last_period, end_or_beginning)`                 | Google      | `CUMIPMT`                        | built                                                         |
| `CUMPRINC`            | Financial   | `CUMPRINC(rate, number_of_periods, present_value, first_period, last_period, end_or_beginning)`                | Google      | `CUMPRINC`                       | built                                                         |
| `DATE`                | Date        | `DATE(year, month, day)`                                                                                       | Google      | `DATE`                           | built                                                         |
| `DATEDIF`             | Date        | `DATEDIF(start_date, end_date, unit)`                                                                          | Google      | `DATEDIF`                        | built                                                         |
| `DATEVALUE`           | Date        | `DATEVALUE(date_string)`                                                                                       | Google      | `DATEVALUE`                      | built                                                         |
| `DAVERAGE`            | Database    | `DAVERAGE(database, field, criteria)`                                                                          | Google      | `DAVERAGE`                       | built                                                         |
| `DAY`                 | Date        | `DAY(date)`                                                                                                    | Google      | `DAY`                            | built                                                         |
| `DAYS`                | Date        | `DAYS(end_date, start_date)`                                                                                   | Google      | `DAYS`                           | built                                                         |
| `DAYS360`             | Date        | `DAYS360(start_date, end_date, [method])`                                                                      | Google      | `DAYS360`                        | built                                                         |
| `DB`                  | Financial   | `DB(cost, salvage, life, period, [month])`                                                                     | Google      | `DB`                             | built                                                         |
| `DCOUNT`              | Database    | `DCOUNT(database, field, criteria)`                                                                            | Google      | `DCOUNT`                         | built                                                         |
| `DCOUNTA`             | Database    | `DCOUNTA(database, field, criteria)`                                                                           | Google      | `DCOUNTA`                        | built                                                         |
| `DDB`                 | Financial   | `DDB(cost, salvage, life, period, [factor])`                                                                   | Google      | `DDB`                            | built                                                         |
| `DDE`                 | OpenFormula |                                                                                                                | OpenFormula | `DDE`                            | left out: kept as text with its cached value (no live source) |
| `DEC2BIN`             | Engineering | `DEC2BIN(decimal_number, [significant_digits])`                                                                | Google      | `DEC2BIN`                        | built                                                         |
| `DEC2HEX`             | Engineering | `DEC2HEX(decimal_number, [significant_digits])`                                                                | Google      | `DEC2HEX`                        | built                                                         |
| `DEC2OCT`             | Engineering | `DEC2OCT(decimal_number, [significant_digits])`                                                                | Google      | `DEC2OCT`                        | built                                                         |
| `DECIMAL`             | Math        | `DECIMAL(value, base)`                                                                                         | Google      | `DECIMAL`                        | built                                                         |
| `DEGREES`             | Math        | `DEGREES(angle)`                                                                                               | Google      | `DEGREES`                        | built                                                         |
| `DELTA`               | Engineering | `DELTA(number1, [number2])`                                                                                    | Google      | `DELTA`                          | built                                                         |
| `DETECTLANGUAGE`      | Google      | `DETECTLANGUAGE(text_or_range)`                                                                                | Google      | S5                               | left out (C3)                                                 |
| `DEVSQ`               | Statistical | `DEVSQ(value1, value2)`                                                                                        | Google      | `DEVSQ`                          | built                                                         |
| `DGET`                | Database    | `DGET(database, field, criteria)`                                                                              | Google      | `DGET`                           | built                                                         |
| `DISC`                | Financial   | `DISC(settlement, maturity, price, redemption, [day_count_convention])`                                        | Google      | `DISC`                           | built                                                         |
| `DIVIDE`              | Operator    | `DIVIDE(dividend, divisor)`                                                                                    | Google      | S5                               | built                                                         |
| `DMAX`                | Database    | `DMAX(database, field, criteria)`                                                                              | Google      | `DMAX`                           | built                                                         |
| `DMIN`                | Database    | `DMIN(database, field, criteria)`                                                                              | Google      | `DMIN`                           | built                                                         |
| `DOLLAR`              | Text        | `DOLLAR(number, [number_of_places])`                                                                           | Google      | `DOLLAR`                         | built                                                         |
| `DOLLARDE`            | Financial   | `DOLLARDE(fractional_price, unit)`                                                                             | Google      | `DOLLARDE`                       | built                                                         |
| `DOLLARFR`            | Financial   | `DOLLARFR(decimal_price, unit)`                                                                                | Google      | `DOLLARFR`                       | built                                                         |
| `DPRODUCT`            | Database    | `DPRODUCT(database, field, criteria)`                                                                          | Google      | `DPRODUCT`                       | built                                                         |
| `DSTDEV`              | Database    | `DSTDEV(database, field, criteria)`                                                                            | Google      | `DSTDEV`                         | built                                                         |
| `DSTDEVP`             | Database    | `DSTDEVP(database, field, criteria)`                                                                           | Google      | `DSTDEVP`                        | built                                                         |
| `DSUM`                | Database    | `DSUM(database, field, criteria)`                                                                              | Google      | `DSUM`                           | built                                                         |
| `DURATION`            | Financial   | `DURATION(settlement, maturity, rate, yield, frequency, [day_count_convention])`                               | Google      | `DURATION`                       | built                                                         |
| `DVAR`                | Database    | `DVAR(database, field, criteria)`                                                                              | Google      | `DVAR`                           | built                                                         |
| `DVARP`               | Database    | `DVARP(database, field, criteria)`                                                                             | Google      | `DVARP`                          | built                                                         |
| `EASTERSUNDAY`        | OpenFormula |                                                                                                                | OpenFormula | `EASTERSUNDAY`                   | built                                                         |
| `EDATE`               | Date        | `EDATE(start_date, months)`                                                                                    | Google      | `EDATE`                          | built                                                         |
| `EFFECT`              | Financial   | `EFFECT(nominal_rate, periods_per_year)`                                                                       | Google      | `EFFECT`                         | built                                                         |
| `ENCODEURL`           | Web         | `ENCODEURL(text)`                                                                                              | Google      | `COM.MICROSOFT.ENCODEURL`        | built                                                         |
| `EOMONTH`             | Date        | `EOMONTH(start_date, months)`                                                                                  | Google      | `EOMONTH`                        | built                                                         |
| `EPOCHTODATE`         | Date        | `EPOCHTODATE(timestamp, [unit])`                                                                               | Google      | S5                               | built                                                         |
| `EQ`                  | Operator    | `EQ(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `ERF`                 | Engineering | `ERF(lower_bound, [upper_bound])`                                                                              | Google      | `ERF`                            | built                                                         |
| `ERF.PRECISE`         | Engineering | `ERF.PRECISE(lower_bound, [upper_bound])`                                                                      | Google      | `COM.MICROSOFT.ERF.PRECISE`      | built                                                         |
| `ERFC`                | Math        | `ERFC(z)`                                                                                                      | Google      | `ERFC`                           | built                                                         |
| `ERFC.PRECISE`        | Math        | `ERFC.PRECISE(z)`                                                                                              | Google      | `COM.MICROSOFT.ERFC.PRECISE`     | built                                                         |
| `ERROR.TYPE`          | Info        | `ERROR.TYPE(reference)`                                                                                        | Google      | `ERROR.TYPE`                     | built                                                         |
| `EUROCONVERT`         | OpenFormula |                                                                                                                | OpenFormula | `EUROCONVERT`                    | built                                                         |
| `EVEN`                | Math        | `EVEN(value)`                                                                                                  | Google      | `EVEN`                           | built                                                         |
| `EXACT`               | Text        | `EXACT(string1, string2)`                                                                                      | Google      | `EXACT`                          | built                                                         |
| `EXP`                 | Math        | `EXP(exponent)`                                                                                                | Google      | `EXP`                            | built                                                         |
| `EXPON.DIST`          | Statistical | `EXPON.DIST(x, LAMBDA, cumulative)`                                                                            | Google      | `COM.MICROSOFT.EXPON.DIST`       | built                                                         |
| `EXPONDIST`           | Statistical | `EXPONDIST(x, LAMBDA, cumulative)`                                                                             | Google      | `EXPONDIST`                      | built                                                         |
| `F.DIST`              | Statistical | `F.DIST(x, degrees_freedom1, degrees_freedom2, cumulative)`                                                    | Google      | `FDIST`                          | built                                                         |
| `F.DIST.RT`           | Statistical | `F.DIST.RT(x, degrees_freedom1, degrees_freedom2)`                                                             | Google      | `COM.MICROSOFT.F.DIST.RT`        | built                                                         |
| `F.INV`               | Statistical | `F.INV(probability, degrees_freedom1, degrees_freedom2)`                                                       | Google      | `FINV`                           | built                                                         |
| `F.INV.RT`            | Statistical | `F.INV.RT(probability, degrees_freedom1, degrees_freedom2)`                                                    | Google      | `COM.MICROSOFT.F.INV.RT`         | built                                                         |
| `F.TEST`              | Statistical | `F.TEST(range1, range2)`                                                                                       | Google      | `COM.MICROSOFT.F.TEST`           | built                                                         |
| `FACT`                | Math        | `FACT(value)`                                                                                                  | Google      | `FACT`                           | built                                                         |
| `FACTDOUBLE`          | Math        | `FACTDOUBLE(value)`                                                                                            | Google      | `FACTDOUBLE`                     | built                                                         |
| `FALSE`               | Logical     | `FALSE()`                                                                                                      | Google      | `FALSE`                          | built                                                         |
| `FDIST`               | Statistical | `FDIST(x, degrees_freedom1, degrees_freedom2)`                                                                 | Google      | `LEGACY.FDIST`                   | built                                                         |
| `FILTER`              | Filter      | `FILTER(range, condition1, [condition2])`                                                                      | Google      | `COM.MICROSOFT.FILTER`           | built                                                         |
| `FIND`                | Text        | `FIND(search_for, text_to_search, [starting_at])`                                                              | Google      | `FIND`                           | built                                                         |
| `FINDB`               | Text        | `FINDB(search_for, text_to_search, [starting_at])`                                                             | Google      | `FINDB`                          | built                                                         |
| `FINV`                | Statistical | `FINV(probability, degrees_freedom1, degrees_freedom2)`                                                        | Google      | `LEGACY.FINV`                    | built                                                         |
| `FISHER`              | Statistical | `FISHER(value)`                                                                                                | Google      | `FISHER`                         | built                                                         |
| `FISHERINV`           | Statistical | `FISHERINV(value)`                                                                                             | Google      | `FISHERINV`                      | built                                                         |
| `FIXED`               | Text        | `FIXED(number, [number_of_places], [suppress_separator])`                                                      | Google      | `FIXED`                          | built                                                         |
| `FLATTEN`             | Array       | `FLATTEN(range1,[range2,...])`                                                                                 | Google      | S5                               | built                                                         |
| `FLOOR`               | Math        | `FLOOR(value, [factor])`                                                                                       | Google      | `FLOOR`                          | built                                                         |
| `FLOOR.MATH`          | Math        | `FLOOR.MATH(number, [significance], [mode])`                                                                   | Google      | `COM.MICROSOFT.FLOOR.MATH`       | built                                                         |
| `FLOOR.PRECISE`       | Math        | `FLOOR.PRECISE(number, [significance])`                                                                        | Google      | `COM.MICROSOFT.FLOOR.PRECISE`    | built                                                         |
| `FORECAST`            | Statistical | `FORECAST(x, data_y, data_x)`                                                                                  | Google      | `FORECAST`                       | built                                                         |
| `FORECAST.LINEAR`     | Statistical | `FORECAST.LINEAR(x, data_y, data_x)`                                                                           | Google      | `COM.MICROSOFT.FORECAST.LINEAR`  | built                                                         |
| `FORMULATEXT`         | Lookup      | `FORMULATEXT(cell)`                                                                                            | Google      | `FORMULA`                        | built                                                         |
| `FREQUENCY`           | Array       | `FREQUENCY(data, classes)`                                                                                     | Google      | `FREQUENCY`                      | built                                                         |
| `FTEST`               | Statistical | `FTEST(range1, range2)`                                                                                        | Google      | `FTEST`                          | built                                                         |
| `FV`                  | Financial   | `FV(rate, number_of_periods, payment_amount, [present_value], [end_or_beginning])`                             | Google      | `FV`                             | built                                                         |
| `FVSCHEDULE`          | Financial   | `FVSCHEDULE(principal, rate_schedule)`                                                                         | Google      | `FVSCHEDULE`                     | built                                                         |
| `GAMMA`               | Statistical | `GAMMA(number)`                                                                                                | Google      | `GAMMA`                          | built                                                         |
| `GAMMA.DIST`          | Statistical | `GAMMA.DIST(x, alpha, beta, cumulative)`                                                                       | Google      | `COM.MICROSOFT.GAMMA.DIST`       | built                                                         |
| `GAMMA.INV`           | Statistical | `GAMMA.INV(probability, alpha, beta)`                                                                          | Google      | `COM.MICROSOFT.GAMMA.INV`        | built                                                         |
| `GAMMADIST`           | Statistical | `GAMMADIST(x, alpha, beta, cumulative)`                                                                        | Google      | `GAMMADIST`                      | built                                                         |
| `GAMMAINV`            | Statistical | `GAMMAINV(probability, alpha, beta)`                                                                           | Google      | `GAMMAINV`                       | built                                                         |
| `GAMMALN`             | Math        | `GAMMALN(value)`                                                                                               | Google      | `GAMMALN`                        | built                                                         |
| `GAMMALN.PRECISE`     | Math        | `GAMMALN.PRECISE(value)`                                                                                       | Google      | `COM.MICROSOFT.GAMMALN.PRECISE`  | built                                                         |
| `GAUSS`               | Statistical | `GAUSS(z)`                                                                                                     | Google      | `GAUSS`                          | built                                                         |
| `GCD`                 | Math        | `GCD(value1, value2)`                                                                                          | Google      | `GCD`                            | built                                                         |
| `GEOMEAN`             | Statistical | `GEOMEAN(value1, value2)`                                                                                      | Google      | `GEOMEAN`                        | built                                                         |
| `GESTEP`              | Engineering | `GESTEP(value, [step])`                                                                                        | Google      | `GESTEP`                         | built                                                         |
| `GETPIVOTDATA`        | Lookup      | `GETPIVOTDATA(value_name, any_pivot_table_cell, [original_column, ...], [pivot_item, ...]`                     | Google      | `GETPIVOTDATA`                   | planned                                                       |
| `GOOGLEFINANCE`       | Google      | `GOOGLEFINANCE(ticker, [attribute], [start_date], [end_date\|num_days], [interval])`                           | Google      | S5                               | left out (C3)                                                 |
| `GOOGLETRANSLATE`     | Google      | `GOOGLETRANSLATE(text, [source_language], [target_language])`                                                  | Google      | S5                               | left out (C3)                                                 |
| `GROWTH`              | Array       | `GROWTH(known_data_y, [known_data_x], [new_data_x], [b])`                                                      | Google      | `GROWTH`                         | built                                                         |
| `GT`                  | Operator    | `GT(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `GTE`                 | Operator    | `GTE(value1, value2)`                                                                                          | Google      | S5                               | built                                                         |
| `HARMEAN`             | Statistical | `HARMEAN(value1, value2)`                                                                                      | Google      | `HARMEAN`                        | built                                                         |
| `HEX2BIN`             | Engineering | `HEX2BIN(signed_hexadecimal_number, [significant_digits])`                                                     | Google      | `HEX2BIN`                        | built                                                         |
| `HEX2DEC`             | Engineering | `HEX2DEC(signed_hexadecimal_number)`                                                                           | Google      | `HEX2DEC`                        | built                                                         |
| `HEX2OCT`             | Engineering | `HEX2OCT(signed_hexadecimal_number, significant_digits)`                                                       | Google      | `HEX2OCT`                        | built                                                         |
| `HLOOKUP`             | Lookup      | `HLOOKUP(search_key, range, index, [is_sorted])`                                                               | Google      | `HLOOKUP`                        | built                                                         |
| `HOUR`                | Date        | `HOUR(time)`                                                                                                   | Google      | `HOUR`                           | built                                                         |
| `HSTACK`              | Array       | `HSTACK(range1; [range2, …])`                                                                                  | Google      | `COM.MICROSOFT.HSTACK`           | built                                                         |
| `HYPERLINK`           | Web         | `HYPERLINK(url, [link_label])`                                                                                 | Google      | `HYPERLINK`                      | built                                                         |
| `HYPGEOM.DIST`        | Statistical | `HYPGEOM.DIST(num_successes, num_draws, successes_in_pop, pop_size)`                                           | Google      | `COM.MICROSOFT.HYPGEOM.DIST`     | built                                                         |
| `HYPGEOMDIST`         | Statistical | `HYPGEOMDIST(num_successes, num_draws, successes_in_pop, pop_size)`                                            | Google      | `HYPGEOMDIST`                    | built                                                         |
| `IF`                  | Logical     | `IF(logical_expression, value_if_true, value_if_false)`                                                        | Google      | `IF`                             | built                                                         |
| `IFERROR`             | Logical     | `IFERROR(value, [value_if_error])`                                                                             | Google      | `IFERROR`                        | built                                                         |
| `IFNA`                | Logical     | `IFNA(value, value_if_na)`                                                                                     | Google      | `IFNA`                           | built                                                         |
| `IFS`                 | Logical     | `IFS(condition1, value1, [condition2, value2], …)`                                                             | Google      | `COM.MICROSOFT.IFS`              | built                                                         |
| `IMABS`               | Engineering | `IMABS(number)`                                                                                                | Google      | `IMABS`                          | built                                                         |
| `IMAGE`               | Google      | `IMAGE(url, [mode], [height], [width])`                                                                        | Google      | S5                               | built                                                         |
| `IMAGINARY`           | Engineering | `IMAGINARY(complex_number)`                                                                                    | Google      | `IMAGINARY`                      | built                                                         |
| `IMARGUMENT`          | Engineering | `IMARGUMENT(number)`                                                                                           | Google      | `IMARGUMENT`                     | built                                                         |
| `IMCONJUGATE`         | Engineering | `IMCONJUGATE(number)`                                                                                          | Google      | `IMCONJUGATE`                    | built                                                         |
| `IMCOS`               | Engineering | `IMCOS(number)`                                                                                                | Google      | `IMCOS`                          | built                                                         |
| `IMCOSH`              | Engineering | `IMCOSH(number)`                                                                                               | Google      | `IMCOSH`                         | built                                                         |
| `IMCOT`               | Engineering | `IMCOT(number)`                                                                                                | Google      | `IMCOT`                          | built                                                         |
| `IMCOTH`              | Engineering | `IMCOTH(number)`                                                                                               | Google      | S5                               | built                                                         |
| `IMCSC`               | Engineering | `IMCSC(number)`                                                                                                | Google      | `IMCSC`                          | built                                                         |
| `IMCSCH`              | Engineering | `IMCSCH(number)`                                                                                               | Google      | `IMCSCH`                         | built                                                         |
| `IMDIV`               | Engineering | `IMDIV(dividend, divisor)`                                                                                     | Google      | `IMDIV`                          | built                                                         |
| `IMEXP`               | Engineering | `IMEXP(exponent)`                                                                                              | Google      | `IMEXP`                          | built                                                         |
| `IMLN`                | Math        | `IMLN(complex_value)`                                                                                          | Google      | `IMLN`                           | built                                                         |
| `IMLOG`               | Engineering | `IMLOG(value, base)`                                                                                           | Google      | S5                               | built                                                         |
| `IMLOG10`             | Engineering | `IMLOG10(value)`                                                                                               | Google      | `IMLOG10`                        | built                                                         |
| `IMLOG2`              | Engineering | `IMLOG2(value)`                                                                                                | Google      | `IMLOG2`                         | built                                                         |
| `IMPORTDATA`          | Web         | `IMPORTDATA(url)`                                                                                              | Google      | S5                               | built                                                         |
| `IMPORTFEED`          | Web         | `IMPORTFEED(url, [query], [headers], [num_items])`                                                             | Google      | S5                               | built                                                         |
| `IMPORTHTML`          | Web         | `IMPORTHTML(url, query, index)`                                                                                | Google      | S5                               | built                                                         |
| `IMPORTRANGE`         | Web         | `IMPORTRANGE(spreadsheet_url, range_string)`                                                                   | Google      | S5                               | built                                                         |
| `IMPORTXML`           | Web         | `IMPORTXML(url, xpath_query, [locale])`                                                                        | Google      | S5                               | built                                                         |
| `IMPOWER`             | Math        | `IMPOWER(complex_base, exponent)`                                                                              | Google      | `IMPOWER`                        | built                                                         |
| `IMPRODUCT`           | Engineering | `IMPRODUCT(factor1, [factor2, ...])`                                                                           | Google      | `IMPRODUCT`                      | built                                                         |
| `IMREAL`              | Engineering | `IMREAL(complex_number)`                                                                                       | Google      | `IMREAL`                         | built                                                         |
| `IMSEC`               | Engineering | `IMSEC(number)`                                                                                                | Google      | `IMSEC`                          | built                                                         |
| `IMSECH`              | Engineering | `IMSECH(number)`                                                                                               | Google      | `IMSECH`                         | built                                                         |
| `IMSIN`               | Engineering | `IMSIN (number)`                                                                                               | Google      | `IMSIN`                          | built                                                         |
| `IMSINH`              | Engineering | `IMSINH(number)`                                                                                               | Google      | `IMSINH`                         | built                                                         |
| `IMSQRT`              | Math        | `IMSQRT(complex_number)`                                                                                       | Google      | `IMSQRT`                         | built                                                         |
| `IMSUB`               | Engineering | `IMSUB(first_number, second_number)`                                                                           | Google      | `IMSUB`                          | built                                                         |
| `IMSUM`               | Engineering | `IMSUM(value1, [value2, ...])`                                                                                 | Google      | `IMSUM`                          | built                                                         |
| `IMTAN`               | Engineering | `IMTAN(number)`                                                                                                | Google      | `IMTAN`                          | built                                                         |
| `IMTANH`              | Engineering | `IMTANH(number)`                                                                                               | Google      | S5                               | built                                                         |
| `INDEX`               | Lookup      | `INDEX(reference, [row], [column])`                                                                            | Google      | `INDEX`                          | built                                                         |
| `INDIRECT`            | Lookup      | `INDIRECT(cell_reference_as_string, [is_A1_notation])`                                                         | Google      | `INDIRECT`                       | built                                                         |
| `INFO`                | OpenFormula |                                                                                                                | OpenFormula | `INFO`                           | built                                                         |
| `INT`                 | Math        | `INT(value)`                                                                                                   | Google      | `INT`                            | built                                                         |
| `INTERCEPT`           | Statistical | `INTERCEPT(data_y, data_x)`                                                                                    | Google      | `INTERCEPT`                      | built                                                         |
| `INTRATE`             | Financial   | `INTRATE(buy_date, sell_date, buy_price, sell_price, [day_count_convention])`                                  | Google      | `INTRATE`                        | built                                                         |
| `IPMT`                | Financial   | `IPMT(rate, period, number_of_periods, present_value, [future_value], [end_or_beginning])`                     | Google      | `IPMT`                           | built                                                         |
| `IRR`                 | Financial   | `IRR(cashflow_amounts, [rate_guess])`                                                                          | Google      | `IRR`                            | built                                                         |
| `ISBETWEEN`           | Operator    | `ISBETWEEN(value_to_compare, lower_value, upper_value, lower_value_is_inclusive, upper_value_is_inclusive)`    | Google      | S5                               | built                                                         |
| `ISBLANK`             | Info        | `ISBLANK(value)`                                                                                               | Google      | `ISBLANK`                        | built                                                         |
| `ISDATE`              | Info        | `ISDATE(value)`                                                                                                | Google      | S5                               | built                                                         |
| `ISEMAIL`             | Info        | `ISEMAIL(value)`                                                                                               | Google      | S5                               | built                                                         |
| `ISERR`               | Info        | `ISERR(value)`                                                                                                 | Google      | `ISERR`                          | built                                                         |
| `ISERROR`             | Info        | `ISERROR(value)`                                                                                               | Google      | `ISERROR`                        | built                                                         |
| `ISEVEN`              | Math        | `ISEVEN(value)`                                                                                                | Google      | `ISEVEN`                         | built                                                         |
| `ISFORMULA`           | Info        | `ISFORMULA(cell)`                                                                                              | Google      | `ISFORMULA`                      | built                                                         |
| `ISLOGICAL`           | Info        | `ISLOGICAL(value)`                                                                                             | Google      | `ISLOGICAL`                      | built                                                         |
| `ISNA`                | Info        | `ISNA(value)`                                                                                                  | Google      | `ISNA`                           | built                                                         |
| `ISNONTEXT`           | Info        | `ISNONTEXT(value)`                                                                                             | Google      | `ISNONTEXT`                      | built                                                         |
| `ISNUMBER`            | Info        | `ISNUMBER(value)`                                                                                              | Google      | `ISNUMBER`                       | built                                                         |
| `ISO.CEILING`         | Math        | `ISO.CEILING(number, [significance])`                                                                          | Google      | `COM.MICROSOFT.ISO.CEILING`      | built                                                         |
| `ISODD`               | Math        | `ISODD(value)`                                                                                                 | Google      | `ISODD`                          | built                                                         |
| `ISOWEEKNUM`          | Date        | `ISOWEEKNUM(date)`                                                                                             | Google      | `ISOWEEKNUM`                     | built                                                         |
| `ISPMT`               | Financial   | `ISPMT(rate, period, number_of_periods, present_value)`                                                        | Google      | `ISPMT`                          | built                                                         |
| `ISREF`               | Info        | `ISREF(value)`                                                                                                 | Google      | `ISREF`                          | built                                                         |
| `ISTEXT`              | Info        | `ISTEXT(value)`                                                                                                | Google      | `ISTEXT`                         | built                                                         |
| `ISURL`               | Web         | `ISURL(value)`                                                                                                 | Google      | S5                               | built                                                         |
| `JIS`                 | OpenFormula |                                                                                                                | OpenFormula | `JIS`                            | built                                                         |
| `JOIN`                | Text        | `JOIN(delimiter, value_or_array1, [value_or_array2, ...])`                                                     | Google      | S5                               | built                                                         |
| `KURT`                | Statistical | `KURT(value1, value2)`                                                                                         | Google      | `KURT`                           | built                                                         |
| `LAMBDA`              | Logical     | `LAMBDA(name, formula_expression)`                                                                             | Google      | `COM.MICROSOFT.LAMBDA`           | built                                                         |
| `LARGE`               | Statistical | `LARGE(data, n)`                                                                                               | Google      | `LARGE`                          | built                                                         |
| `LCM`                 | Math        | `LCM(value1, value2)`                                                                                          | Google      | `LCM`                            | built                                                         |
| `LEFT`                | Text        | `LEFT(string, [number_of_characters])`                                                                         | Google      | `LEFT`                           | built                                                         |
| `LEFTB`               | Text        | `LEFTB(string, num_of_bytes)`                                                                                  | Google      | `LEFTB`                          | built                                                         |
| `LEN`                 | Text        | `LEN(text)`                                                                                                    | Google      | `LEN`                            | built                                                         |
| `LENB`                | Text        | `LENB(string)`                                                                                                 | Google      | `LENB`                           | built                                                         |
| `LET`                 | Logical     | `LET(name1, value_expression1, [name2, …], [value_expression2, …], formula_expression )`                       | Google      | `COM.MICROSOFT.LET`              | built                                                         |
| `LINEST`              | Array       | `LINEST(known_data_y, [known_data_x], [calculate_b], [verbose])`                                               | Google      | `LINEST`                         | built                                                         |
| `LN`                  | Math        | `LN(value)`                                                                                                    | Google      | `LN`                             | built                                                         |
| `LOG`                 | Math        | `LOG(value, base)`                                                                                             | Google      | `LOG`                            | built                                                         |
| `LOG10`               | Math        | `LOG10(value)`                                                                                                 | Google      | `LOG10`                          | built                                                         |
| `LOGEST`              | Array       | `LOGEST(known_data_y, [known_data_x], [b], [verbose])`                                                         | Google      | `LOGEST`                         | built                                                         |
| `LOGINV`              | Statistical | `LOGINV(x, mean, standard_deviation)`                                                                          | Google      | `LOGINV`                         | built                                                         |
| `LOGNORM.DIST`        | Statistical | `LOGNORM.DIST(x, mean, standard_deviation)`                                                                    | Google      | `COM.MICROSOFT.LOGNORM.DIST`     | built                                                         |
| `LOGNORM.INV`         | Statistical | `LOGNORM.INV(x, mean, standard_deviation)`                                                                     | Google      | `COM.MICROSOFT.LOGNORM.INV`      | built                                                         |
| `LOGNORMDIST`         | Statistical | `LOGNORMDIST(x, mean, standard_deviation)`                                                                     | Google      | `LOGNORMDIST`                    | built                                                         |
| `LOOKUP`              | Lookup      | `LOOKUP(search_key, search_range\|search_result_array, [result_range])`                                        | Google      | `LOOKUP`                         | built                                                         |
| `LOWER`               | Text        | `LOWER(text)`                                                                                                  | Google      | `LOWER`                          | built                                                         |
| `LT`                  | Operator    | `LT(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `LTE`                 | Operator    | `LTE(value1, value2)`                                                                                          | Google      | S5                               | built                                                         |
| `MAKEARRAY`           | Array       | `MAKEARRAY(rows, columns, LAMBDA)`                                                                             | Google      | `COM.MICROSOFT.MAKEARRAY`        | built                                                         |
| `MAP`                 | Array       | `MAP(array1, [array2, ...], LAMBDA)`                                                                           | Google      | `COM.MICROSOFT.MAP`              | built                                                         |
| `MARGINOFERROR`       | Statistical | `MARGINOFERROR(range, confidence)`                                                                             | Google      | S5                               | built                                                         |
| `MATCH`               | Lookup      | `MATCH(search_key, range, [search_type])`                                                                      | Google      | `MATCH`                          | built                                                         |
| `MAX`                 | Statistical | `MAX(value1, [value2, ...])`                                                                                   | Google      | `MAX`                            | built                                                         |
| `MAXA`                | Statistical | `MAXA(value1, value2)`                                                                                         | Google      | `MAXA`                           | built                                                         |
| `MAXIFS`              | Statistical | `MAXIFS(range, criteria_range1, criterion1, [criteria_range2, criterion2], …)`                                 | Google      | `COM.MICROSOFT.MAXIFS`           | built                                                         |
| `MDETERM`             | Array       | `MDETERM(square_matrix)`                                                                                       | Google      | `MDETERM`                        | built                                                         |
| `MDURATION`           | Financial   | `MDURATION(settlement, maturity, rate, yield, frequency, [day_count_convention])`                              | Google      | `MDURATION`                      | built                                                         |
| `MEDIAN`              | Statistical | `MEDIAN(value1, [value2, ...])`                                                                                | Google      | `MEDIAN`                         | built                                                         |
| `MID`                 | Text        | `MID(string, starting_at, extract_length)`                                                                     | Google      | `MID`                            | built                                                         |
| `MIDB`                | Text        | `MIDB(string, starting_at, extract_length_bytes)`                                                              | Google      | `MIDB`                           | built                                                         |
| `MIN`                 | Statistical | `MIN(value1, [value2, ...])`                                                                                   | Google      | `MIN`                            | built                                                         |
| `MINA`                | Statistical | `MINA(value1, value2)`                                                                                         | Google      | `MINA`                           | built                                                         |
| `MINIFS`              | Statistical | `MINIFS(range, criteria_range1, criterion1, [criteria_range2, criterion2], …)`                                 | Google      | `COM.MICROSOFT.MINIFS`           | built                                                         |
| `MINUS`               | Operator    | `MINUS(value1, value2)`                                                                                        | Google      | S5                               | built                                                         |
| `MINUTE`              | Date        | `MINUTE(time)`                                                                                                 | Google      | `MINUTE`                         | built                                                         |
| `MINVERSE`            | Array       | `MINVERSE(square_matrix)`                                                                                      | Google      | `MINVERSE`                       | built                                                         |
| `MIRR`                | Financial   | `MIRR(cashflow_amounts, financing_rate, reinvestment_return_rate)`                                             | Google      | `MIRR`                           | built                                                         |
| `MMULT`               | Array       | `MMULT(matrix1, matrix2)`                                                                                      | Google      | `MMULT`                          | built                                                         |
| `MOD`                 | Math        | `MOD(dividend, divisor)`                                                                                       | Google      | `MOD`                            | built                                                         |
| `MODE`                | Statistical | `MODE(value1, [value2, ...])`                                                                                  | Google      | `MODE`                           | built                                                         |
| `MODE.MULT`           | Statistical | `MODE.MULT(value1, value2)`                                                                                    | Google      | `COM.MICROSOFT.MODE.MULT`        | built                                                         |
| `MODE.SNGL`           | Statistical | `MODE.SNGL(value1, [value2, ...])`                                                                             | Google      | `COM.MICROSOFT.MODE.SNGL`        | built                                                         |
| `MONTH`               | Date        | `MONTH(date)`                                                                                                  | Google      | `MONTH`                          | built                                                         |
| `MROUND`              | Math        | `MROUND(value, factor)`                                                                                        | Google      | `MROUND`                         | built                                                         |
| `MULTINOMIAL`         | Math        | `MULTINOMIAL(value1, value2)`                                                                                  | Google      | `MULTINOMIAL`                    | built                                                         |
| `MULTIPLE.OPERATIONS` | OpenFormula |                                                                                                                | OpenFormula | `MULTIPLE.OPERATIONS`            | built                                                         |
| `MULTIPLY`            | Operator    | `MULTIPLY(factor1, factor2)`                                                                                   | Google      | S5                               | built                                                         |
| `MUNIT`               | Math        | `MUNIT(dimension)`                                                                                             | Google      | `MUNIT`                          | built                                                         |
| `N`                   | Info        | `N(value)`                                                                                                     | Google      | `N`                              | built                                                         |
| `NA`                  | Info        | `NA()`                                                                                                         | Google      | `NA`                             | built                                                         |
| `NE`                  | Operator    | `NE(value1, value2)`                                                                                           | Google      | S5                               | built                                                         |
| `NEGBINOM.DIST`       | Statistical | `NEGBINOM.DIST(num_failures, num_successes, prob_success)`                                                     | Google      | `COM.MICROSOFT.NEGBINOM.DIST`    | built                                                         |
| `NEGBINOMDIST`        | Statistical | `NEGBINOMDIST(num_failures, num_successes, prob_success)`                                                      | Google      | `NEGBINOMDIST`                   | built                                                         |
| `NETWORKDAYS`         | Date        | `NETWORKDAYS(start_date, end_date, [holidays])`                                                                | Google      | `NETWORKDAYS`                    | built                                                         |
| `NETWORKDAYS.INTL`    | Date        | `NETWORKDAYS.INTL(start_date, end_date, [weekend], [holidays])`                                                | Google      | `COM.MICROSOFT.NETWORKDAYS.INTL` | built                                                         |
| `NOMINAL`             | Financial   | `NOMINAL(effective_rate, periods_per_year)`                                                                    | Google      | `NOMINAL`                        | built                                                         |
| `NORM.DIST`           | Statistical | `NORM.DIST(x, mean, standard_deviation, cumulative)`                                                           | Google      | `COM.MICROSOFT.NORM.DIST`        | built                                                         |
| `NORM.INV`            | Statistical | `NORM.INV(x, mean, standard_deviation)`                                                                        | Google      | `COM.MICROSOFT.NORM.INV`         | built                                                         |
| `NORM.S.DIST`         | Statistical | `NORM.S.DIST(x)`                                                                                               | Google      | `COM.MICROSOFT.NORM.S.DIST`      | built                                                         |
| `NORM.S.INV`          | Statistical | `NORM.S.INV(x)`                                                                                                | Google      | `COM.MICROSOFT.NORM.S.INV`       | built                                                         |
| `NORMDIST`            | Statistical | `NORMDIST(x, mean, standard_deviation, cumulative)`                                                            | Google      | `NORMDIST`                       | built                                                         |
| `NORMINV`             | Statistical | `NORMINV(x, mean, standard_deviation)`                                                                         | Google      | `NORMINV`                        | built                                                         |
| `NORMSDIST`           | Statistical | `NORMSDIST(x)`                                                                                                 | Google      | `LEGACY.NORMSDIST`               | built                                                         |
| `NORMSINV`            | Statistical | `NORMSINV(x)`                                                                                                  | Google      | `LEGACY.NORMSINV`                | built                                                         |
| `NOT`                 | Logical     | `NOT(logical_expression)`                                                                                      | Google      | `NOT`                            | built                                                         |
| `NOW`                 | Date        | `NOW()`                                                                                                        | Google      | `NOW`                            | built                                                         |
| `NPER`                | Financial   | `NPER(rate, payment_amount, present_value, [future_value], [end_or_beginning])`                                | Google      | `NPER`                           | built                                                         |
| `NPV`                 | Financial   | `NPV(discount, cashflow1, [cashflow2, ...])`                                                                   | Google      | `NPV`                            | built                                                         |
| `NUMBERVALUE`         | OpenFormula |                                                                                                                | OpenFormula | `NUMBERVALUE`                    | built                                                         |
| `OCT2BIN`             | Engineering | `OCT2BIN(signed_octal_number, [significant_digits])`                                                           | Google      | `OCT2BIN`                        | built                                                         |
| `OCT2DEC`             | Engineering | `OCT2DEC(signed_octal_number)`                                                                                 | Google      | `OCT2DEC`                        | built                                                         |
| `OCT2HEX`             | Engineering | `OCT2HEX(signed_octal_number, [significant_digits])`                                                           | Google      | `OCT2HEX`                        | built                                                         |
| `ODD`                 | Math        | `ODD(value)`                                                                                                   | Google      | `ODD`                            | built                                                         |
| `ODDFPRICE`           | OpenFormula |                                                                                                                | OpenFormula | `ODDFPRICE`                      | built                                                         |
| `ODDFYIELD`           | OpenFormula |                                                                                                                | OpenFormula | `ODDFYIELD`                      | built                                                         |
| `ODDLPRICE`           | OpenFormula |                                                                                                                | OpenFormula | `ODDLPRICE`                      | built                                                         |
| `ODDLYIELD`           | OpenFormula |                                                                                                                | OpenFormula | `ODDLYIELD`                      | built                                                         |
| `OFFSET`              | Lookup      | `OFFSET(cell_reference, offset_rows, offset_columns, [height], [width])`                                       | Google      | `OFFSET`                         | built                                                         |
| `OR`                  | Logical     | `OR(logical_expression1, [logical_expression2, ...])`                                                          | Google      | `OR`                             | built                                                         |
| `PDURATION`           | Financial   | `PDURATION(rate, present_value, future_value)`                                                                 | Google      | `PDURATION`                      | built                                                         |
| `PEARSON`             | Statistical | `PEARSON(data_y, data_x)`                                                                                      | Google      | `PEARSON`                        | built                                                         |
| `PERCENTILE`          | Statistical | `PERCENTILE(data, percentile)`                                                                                 | Google      | `PERCENTILE`                     | built                                                         |
| `PERCENTILE.EXC`      | Statistical | `PERCENTILE.EXC(data, percentile)`                                                                             | Google      | `COM.MICROSOFT.PERCENTILE.EXC`   | built                                                         |
| `PERCENTILE.INC`      | Statistical | `PERCENTILE.INC(data, percentile)`                                                                             | Google      | `COM.MICROSOFT.PERCENTILE.INC`   | built                                                         |
| `PERCENTRANK`         | Statistical | `PERCENTRANK(data, value, [significant_digits])`                                                               | Google      | `PERCENTRANK`                    | built                                                         |
| `PERCENTRANK.EXC`     | Statistical | `PERCENTRANK.EXC(data, value, [significant_digits])`                                                           | Google      | `COM.MICROSOFT.PERCENTRANK.EXC`  | built                                                         |
| `PERCENTRANK.INC`     | Statistical | `PERCENTRANK.INC(data, value, [significant_digits])`                                                           | Google      | `COM.MICROSOFT.PERCENTRANK.INC`  | built                                                         |
| `PERMUT`              | Statistical | `PERMUT(n, k)`                                                                                                 | Google      | `PERMUT`                         | built                                                         |
| `PERMUTATIONA`        | Statistical | `PERMUTATIONA(number, number_chosen)`                                                                          | Google      | `PERMUTATIONA`                   | built                                                         |
| `PHI`                 | Statistical | `PHI(x)`                                                                                                       | Google      | `PHI`                            | built                                                         |
| `PI`                  | Math        | `PI()`                                                                                                         | Google      | `PI`                             | built                                                         |
| `PMT`                 | Financial   | `PMT(rate, number_of_periods, present_value, [future_value], [end_or_beginning])`                              | Google      | `PMT`                            | built                                                         |
| `POISSON`             | Statistical | `POISSON(x, mean, cumulative)`                                                                                 | Google      | `POISSON`                        | built                                                         |
| `POISSON.DIST`        | Statistical | `POISSON.DIST(x, mean, [cumulative])`                                                                          | Google      | `COM.MICROSOFT.POISSON.DIST`     | built                                                         |
| `POW`                 | Operator    | `POW(base, exponent)`                                                                                          | Google      | S5                               | built                                                         |
| `POWER`               | Math        | `POWER(base, exponent)`                                                                                        | Google      | `POWER`                          | built                                                         |
| `PPMT`                | Financial   | `PPMT(rate, period, number_of_periods, present_value, [future_value], [end_or_beginning])`                     | Google      | `PPMT`                           | built                                                         |
| `PRICE`               | Financial   | `PRICE(settlement, maturity, rate, yield, redemption, frequency, [day_count_convention])`                      | Google      | `PRICE`                          | built                                                         |
| `PRICEDISC`           | Financial   | `PRICEDISC(settlement, maturity, discount, redemption, [day_count_convention])`                                | Google      | `PRICEDISC`                      | built                                                         |
| `PRICEMAT`            | Financial   | `PRICEMAT(settlement, maturity, issue, rate, yield, [day_count_convention])`                                   | Google      | `PRICEMAT`                       | built                                                         |
| `PROB`                | Statistical | `PROB(data, probabilities, low_limit, [high_limit])`                                                           | Google      | `PROB`                           | built                                                         |
| `PRODUCT`             | Math        | `PRODUCT(factor1, [factor2, ...])`                                                                             | Google      | `PRODUCT`                        | built                                                         |
| `PROPER`              | Text        | `PROPER(text_to_capitalize)`                                                                                   | Google      | `PROPER`                         | built                                                         |
| `PV`                  | Financial   | `PV(rate, number_of_periods, payment_amount, [future_value], [end_or_beginning])`                              | Google      | `PV`                             | built                                                         |
| `QUARTILE`            | Statistical | `QUARTILE(data, quartile_number)`                                                                              | Google      | `QUARTILE`                       | built                                                         |
| `QUARTILE.EXC`        | Statistical | `QUARTILE.EXC(data, quartile_number)`                                                                          | Google      | `COM.MICROSOFT.QUARTILE.EXC`     | built                                                         |
| `QUARTILE.INC`        | Statistical | `QUARTILE.INC(data, quartile_number)`                                                                          | Google      | `COM.MICROSOFT.QUARTILE.INC`     | built                                                         |
| `QUERY`               | Google      | `QUERY(data, query, [headers])`                                                                                | Google      | S5                               | built                                                         |
| `QUOTIENT`            | Math        | `QUOTIENT(dividend, divisor)`                                                                                  | Google      | `QUOTIENT`                       | built                                                         |
| `RADIANS`             | Math        | `RADIANS(angle)`                                                                                               | Google      | `RADIANS`                        | built                                                         |
| `RAND`                | Math        | `RAND()`                                                                                                       | Google      | `RAND`                           | built                                                         |
| `RANDARRAY`           | Math        | `RANDARRAY(rows, columns)`                                                                                     | Google      | `COM.MICROSOFT.RANDARRAY`        | built                                                         |
| `RANDBETWEEN`         | Math        | `RANDBETWEEN(low, high)`                                                                                       | Google      | `RANDBETWEEN`                    | built                                                         |
| `RANK`                | Statistical | `RANK(value, data, [is_ascending])`                                                                            | Google      | `RANK`                           | built                                                         |
| `RANK.AVG`            | Statistical | `RANK.AVG(value, data, [is_ascending])`                                                                        | Google      | `COM.MICROSOFT.RANK.AVG`         | built                                                         |
| `RANK.EQ`             | Statistical | `RANK.EQ(value, data, [is_ascending])`                                                                         | Google      | `COM.MICROSOFT.RANK.EQ`          | built                                                         |
| `RATE`                | Financial   | `RATE(number_of_periods, payment_per_period, present_value, [future_value], [end_or_beginning], [rate_guess])` | Google      | `RATE`                           | built                                                         |
| `RECEIVED`            | Financial   | `RECEIVED(settlement, maturity, investment, discount, [day_count_convention])`                                 | Google      | `RECEIVED`                       | built                                                         |
| `REDUCE`              | Array       | `REDUCE(initial_value, array_or_range, LAMBDA)`                                                                | Google      | `COM.MICROSOFT.REDUCE`           | built                                                         |
| `REGEXEXTRACT`        | Text        | `REGEXEXTRACT(text, regular_expression)`                                                                       | Google      | S5                               | built                                                         |
| `REGEXMATCH`          | Text        | `REGEXMATCH(text, regular_expression)`                                                                         | Google      | S5                               | built                                                         |
| `REGEXREPLACE`        | Text        | `REGEXREPLACE(text, regular_expression, replacement)`                                                          | Google      | S5                               | built                                                         |
| `REPLACE`             | Text        | `REPLACE(text, position, length, new_text)`                                                                    | Google      | `REPLACE`                        | built                                                         |
| `REPLACEB`            | Text        | `REPLACEB(text, position, num_bytes, new_text)`                                                                | Google      | `REPLACEB`                       | built                                                         |
| `REPT`                | Text        | `REPT(text_to_repeat, number_of_repetitions)`                                                                  | Google      | `REPT`                           | built                                                         |
| `RIGHT`               | Text        | `RIGHT(string, [number_of_characters])`                                                                        | Google      | `RIGHT`                          | built                                                         |
| `RIGHTB`              | Text        | `RIGHTB(string, num_of_bytes)`                                                                                 | Google      | `RIGHTB`                         | built                                                         |
| `ROMAN`               | Text        | `ROMAN(number, [rule_relaxation])`                                                                             | Google      | `ROMAN`                          | built                                                         |
| `ROUND`               | Math        | `ROUND(value, [places])`                                                                                       | Google      | `ROUND`                          | built                                                         |
| `ROUNDDOWN`           | Math        | `ROUNDDOWN(value, [places])`                                                                                   | Google      | `ROUNDDOWN`                      | built                                                         |
| `ROUNDUP`             | Math        | `ROUNDUP(value, [places])`                                                                                     | Google      | `ROUNDUP`                        | built                                                         |
| `ROW`                 | Lookup      | `ROW([cell_reference])`                                                                                        | Google      | `ROW`                            | built                                                         |
| `ROWS`                | Lookup      | `ROWS(range)`                                                                                                  | Google      | `ROWS`                           | built                                                         |
| `RRI`                 | Financial   | `RRI(number_of_periods, present_value, future_value)`                                                          | Google      | `RRI`                            | built                                                         |
| `RSQ`                 | Statistical | `RSQ(data_y, data_x)`                                                                                          | Google      | `RSQ`                            | built                                                         |
| `SCAN`                | Array       | `SCAN(initial_value, array_or_range, LAMBDA)`                                                                  | Google      | `COM.MICROSOFT.SCAN`             | built                                                         |
| `SEARCH`              | Text        | `SEARCH(search_for, text_to_search, [starting_at])`                                                            | Google      | `SEARCH`                         | built                                                         |
| `SEARCHB`             | Text        | `SEARCHB(search_for, text_to_search, [starting_at])`                                                           | Google      | `SEARCHB`                        | built                                                         |
| `SEC`                 | Math        | `SEC(angle)`                                                                                                   | Google      | `SEC`                            | built                                                         |
| `SECH`                | Math        | `SECH(value)`                                                                                                  | Google      | `SECH`                           | built                                                         |
| `SECOND`              | Date        | `SECOND(time)`                                                                                                 | Google      | `SECOND`                         | built                                                         |
| `SEQUENCE`            | Math        | `SEQUENCE(rows, columns, start, step)`                                                                         | Google      | `COM.MICROSOFT.SEQUENCE`         | built                                                         |
| `SERIESSUM`           | Math        | `SERIESSUM(x, n, m, a)`                                                                                        | Google      | `SERIESSUM`                      | built                                                         |
| `SHEET`               | Lookup      | `SHEET(value)`                                                                                                 | Google      | `SHEET`                          | built                                                         |
| `SHEETS`              | Info        | `SHEETS(reference)`                                                                                            | Google      | `SHEETS`                         | built                                                         |
| `SIGN`                | Math        | `SIGN(value)`                                                                                                  | Google      | `SIGN`                           | built                                                         |
| `SIN`                 | Math        | `SIN(angle)`                                                                                                   | Google      | `SIN`                            | built                                                         |
| `SINH`                | Math        | `SINH(value)`                                                                                                  | Google      | `SINH`                           | built                                                         |
| `SKEW`                | Statistical | `SKEW(value1, value2)`                                                                                         | Google      | `SKEW`                           | built                                                         |
| `SKEW.P`              | Statistical | `SKEW.P(value1, value2)`                                                                                       | Google      | `SKEWP`                          | built                                                         |
| `SLN`                 | Financial   | `SLN(cost, salvage, life)`                                                                                     | Google      | `SLN`                            | built                                                         |
| `SLOPE`               | Statistical | `SLOPE(data_y, data_x)`                                                                                        | Google      | `SLOPE`                          | built                                                         |
| `SMALL`               | Statistical | `SMALL(data, n)`                                                                                               | Google      | `SMALL`                          | built                                                         |
| `SORT`                | Filter      | `SORT(range, sort_column, is_ascending, [sort_column2], [is_ascending2])`                                      | Google      | `COM.MICROSOFT.SORT`             | built                                                         |
| `SORTBY`              | Array       |                                                                                                                | OpenFormula | `COM.MICROSOFT.SORTBY`           | built                                                         |
| `SORTN`               | Filter      | `SORTN(range, [n], [display_ties_mode], [sort_column1, is_ascending1], ...)`                                   | Google      | S5                               | built                                                         |
| `SPARKLINE`           | Google      | `SPARKLINE(data, [options])`                                                                                   | Google      | S5                               | built                                                         |
| `SPLIT`               | Text        | `SPLIT(text, delimiter, [split_by_each], [remove_empty_text])`                                                 | Google      | S5                               | built                                                         |
| `SQRT`                | Math        | `SQRT(value)`                                                                                                  | Google      | `SQRT`                           | built                                                         |
| `SQRTPI`              | Math        | `SQRTPI(value)`                                                                                                | Google      | `SQRTPI`                         | built                                                         |
| `STANDARDIZE`         | Statistical | `STANDARDIZE(value, mean, standard_deviation)`                                                                 | Google      | `STANDARDIZE`                    | built                                                         |
| `STDEV`               | Statistical | `STDEV(value1, [value2, ...])`                                                                                 | Google      | `STDEV`                          | built                                                         |
| `STDEV.P`             | Statistical | `STDEV.P(value1, [value2, ...])`                                                                               | Google      | `COM.MICROSOFT.STDEV.P`          | built                                                         |
| `STDEV.S`             | Statistical | `STDEV.S(value1, [value2, ...])`                                                                               | Google      | `COM.MICROSOFT.STDEV.S`          | built                                                         |
| `STDEVA`              | Statistical | `STDEVA(value1, value2)`                                                                                       | Google      | `STDEVA`                         | built                                                         |
| `STDEVP`              | Statistical | `STDEVP(value1, value2)`                                                                                       | Google      | `STDEVP`                         | built                                                         |
| `STDEVPA`             | Statistical | `STDEVPA(value1, value2)`                                                                                      | Google      | `STDEVPA`                        | built                                                         |
| `STEYX`               | Statistical | `STEYX(data_y, data_x)`                                                                                        | Google      | `STEYX`                          | built                                                         |
| `SUBSTITUTE`          | Text        | `SUBSTITUTE(text_to_search, search_for, replace_with, [occurrence_number])`                                    | Google      | `SUBSTITUTE`                     | built                                                         |
| `SUBTOTAL`            | Math        | `SUBTOTAL(function_code, range1, [range2, ...])`                                                               | Google      | `SUBTOTAL`                       | built                                                         |
| `SUM`                 | Math        | `SUM(value1, [value2, ...])`                                                                                   | Google      | `SUM`                            | built                                                         |
| `SUMIF`               | Math        | `SUMIF(range, criterion, [sum_range])`                                                                         | Google      | `SUMIF`                          | built                                                         |
| `SUMIFS`              | Math        | `SUMIFS(sum_range, criteria_range1, criterion1, [criteria_range2, criterion2, ...])`                           | Google      | `SUMIFS`                         | built                                                         |
| `SUMPRODUCT`          | Array       | `SUMPRODUCT(array1, [array2, ...])`                                                                            | Google      | `SUMPRODUCT`                     | built                                                         |
| `SUMSQ`               | Math        | `SUMSQ(value1, [value2, ...])`                                                                                 | Google      | `SUMSQ`                          | built                                                         |
| `SUMX2MY2`            | Array       | `SUMX2MY2(array_x, array_y)`                                                                                   | Google      | `SUMX2MY2`                       | built                                                         |
| `SUMX2PY2`            | Array       | `SUMX2PY2(array_x, array_y)`                                                                                   | Google      | `SUMX2PY2`                       | built                                                         |
| `SUMXMY2`             | Array       | `SUMXMY2(array_x, array_y)`                                                                                    | Google      | `SUMXMY2`                        | built                                                         |
| `SWITCH`              | Logical     | `SWITCH(expression, case1, value1, [default or case2, value2], …)`                                             | Google      | `COM.MICROSOFT.SWITCH`           | built                                                         |
| `SYD`                 | Financial   | `SYD(cost, salvage, life, period)`                                                                             | Google      | `SYD`                            | built                                                         |
| `T`                   | Text        | `T(value)`                                                                                                     | Google      | `T`                              | built                                                         |
| `T.DIST`              | Statistical | `T.DIST(x, degrees_freedom, cumulative)`                                                                       | Google      | `COM.MICROSOFT.T.DIST`           | built                                                         |
| `T.DIST.2T`           | Statistical | `T.DIST.2T(x, degrees_freedom)`                                                                                | Google      | `COM.MICROSOFT.T.DIST.2T`        | built                                                         |
| `T.DIST.RT`           | Statistical | `T.DIST.RT(x, degrees_freedom)`                                                                                | Google      | `COM.MICROSOFT.T.DIST.RT`        | built                                                         |
| `T.INV`               | Statistical | `T.INV(probability, degrees_freedom)`                                                                          | Google      | `COM.MICROSOFT.T.INV`            | built                                                         |
| `T.INV.2T`            | Statistical | `T.INV.2T(probability, degrees_freedom)`                                                                       | Google      | `COM.MICROSOFT.T.INV.2T`         | built                                                         |
| `T.TEST`              | Statistical | `T.TEST(range1, range2, tails, type)`                                                                          | Google      | `COM.MICROSOFT.T.TEST`           | built                                                         |
| `TAN`                 | Math        | `TAN(angle)`                                                                                                   | Google      | `TAN`                            | built                                                         |
| `TANH`                | Math        | `TANH(value)`                                                                                                  | Google      | `TANH`                           | built                                                         |
| `TBILLEQ`             | Financial   | `TBILLEQ(settlement, maturity, discount)`                                                                      | Google      | `TBILLEQ`                        | built                                                         |
| `TBILLPRICE`          | Financial   | `TBILLPRICE(settlement, maturity, discount)`                                                                   | Google      | `TBILLPRICE`                     | built                                                         |
| `TBILLYIELD`          | Financial   | `TBILLYIELD(settlement, maturity, price)`                                                                      | Google      | `TBILLYIELD`                     | built                                                         |
| `TDIST`               | Statistical | `TDIST(x, degrees_freedom, tails)`                                                                             | Google      | `LEGACY.TDIST`                   | built                                                         |
| `TEXT`                | Text        | `TEXT(number, format)`                                                                                         | Google      | `TEXT`                           | built                                                         |
| `TEXTJOIN`            | Text        | `TEXTJOIN(delimiter, ignore_empty, text1, [text2], …)`                                                         | Google      | `COM.MICROSOFT.TEXTJOIN`         | built                                                         |
| `TIME`                | Date        | `TIME(hour, minute, second)`                                                                                   | Google      | `TIME`                           | built                                                         |
| `TIMEVALUE`           | Date        | `TIMEVALUE(time_string)`                                                                                       | Google      | `TIMEVALUE`                      | built                                                         |
| `TINV`                | Statistical | `TINV(probability, degrees_freedom)`                                                                           | Google      | `TINV`                           | built                                                         |
| `TOCOL`               | Array       | `TOCOL(array_or_range, [ignore], [scan_by_column])`                                                            | Google      | `COM.MICROSOFT.TOCOL`            | built                                                         |
| `TODAY`               | Date        | `TODAY()`                                                                                                      | Google      | `TODAY`                          | built                                                         |
| `TOROW`               | Array       | `TOROW(array_or_range, [ignore], [scan_by_column])`                                                            | Google      | `COM.MICROSOFT.TOROW`            | built                                                         |
| `TO_DATE`             | Parser      | `TO_DATE(value)`                                                                                               | Google      | S5                               | built                                                         |
| `TO_DOLLARS`          | Parser      | `TO_DOLLARS(value)`                                                                                            | Google      | S5                               | built                                                         |
| `TO_PERCENT`          | Parser      | `TO_PERCENT(value)`                                                                                            | Google      | S5                               | built                                                         |
| `TO_PURE_NUMBER`      | Parser      | `TO_PURE_NUMBER(value)`                                                                                        | Google      | S5                               | built                                                         |
| `TO_TEXT`             | Parser      | `TO_TEXT(value)`                                                                                               | Google      | S5                               | built                                                         |
| `TRANSPOSE`           | Array       | `TRANSPOSE(array_or_range)`                                                                                    | Google      | `TRANSPOSE`                      | built                                                         |
| `TREND`               | Array       | `TREND(known_data_y, [known_data_x], [new_data_x], [b])`                                                       | Google      | `TREND`                          | built                                                         |
| `TRIM`                | Text        | `TRIM(text)`                                                                                                   | Google      | `TRIM`                           | built                                                         |
| `TRIMMEAN`            | Statistical | `TRIMMEAN(data, exclude_proportion)`                                                                           | Google      | `TRIMMEAN`                       | built                                                         |
| `TRUE`                | Logical     | `TRUE()`                                                                                                       | Google      | `TRUE`                           | built                                                         |
| `TRUNC`               | Math        | `TRUNC(value, [places])`                                                                                       | Google      | `TRUNC`                          | built                                                         |
| `TTEST`               | Statistical | `TTEST(range1, range2, tails, type)`                                                                           | Google      | `TTEST`                          | built                                                         |
| `TYPE`                | Info        | `TYPE(value)`                                                                                                  | Google      | `TYPE`                           | built                                                         |
| `UMINUS`              | Operator    | `UMINUS(value)`                                                                                                | Google      | S5                               | built                                                         |
| `UNARY_PERCENT`       | Operator    | `UNARY_PERCENT(percentage)`                                                                                    | Google      | S5                               | built                                                         |
| `UNICHAR`             | Text        | `UNICHAR(number)`                                                                                              | Google      | `UNICHAR`                        | built                                                         |
| `UNICODE`             | Text        | `UNICODE(text)`                                                                                                | Google      | `UNICODE`                        | built                                                         |
| `UNIQUE`              | Filter      | `UNIQUE(range, [by_column], [exactly_once])`                                                                   | Google      | `COM.MICROSOFT.UNIQUE`           | built                                                         |
| `UPLUS`               | Operator    | `UPLUS(value)`                                                                                                 | Google      | S5                               | built                                                         |
| `UPPER`               | Text        | `UPPER(text)`                                                                                                  | Google      | `UPPER`                          | built                                                         |
| `VALUE`               | Text        | `VALUE(text)`                                                                                                  | Google      | `VALUE`                          | built                                                         |
| `VAR`                 | Statistical | `VAR(value1, [value2, ...])`                                                                                   | Google      | `VAR`                            | built                                                         |
| `VAR.P`               | Statistical | `VAR.P(value1, [value2, ...])`                                                                                 | Google      | `COM.MICROSOFT.VAR.P`            | built                                                         |
| `VAR.S`               | Statistical | `VAR.S(value1, [value2, ...])`                                                                                 | Google      | `COM.MICROSOFT.VAR.S`            | built                                                         |
| `VARA`                | Statistical | `VARA(value1, value2)`                                                                                         | Google      | `VARA`                           | built                                                         |
| `VARP`                | Statistical | `VARP(value1, value2)`                                                                                         | Google      | `VARP`                           | built                                                         |
| `VARPA`               | Statistical | `VARPA(value1, value2,...)`                                                                                    | Google      | `VARPA`                          | built                                                         |
| `VDB`                 | Financial   | `VDB(cost, salvage, life, start_period, end_period, [factor], [no_switch])`                                    | Google      | `VDB`                            | built                                                         |
| `VLOOKUP`             | Lookup      | `VLOOKUP(search_key, range, index, [is_sorted])`                                                               | Google      | `VLOOKUP`                        | built                                                         |
| `VSTACK`              | Array       | `VSTACK(range1; [range2, …])`                                                                                  | Google      | `COM.MICROSOFT.VSTACK`           | built                                                         |
| `WEEKDAY`             | Date        | `WEEKDAY(date, [type])`                                                                                        | Google      | `WEEKDAY`                        | built                                                         |
| `WEEKNUM`             | Date        | `WEEKNUM(date, [type])`                                                                                        | Google      | `WEEKNUM`                        | built                                                         |
| `WEIBULL`             | Statistical | `WEIBULL(x, shape, scale, cumulative)`                                                                         | Google      | `WEIBULL`                        | built                                                         |
| `WEIBULL.DIST`        | Statistical | `WEIBULL.DIST(x, shape, scale, cumulative)`                                                                    | Google      | `COM.MICROSOFT.WEIBULL.DIST`     | built                                                         |
| `WORKDAY`             | Date        | `WORKDAY(start_date, num_days, [holidays])`                                                                    | Google      | `WORKDAY`                        | built                                                         |
| `WORKDAY.INTL`        | Date        | `WORKDAY.INTL(start_date, num_days, [weekend], [holidays])`                                                    | Google      | `COM.MICROSOFT.WORKDAY.INTL`     | built                                                         |
| `WRAPCOLS`            | Array       | `WRAPCOLS(range, wrap_count, [pad_with])`                                                                      | Google      | `COM.MICROSOFT.WRAPCOLS`         | built                                                         |
| `WRAPROWS`            | Array       | `WRAPROWS(range, wrap_count, [pad_with])`                                                                      | Google      | `COM.MICROSOFT.WRAPROWS`         | built                                                         |
| `XIRR`                | Financial   | `XIRR(cashflow_amounts, cashflow_dates, [rate_guess])`                                                         | Google      | `XIRR`                           | built                                                         |
| `XLOOKUP`             | Lookup      | `XLOOKUP(search_key, lookup_range, result_range, missing_value, [match_mode], [search_mode])`                  | Google      | `COM.MICROSOFT.XLOOKUP`          | built                                                         |
| `XMATCH`              | Lookup      |                                                                                                                | OpenFormula | `COM.MICROSOFT.XMATCH`           | built                                                         |
| `XNPV`                | Financial   | `XNPV(discount, cashflow_amounts, cashflow_dates)`                                                             | Google      | `XNPV`                           | built                                                         |
| `XOR`                 | Logical     | `XOR(logical_expression1, [logical_expression2, ...])`                                                         | Google      | `XOR`                            | built                                                         |
| `YEAR`                | Date        | `YEAR(date)`                                                                                                   | Google      | `YEAR`                           | built                                                         |
| `YEARFRAC`            | Date        | `YEARFRAC(start_date, end_date, [day_count_convention])`                                                       | Google      | `YEARFRAC`                       | built                                                         |
| `YIELD`               | Financial   | `YIELD(settlement, maturity, rate, price, redemption, frequency, [day_count_convention])`                      | Google      | `YIELD`                          | built                                                         |
| `YIELDDISC`           | Financial   | `YIELDDISC(settlement, maturity, price, redemption, [day_count_convention])`                                   | Google      | `YIELDDISC`                      | built                                                         |
| `YIELDMAT`            | Financial   | `YIELDMAT(settlement, maturity, issue, rate, price, [day_count_convention])`                                   | Google      | `YIELDMAT`                       | built                                                         |
| `Z.TEST`              | Statistical | `Z.TEST(data, value, [standard_deviation])`                                                                    | Google      | `COM.MICROSOFT.Z.TEST`           | built                                                         |
| `ZTEST`               | Statistical | `ZTEST(data, value, [standard_deviation])`                                                                     | Google      | `ZTEST`                          | built                                                         |

## Other workbooks

`IMPORTRANGE(spreadsheet_url, range_string)` reads a range of another LiveDoc spreadsheet, as Google Sheets' reads
another Google spreadsheet (verified: Google's help, "IMPORTRANGE").
It shares the imports' path through the page and the api ([Imports from the web](imports.md#fetching)), but never
fetches from the web: it reads LiveDoc's own spreadsheets, so it works wherever LiveDoc runs, `SHEET_IMPORTS` or not.

- `spreadsheet_url` is the spreadsheet's document address (`https://<host>/document/<id>`, any path after the id) or
  its id alone, as Google takes a spreadsheet's address or its key (default, D75).
- An address of anything else (another service's spreadsheet, a page) is `#REF!` "Only LiveDoc spreadsheets can be
  imported"; an empty one is `#REF!` too (default, D75).
- `range_string` is `[sheet_name!]range` (`"Sheet1!A2:B6"`, `"A2:B6"`) or a named range of the source; without a
  sheet it reads the source's first sheet (verified: Google's help). Whole columns and rows (`"Data!A:C"`) and open
  ranges (`"A2:A"`) read to the source's filled extent, as a reference does.
- A range string that is no reference, or names a sheet or name the source does not have, is `#REF!` "Cannot find
  range or sheet for imported range." (verified: third-party guides quote Google's words).
- **Its answer** is the source's values, as the source's own engine works them out: numbers, text, booleans, empty
  cells and errors (a `#DIV/0!` in the source reads `#DIV/0!`); one cell is one value, a range spills.
- Number formats do not come with the values: a date reads as its serial number until a spill carries formats (D69's
  gap); format the cells that receive it (default, D75).
- An answer past the largest array (D3) is `#ERROR!` "Result too large" (verified: Google's words, third-party
  guides; Google's own bound is 10 MB a request).
- Arguments reading `NOW`, `RAND`, `RANDARRAY` or `RANDBETWEEN` are `#ERROR!`, as an import's are (verified:
  Google's help, "Volatility").
- While the answer is on its way the cell shows Loading… (`#N/A`, pending), as an import's does.

### Connecting two spreadsheets

Google asks once for each pair of spreadsheets: the first `IMPORTRANGE` from a new source is `#REF!` "You need to
connect these sheets." with **Allow Access** (verified: Google's help).

- A spreadsheet holding an `IMPORTRANGE` whose source is not yet connected shows a bar above the grid: "Some formulas
  import ranges from other spreadsheets." with **Allow Access** for Editors, as the imports' bar does; one press
  connects every source its formulas name that the Editor may open (default, D76).
- Google offers the button in the cell's hover card; LiveDoc's bar is reachable by keyboard and screen reader, and
  the hover card says why, as every error's does (default, D76).
- Connecting is for the pair, for everyone, for good: it is kept with the destination's workbook as the sources it may
  read, a copy starts without it, and it is never taken back (verified: Google's help, "Permission & access").
- An Editor connects with `POST /api/documents/<id>/workbook/imports` naming the sources, sent to everyone as a
  `workbook` op; a source the Editor may not open is not connected.
- A spreadsheet reading itself needs no connecting (default, D76).
- Connecting sends `Spreadsheet · Unlocked · RangeAccess`, before the change is saved ([Telemetry](../017-telemetry/telemetry.md)).
- A spreadsheet in This Browser has nothing on a server to connect: its `IMPORTRANGE` reads as its imports do,
  offered Sync Document first ([Imports](imports.md#a-spreadsheet-in-this-browser)).

### Who reads what

- Each reader reads with their own access: a reader who may not open the source sees `#REF!` "You don't have
  permissions to access that sheet." (verified: Google's words), never its values.
- A source that does not exist, is in someone's browser only, or is trashed reads the same words, so an address never
  tells whether a document is there (default, D76).
- Google reads with the access of the person who connected, so every Editor of the destination may import from it;
  LiveDoc never widens anyone's access ([Plan's links](plan-links.md#who-may-do-what)), so it reads with the reader's.
- A source that is no spreadsheet (a diagram, a wiki) reads "Cannot find range or sheet for imported range.".

### Fresh values

- The page asks for each distinct `IMPORTRANGE` once, and again every minute while the spreadsheet is open; the api
  answers from its copy while the source has not changed, so a change in the source shows within about a minute
  (Google's refresh on every source change; default, D77).
- Typing the formula into its cell again asks afresh, as an import's does (verified: Google's help).
- A source that itself imports is worked out with its own `IMPORTRANGE`s read in turn, at most 4 spreadsheets deep;
  past that, or around a loop (A reads B reads A), the cell is `#REF!` "Circular dependency detected" (Google's
  loop "never results in an actual data output"; default, D77).
- A source's web imports and `IMAGE`s read as they do where no editor fetches (D65), since the api fetches nothing
  for a source no one has open (default, D77).
- Where no editor asks (the api, MCP and CLI reading values, a Plan Sheet) `IMPORTRANGE` is `#N/A` "Imports are
  fetched while the spreadsheet is open", as an import is (D65).
- A file keeps the last values as cached ([Files](files-and-print.md)).

## The oracle

- Each function is measured against an **oracle corpus**: OpenFormula's own test cases, values LibreOffice
  calculates headless from the same inputs, and the values Google Sheets gives the same workbook.
- The corpus is **cases by category** (the catalogue's categories, and `Syntax` for the language itself): each case
  a formula over its category's fixture, and the rows and columns its answer fills (one cell unless it spills).
- **Answers** are kept per source beside the cases, made by a script from the source itself, never typed by hand:
  LibreOffice's by converting the category's workbook headless with every formula worked out afresh; Google's by
  the same workbook opened in Google Sheets and downloaded again. An answer a source documents (OpenFormula's own
  test cases, Microsoft's help for an OOXML meaning) may be written in its case instead, citing where. Google's
  measured answers replace its help pages, which were wrong where cited (`STDEVP(5)` is 0, not `#DIV/0!`).
- A formula typed into Google Sheets answers as the same formula in its `.xlsx` (measured, arity errors alike), so a
  probe that types formulas into a fresh Sheet through the Sheets API, at full precision, stands for the corpus while
  a disagreement is worked out; it deletes its Sheet afterwards.
- A case holds to the answer of its function's **Authority** above; until Google's answer is in, a Google case holds
  to LibreOffice's and is counted as provisional (default, D31). A case LibreOffice answers otherwise than Google
  documents waits for Google's answer, counted, held to none (default, D32).
- Where two sources answer differently, the case names the difference and why; an unnamed difference fails, and so
  does a named one that is not there (the source it names answers as the case holds).
- Numbers agree to one part in a billion (a case may loosen it to one in a million, saying why); text and booleans
  exactly, but complex numbers written as text by their parts; errors by their code, never their wording. A source
  that gives one value where the case's block is bigger fills its first cell, the rest empty.
- The corpus runs in `en-US`, in UTC, at a fixed now (default, D33); volatile functions are held by their own tests.
  A category may name another locale (`Locale` runs in `de-DE`): its formulas are typed in that locale's syntax,
  and LibreOffice answers it with that locale as its own.
- **Google's answers through Drive** (Webber, 2026-11-21): the script works with a Drive token of its own, so no one
  downloads by hand. For each category it uploads the category's workbook as an `.xlsx` converted to a Google Sheet,
  exports that sheet as `.xlsx` with Google's calculated values, reads the answers from it, and deletes
  the Drive file afterwards, whether the category succeeded or failed. Each upload and delete is logged by its file
  id, never by what the file holds.
- The workbook Google is given names `FILTER` and `SORT` with `_xlfn.` alone, as Google reads them; Excel's
  `_xlfn._xlws.` reads as `#NAME?` there ([Excel's grammar](standard-mapping.md#excels-grammar-in-detail)).
- A case of a function the catalogue gives to OpenFormula says so (`authority: openformula`), and a test holds every
  such case to it: Google lacks the function, so its `#NAME?` there is no answer and names no difference.
- Google's `.ods` export is not read: it writes booleans as 1 and 0, and each function ODF lacks (`XOR`, `IFS`,
  `LAMBDA`) as `#NAME?`, where its `.xlsx` holds Google's own answers (measured 2026-11-21, `Logical`).
- Before exporting, the script sets the sheet's locale and time zone to the category's (`en_US`, `de_DE`) and UTC
  through the Sheets API, as a converted file takes the account's own; it is the only Sheets API call.
- Drive's answers replace downloads made by hand: there is no folder of downloads to read from.
- The token is an OAuth client of the operator's (a Desktop app, scope `drive.file` only, published so its refresh
  token does not lapse after seven days): its client file at `~/.secrets/google-oracle-oauth-client.json`, its refresh
  token at `~/.secrets/google-oracle-refresh-token`, both mode 600, never printed or logged.
- **Consent** is a one-time step: the script listens on `127.0.0.1` at a free port, prints Google's consent URL (offline
  access, `prompt=consent`, PKCE, a random `state`) for the operator to open, takes the redirect's code, refuses a
  `state` that is not its own, exchanges the code and saves the refresh token, mode 600; it waits at most 10 minutes
  (default, D95).
- A Drive or Sheets call that fails with 429 or 5xx is tried again up to three times, a second, then 4, then 16 apart; any other
  failure stops the category and names the call and status, never the token (default, D96).
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
- In the browser the engine runs in a Web Worker, the only engine there. The page keeps a copy of every value it has
  worked out, sent as they change: first which cells are waiting, then their new values in parts. Everything on the
  page that reads values (the grid, sort, find, charts, dropdowns, exports, a rule's custom formula) reads the copy,
  as it stands, never waiting. The api, the MCP worker and agents work values out directly, as before.
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
- **D38** A function Google defines more narrowly than a standard: The standard's wider definition, everywhere (default).
- **D39** ISDATE of a number worked out in its formula: No date; only a cell's format makes a number a date (default).
- **D40** CELL's "width": ECMA-376's characters, a 7-pixel digit and 5 pixels of padding, to the nearest whole
  character, as Google gives it (measured: 100 pixels are 14, 120 are 16, 64 are 8).
- **D41** CELL's "format" for LiveDoc's own formats: Number `,`, Currency `C`, Date `D4`, Time `D8`, ... (default).
- **D42** CELL's "filename" and "protect": Empty text; 1 only under a protected range or sheet (default).
- **D43** What the byte functions count as two bytes: East Asian wide and full-width characters (UAX #11), and
  half-width katakana, as Google gives them (measured: `LENB("ｶ")` is 2).
- **D44** DOLLAR's currency: The locale's region's, US dollars for a region not in LiveDoc's table (default).
- **D45** COUNTUNIQUE's sameness: A value's type and its text, case kept, as UNIQUE compares (default).
- **D46** FREQUENCY with no class a number: Every value counted in one row, as Excel documents (default).
- **D47** LINEST and its kin over collinear x values: `#N/A`, no single fit, as Google gives it (measured).
- **D48** The statistics of an exact fit: Errors 0, F `#NUM!`, as Google gives them (measured).
- **D49** TO_DATE's format: Date, the day without its time (default).
- **D50** CONVERT's unit sizes: Their exact definitions (NIST SP 811), not LibreOffice's rounded factors (default).
- **D51** DOLLARDE and DOLLARFR's written fraction: As many places as the unit has digits, as Google gives it
  (measured); unit 1 the decimal itself (default).
- **D52** CUMPRINC's fractional periods: From the first in steps of one, as Google gives them (measured).
- **D53** TBILLEQ's days: Actual days, as TBILLPRICE and TBILLYIELD count them (default).
- **D54** COUPPCD and COUPNCD's format: Date (default).
- **D55** XNPV and XIRR's amounts and dates: Every one a number, else `#VALUE!`; a count apart `#NUM!`; XNPV of one
  amount that amount, as Google gives it (default).
- **D56** AVERAGE.WEIGHTED's errors: Ranges of two sizes `#VALUE!`, a negative weight `#NUM!` (default).
- **D57** PERCENTRANK.INC and .EXC: As PERCENTRANK's help: outside the data `#N/A`; fewer than 1 digit is 3 (default).
- **D58** INFO's answers: One document, recalculation Automatic, `LiveDoc` as system and release; else `#N/A` (default).
- **D59** The odd-period bonds' sums: Excel's over quasi-coupon periods (ECMA-376), not LibreOffice's (default).
- **D60** MULTIPLE.OPERATIONS's reach: Ranges read the replacement; spills as they stand; 250 formulas deep (default).
- **D67** The functions that lift over arrays in an array context: those named in "Arrays and spills", as Google
  gives them (measured): `SUMIF`, `COUNTIF` and `COUNTIFS` lift; `SUMIFS`, `AVERAGEIF` and `AVERAGEIFS` give one
  value.
- **D68** LAMBDA and LET's errors and limits: uncalled, or a name that is not one, `#VALUE!`; at most 100,000
  applications a formula, past them `#NUM!` (default).
- **D69** QUERY's guessed header and its format: a first row of text over other types is a header; `format` and
  `options` are read and not yet shown (default).
- **D70** REGEXREPLACE's unnamed edges: a `$` naming no group, or before no digit, is `#N/A` only when the pattern
  matches (Java's replacement runs per match, measured); a group that took no part is empty text; a trailing
  backslash stays (default).
- **D71** SPARKLINE's unstated choices: empty cells and other values skipped unless set; an unknown chart type
  `#VALUE!`; column colours applied in the order the help lists them; the accent's colours (charts.md "Sparklines").
- **D75** IMPORTRANGE's addresses and values: a document address or id; anything else, or empty, `#REF!`; values
  without their number formats (default).
- **D76** Connecting spreadsheets: one bar with Allow Access for every unconnected source; a spreadsheet reading itself
  needs none; a missing source reads as one the reader may not open (default).
- **D77** IMPORTRANGE's freshness: asked again every minute while open; sources read 4 deep, a loop `#REF!`; a
  source's web imports as where no editor fetches (default).
- **D78** Separators by locale: A locale whose own decimal mark (Intl) is a comma writes `;` and `\`; a comma outside a
  number, or a point in one, there cannot be read (default).
- **D79** A Plan Sheet's locale and time zone: The viewer's browser's, formula separators included (default).
- **D80** Function names' case: A function's in capitals; a name no function has as typed (default).
- **D81** An unknown time zone or locale: Read as UTC and as `en` (default).
- **D95** The oracle's Drive consent: On `127.0.0.1` at a free port, its own `state` and PKCE, at most 10 minutes
  (default).
- **D96** The oracle's Drive retries: 429 and 5xx three more times, 1, 4 and 16 seconds apart; any other stops the
  category (default).
- **D100** Converting between meanings: The formulas that may answer differently are listed among the losses, never
  rewritten (default).
- **D101** A spreadsheet opened from a file before the file's meaning: Keeps Google's meaning (default).
- **D102** Where LEFT, MID, RIGHT and REPLACE count: In characters, never splitting one, where Google counts UTF-16
  units and may cut a character in two (`LEFT("😀a", 1)` is the emoji); `LEN` counts as the meaning does (default).
- **D103** ACCRINT past the first interest date in bases 1 to 3: The securities' day count, as Google's there follows
  no day count found (measured: 213.5 days of a 214-day span at Actual/365) (default).
- **D300** How deep named functions call each other: 100 calls deep, past which the formula is `#NUM!`, so a definition
  calling itself without end stops before the browser's own stack does (default).
- **D301** A cell reference in a named function's definition: Kept as Google keeps it, an absolute reference to its
  sheet adjusted as a formula's are (ruled by the Director, 2026-11-26: a refusal would turn files' LAMBDA names into
  errors). A range shrunk by a deletion stays shrunk when the deletion is undone, as the definition is the
  workbook's, not the sheet's (default).
- The imports' defaults, D61 to D66 and D72 to D74, are kept in [Imports from the web](imports.md#defaults).
