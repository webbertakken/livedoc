# Standard mapping

**Status: partly built.** Both formats read and write sheets, cells, formulas and arrays (`@livedoc/sheets/files`),
within Excel's bounds, and a workbook converts between them; both carry number formats; other styles, unknown
content and the other rows of the table below are ahead.

How a [spreadsheet](spreadsheet.md)'s workbook maps onto its two native file formats (C1, ruled 2026-11-18: both
native; a file keeps the format it arrived in). Research: [The standard](../../research/sheets-open-standard/standard.md).

## One model, two mappings

- The **model** is LiveDoc's own: the workbook as the room stores it ([Sheet store](sheet-store.md)), cells by row and
  column id, formulas by id references. Neither format is the model, and neither is an export of the other.
- Each format has its own **mapping**: a reader from the file into the model and a writer from the model back, with
  what the model does not hold kept beside it (Unknown content, below).
- A workbook keeps its **file format** ([Spreadsheet](spreadsheet.md#what-a-workbook-holds)) and is downloaded,
  synced and mirrored in it until a person converts it ([Files and print](files-and-print.md#converting)).

| Format   | Standard                                                                                               | Files                |
| -------- | ------------------------------------------------------------------------------------------------------ | -------------------- |
| **ODF**  | OpenDocument 1.4, OASIS Standard (3 December 2025): Part 2 packages, Part 3 schema, Part 4 OpenFormula | `.ods`, flat `.fods` |
| **XLSX** | Office Open XML SpreadsheetML, ISO/IEC 29500 (ECMA-376), Transitional conformance, as Excel writes it  | `.xlsx`              |

## What the model holds, and where each format keeps it

| Model                                                 | ODF                                                                                                                         | XLSX                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Workbook, sheets in order                             | `office:spreadsheet`, `table:table` per sheet                                                                               | `xl/workbook.xml` `sheets`, a worksheet part per sheet                         |
| Sheet name, hidden, tab colour                        | `table:name`; `table:display` in its table style; `table:tab-color`                                                         | `sheet@name`, `@state`; `sheetPr/tabColor`                                     |
| Rows and columns, sizes, hidden, groups               | `table:table-row`, `table:table-column` with styles and repeats; `table:table-row-group`                                    | `row@ht`, `@hidden`, `@outlineLevel`; `cols/col`                               |
| Frozen lines                                          | `config:config-item` view settings (`HorizontalSplitPosition`, ...)                                                         | `sheetView/pane` (`frozen`)                                                    |
| Cells: number, text, boolean, date, time, error       | `office:value-type` with `office:value`, `office:date-value`, `office:time-value`, `office:boolean-value`; text in `text:p` | `c@t` (`n`, `s`, `str`, `b`, `e`, `inlineStr`), `v`, shared strings            |
| Formulas                                              | `table:formula` in OpenFormula (`of:=`), its cached value beside it                                                         | `c/f` in Excel's grammar, the cached value in `v`; shared formulas kept shared |
| Array and spilled formulas                            | `table:number-matrix-columns-spanned` and `-rows-spanned`                                                                   | `f@t="array"`, `@ref`; dynamic arrays with their metadata                      |
| Merges                                                | `table:number-columns-spanned`, `-rows-spanned`, covered cells                                                              | `mergeCells`                                                                   |
| Cell styles and number formats                        | Automatic and named `style:style` (`table-cell`), data styles (`number:number-style`, `number:date-style`, ...)             | `xl/styles.xml`: `numFmts`, `fonts`, `fills`, `borders`, `cellXfs`             |
| Named ranges, named functions                         | `table:named-range` ([below](#named-ranges-in-the-file)), `table:named-expression`; no named functions                      | `definedNames`; named functions as `LAMBDA` names                              |
| Validation                                            | `table:content-validation`, LiveDoc's rule in `livedoc:` attributes                                                         | `dataValidations`, LiveDoc's rule in an `extLst` `ext`                         |
| Conditional formats                                   | `calcext:conditional-formats` (LibreOffice's extension namespace)                                                           | `conditionalFormatting`                                                        |
| Filters ([below](#filters-in-the-file))               | `table:database-range` with `table:filter`; no filter views nor slicers                                                     | `autoFilter`; views as `customSheetView`; LiveDoc's record                     |
| Protection ([below](#protection-in-the-file))         | `table:protected`, `style:cell-protect`; LiveDoc's record in `livedoc:` attributes                                          | `sheetProtection`, `protectedRanges`; LiveDoc's record in an `extLst` `ext`    |
| Comments and notes                                    | `office:annotation` in the cell                                                                                             | `xl/comments*.xml` (notes), threaded comments parts                            |
| Charts                                                | `draw:frame` › `draw:object` holding a chart document (inline in `.fods`)                                                   | DrawingML chart parts through `xl/drawings`                                    |
| Pivot tables ([below](#pivot-tables-in-the-file))     | `table:data-pilot-table`; LiveDoc's record in `livedoc:` attributes                                                         | pivot cache definition and table parts; LiveDoc's record in an `extLst` `ext`  |
| Images                                                | `draw:frame` › `draw:image` (`Pictures/`)                                                                                   | `xl/media`, DrawingML pictures; in-cell images as rich values                  |
| Settings: locale, time zone, recalculation, iteration | `table:calculation-settings` (`table:iteration`), meta and settings                                                         | `calcPr` (`iterate`, `iterateCount`, `iterateDelta`, `calcMode`)               |

The table is the contract the readers and writers are tested against, one test per row and direction.

## Formulas in the file's own syntax

- An ODF file's formulas are OpenFormula: `of:=SUM([.A1:.B2])`, sheets as `[$Sheet2.A1]`, `;` between arguments; the
  root declares the `of` namespace, without which LibreOffice reads every formula as `Err:510`.
- An XLSX file's formulas are Excel's grammar: `SUM(A1:B2)`, `Sheet2!A1`, `,` between arguments, `_xlfn.` before
  functions Excel added after 2007.
- A function a format lacks is written as that format's other writers write it: in ODF, LibreOffice's names
  (`COM.MICROSOFT.XLOOKUP`, `ORG.LIBREOFFICE.REGEX`, [Function catalogue](../../research/sheets-open-standard/function-catalogue.md));
  a Google-only function by S5's convention (ruled 2026-11-18: in XLSX, `IFERROR(__xludf.DUMMYFUNCTION("…"), <cached>)` as
  Google writes it; in ODF, `ORG.LIVEDOC.<NAME>`), always with its cached value.
- Where Google Sheets differs from OpenFormula or Excel on what a function means, Google's meaning holds in the grid
  and each file names the function whose meaning matches (S6, ruled 2026-11-18) ([Formulas](formulas.md)).
- A formula read from a file that LiveDoc cannot evaluate keeps its text and shows its cached value, with a marker
  saying so; it is written back as it came.
- An open-ended range (`A2:A`) has no form in either standard: it is written to the standards' last row or column
  (1,048,576 and 16,384, `XFD`), and any range reaching them is read back open (`A2:A`; from the first row, `A:A`),
  since the grid is smaller than the standards' and a range past it is `#REF!`.

### Excel's grammar in detail

- A function Excel added after 2007 carries Excel's prefix: `_xlfn.` for each name of MS-XLSX §2.2.2's future
  function list and of Excel's dynamic arrays, `_xlfn._xlws.` for `FILTER` and `SORT`; the list is XlsxWriter's
  record of both ([Working with formulas](https://xlsxwriter.readthedocs.io/working_with_formulas.html)).
- Google Sheets reads `_xlfn._xlws.FILTER` and `_xlfn._xlws.SORT` as `_xlws.FILTER` and `_xlws.SORT` and shows
  `#NAME?`, where it reads `_xlfn.FILTER` and a bare `FILTER` (measured 2026-11-21); LibreOffice 26.8 reads only
  `_xlfn._xlws.`, as Excel does. The file follows Excel and LibreOffice: in Google Sheets, a `FILTER` or `SORT` from
  LiveDoc's `.xlsx` shows `#NAME?` until it is typed again.
- `LAMBDA` and `LET` parameters carry `_xlpm.`, wherever the formula uses them.
- A spilled range (`B2#`) is `_xlfn.ANCHORARRAY(B2)`.
- A formula Excel's grammar cannot hold is written whole by S5's convention: one calling a Google-only function or a
  function Excel does not have (`EASTERSUNDAY`), and one whose array literal holds more than constants
  (`{A1:A3, B1:B3}`) (default, D83).
- Reading undoes each: the prefixes go, `ANCHORARRAY` is a spill again, and `IFERROR(__xludf.DUMMYFUNCTION("…"), …)`
  is the formula it wraps, as Google Sheets reads its own downloads.
- A string literal holds 255 characters in Excel's grammar: a longer one is written as pieces of 255 joined by `&`,
  bracketed as one value (`("…"&"…")`), and so is the text `DUMMYFUNCTION` wraps, as Google Sheets writes it
  (measured in the corpus); reading joins the pieces again.
- A shared formula (`f@t="shared"`) is unfolded: each cell of its block holds the first cell's formula moved as a
  copy moves it (relative parts move, absolute parts stay).
- What Excel's grammar holds and Google's does not (a structured reference `Table1[Col]`, another workbook's
  `[1]Sheet1!A1`, a data table) cannot be read: the cell keeps its cached value and the loss is named.

## Arrays in the file

- A formula whose result spills is written with its block: in ODF its matrix spans, in XLSX `f@t="array"` with
  `@ref` and the dynamic-array cell metadata (`c@cm`, `xl/metadata.xml`), so Excel spills it as Google does.
- The block's other cells carry the spilled values as their cached values, so a reader that does not calculate
  shows them; in XLSX a block S5 wraps is no array, and its other cells are
  `IFERROR(__xludf.DUMMYFUNCTION("""COMPUTED_VALUE"""), <value>)`, as Google Sheets writes them.
- Reading, a block's other cells are cache: never inputs, so the formula spills into them again; a wrapped formula's
  block is the run of `COMPUTED_VALUE` cells to its right and below.

## Values in XLSX

- Text is written once into the shared strings, in order of first use; a formula's text result is `c@t="str"`.
- An error Excel knows (`#NULL!`, `#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#NUM!`, `#N/A`) is cached as `c@t="e"`;
  another (`#ERROR!`) is cached as its text (default, D82).
- In a workbook in the 1904 date system (`workbookPr@date1904`), a date (a number whose cell style's number format
  shows a date or a time) is read 1,462 days later, so it keeps its day; a `c@t="d"` value (an ISO 8601 date) is
  read as its serial.
- A sheet's name past Excel's 31 characters is cut and numbered as a taken name is, the formulas naming it follow, and
  the loss is named (`sheet_renamed`) (default, D84).
- Excel's own bounds hold in every XLSX written, each loss named (default, D89): a cell's text past 32,767 characters
  is cut (`text_cut`); a formula past 8,192 characters, as written, keeps only its value (`formula_unwritten`);
  cells past column `XFD` (16,384) are left out (`sheet_cut`), and a block spilling past it is written to `XFD`;
  a formula naming a column past `XFD` is written by S5's convention.

## Number formats in the file

- A cell's number format travels as a **format code**, the grammar Google Sheets, Excel and `TEXT` share
  ([Sheet](sheet.md#formatting)); each format's mapping turns the code into its own form and back.
- Each number format of the model is written as the code below and read back as that format when a file carries
  exactly that code; any other code is read as Custom with the code as it came (default, D90):

| Format     | Code written (2 decimals; `n` decimals put `n` zeros after the point, none and no point for 0)        |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Automatic  | none (XLSX General, ODF no data style); with decimals set, `0.00`                                     |
| Number     | `#,##0.00`                                                                                            |
| Percent    | `0.00%`                                                                                               |
| Scientific | `0.00E+00`                                                                                            |
| Currency   | `"£"#,##0.00`, its symbol quoted                                                                      |
| Accounting | `_("£"* #,##0.00_);_("£"* \(#,##0.00\);_("£"* "-"??_);_(@_)`                                          |
| Date       | The workbook's locale's short date as the grid draws it: `dd/mm/yyyy` in en-GB, `mm/dd/yyyy` in en-US |
| Time       | `hh:mm:ss`                                                                                            |
| Date Time  | The short date, a space, `hh:mm`                                                                      |
| Duration   | `[h]:mm:ss`                                                                                           |
| Plain Text | `@`                                                                                                   |
| Custom     | Its code                                                                                              |

- Reading also takes a currency written the other ways Excel and LibreOffice write one: `£#,##0.00` and
  `[$£-809]#,##0.00` are Currency with `£` (default, D91); a code of more sections than the table's is Custom.
- A code past `FORMAT_CODE_MAX` characters, or one `TEXT` cannot read, keeps its cell's value under Automatic and the
  loss is named (`format_unread`).
- **XLSX**: a code is a `numFmt` of `xl/styles.xml`, a cell's `s` naming the `cellXfs` entry that applies it. A code
  equal to one of ECMA-376's built-in formats (§18.8.30: 1 `0`, 2 `0.00`, 3 `#,##0`, 4 `#,##0.00`, 9 `0%`, 10
  `0.00%`, 11 `0.00E+00`, 46 `[h]:mm:ss`, 49 `@`) is written by that id, any other from id 164 in the order of first
  use; reading, built-in 14 (Excel's short date in the reader's locale) is Date, 21 `h:mm:ss` and 22 `m/d/yyyy h:mm`
  their codes, and every other built-in its code from the standard's table (default, D92).
- **ODF**: a code is a data style (`number:number-style`, `number:percentage-style`, `number:currency-style`,
  `number:date-style`, `number:time-style`, `number:text-style`), its sections as `style:map` conditions and its
  colours as text properties, applied by an automatic cell style (`table-cell`) a cell names; data styles `N1`,
  `N2`, ... and cell styles `ce1`, `ce2`, ... in the order of first use (default, D93); the code rides as the main data
  style's `number:title`, and reading takes it where it writes the very structure the file holds, so a file LiveDoc
  wrote comes back to its own code. Other makers' data styles are read from their structure; what a code cannot say
  (an era, a quarter, text inside the digits, a colour of no name) is read as near as a code says it and named
  (`format_approximated`); a code ODF cannot say here (a fraction, a scaling comma) is written without its format and
  named (`format_unwritten`).
- A cell's format is its own cell style's, else its row's default cell style's, else its column's. An empty cell keeps
  its own style's format where the file repeats it over at most 1,000 cells; a format over more is a whole line's,
  which the grid does not hold yet, and is named (`formats_cut`) (default, D94).
- A row's or column's default cell style formats the cells the file fills in it; over its empty cells it shows
  nothing, as Excel's column styles show nothing (D110), and is not named (default, D123).

## Cell styles in the file

- A cell's style beyond its number format (bold, italic, underline, strikethrough, text and fill colour, font family
  and size, horizontal and vertical alignment, wrapping, rotation, the four borders) travels with its number format in
  the one cell style the cell names, both ways ([Formatting](formatting.md#styles-in-the-model)).
- Each distinct style is written once, in order of first use: XLSX's `cellXfs` entry with its `fonts`, `fills` and
  `borders` entries, ODF's automatic cell style (`ce1`, ...) with its text, paragraph and cell properties.
- A style is read against LiveDoc's defaults, Arial 10 pt in black with no fill and no border: what a file's style
  says that differs is the cell's own, the file's default style included (Excel's Calibri 11 makes every cell
  Calibri 11). The file's default font colour reads as none, as the grid's own ink; a file with no default style says nothing of its cells' look (default, D203).
- A cell's style is its own, else its row's default cell style, else its column's, as its number format is; an empty
  cell keeps its own style where it differs from the file's default, over at most 1,000 cells (D94).
- ODF's written default cell style is LiveDoc's, Arial 10 pt in the middle, in `styles.xml` as the default style
  (`style:default-style`) and as the "Default" style every written cell style is a child of; a read follows each
  style's parents to the default style, property by property, and takes the default style's text properties alone,
  as LibreOffice writes cell properties there (a wrap) that it draws by its "Default" style instead (default, D207).
- A cell the grid leaves unaligned vertically draws in the middle ([Sheet](sheet.md#formatting)): it is written as
  middle (`center`, ODF `middle`), the default style's too, and a file's bottom, both formats' default, reads as
  Bottom (default, D204).
- **Clip** has no form in either format: written as Overflow, the format both apps draw a long text in (default,
  D205).

| Model             | XLSX (`xl/styles.xml`)                                         | ODF (automatic `table-cell` style)                                         |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Bold, italic      | `font/b`, `font/i`                                             | `fo:font-weight="bold"`, `fo:font-style="italic"`                          |
| Underline         | `font/u` (single; double reads as single)                      | `style:text-underline-style="solid"` (any other style reads as solid)      |
| Strikethrough     | `font/strike`                                                  | `style:text-line-through-style="solid"` (any style but none)               |
| Text colour       | `font/color@rgb` (`FFrrggbb`)                                  | `fo:color`                                                                 |
| Font family, size | `font/name@val`, `font/sz@val` (points)                        | `fo:font-family` written; `style:font-name` through its font face read too |
| Fill colour       | `fill/patternFill@patternType="solid"`, its `fgColor@rgb`      | `fo:background-color`                                                      |
| Horizontal        | `alignment@horizontal` `left`, `center`, `right`               | `fo:text-align` `start`, `center`, `end`, with `style:text-align-source`   |
| Vertical          | `alignment@vertical` `top`, `center`, `bottom`                 | `style:vertical-align` `top`, `middle`, `bottom`                           |
| Wrap              | `alignment@wrapText="1"`                                       | `fo:wrap-option="wrap"`                                                    |
| Rotation          | `alignment@textRotation`: 1 to 90 up, 91 to 180 down (91 −1°)  | `style:rotation-angle`, counterclockwise (315 −45°)                        |
| Stacked           | `alignment@textRotation="255"`                                 | `style:direction="ttb"`                                                    |
| Borders           | `border/left`, `right`, `top`, `bottom`: `@style`, `color@rgb` | `fo:border-left`, ...: width, style, colour (`0.74pt solid #000000`)       |

- **Borders**: thin, medium and thick are widths 1, 2 and 3 solid; XLSX's `dashed` and `mediumDashed` (and its
  dash-dots) are dashed of width 1 and 2, `dotted` and `hair` dotted, `double` double; ODF's width reads as 1 up to
  1 pt, 2 up to 2 pt, else 3, its `double` and `double-thin` as double, its 3-D lines as solid and its other dashes and
  waves as dashed. Written: thin, medium, thick; dashed, mediumDashed; dotted; double; ODF 0.74 pt, 1.76 pt, 2.49 pt
  (LibreOffice's thin, medium and thick), a double as LibreOffice writes one, 1.76 pt with its line widths
  (`style:border-line-width`), which LibreOffice carries into Excel's `double` (default, D206).
- **Colours**: XLSX's `rgb`, its `indexed` colours by ECMA-376's palette (§18.8.27) and its `theme` colours by the
  file's theme with their `tint`; a colour none of those name (`auto`, system colours) is none. ODF's are `#rrggbb`;
  `transparent` is none.
- A font size is rounded to a whole point within Font Size's limits.
- What a style says that the model does not hold (an ODF angle between 90° and 270°, D212, an indent, shrink to fit,
  a justified, filled or distributed alignment, a pattern or gradient fill, a diagonal border, protection) is left
  out, and the read names each sheet whose cells, rows or columns hold it (`styles_unread`, D104).

## The theme in the file

- A workbook's [theme](formatting.md#themes) is written and read with XLSX's theme part (`xl/theme/theme1.xml`); ODF
  has no theme, so an ODF file holds the colours a theme colour is and the theme's font as its default.
- **XLSX, written**: the theme part's `a:clrScheme` holds the theme's colours (`dk1` Text, `lt1` Background, `dk2` and
  `lt2` the same, `accent1` to `accent6`, `hlink` Link, `folHlink` Link too) and its `a:fontScheme` the theme's font as
  the major and minor `a:latin`; `a:fmtScheme` is LibreOffice's plain one. The default font (`fonts` 0) is the theme's
  font. A cell's theme colour is a `color@theme` (text) or `fgColor@theme` (fill), by Excel's order: 0 Background,
  1 Text, 2 and 3 the second pair, 4 to 9 the accents, 10 Link.
- **XLSX, read**: a file with a theme part opens with its theme: its colours as above and the default font's family as
  its font, named as the file names it (`a:theme@name`), or the catalogue's theme it matches exactly. A cell's colour
  by `theme` without a `tint` reads as that theme colour; with a tint, as the colour it draws (default, D218).
- A file's default font is the theme's font: a cell whose font is it carries no font of its own, where D203 gave
  every cell the default font; a file without a theme part reads as D203 says (default, D218).
- **ODF, written**: theme colours as their `#rrggbb`; the default style's font is the theme's (D207).

## Format rules in the file

- A sheet's [format rules](conditional-formatting.md) are written and read both ways, in list order, each with its
  range of one or more rectangles (XLSX `sqref`, ODF `calcext:target-range-address`, space-separated).
- **XLSX**: one `conditionalFormatting` a rule, its `cfRule` numbered by list order (`priority` 1, 2, ...) and
  `stopIfTrue`, so Excel draws the first met rule alone, as LiveDoc does; a style
  is a differential format (`dxf`) in the styles part, after the file's own kept ones (D110), so their ids stand.
- **ODF**: LibreOffice's `calcext:conditional-formats` in the table, one `calcext:conditional-format` a rule; a style
  is a named cell style (`ConditionalStyle_1`, ...) in `styles.xml`'s `office:styles`, a child of "Default", as
  LibreOffice writes them (`ConditionalStyle_5f_1`, shown and named by the rule as `ConditionalStyle_1`); a
  condition's `calcext:base-cell-address` is the anchor's top-left cell. LiveDoc's rules follow the kept ones in the
  table's one `calcext:conditional-formats`, and the named styles kept conditions name are kept with them.
- A custom formula is in each format's own syntax, written for the anchor's top-left cell; a read formula written for
  another base cell is moved to the anchor's.

| Model                       | XLSX `cfRule`                                                                                    | ODF `calcext:condition@calcext:value`                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Is Empty, Is Not Empty      | `containsBlanks`, `notContainsBlanks` (`LEN(TRIM(A1))=0`)                                        | `formula-is(LEN(TRIM([.A1]))=0)`, `>0`                                                                |
| Text Contains               | `containsText` (`operator="containsText"`, `text`)                                               | `contains-text("x")`                                                                                  |
| Text Does Not Contain       | `notContainsText` (`operator="notContains"`)                                                     | `not-contains-text("x")`                                                                              |
| Text Starts With, Ends With | `beginsWith`, `endsWith`                                                                         | `begins-with("x")`, `ends-with("x")`                                                                  |
| Text Is Exactly             | `cellIs` `equal` with the text                                                                   | `="x"`                                                                                                |
| Greater Than, ... Not Equal | `cellIs` `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `equal`, `notEqual` | `>`, `>=`, `<`, `<=`, `=`, `!=`                                                                       |
| Is Between                  | `cellIs` `between`, two `formula`s                                                               | `between(1,5)`                                                                                        |
| Is Not Between              | `cellIs` `notBetween`, two `formula`s                                                            | `not-between(1,5)`                                                                                    |
| Date Is Before, After, Is   | `expression`: `AND(ISNUMBER(A1),INT(A1)<DATE(2026,1,5))`                                         | `formula-is(...)`, the same formula                                                                   |
| Custom Formula Is           | `expression`                                                                                     | `formula-is(...)`                                                                                     |
| Colour Scale                | `colorScale`: `cfvo` `min`, `max`, `num`, `percent`, `percentile`; `color@rgb`                   | `calcext:color-scale-entry`: `minimum`, `maximum`, `number`, `percent`, `percentile`; `calcext:color` |
| Style                       | `dxf`: `font/b`, `i`, `u`, `strike`, `color`; `fill/patternFill/bgColor`                         | `fo:font-weight`, `fo:font-style`, underline, line-through, `fo:color`, `fo:background-color`         |

- A condition's value is written as a number when it reads as one (a date as its day number), else as text.
- **Read**: a `cellIs` or ODF comparison whose operand is a number or a text is its condition; any other operand (a
  reference, a formula) reads as the same test written as a Custom Formula Is. An empty or not empty
  test written as `LEN(TRIM(...))` reads as Is Empty or Is Not Empty; Date Is and Text Is Exactly come back as a
  Custom Formula Is and Is Equal To, drawing the same cells (default, D215).
- What the model does not hold (data bars, icon sets, top and bottom, above average, duplicates, errors, time periods,
  a scale point by formula, a formula LiveDoc cannot read, a rule past `FORMAT_RULES_MAX` or `FORMAT_RULE_RANGES_MAX`)
  stays the file's own: kept as it came, without the rules read beside it, and written back before LiveDoc's own, so
  it draws first in the other apps (default, D215).
- What a differential format says beyond a rule's style (a border, a number format, a font) is left out, and the read
  names the sheet (`styles_unread`, D104).
- Excel and LibreOffice draw a comparison on a text or an empty cell (Excel's `"abc">5` is TRUE, an empty cell is
  0); LiveDoc draws numbers alone, as Google Sheets does: the same file can draw differently there (default, D215).

## Validation in the file

- A sheet's [validation rules](data-validation.md) are written and read both ways, each as the **standard rule**
  closest to it, which every app checks, and **LiveDoc's rule** beside it, exact, which LiveDoc reads back
  (default, D293). The evidence is Google Sheets' own export
  (`plans/assets/0020/research/google-validation-export.md`): it writes no checkbox and no Text Is Exactly.
- **XLSX**: one `dataValidation` a rule in the worksheet's one `dataValidations` (after the kept ones, `count`
  their sum), `allowBlank="1"`; LiveDoc's rules in one `ext` of the worksheet's `extLst`, its `uri` LiveDoc's
  namespace `urn:livedoc:xmlns:spreadsheet:1.0`, one `livedoc:dataValidation` a rule naming its standard rule by
  `sqref`.
- **ODF**: one `table:content-validation` a rule in the spreadsheet's one `table:content-validations` (after the
  kept ones), named `LiveDocValidation1`, ... (a name a kept one holds skipped), each of its cells naming it
  (`table:content-validation-name`), `table:allow-empty-cell="true"`, `table:base-cell-address` its top-left cell;
  LiveDoc's rule in its `livedoc:rule` and `livedoc:fingerprint` attributes, the same namespace.
- **LiveDoc's rule** (`livedoc:rule`) is the rule's settings as JSON, its range left to the standard rule's: `is`,
  `opts` (each `v` and `c`), `src` (`'My Lists'!A1:A3`, or `A1:A3` on its own sheet), `show`, `multi`, `op`,
  `a`, `b`, `on`, `off`, `fx` (Google's syntax, for the range's top-left cell), `warn`, `help`.
- Its `livedoc:fingerprint` is the CRC-32 (8 lower-case hex digits) of the standard rule as written: XLSX's `type`,
  `operator`, `formula1`, `formula2`, `showErrorMessage`, `errorStyle` and `prompt`; ODF's `table:condition`,
  its error message's type and its help message's text; each a line. **Read**, LiveDoc's rule is taken when its
  fingerprint is the standard rule's as read; else another app changed the standard rule since, so the standard
  rule is read, LiveDoc's dropped, and the read names it (`validation_rule_changed`, logged, never reported)
  (default, D294).

| Model                            | XLSX `dataValidation` (standard rule)                                                              | ODF `table:condition` (standard rule)                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Dropdown                         | `list`, `formula1` `"To Do,Doing,Done"`                                                            | `of:cell-content-is-in-list("To Do";"Doing";"Done")`, `table:display-list="unsorted"`       |
| Dropdown from a Range            | `list`, `formula1` `'My Lists'!$A$1:$A$3`                                                          | `of:cell-content-is-in-list([$'My Lists'.$A$1:.$A$3])`, `unsorted`                          |
| Checkbox                         | `list` `"TRUE,FALSE"`; with custom cell values, `"Yes,No"` (or `"Yes"`)                            | `cell-content-is-in-list("TRUE";"FALSE")`, the custom values the same                       |
| Number                           | `decimal`, `operator` `between`, ..., `notEqual`, the numbers                                      | `of:cell-content-is-decimal-number() and cell-content-is-between(1,10)`, `cell-content()>5` |
| Date (before, ..., between)      | `date`, `operator` `lessThan`, `lessThanOrEqual`, `greaterThan`, ..., `equal`, day numbers         | `of:cell-content-is-date() and cell-content()<46296`, ...                                   |
| Date Is a Valid Date             | `custom`, Google's `OR(NOT(ISERROR(DATEVALUE(A1))),AND(ISNUMBER(A1),LEFT(CELL("format",A1))="D"))` | `of:is-true-formula(...)`, the same formula                                                 |
| Text Contains, Does Not          | `custom`, `NOT(ISERROR(SEARCH("x",A1)))`, `ISERROR(SEARCH("x",A1))`                                | `is-true-formula(...)`                                                                      |
| Text Is Exactly                  | `custom`, `A1="x"` (case aside, as LiveDoc checks it)                                              | `is-true-formula([.A1]="x")`                                                                |
| Text Is a Valid Email, URL       | `custom`, `IFERROR(ISEMAIL(A1),TRUE)`, `ISURL`, kept by S5's convention                            | `is-true-formula(IFERROR(ISEMAIL([.A1]);TRUE()))`                                           |
| Custom Formula Is                | `custom`, the formula (S5's convention when Excel lacks a function)                                | `of:is-true-formula(...)`                                                                   |
| Reject the Value, Show a Warning | `showErrorMessage="1"`; a warning adds `errorStyle="warning"`                                      | `table:error-message` `table:message-type="stop"` or `"warning"`, `table:display="true"`    |
| Help Text                        | `showInputMessage="1" prompt="..."`                                                                | `table:help-message table:display="true"` › `text:p`                                        |

- A dropdown's options the standard list cannot say (an option holding a comma in XLSX, or a list past XLSX's 255
  characters) are written as a rule that allows any value (no `type`), LiveDoc's rule beside it (default, D295).
- **What another app loses**: an option's colour, the Chip and Arrow display, Allow Multiple Selections (a plain
  list: a cell of several options is invalid there) and a checkbox (a TRUE, FALSE list). Converting lists them
  ([Converting](files-and-print.md#converting), `validation_simplified`), counted by rule.
- **Read without LiveDoc's rule** (another app's file, or a changed one): a `list` of literal values is a Dropdown
  (a `TRUE,FALSE` one too); a `list` of one range a Dropdown from a Range; `decimal` and `date` with number
  operands a Number and a Date rule; `custom` a Custom Formula Is, Google's malformed ODF custom formula
  (`of: and cell-content-is-between(FORMULA,0)`) read as FORMULA; a rule is Reject the Value only when it shows a
  `stop` error; its input message is its Help Text, its own error message and titles left out. A custom formula is
  moved from its base cell (ODF) to each rectangle's top-left. A rule over several rectangles (an `sqref` of
  several, an ODF rule's cells) becomes one rule a rectangle (default, D296).
- What the model does not hold (`whole`, `textLength`, `time`, a list of a formula or a name, a rule over cells
  another rule already holds, a formula LiveDoc cannot read, past `VALIDATION_RULES_MAX` or `FORMAT_RULE_RANGES_MAX`
  rectangles) stays the file's own: kept as it came, without the rules read beside it; a read rule the grid cannot
  hold is named at its top-left cell (`validation_rule_unread`).

## Named ranges in the file

- Each [named range](sheet.md#named-ranges) is a name of the workbook, as Google Sheets writes it, its cells with
  their sheet and absolute:
  - **XLSX**: a `definedName` without `localSheetId` (`<definedName name="Total">'My data'!$A$1:$B$4</definedName>`),
    in the workbook's one `definedNames`, after the kept ones and before the named functions.
  - **ODF**: a `table:named-range` (`table:name`, `table:base-cell-address` its top-left cell,
    `table:cell-range-address` `$'My data'.$A$1:.$B$4`) in the spreadsheet's one `table:named-expressions`,
    after the kept ones.
- **Read**: a name of the workbook (XLSX without `localSheetId`, ODF in the spreadsheet's `table:named-expressions`)
  whose range is one cell or one rectangle on one of the file's sheets is a named range on that sheet, its name as
  written; it is then the model's, no longer kept.
- **Kept and named** (`name_unread`, "2 named ranges LiveDoc cannot read are kept for the file: Rate and Mine"),
  as the file wrote them and written back to its format (default, D343):
  - a name of one sheet: XLSX's `localSheetId`, an ODF table's own `table:named-expressions`, as LiveDoc's names
    belong to the workbook;
  - a name of a constant or a formula (`0.2`, ODF's `table:named-expression`), of several areas, of whole columns
    or rows, of another workbook's cells, or `#REF!`;
  - a name the [rules](sheet.md#named-ranges) refuse (its shape, one reading as a cell, one a name before it took,
    case aside, past 100 a sheet), and one whose cells the workbook's limits cut.
- **Kept, not named**: Excel's built-in names (`_xlnm.Print_Area`, `_xlnm.Print_Titles`, `_xlnm._FilterDatabase`,
  any `_xlnm.` name) and hidden names (`hidden="1"`, which Excel and Google keep for themselves). They are the
  print settings and filters they belong to, kept with them, and no name a person gave (default, D343).
- **One name once.** A file holds a name once in a scope, so at a write (default, D344):
  - a named range and a kept name of the workbook of one name, case aside (a name the file held that LiveDoc could
    not read, then one an Editor made): the named range is written, the kept one dropped and counted
    (`kept_dropped`), as a named function takes a kept name's place (D341);
  - a named range and a named function of one name: the named range is written, the function left out and named
    (`function_unwritten`);
  - one name on two sheets (D297): the first in tab order is written, the other left out and named
    (`name_unwritten`); so is a name Excel refuses (`R`, `C`) in XLSX;
  - a kept name of one sheet keeps its own scope beside a named range of its name, in both formats.

- **XLSX**: each [named function](formulas.md#named-functions) is a workbook's defined name, as Excel keeps a named
  `LAMBDA`: `<definedName name="CONTAINS" comment="…">_xlfn.LAMBDA(_xlpm.search_query,_xlpm.search_range,…)</definedName>`,
  in the workbook's one `definedNames` after the kept ones. Its definition is in Excel's grammar
  ([Excel's grammar in detail](#excels-grammar-in-detail)), each reference with its sheet and absolute
  (`Sheet1!$A$1`), its placeholders `_xlpm.` first; its description is the `comment`.
- What the file cannot hold of one is left out and the write names it (logged, `function_cut`): a description
  past Excel's 255 characters is cut to them, and argument descriptions and examples have no place (default, D340).
- A definition Excel's grammar cannot hold (a Google-only function, an array literal of more than constants) is
  written by S5's convention inside its `LAMBDA`
  (`_xlfn.LAMBDA(_xlpm.x,IFERROR(__xludf.DUMMYFUNCTION("TWICE(x)"),""))`): LiveDoc reads it back whole, and Excel
  gives an empty value. A name Excel refuses (`R`, `C`) is left out and the write names it
  (`function_unwritten`) (default, D340).
- A kept workbook defined name of a named function's name gives way to it: dropped at the write and counted
  (`kept_dropped`), as a workbook holds a name once (default, D341).
- **Read**: a workbook's defined name (no `localSheetId`) whose formula is a `LAMBDA` of placeholders and a
  definition is a named function: its name in capitals, its placeholders as written, its description the
  `comment`, its definition read as a cell's formula is, against the file's sheets; a reference naming no sheet
  names the first. It is then the model's, no longer kept.
- One LiveDoc cannot hold (a name or a placeholder the [rules](data-tools.md#named-ranges-and-named-functions)
  refuse, more than 20 placeholders, a definition past 2,000 characters, one past the 100th) stays the file's own:
  kept as it came, and the read names it (`function_unread`): "1 named function LiveDoc cannot read is kept for
  Excel: TOOLONG". A sheet's `LAMBDA` name (`localSheetId`) stays kept with its sheet, named the same way (default, D342).
- **ODF**: OpenFormula has no `LAMBDA`, and LibreOffice no named functions, so an ODF file holds none: an `.ods` or
  `.fods` write leaves each out and names it (logged, `function_unwritten`), and converting to OpenDocument lists
  them first ([Converting](files-and-print.md#converting)). A file's `table:named-expression` stays kept.

## Protection in the file

- A sheet's [protections](data-tools.md#protected-ranges) are written and read both ways, as validation rules are
  (D293): the **standard form** each format's apps enforce (a protected sheet, and the cells it leaves free), and
  **LiveDoc's record** beside it, exact, which LiveDoc reads back (default, D349). Google Sheets writes no protection
  to either format (`plans/assets/0020/research/google-protection-export.md`), so the standard form follows Excel and
  LibreOffice.
- **XLSX standard form**: a sheet's protection admitting Editors or the owner alone is the worksheet's
  `sheetProtection sheet="1" objects="1" scenarios="1"`; each of its exceptions a `protectedRange` without a password
  (`sqref` its cells, `name` `LiveDocException1`, ...), cells anyone may edit while the sheet is protected, in the
  worksheet's one `protectedRanges` after the kept ones.
- **ODF standard form**: the same protection is its `table:table`'s `table:protected="true"`; ODF frees cells by their
  cell styles, as LibreOffice writes an unlocked cell, so each cell of its exceptions names a style with
  `style:cell-protect="none"` (the Director's ruling, 2026-11-27, D350):
  - one open variant of each style the exception cells use (`ce3-open`, and `ce-open` for a cell of no style of its
    own), the same properties and `style:cell-protect="none"`; the style other cells share is never touched;
  - empty cells of an exception are written as repeated cells naming the open style, its rows a run of repeated rows,
    so an exception over a whole column holds one cell element a run of rows, never one a cell.
  - Evidence (`written-files.validate.ts`): LibreOffice opens the written `.fods` and `.xlsx` and saves them again with
    the sheet protected, the exception's cells open and every other cell locked. LibreOffice copies no XML through a
    save; it writes the protection and the cell styles again from its own model, so the re-saved file shows its model
    holds those cells unlocked, which is what its editing check reads.
- **No standard form**: neither suite guards a range alone, nor warns, nor tells Editors from the owner. A range's
  protection and a protection that shows a warning are in LiveDoc's record only; Editors Only and Only the Owner are
  one protected sheet there.
- **LiveDoc's record**: a sheet's protections in its order as JSON, each its `range` or its `except` as A1 text
  (`A1:B4`), `can`, and `d` its description; in XLSX one `livedoc:protections` (`record`, `fingerprint`) in the
  worksheet's LiveDoc `ext` (the validation rules' one), in ODF the `table:table`'s `livedoc:protections` and
  `livedoc:protections-fingerprint` attributes, LiveDoc's namespace.
- Its fingerprint is the CRC-32 (8 lower-case hex digits) of the standard form as written: whether the sheet is
  protected, then each free range's cells, each a line: XLSX's password-less `protectedRange` `sqref`s as written; ODF's
  open cells as the reader makes them into rectangles (each row's runs, a run carried over consecutive rows).
  **Read**, the record is taken when its fingerprint is the standard form's as read; else another app changed the
  protection since, so the standard form is read, the record dropped, and the read names it (`protection_changed`,
  logged, never reported), as D294.
- **Read without LiveDoc's record** (another app's file, or a changed one), each protected sheet is a sheet's
  protection, **Only the Owner** (the Director's ruling, 2026-11-27):
  - **XLSX**: a `sheetProtection` whose `sheet` is `1` or `true`. Free of it: each `protectedRange` without a
    password or a security descriptor, and the cells whose style is not locked (`protection locked="0"`, in the
    cell's, its row's or its column's style). A `sheetProtection` that protects nothing is left out, logged.
  - **ODF**: a `table:table` with `table:protected="true"`. Free of it: the cells whose style's `style:cell-protect`
    is `none` or `formula-hidden` (the cell's, its row's or its column's default cell style).
  - Free cells are made into rectangles, each row's runs, then a run over consecutive rows once; past 50 (D345) the
    rest stay under the sheet's protection, never freed, and the read names the sheet (`protection_cut`): "1
    protected sheet frees more than 50 ranges; the rest stay protected: Data".
  - An unlocked cell style on a sheet that is not protected says nothing LiveDoc holds (`styles_unread`, D104).
- **Kept, not read**: a `protectedRange` with a password or a security descriptor (Excel frees its cells to those who
  know it, so they stay under the sheet's protection in LiveDoc), any `protectedRange` of a sheet that is not
  protected, the workbook's `workbookProtection` and ODF's `table:structure-protected` (its structure), and
  LibreOffice's options (`loext:table-protection`): the file's own, written back to its format
  ([Unknown content](#unknown-content)) (default, D352).
- **The file's password**: what a protected sheet held that LiveDoc has no form for, its password hash (XLSX's
  `password`, or `algorithmName`, `hashValue`, `saltValue` and `spinCount`; ODF's `table:protection-key`,
  `table:protection-key-digest-algorithm` and `loext:protection-key-digest-algorithm-2`) and Excel's allowances
  (`formatCells`, `sort`, ...), is kept on the sheet's protection as the file wrote it (default, D351):
  - LiveDoc never asks for a password nor checks one; the owner removes the protection as any other (D347), and
    `CELL("protect")` reads it as any other.
  - It is written back only to a file of its own format, on that sheet's protection, while the protection admits
    Editors or the owner alone; LiveDoc never writes a hash it did not read, nor one into the other format.
  - Editing the protection keeps it; removing it, making it a range's, or moving it to another sheet leaves it behind.
- **What another app loses**, listed by converting and downloading to the other format
  ([Converting](files-and-print.md#converting), `protections_simplified`, counted by protection): a range's
  protection and a warning; and a file password the other format
  cannot carry (`protection_passwords_left`): "1 protected sheet leaves its file password behind".

## Tables in the file

- A sheet's [tables](data-tools.md#tables) are written and read both ways, as validation rules are (D293): the
  **standard form** each format's apps read, and **LiveDoc's record** beside it, exact, which LiveDoc reads back.
- **XLSX standard form**: a table part (`xl/tables/tableN.xml`, `table` with `id`, `name` and `displayName` the
  formula name, `ref` its range, `headerRowCount="1"`, `totalsRowCount="1"` with a total row, an `autoFilter` over
  its header and data rows while its filter is on, [Filters in the file](#filters-in-the-file)), one `tableColumn` a column (`id`, `name` its column name), linked from the worksheet's `tableParts`
  by its relationship; its style `TableStyleLight1` with `showRowStripes="1"`, as the table's banding is written as
  format rules already ([Alternating colours](formatting.md#alternating-colours)). Each header cell is written as its
  column's name, text, as Excel holds a header (D452). Its `id` is past every kept table's; a kept table of an own
  table's name gives way to it (D453).
- **XLSX formulas** write table references in Excel's grammar: `Table1[Amount]`, `Table1[#All]`, `Table1[#Headers]`,
  `Table1[#Totals]`, `Table1[#Data]`, this row as `Table1[[#This Row],[Amount]]` (Excel's file form of `[@Amount]`)
  and the table alone as `Table1[]` (as Google writes it); read, `[@Amount]` and the bare `[Amount]` of a formula
  inside its table are read too.
- **ODF standard form**: a `table:database-range` in the spreadsheet's one `table:database-ranges` (`table:name` the
  formula name, `table:target-range-address` its range with its sheet, `table:contains-header="true"`,
  `table:display-filter-buttons="true"` while its filter is on), as LibreOffice writes a database range.
- **OpenFormula** has no table reference a cell's formula keeps (LibreOffice reads `Table1[Amount]` only as it types
  it), so in an ODF file each is written as the plain absolute range it reads (`[.$B$2:.$B$9]`), which every app
  computes; LiveDoc's record restores the table references on read.
- **LiveDoc's record**: in XLSX one `livedoc:tables` (`record`, `fingerprint`) in the worksheet's LiveDoc `ext`; in ODF
  the `table:table`'s `livedoc:tables` and `livedoc:tables-fingerprint` attributes; LiveDoc's namespace. It is one
  JSON object: `tables`, the sheet's tables in order, each its `name`, `range` as A1 text, `types` (column name to
  type), `opts` (a Dropdown column's name to its options, as a dropdown rule's), `total` and `filter` (while on: each
  filtered column's letter to its condition, as the filters record holds one); in ODF also `refs`, each
  formula cell (A1) whose formula reads a table, with that formula in Google's syntax.
- Its fingerprint is the CRC-32 (8 lower-case hex digits) of the standard form as written: each table's name and
  range a line, then each column its filter keeps a standard column for, a line as the filters record's (and in ODF
  each `refs` cell's place and its formula as read back from what is written, a line). Whether a table's filter is
  on is the standard form's alone: the record gives the conditions of a filter the standard form shows on.
  **Read**, the record is taken when its fingerprint is the standard form's as read; else another app changed the
  tables or those formulas since, so the standard form is read, the record dropped (every ODF formula then keeps its
  plain range), and the read names it (`tables_changed`, logged, never reported), as D294.
- **Read without LiveDoc's record**: each XLSX table part and each ODF database range with a header row is a table,
  its columns None (D447); one LiveDoc cannot hold (overlapping another, past 50 a sheet, a name the rules refuse,
  no header row, a range over no sheet the file holds) is kept as the file wrote it, written back to its format, and
  named (`table_unread`, reported); a table the grid cannot hold once its sheet is cut stays plain cells, named too.
  ODF's sheet-local `table:database-range` named `__Anonymous_Sheet_DB__N` is an autofilter, not a table: the sheet's
  filter ([Filters in the file](#filters-in-the-file)).

## Filters in the file

- The sheet's filter, its filter views and its slicers are written and read through one mapping of a column's
  condition (`FilterCondition`, [Data tools](data-tools.md#filters-filter-views-and-slicers)) to each format's
  filter form, with **LiveDoc's record** beside it for what that form cannot say, as tables are (D293, D294).
- **The one mapping** turns a column's condition into a **standard column**: its kept values (the blank apart), or
  one or two tests (Is Equal To, Is Not Equal To, the four comparisons, Contains, Does Not Contain, Begins With, Ends
  With, Is Empty, Is Not Empty), joined by and or by or, or a day (today, tomorrow, yesterday). Each format writes
  and reads the standard column; read back, it is the condition it says (D477):
  - a condition before kept values: a column with both is written as its condition, the record keeping both;
  - Text Is Exactly is Is Equal To, which compares text as text; a comparison of text has no form;
  - Is Between is `≥ a` and `≤ b`, Is Not Between `< a` or `> b` (the smaller first);
  - a date is its day number: Date Is a day as `≥ d` and `< d + 1` (read back as Date Is), Date Is Before as
    `< d`, Date Is After as `≥ d + 1`; a period today, tomorrow or yesterday as its day, the past week, month or year
    as `≥` its first day and `< ` the day after its last, counted from the day it is written;
  - Filter by Colour and Custom Formula Is have no standard column.
- **XLSX filter**: the worksheet's `autoFilter` (`ref` the filter's range), one `filterColumn` a filtered column
  (`colId` its place in the range): kept values as `filters` › `filter val` (the blank as `filters blank="1"`); a
  condition as `customFilters` (`and="1"` for Is Between, two `customFilter`s; Is Not Between two joined by or; the
  text conditions as Excel's wildcards, `*x*`, `x*`, `*x`, Does Not Contain `notEqual` `*x*`); a date period as
  `dynamicFilter` (`today`, `tomorrow`, `yesterday`; the past week, month and year as the two days they span);
  every row any filter hides (the sheet's or a table's) written `hidden="1"`, as Excel draws a file's filters from
  its rows; and Excel's hidden `_xlnm._FilterDatabase` name for the sheet, its range. A text in a wildcard form
  escapes Excel's `*`, `?` and `~` with `~`. Read back, a hidden row under the header of a filter with a condition
  (the sheet's or a table's) is the filter's, not a hidden line, as Excel holds them (D478); LiveDoc's record lists
  the rows under the sheet's filter hidden by hand (`hidden`). Each table's filter (data-tools.md, D481) is its
  table part's own `autoFilter` (its `filterColumn`s, `colId` the column's place in the table, the part's `ref` its
  header and data rows), as Excel holds a table's, written only while the filter is on; read back, a table part
  with an `autoFilter` has its filter on, its columns read as the sheet's are, and one without has it off. Excel
  refuses a sheet's `autoFilter` over a table's cells, so a sheet's filter still overlapping a table (D480) is
  written in LiveDoc's record alone, its rows still hidden.
- **XLSX filter views**, as Google writes them (`plans/assets/0020/research/google-filter-view-export.md`): each a
  `customSheetView` (`guid` made of the sheet's place and the view's id, D479, `filter="1"`, `showAutoFilter="1"`)
  holding an `autoFilter` as the
  filter's and the view's sort as its `sortState` (`sortCondition`, `descending="1"` for Z to A); a hidden
  `Z_<guid>_.wvu.FilterData` name with its range; and a `customWorkbookView` named the view's name.
- **ODF filter**: LibreOffice's own form, the sheet-local `table:database-range` named `__Anonymous_Sheet_DB__N`
  (`table:display-filter-buttons="true"`) with `table:filter` › `table:filter-and` › `table:filter-condition`
  (`table:field-number`, `table:operator`, `table:value`; kept values as `table:filter-set-item`s),
  as Google writes the same; read back as the sheet's filter, never a table, and never named in the import report
  (Director, 2026-11-27). Kept values are `=` with a set item each (the blank `""`), the tests LibreOffice's
  `=`, `!=`, `>`, `>=`, `<`, `<=` (no `table:data-type`, as LibreOffice writes them), `contains`, `!contains`,
  `begins`, `ends`, `empty`, `!empty`, a day as `>=` its day number and `<` the next; LibreOffice reads one
  list joined by and, so Is Not Between has no ODF form but LiveDoc's record (measured with LibreOffice 2026-11-27,
  `plans/assets/0020/research/libreoffice-filter-proof.md`). The rows the filter hides are
  `table:visibility="filter"`, LibreOffice's own, read back as the filter's, never hidden lines.
  Each table's filter (D481) is the `table:filter` of the table's own `table:database-range`, as LibreOffice holds
  a database range's filter, the range's filter buttons shown while it is on; read back, a table's database range
  showing its buttons has its filter on, with the `table:filter`'s columns.
- **ODF** has no filter views nor slicers: written to ODS they are left out, listed in the Download and Convert
  dialog ("2 filter views are left out", "1 slicer is left out"); Google's ODS keeps only each view's range as a
  `Z_…_.wvu.FilterData` name, which LiveDoc neither writes nor reads as a view.
- **XLSX slicers**: LiveDoc's record, and Excel's table slicer (`slicers`, `slicerCaches`, a drawing anchor) when
  the slicer's range is a table's exactly. No table is made for one (Google makes a `Table_1`; a table the person
  never made would change their workbook, Director 2026-11-27); a slicer over another range is listed in the Download
  and Convert dialog: "1 slicer is not seen by Excel".
- **LiveDoc's record**: one JSON object, `filter` (range as A1 text, conditions by column letter, a Custom Formula Is
  as its formula's text for the first row under the header, and `hidden`), `views` (each its name, range,
  conditions and sort) and `slicers`; in XLSX `livedoc:filters` (`record`, `fingerprint`) in the
  worksheet's LiveDoc `ext`, in ODF the `table:table`'s `livedoc:filters` and `livedoc:filters-fingerprint`. Its
  fingerprint is the CRC-32 of the standard form as written (the filter's range and each column's form a line, each
  view's the same); read, the record is taken when the fingerprint is the standard form's as read, else the standard
  form is read and the record dropped (`filters_changed`, logged, never reported), as D294. A record that does not
  parse, or a condition in it a write would refuse, is dropped the same way.
- **Read without LiveDoc's record**: an `autoFilter` or anonymous database range is the sheet's filter, each column's
  form read back into its condition; a form LiveDoc has no condition for (`top10`, `colorFilter`, `iconFilter`, an
  `and` of other operators) leaves that column unfiltered and is named (`filter_unread`, reported). Each
  `customSheetView` holding an `autoFilter` is a filter view, named by its `customWorkbookView` (`Filter N` without
  one); one without an `autoFilter` is Excel's custom view, kept as unknown content. Views past 50 a sheet holds
  are left out, each named (`filter_unread`). The `_xlnm._FilterDatabase` and `Z_…_.wvu.FilterData` names and the
  `customWorkbookView`s of the views read are LiveDoc's to write again, never kept.

## Rows and columns in the file

- A line's own size, whether it is hidden by hand, its group depth, the collapsed groups, the side their controls sit
  on and the sheet's own line sizes are written and read both ways
  ([Groups and the outline](grid-and-editing.md#groups-and-the-outline)).
- **XLSX**: a row's `ht` in points with `customHeight="1"` when sized by hand; `hidden="1"` on a line hidden by hand
  or inside a collapsed group; `outlineLevel` its depth; `collapsed="1"` on the line holding a collapsed group's
  control. Columns alike in `cols/col`, runs of columns with the same `width`, `customWidth`, `hidden`,
  `outlineLevel` and `collapsed`. `sheetFormatPr` holds the sheet's own `defaultRowHeight` and `defaultColWidth`,
  and `outlineLevelRow` and `outlineLevelCol` the deepest group; `sheetPr/outlinePr`'s `summaryBelow` and
  `summaryRight` the controls' side, 1 after and 0 before, written for a sheet with groups (absent, Excel's after).
- **ODF**: `table:table-row-group` and `table:table-column-group` nest a line in its groups, `table:display="false"`
  on a collapsed one; `table:visibility="collapse"` on a hidden line; a row's style its `style:row-height` with
  `style:use-optimal-row-height="false"` when sized by hand, a column's its `style:column-width`. ODF says nothing of
  the controls' side: a read sheet with groups puts them after, as LibreOffice draws them, and a written sheet's
  before is not said (default, D167).
- **Units**: a pixel is a 96th of an inch and a point 4/3 of a pixel; an XLSX column's width is Excel's, characters of
  a 7 px digit with 5 px of padding; an ODF length in any of its units, written in inches (default, D166).
- **The sheet's own sizes**: XLSX's `sheetFormatPr` defaults, and in ODF the size most of the lines carry within the
  grid the sheet makes (Google sizes every row, and the run past it otherwise), are the sheet's own row height and
  column width; a line at that size takes it, as does an XLSX row not
  `customHeight` and an ODF row at its text's height, and any other size is the line's own, kept within the sizes the
  Resize dialog allows (D158) (default, D124). LiveDoc writes a row without a size of its own at its text's height. A sheet
  whose sized lines pass the most it holds keeps the first and names the rest (`sizes_cut`).
- **Collapsed**: an XLSX group is collapsed when every line of it is hidden and its control's line says so (or it has
  none); an ODF group when it says `table:display="false"`. Its lines are hidden by the group alone: a line hidden by
  hand inside a collapsed group shows again with it, as the file cannot tell the two apart (default, D168).
- Frozen lines are not in either mapping yet: XLSX's `sheetViews`, with its pane, is kept as the file's own and
  written back as it came, and ODF's `settings.xml` is LiveDoc's; a freeze made in LiveDoc is not in its files.

## A sheet's tab in the file

- Whether a sheet is hidden and its tab's colour are written and read both ways
  ([Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar), D177).
- **XLSX**: `state="hidden"` on the workbook's `sheet`; `sheetPr/tabColor` with an opaque `rgb`, first in its
  `sheetPr`. Excel's `veryHidden` reads as hidden; a tab colour by `theme` or `indexed` is not read and is named
  (`kept_unread`). A first sheet hidden makes the first shown the open one (`workbookView@activeTab`), and a kept
  view opening a hidden sheet opens the first shown (default, D182).
- **ODF**: the table's automatic style (`ta1`, ... one per look), its `style:table-properties` saying
  `table:display="false"` for a hidden sheet and `table:tab-color` (ODF 1.3 and later) for the colour; LibreOffice's
  older `tableooo:tab-color` is read too.
- A file hiding every sheet opens with its first shown, as a spreadsheet always shows one (default, D182).

## Charts in the file

**Status: built, written and read in both formats.** A sheet's [charts](charts.md#the-model) are written into both formats as
each suite writes its own, so LibreOffice, Excel and Google Sheets open them as charts reading the same cells.

- **Data**: each chart's range is read as the grid reads it ([Charts](charts.md#the-model)): its first row names the
  series when it holds no number, its first column labels them when it holds text or dates, and on a scatter chart
  and a bubble chart the first column of numbers is the x (a bubble's last series its sizes). Each series is written as references to its cells in the file's own syntax
  (`'Models'!$B$2:$B$40`, `Models.B2:Models.B40`), so the chart reads them live in every suite; an empty cell is a gap
  (XLSX `dispBlanksAs="gap"`). A chart with no data is written with no series.
- **Look**: its type (Column and Bar as clustered bars, Line, Area, Scatter as markers, Pie, Doughnut with a half
  hole, Radar as lines with markers: XLSX `c:radarChart` of `radarStyle` `marker`, ODF `chart:radar`) (default, D292),
  Bubble with its sizes (XLSX `c:bubbleChart` on two value axes, each series its `c:xVal`, `c:yVal` and the size
  column as `c:bubbleSize`, `c:bubbleScale` 100 and no negative bubbles; ODF `chart:bubble`, each series' values the
  size column and its two `chart:domain` children the y column and then the x column, as ODF 1.3 Part 3 §11.13 orders
  them) (default, D321), Candlestick and OHLC as stock charts (XLSX `c:stockChart` of its open, high, low and close
  series in that order, or high, low and close, with high-low lines, a Candlestick's up-down bars, an OHLC's open and
  close series marked by dashes, and no line joining a series; ODF `chart:stock`, its series in ODF's order of opening,
  minimum, maximum and closing values, or minimum, maximum and closing, as ODF 1.3 Part 3 §19.15 orders them, a
  Candlestick saying `chart:japanese-candle-stick="true"`) (default, D323), its stacking on a Column, Bar or Area chart (XLSX `grouping` `stacked` or `percentStacked`, bars with
  `overlap` 100; ODF `chart:stacked` or `chart:percentage` on the plot area) (default, D283), a Line chart's smoothing (XLSX `c:smooth` on
  each series; ODF `chart:interpolation="cubic-spline"` on the plot area) (default, D285), a Combo chart's series
  types (XLSX: one plot area holding a clustered `c:barChart` of its column series, a `c:lineChart` of its line
  series and a `c:areaChart` of its area series, each only when it holds one, sharing one pair of axes, the series'
  `c:idx` and `c:order` running in series order; ODF: `chart:class="chart:bar"` on the chart, each series its own
  `chart:class`, `chart:bar`, `chart:line` or `chart:area`) (default, D287), its title and axis titles, its legend's place or none, values on the marks, the value axis (deleted when
  off), each series' own colour, a scatter series drawn as a line, the right-hand axis (below), and its alt text. Its palette is LiveDoc's: a series
  with no colour of its own takes the reading suite's (default, D260).
- **The right-hand axis**: a series on the right axis of a Line, unstacked Area, unstacked Stepped Area or Combo chart, when another series is
  on the left (as LiveDoc draws it), is written on a secondary axis. XLSX: the right series in chart groups of their
  own, after the left ones, naming a second pair of axes, a deleted category axis and a value axis at the right
  (`axPos="r"`, crossing at the maximum, no gridlines; deleted with the value axis off). ODF: the series say
  `chart:attached-axis="secondary-y"` and the plot area holds a `secondary-y` axis styled as the primary one
  (default, D288). Any other chart writes every series on the one axis.
- **Place**: its top-left cell and offset and its size. XLSX: one drawing part per sheet with charts
  (`xl/drawings/drawingN.xml`, a `oneCellAnchor` per chart, px × 9,525 EMU) and a chart part per chart
  (`xl/charts/chartN.xml`). ODF: a `draw:frame` per chart in the cell it is anchored to (LibreOffice's "To cell"), its
  `svg:x` and `svg:y` its offset into that cell, so a suite that sizes rows to their text keeps it on its cell
  (default, D280), holding a `draw:object` that names an embedded chart document (`Object N/` in a
  package; inline in a flat `.fods`). A shown value axis says so (`chart:display-label="true"`), as LibreOffice
  reads an axis that does not as one without labels (default, D279).
- **A sheet keeping its file's drawings**: a sheet whose kept content holds a drawing (XLSX `drawing`) or shapes
  (ODF `table:shapes`) from the file it arrived in keeps them, and its own charts are not written beside them; the
  write names the sheet (`charts_unwritten`) (default, D261).
- **Reading**: a chart a file holds is read into the model when its type is one built and
  its series read one block of its own sheet: the rows they share, a header row above them naming the series, a
  label column (or a scatter's x) and the series' columns, in order. Its look is read as it is written above, a
  series' colour and a scatter series' line by its column. XLSX reads a bar or area chart's `grouping` as its stacking, `stacked` or `percentStacked`, and a
  line chart's only when `standard`; a line chart is smooth when every series says `c:smooth` on, straight when none
  does, and not read when they differ (D285). A plot area of two or three chart groups, each a different one of a
  clustered column `c:barChart`, a standard `c:lineChart` and a standard `c:areaChart`, sharing one pair of axes, is
  read as a Combo chart, its series in `c:order` order, each typed by its group (D287). Groups on a second pair of axes,
  its value axis at the right, put their series on the right axis: groups of one kind, line or area, on the two pairs
  read as that type, groups of those kinds as a Combo chart, no kind twice on one pair (D288); any other plot area of
  several groups is not read. It reads a sheet's charts only when its drawing holds
  nothing else, every anchor a chart that qualifies and no chart naming a part of its own (`r:id`); otherwise the
  drawing stays kept whole and none of its charts is read (default, D275). ODF reads a sheet's charts only when every
  drawing on it, in its `table:shapes` and in its cells, is a `draw:frame` holding one chart object (and its
  replacement picture, title and description) that qualifies; otherwise every drawing stays kept and none of its
  charts is read (default, D277). A frame in `table:shapes` is placed by its position over the sheet's line sizes; one
  in a cell (LibreOffice's "To cell") on that cell, its `svg:x` and `svg:y` the offset into it. Lengths are read in
  any of ODF's units. A Bubble chart is read from XLSX's `c:bubbleChart` (not 3-D) whose series share one x column
  and one size column, the size column after every y column in the block, and from ODF's `chart:bubble` whose
  series' values are one size column and whose two domains are each series' y column and the shared x column
  (D321). A stock chart is read from XLSX's `c:stockChart` of three or four series (four with up-down bars a
  Candlestick, else OHLC) and from ODF's `chart:stock` (a Japanese candlestick of four series a Candlestick, else
  OHLC; with volume not read), its series put back in the open, high, low, close order (D323). A series reads its cells by `chart:values-cell-range-address`, its name by
  `chart:label-cell-address`, a scatter's x by the first series' `chart:domain` (a later series has none or the
  same), the labels by the x axis's `chart:categories`. The look is read from the chart document's automatic styles:
  a bar chart by `chart:vertical`; stacking by `chart:stacked` and `chart:percentage` on a bar or area chart; a line chart's
  `chart:interpolation` `cubic-spline` as smooth; a stacked or percentage line chart, 3-D, another interpolation,
  a smoothed chart of another type, or a series on a secondary axis
  (`chart:attached-axis="secondary-y"`) of any chart but a Line, unstacked Area or Combo chart, are not read, the
  series of one read on its right axis (D288); a bar, line or area chart whose series name their own classes among
  `chart:bar` (upright), `chart:line` and `chart:area`, two or more of them, unstacked, is read as a Combo chart, each
  series typed by its class (a series naming none takes the chart's) (D287), and a series of any other class is not
  read; values on the marks by `chart:data-label-number="value"` on every series (or
  the plot area); the value axis off when it is missing, `chart:visible="false"` or `chart:display-label="false"`;
  a series' colour by its fill (stroke on a line chart), a scatter series a line unless `draw:stroke="none"`, its
  colour then the stroke's; the alt text by the frame's `svg:desc`, else its `svg:title`, when it is not the title.
- **Kept while unchanged**: a chart read from a file keeps its file XML beside it (a kept part, named on the chart),
  with a sum of what it was read as: its type, stacking, smoothing, a Combo chart's series types, the series on the right axis, titles, legend, values, axis, alt, place and size, and its cells by
  position. A write whose chart sums the same writes the kept XML in its place, under a new part name; a chart changed
  here (its look, its range, its place, or the cells moved by an insert or a delete) is written from the model, the
  sheet named (`chart_rewritten`). A conversion writes every chart from the model (default, D276). ODF keeps a chart
  object's `content.xml` (a flat file's inline `office:document`, its bindings declared on itself), and a package's
  object its `styles.xml` beside it; kept XML is written only to the ODF form it was read from, so a package's chart
  written to a flat file, or a flat file's to a package, is written from the model and named (default, D278).
- **Written as the nearest type**: a chart no format holds is written as the nearest one it does, which every suite
  draws: a Stepped Area chart as an Area chart of the same stacking, a Combo chart's stepped area series as area
  series, a Bubble chart of one series (no sizes, so no format's bubble) as a Scatter chart (D321), a Candlestick chart
  of three series as OHLC, a Candlestick or OHLC chart of fewer than three series or more than four as a Line chart,
  and in ODF an OHLC chart of four series as a Candlestick, as no suite draws ODF's open and close ticks (LibreOffice
  24.2 draws them wrongly) (D323), and a Histogram chart as a Column chart of the values it counts, its series and
  labels as they are (Excel's own histogram is a `cx:chart` part no other suite reads, and ODF has none) (D325), and a
  Waterfall chart as a Column chart of its changes, as it is (Excel's waterfall is a `cx:chart` too) (D327),
  and a Treemap chart as a Pie chart of the same slices, the same shares of a whole (D329),
  and a Gauge chart, which no format holds, as a Bar chart of its values (D331),
  and a Scorecard chart, which no format holds either, as a Column chart of its series (D371),
  and a Timeline chart as a Line chart of its series over its dates (D373),
  and a Table chart, which no format holds as a chart, as a Column chart of its series (D375). The file also keeps the **original** for LiveDoc, a record of what the nearest type lost: its type, on a
  Combo chart each series' type in series order, and the sum the written chart reads back as (as "Kept while
  unchanged" sums it), as JSON (`{"type":"stepped-area","sum":"0a1b2c3d"}`,
  `{"type":"combo","series":["column","stepped-area"],"sum":"…"}`). It travels with the chart, in the chart's own
  document. XLSX: an extension of the chart part, `c:chartSpace`'s `c:extLst` holding a `c:ext` with LiveDoc's uri
  (`https://docs.nu/ns/chart/1`) and an `ldc:original` element of that namespace holding the JSON, which other suites
  pass over. ODF: a user-defined property of the chart object's own metadata, `meta:user-defined` named
  `LiveDoc chart`: in a package the object's `meta.xml` (`Object N/meta.xml`, in the manifest), in a flat file an
  `office:meta` within the frame's inline `office:document` (default, D290).
  - Reading: a chart read as a nearest type whose record parses, names a built type (and on a Combo chart a series
    type for each series) and holds the sum it reads as, is read as the original; a record whose sum differs (the
    chart was changed in another suite) or that does not parse is passed over, and the chart is read as the type it
    is (default, D290).
  - The write lists each such chart (`chart_nearest_type`, its sheet named), so the
    loss is never silent; a kept chart whose original is restored writes its kept XML as any other (default, D290).
- Any other chart stays kept content.

## Pictures in the file

**Status: written in both formats; reading follows.** A sheet's [images over cells](inserted-objects.md#images-over-cells)
are written as each suite writes a picture over the cells, so LibreOffice, Excel and Google Sheets show them where
LiveDoc draws them (default, D626).

- **The bytes**: a download reads each picture's bytes from the gallery, for the images the document may serve
  ([Images](../009-elements/images.md#placement-grants)), each image once however many times its sheets place it, up to
  50 MB of pictures a file in paint order. A picture whose bytes are not served (deleted from its gallery, not yet
  granted, the image store not set up), or past the 50 MB, is left out of the file and named by the write
  (`picture_unwritten`, its sheet and why: `unavailable` or `too_large`). A sheet keeping its file's own drawing
  writes none of its pictures, as none of its charts (D261), named the same (`kept_drawing`).
- **XLSX**: each picture an `xdr:oneCellAnchor` in the sheet's drawing, after its charts, holding an `xdr:pic`
  (`cNvPr` named `Picture N`, its alt text as `descr`, `picLocks noChangeAspect`), its `a:blip` naming the bytes
  by a relationship to `xl/media/imageN.<ext>` (`png`, `jpeg`, `gif` or `webp` by the stored type, each extension's
  content type declared once), its anchor cell and offset as a chart's, its size as `xdr:ext` and the shape's
  `a:xfrm`, a rectangle.
- **ODF**: each picture a `draw:frame` in the cell it is anchored to (LibreOffice's "To cell", D280), at its offset
  into that cell, after the cell's charts, named `Picture N`, holding a `draw:image` of `Pictures/<n>.<ext>` (in the
  manifest with its media type) and its alt text as `svg:desc`. A flat `.fods` holds the bytes inline, as the
  `draw:image`'s `office:binary-data` (base64).
- WebP is written as it is stored: LibreOffice and current Excel show it; an older Excel shows the frame empty.

## Pivot tables in the file

A sheet's [pivot tables](pivot-tables.md) are written both ways, as validation rules are (D293): the **standard form**
each format's apps read and refresh, **LiveDoc's record** beside it, exact, which LiveDoc reads back, and the
**output's cells** cached as plain values in their number formats, so an app that does not refresh shows what LiveDoc
showed (default, D604). The evidence is Google Sheets' own export (`corpus/google/pivot-tables.xlsx`, `.ods`), which
LibreOffice reads into its own pivot tables.

- **XLSX standard form**, shaped as Google Sheets exports one: per pivot table a pivot cache definition
  (`xl/pivotCache/pivotCacheDefinitionN.xml`: `cacheSource type="worksheet"` with `worksheetSource` `ref` and
  `sheet`, one `cacheField` a source column named by its header, its `sharedItems` the column's distinct values in
  source order when the column is a row, column or filter field, `refreshOnLoad="1"` while the standard form says the
  whole pivot table, no records), listed in the workbook's one `pivotCaches` (after the kept ones, `cacheId` past
  theirs); and a pivot table part (`xl/pivotTables/pivotTableN.xml`) linked from its worksheet: tabular
  (`compact="0" outline="0"`), its `location` the output, moved down by its page fields and one more row as Excel lays
  page fields out above it, one `pivotField` a cache field (its `axis`, `dataField`, `items`, `sortType`,
  `defaultSubtotal="0"` when its totals are off), `rowFields`, `colFields` (`-2`, the values, last, or in
  `rowFields` with Values as rows, when there are two or more), `pageFields` (a filter's column, its hidden items
  `h="1"`), `dataFields` (`name`, `fld`, `subtotal`, `showDataAs`), `rowGrandTotals` off when the outermost row group's
  totals are and `colGrandTotals` when the outermost column group's are (as Google Sheets writes them and LibreOffice
  reads them), and the style `PivotStyleLight16`. A calculated field is a `cacheField` with its
  `formula` (without `=`) and `databaseField="0"`.
- **ODF standard form**: one `table:data-pilot-table` a pivot table in the spreadsheet's one
  `table:data-pilot-tables` (after the kept ones), named `LiveDocPivot1`, ... (a name a kept one holds skipped):
  `table:target-range-address` the output (page fields' rows above it, as LibreOffice lays them out),
  `table:source-cell-range`, and one `table:data-pilot-field` a field (`table:source-field-name` its header,
  `table:orientation` `row`, `column`, `data` or `page`, `table:function` on a data field; a page field its
  `table:selected-page`, which ODF asks for, the first item it shows, and LibreOffice's `loext:ignore-selected-page="true"`
  so LibreOffice reads its members rather than that item alone), each row, column and page field with a `table:data-pilot-level` holding its subtotals (none when its totals are off), its members (a filtered
  value `table:display="false"`) and its sort (`table:sort-mode="name"`, `table:order`); a Show As value its
  `table:data-pilot-field-reference` (`row-percentage`, `column-percentage`, `total-percentage`); with two or more
  values the data layout field (`table:is-data-layout-field="true"`) on columns, or rows with Values as rows; and
  `table:grand-total` `none`, `row`, `column` or `both` from the outermost groups' totals.
- **Summaries**: SUM `sum`, COUNTA XLSX `count` and ODF `count`, COUNT `countNums` and `countnums`, AVERAGE, MAX, MIN,
  PRODUCT, STDEV, STDEVP, VAR, VARP each its own; MEDIAN ODF `median`, which LibreOffice reads; MEDIAN in XLSX and
  COUNTUNIQUE in both have none, so the standard form writes `sum` (default, D605).
- **What other apps lose**, as the standard form cannot say it or LiveDoc does not write it there yet: a summary the
  format lacks (D605), a Custom summary, a calculated field in ODF (left out of the standard form), sort by a value
  (written sorted by item), grouping (written ungrouped), a filter by condition or by formula (written unfiltered),
  and Repeat Row Labels in XLSX. Such a pivot table's XLSX cache is written without `refreshOnLoad`, so Excel shows the
  cached output until someone refreshes it. Converting lists them ([Converting](files-and-print.md#converting),
  `pivots_simplified`), counted by pivot table (default, D606).
- **LiveDoc's record**: in XLSX one `livedoc:pivot` (`record`, `fingerprint`) in an `ext` of the pivot table part's
  `extLst`, LiveDoc's namespace; in ODF the `table:data-pilot-table`'s `livedoc:pivot` and `livedoc:pivot-fingerprint`
  attributes. It is the pivot table as JSON: `at` (A1), `source` (A1, its sheet named when another), `rows` and
  `columns` (each `col`, its column's place in the source from 0, and the group's options), `values`, `filters` and
  `valuesAsRows`, as the model holds them ([The model](pivot-tables.md#the-model)).
- Its fingerprint is the CRC-32 (8 lower-case hex digits) of the standard form as written: the output's place, the
  source, then each field's orientation, header and function, a line each. **Read**, the record is taken when its
  fingerprint is the standard form's as read; then the pivot table, its parts and its cache leave the kept content,
  and its output's cached cells are not read as inputs, as the engine works them out again (as a spilled block's,
  [Arrays in the file](#arrays-in-the-file)). A record whose fingerprint differs (another app changed the pivot
  table) or that does not read is passed over (`pivot_changed`, logged, never reported), and the pivot table is read as
  another app's is, below (default, D607).
  **Another app's pivot table**, one without LiveDoc's record or whose record was passed over, is read from its standard
  form when the model holds every part of it, and is then the sheet's pivot table as one made here is (default, D608):

- **XLSX**: the cache's source a range of a sheet the workbook holds (`worksheetSource` `ref` and `sheet`), or a
  table or named range of the workbook by its `name` (case aside), read as the range it covers as the file arrives
  (a table's without its total row), from then on the pivot table's own range (default, D619); each field
  of `rowFields`, `colFields` and `pageFields` a source column, by its place in the cache; `-2` among `rowFields`
  Values as rows. Each `dataField` a value: `subtotal` back to its summary (`count` COUNTA, `countNums` COUNT,
  `stdDev` STDEV, `stdDevp` STDEVP, the rest their own; none SUM), `showDataAs` `percentOfRow`, `percentOfCol` or
  `percentOfTotal` its Show As (`normal` none), and its `name` the value's name when it is not LiveDoc's own label
  (`SUM of Units`). A data field on a `cacheField` with a `formula` is a calculated field of that field's name, its
  formula with `=` before it, summarised by SUM, as Excel works one out.
- An axis field's `sortType` `descending` sorts descending, any other ascending; its `autoSortScope` naming a data
  field (`4294967294`) sorts by that value, in the column items its other references name, outermost first. A
  field's `defaultSubtotal="0"` turns the next group's Show Totals off, `rowGrandTotals="0"` the outermost row
  group's and `colGrandTotals="0"` the outermost column group's, as they are written. Items hidden (`h="1"`) on any
  axis are a filter by values showing the column's other items. Its place is the `location`'s first cell, moved up by
  its page fields and one row more when it has page fields (row 1 at most).
- **XLSX grouping** (default, D617): an axis field that is a `cacheField` of no source column (`databaseField="0"`)
  whose `fieldGroup` names a source column by `base` (and no `par` of its own) groups that column, as does a
  source column's own `fieldGroup` holding a `rangePr` or `discretePr`; a `par` alone groups nothing. A `rangePr`
  `groupBy` of `seconds`, `minutes`, `hours`, `days`, `months`, `quarters` or `years` (its `groupInterval` 1)
  is the date rule Second, Minute, Hour, Day-Month, Month, Quarter or Year, its `startDate` and `endDate` not read;
  `groupBy` `range` (or none) is number intervals of size `groupInterval` (1 when absent), starting at `startNum`
  (0 when absent) and ending at `endNum` unless `autoStart` or `autoEnd` is on (on when absent). A `discretePr`
  maps each of the base column's items to a `groupItems` name: each name with an item other than one of its own
  text is a custom group of those items, as shown; an item in a group of its own name stays itself. A grouping
  field with hidden items, on the page fields, under a sort by a column item, or a date `groupInterval` other than
  1 is kept as it came.
- **ODF grouping** (default, D618): a `table:data-pilot-field` holding `table:data-pilot-groups` groups its column in
  place, or, when the groups name a `table:source-field-name`, groups that column as a field of its own. A
  `table:grouped-by` (`seconds` to `years`, its `table:step` 0 or 1) is the date rule XLSX's level of that name
  reads as; without one, `table:step` is the intervals' size and `table:start` and `table:end` their bounds (`auto`
  or absent: open); each `table:data-pilot-group` is a custom group of its `table:data-pilot-group-member`s by name,
  a group of only its own name's member left itself. A grouping on the page or data fields, one with hidden members,
  or any other is kept as it came.
- **ODF**: the `table:source-cell-range` a range of a sheet the workbook holds; each `table:data-pilot-field` a source
  column by `table:source-field-name` (the first header of that name) on its `table:orientation`; the data layout
  field on rows Values as rows. A data field's `table:function` back to its summary (`count` COUNTA, `countnums`
  COUNT, `auto` SUM, the rest their own, `median` MEDIAN), its `table:data-pilot-field-reference` `row-percentage`,
  `column-percentage` or `total-percentage` its Show As (`none` none), and its `tableooo:display-name` its name
  when it is not LiveDoc's own label. A level's `table:data-pilot-sort-info` gives its order (`table:sort-mode="data"`
  sorts by the first value of `table:data-field`'s column, `name` by item, any other ascending); a level with no
  subtotals turns the next group's Show Totals off, and `table:grand-total` the outermost groups' as written; a row
  level's `calcext:repeat-item-labels="true"` is Repeat Row Labels; members `table:display="false"` are a filter by
  values showing the column's other items, a member named by the item's text as shown; a page field's
  `table:selected-page` is not read, as LibreOffice reads Google Sheets' exports. Its place is the target's first
  cell, where LibreOffice puts the page fields.
- A page field that hides no item is no filter. A filter's hidden items are matched to the source's cells by value
  (XLSX) or by their text as shown (ODF), and the filter shows the shown texts of the rest.
- Read so, the cells the other app cached for its output (from its place to the end of its `location` or target) are not
  read as inputs: the engine works the output out again in LiveDoc's own layout and labels, which are Google Sheets'
  and may differ from the other app's in size and words (`Grand Total` for LibreOffice's `Total Result`).
- **Kept as it came**: a pivot table whose source is not a range, table or named range the workbook holds (an
  external source, a consolidation, a name of none), whose field LiveDoc cannot find (a source column by name, an item by its
  place), that groups a field in a way XLSX or ODF grouping does not read or has calculated items, whose Show As
  LiveDoc does not have (difference from, running total, index, and so on), or that the model refuses (past its bounds) stays
  the file's own: kept as it came, its output read as plain values, and named (`pivot_unread`, reported: "N pivot
  tables LiveDoc cannot work out are kept as the file holds them", one "is kept as the file holds it") (default, D609).
- Google Sheets' exports say less than Google's pivot tables (`corpus/google/pivot-tables.xlsx`, `.ods`): its XLSX
  leaves out Repeat Row Labels, filters by condition and by formula, a Custom summary (written SUM) and the groupings it
  has no `fieldGroup` for (the date rules but Quarter, Year, Month and Day-Month, and number intervals over a column of
  mixed values: written ungrouped), and groups the rest (read, D617); its ODS, as LibreOffice computes it, leaves out
  calculated fields, Custom summaries, filters by condition and formula, every grouping (the field left out, or named
  `Product2` for custom groups: kept), sorting by a value in a column item, an inner group's Show Totals off, and
  Repeat Row Labels. LibreOffice's own saves keep no record of LiveDoc's: its ODS leaves out what Google's ODS does
  and sorting by a value; its XLSX also Show As, grand totals off, sorting, custom groups (an empty field: kept) and
  number intervals (written ungrouped); its ODS keeps every grouping (`corpus/libreoffice/PivotGroups-*`, D618). A case read from any of them works out
  what its file says, so it equals Google's answer only where the file says the whole case (default, D610).

- A pivot table whose source was deleted has no standard form: it is left out, named (`pivot_unwritten`); one whose
  output is blocked or too large is written with its anchor cell as its output (default, D607).

## Unknown content

- Whatever a file holds that the model does not (an embedded chart, a format's own setting, a smart chip, a filter
  view in XLSX that only ODF could hold) is kept with the workbook as the file's own XML, by where it sat, and written
  back untouched to the same format. Built in `@livedoc/sheets/files` (`KeptContent`).
- Every construct the mappings above do not read yet is kept until its mapping is built (charts and pictures, notes
  and comments, merges, names LiveDoc cannot read, validation and format rules, filters, protections LiveDoc does not read; XLSX's print settings), as
  text documents keep theirs. Styles are not kept: a cell's style is read as [Cell styles in the file](#cell-styles-in-the-file)
  maps it, and what it says beyond that, a row's or column's style over its empty cells, and ODF's `styles.xml`
  (its page layouts, so its print settings, and the named styles a format rule applies) are left out; a file's read
  names each sheet whose cells, rows or columns hold such a style (`styles_unread`) (default, D104).
  XLSX's differential formats (`dxfs`) and table styles are kept in its styles part, as kept format rules, tables and
  pivot tables name them by index (default, D110).
- **Grains**, each kept as the file's own XML with the namespace bindings it needs
  ([Office packages](../020-import-export/office-packages.md), `keptXmlOf`), anchored where it sat:
  - **Workbook**: ODF's `office:spreadsheet` children but its tables and `table:calculation-settings` (which LiveDoc
    writes), each before or after the tables as it sat; `office:scripts`; the automatic styles of the families no
    cell, row, column or table names (`graphic`, `paragraph`, `text`, `chart`), which kept drawings and notes
    name. XLSX's `workbook` children but `workbookPr` and `sheets`.
  - **Sheet**: ODF's `table:table` children but its columns and rows, each before or after them, and its attributes
    but `table:name` and `table:style-name`; XLSX's `worksheet` children but `dimension`, `sheetFormatPr`, `cols` and
    `sheetData`, its `sheetPr` but its `outlinePr`, and its `sheet` element's attributes but `name`, `sheetId` and
    `r:id`.
  - **Cell** (ODF): a `table:table-cell`'s children but its paragraphs (a note, a drawing anchored to it) and its
    attributes but those the reader reads (its value, type, formula, style, repeats and array spans), so a merge or a
    validation stays on its cell. A repeated cell keeps them on each of its cells up to 1,000 cells; past that they
    are not kept and the read names them (`kept_cut`) (default, D105).
  - **Cell text** (ODF): a cell's paragraphs, when one holds marked text (a link, a span: anything but text, spaces,
    tabs and line breaks), as a smart chip Google Sheets exports does (its email linked to `mailto:`, a file's title
    linked to the file). LiveDoc reads their plain text into the cell and keeps the paragraphs whole; they are written
    in place of the cell's own while its text reads the same, and an edited text writes plain paragraphs, the marks
    going with the text they were on (default, D376).
  - **Cell text** (XLSX): a cell's rich text (a shared or inline string of runs, each with its own font, size or
    colour). LiveDoc reads its plain text into the cell and keeps the runs whole; they are written as the cell's
    shared string while its text reads the same, and an edited text writes a plain one. A Strict file's runs are not
    kept, but named with its other unread content (`kept_unread`, D108) (default, D377).
  - **Parts**: every package entry the reader does not read and the writer does not write: ODF's by path with its
    media type (`settings.xml`, `Pictures/`, `Object 1/`, `Basic/`); XLSX's with its content type and its
    relationships, each relationship kept on the workbook, sheet or package it came from with its id. Left out:
    what the office packages drop, as what may run or signs bytes LiveDoc rewrites (macros, scripts, signatures,
    thumbnails; [Office packages](../020-import-export/office-packages.md)), which the read names
    (`entries_dropped`), and XLSX's `calcChain.xml`, a cache of the cells' formulas Excel rebuilds (default, D106).
- **Sheets by place** (XLSX): a kept defined name of one sheet (`localSheetId`) is kept on that sheet and written
  with the sheet's place at the write, and goes with it; a kept workbook view's `activeTab` or `firstSheet` past the
  last sheet is written as the first (default, D112).
- **Anchors by id.** In the store a sheet's kept content follows its sheet id and a cell's its row and column ids, so
  it moves with its sheet, row and column, as the cells do; the kept XML itself is untouched, so a reference inside it
  (a named range's, a chart's) still names the cells it named in the file (default, D107).
- **Written back in place.** Each kept element is written where it sat: in ODF before or after the tables, columns
  and rows; in XLSX at its place in the schema's order of the workbook's and worksheet's children. Kept relationships
  keep their ids, and the writer numbers its own after them; a kept part is written while a kept relationship still
  reaches it, or, in ODF, while kept XML still names its path, so a deleted sheet's drawings go with it.
- **A flat `.fods` holds no package entries**: a kept picture or embedded object still reached is left out of it, and
  the write names it (`parts_left`) (default, D111).
- **Not kept, and named by the read (`kept_unread`)**: anything of a Strict XLSX (its namespaces differ from the
  Transitional LiveDoc writes), and an XLSX element naming a relationship that is not kept (one to a dropped macro or
  control), which another suite would read as damage (default, D108).
- Kept content whose anchor is gone (its sheet, row or column deleted) is dropped at the next write, and the
  write's report says so (`kept_dropped`); nothing is dropped silently.
- Converting to the other format carries only what the model holds; the conversion lists what it leaves behind
  before it runs ([Files and print](files-and-print.md#converting)): the kept content, and what the model holds that
  the new format's file cannot (Excel's bounds and grammar above, OpenFormula's unwritten formulas).
- The kept content stays with the workbook in its own format: a file of the other standard leaves it out (a
  conversion's or a download's), and converting back, by **Undo** or later, writes it again where its anchors still
  stand (default, D109).
- **Kept with the spreadsheet**: opening a file stores its kept content in the spreadsheet's room
  ([Sheet store](sheet-store.md#in-a-spreadsheet)), and every file the spreadsheet is written as (a download, an
  offline download, a conversion's list) carries it; so do its copies and its trips to and from This Browser.
- A spreadsheet keeps up to 16 MB of a file's kept content, each element or attribute up to 1 MB and each package
  entry up to 5 MB; what is past them is left out, entries the first, with the relationships naming them, and the
  read names it (`kept_too_large`) (default, D113).

## The corpus

Files other suites wrote, kept in `packages/sheets/corpus/` with each one's maker, source and licence, so every read
and write is measured against what arrives in practice, not only against LiveDoc's own files.

- **Excel**: workbooks Microsoft Excel 2007 to 2016 saved on Windows and macOS, from Apache POI's test data (Apache
  License 2.0, pinned to one commit), each holding what the readers keep or read (formulas, shared formulas, number
  and date formats, tables, comments, drawings, validation and format rules) (default, D119).
- **LibreOffice**: each Excel workbook saved by LibreOffice as `.ods`, and some as `.xlsx` (default, D119).
- **Google Sheets**: some Excel workbooks and a workbook of Google-only functions uploaded to Google Sheets and
  exported as `.xlsx` and `.ods` through the oracle's Drive (default, D119).
- Each file is read, made into sheets, written in its own format and read again, and written in the other standard:
  - The second read holds every sheet, cell value, formula (in the model's own text), number format and kept item the
    first made (the round trip loses nothing it did not name).
  - Every loss each step names is recorded per file (`packages/sheets/corpus/losses.json`): a loss that appears or
    goes fails the run, so none is silent and none is fixed unnoticed.
- The corpus is made again by `pnpm --filter @livedoc/sheets corpus:make` (LibreOffice and Google by hand, as the
  oracle is); the round trips run in the unit run.

## Conformance claimed

- **ODF**: every `.ods` and `.fods` written is a conforming OpenDocument 1.4 spreadsheet document, valid against the
  Part 3 RELAX NG schema (extended conformance where `calcext:` and `loext:` content is kept, or LiveDoc's own
  `livedoc:` validation rules are written), checked in CI.
- **OpenFormula**: an evaluator of the **Small** group to start, the **Large** group as the definition of done
  (OpenFormula Part 4 §2.3), measured by the oracle corpus ([Formulas](formulas.md#the-oracle)).
- **XLSX**: every `.xlsx` written validates against ECMA-376 Transitional's schemas, checked in CI, and opens in
  Excel, LibreOffice and Google Sheets with the same values.
- Built: `pnpm --filter @livedoc/sheets validate:files` writes one workbook per construct group (values, formulas,
  arrays, number formats, Excel's bounds, validation rules) in all three files, validates each against its schema with Jing, and has
  LibreOffice open and save each again with the same values ([Office packages](../020-import-export/office-packages.md#validation));
  CI's Office files job runs it.

## The flat form

- A `.fods` is one XML file: every part inline, written one cell a line with attributes in a fixed order, so a
  repository diff of a changed value is one line and `rg` finds any text ([Files and print](files-and-print.md#repositories)).
- An XLSX workbook has no flat form; in a repository it is its `.xlsx` bytes.

## Limits

- A file over 100 MB, or a package that inflates past 200 MB, is refused with a named rejection (`package_too_large`,
  [Office packages](../020-import-export/office-packages.md#named-rejections)); a file holding more than the
  workbook's limits ([Spreadsheet](spreadsheet.md#limits)) or 2,000,000 cells is cut, and the cut listed in the
  import report.
- Every import guard of [Security](../../research/sheets-open-standard/security.md) is a test with its named
  rejection or its line in the import report ([Files and print](files-and-print.md#import-security)).

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D82** An error Excel does not know, cached in XLSX: Its text, as a text result (default).
- **D83** What S5 wraps in XLSX: The whole formula, when it calls a Google-only function or one Excel does not have,
  or its array literal holds more than constants (default).
- **D84** A sheet name past 31 characters in XLSX: Cut and numbered as `SheetName.fit` makes a name (default).
- **D85** An `.xlsm` opened: An XLSX workbook, its macros dropped and reported as the office packages drop them
  (default).
- **D89** Excel's bounds in an XLSX written: Text cut at 32,767 characters, a formula past 8,192 written as its value,
  cells past `XFD` left out, a formula naming a column past `XFD` wrapped by S5 (default).
- **D90** How the model's number formats are written: Each as the code Google Sheets uses for it, the date in the
  workbook's locale as drawn; read back by exact code, any other code Custom (default).
- **D91** A currency in other spellings: `£#,##0.00` and `[$£-809]#,##0.00` read as Currency (default).
- **D92** XLSX number format ids: Built-ins by ECMA-376's table, the rest from 164 in order of first use (default).
- **D93** ODF style names: Data styles `N1`... and cell styles `ce1`... in order of first use, as LibreOffice names them
  (default).
- **D94** A format over empty cells in ODF: Kept for a cell repeated over at most 1,000 cells; a line's left out and
  named (default).
- **D104** Styles beyond what a cell's style maps in an arriving file: Not kept; named by the read (`styles_unread`)
  (default).
- **D105** A repeated ODF cell's kept attributes and children: Kept on each of its cells up to 1,000 cells, else not
  kept and named (`kept_cut`) (default).
- **D106** Package entries left out of kept content: What the office packages drop (named, `entries_dropped`), and
  XLSX's `calcChain.xml` (default).
- **D107** References inside kept XML: Untouched; they name what they named in the file (default).
- **D108** Kept content of a Strict XLSX, and an XLSX element naming a relationship not kept: Not kept; named
  (`kept_unread`) (default).
- **D109** Kept content after a conversion: Stays with the workbook in its own format, left out of the other
  standard's files, written again once converted back (default).
- **D110** XLSX kept content naming styles: `dxfs` and `tableStyles` kept in the styles part (default).
- **D111** Kept package entries in a flat `.fods`: Left out, named (`parts_left`) (default).
- **D112** XLSX kept content naming a sheet by its place: A defined name follows its sheet; a view's index past the
  last sheet becomes the first (default).
- **D113** Kept content a spreadsheet stores: Up to 16 MB, an item up to 1 MB, a package entry up to 5 MB; past them
  left out, entries first, with the relationships naming them, and named (`kept_too_large`) (default).
- **D119** The corpus's files: Excel's from Apache POI's test data, saved again by LibreOffice 26.8 and by Google
  Sheets (default).
- **D123** A row's or column's default cell format in ODF: On the cells the file fills in it; not named over its empty
  cells (default).
- **D124** The sheet's own sizes in a file: XLSX's `sheetFormatPr` defaults, ODF's size most lines carry within the
  grid; a line at that size takes it, any other its own, within D158 (default).
- **D166** Units: A pixel a 96th of an inch, a point 4/3 px; an XLSX column width in Excel's characters of a 7 px digit
  and 5 px padding; ODF written in inches (default).
- **D167** The controls' side in ODF: Not said by the format; read as after, as LibreOffice draws them (default).
- **D168** A line hidden by hand inside a collapsed group in a file: Hidden by its group alone, shown with it (default).
- **D182** A sheet's tab in a file: Excel's very hidden reads as hidden; a file hiding every sheet shows its first;
  an XLSX file opens on its first sheet shown (default).
- **D203** A file's style read against LiveDoc's defaults (Arial 10 pt, black, no fill, no border): what differs is
  the cell's own, the file's default style included; the default font colour reads as none; a file with no default style says nothing of its cells' look (default).
- **D204** Vertical alignment in a file: the grid's middle, for a cell with none, written as middle; a file's bottom
  read as Bottom (default).
- **D215** Format rules in a file: a comparison with a reference or formula operand, `notBetween`, Date Is and
  Text Is Exactly read as the same test (Custom Formula Is, Is Equal To); rules the model does not hold kept and written
  before LiveDoc's own; LiveDoc draws comparisons on numbers alone, as Google Sheets does (default).
- **D218** The theme in a file: XLSX's theme part read as the workbook's theme (a catalogue theme it matches, else
  the file's by its name), its default font the theme's font that cells then carry none of; an untinted theme colour read
  as that theme colour, a tinted one as the colour it draws (default).
- **D205** Clip in a file: written as Overflow, which neither format can tell apart (default).
- **D206** Border widths and styles in a file: thin, medium, thick as widths 1 to 3; double as double; dashes and dots
  by their nearest; ODF 0.74, 1.76 and 2.49 pt written (default).
- **D207** ODF's default cell style: written as the default style and as "Default", every cell style its child; read
  for its text properties alone, as LibreOffice draws its cells by "Default" (default).
- **D212** An ODF angle between 90° and 270°: Left out and named (`styles_unread`), as Google's −90° to 90° holds
  none (default).
- **D260** A chart's palette in a file: Not written; a series without a colour of its own takes the reading suite's
  colours (default).
- **D275** Which XLSX charts are read: a sheet's, when its drawing holds only charts of the types built, each
  reading one block of its own sheet and naming no part of its own; else the drawing is kept whole (default).
- **D276** A read chart unchanged: its read sum (type, titles, legend, values, axis, alt, place, size, cells by
  position) equals the written one's; its kept chart part is then written in its place under a new name (default).
- **D377** A cell's rich text runs (XLSX): kept whole while the cell's text reads the same, so its fonts and colours
  survive a round trip; an edited text writes a plain string (default).
- **D376** A cell's marked paragraphs (ODF): kept whole while the cell's text reads the same, so a link or a span
  survives a round trip; an edited text writes plain paragraphs (default).
- **D375** A Table chart in a file: written in both formats as a Column chart of its series and labels, the original
  kept (D290) (default).
- **D373** A Timeline chart in a file: written in both formats as a Line chart of its series and labels, the original
  kept (D290) (default).
- **D371** A Scorecard chart in a file: written in both formats as a Column chart of its series and labels, the
  original kept (D290) (default).
- **D331** A Gauge chart in a file: written in both formats as a Bar chart of its series and labels, the original kept
  (D290) (default).
- **D329** A Treemap chart in a file: written in both formats as a Pie chart of its series and labels, the original kept
  (D290); Excel's `cx:chart` treemap neither written nor read (default).
- **D327** A Waterfall chart in a file: written in both formats as a Column chart of its series and labels (the changes,
  not the running total), the original kept (D290); Excel's `cx:chart` waterfall neither written nor read (default).
- **D325** A Histogram chart in a file: written in both formats as a Column chart of the same series and labels (the
  values it counts, not its buckets), the original kept (D290); Excel's `cx:chart` histogram neither written nor read
  (default).
- **D323** Candlestick and OHLC in a file: XLSX `c:stockChart` (`c:hiLowLines`; a Candlestick's `c:upDownBars`, gap
  width 150; an OHLC's open and close series marked `dash`; series lines not drawn) on a category and a value axis;
  ODF `chart:stock` with its series in ODF's order (open, minimum, maximum, close), a Candlestick's plot
  `chart:japanese-candle-stick="true"`; read back from either into the open, high, low, close order; a three-series
  Candlestick written as OHLC, another count as Line, and in ODF a four-series OHLC as a Candlestick (LibreOffice draws
  no ODF open and close ticks), the original kept (D290) (default).
- **D321** A Bubble chart in a file: XLSX `c:bubbleChart` (`varyColors` 0, each series `c:xVal`, `c:yVal`,
  `c:bubbleSize` of the shared size column and `c:bubble3D` 0; `c:bubbleScale` 100, `c:showNegBubbles` 0; two
  `c:valAx`); ODF `chart:class="chart:bubble"`, each series' `chart:values-cell-range-address` the size column and its
  domains the y column then the x column; read back when the series share one x and one size column, the size
  column last; one series (no sizes) written as Scatter with the original kept (D290) (default).
- **D292** A Radar chart in a file: XLSX `c:radarChart` with `radarStyle` `marker` on a category and a value axis, ODF
  `chart:class="chart:radar"`; read back from either, a filled radar (`filled`, `chart:filled-radar`) staying kept
  (default).
- **D626** A sheet's images over cells are written as pictures over the cells in both formats (XLSX `xdr:pic` in a
  one-cell anchor, ODF a cell-anchored `draw:frame` › `draw:image`, flat ODF inline), their bytes read from the gallery
  for the images the document may serve, up to 50 MB a file; a picture not served, past the 50 MB, or on a sheet
  keeping its file's drawing is left out and named (`picture_unwritten`) (default).
- **D290** A chart type no format holds: written as the nearest that does (Stepped Area as Area, a stepped area
  series as an area one), its original kept in the chart's own document (XLSX a `c:ext` of LiveDoc's uri, ODF the
  object's `meta:user-defined` `LiveDoc chart`) as JSON with the written chart's sum, restored on reading only while
  the chart still sums so; the write lists it (`chart_nearest_type`). Chosen over one record for the whole workbook
  in its document properties (XLSX `docProps/custom.xml`, ODF `meta.xml`), which stays behind when a suite renumbers,
  copies or deletes a chart, over writing computed columns into the cells, and over Excel's `cx:chart` in XLSX
  (Webber's ruling, 2026-11-28).
- **D285** A line chart's smoothing in a file: XLSX `c:smooth` on every series, ODF `chart:interpolation="cubic-spline"`;
  read from either, a line whose series differ, or another interpolation, stays kept (default).
- **D288** The right-hand axis in a file: written only as LiveDoc draws it (a Line, unstacked Area or Combo chart with a
  series on each side); XLSX right series in groups on a second axis pair (category axis deleted, value axis at the
  right, crossing at the maximum), ODF `secondary-y`; read back from either (default).
- **D287** A Combo chart in a file: XLSX one plot area of a clustered column group, a line group and an area group
  (those holding a series) on one pair of axes; ODF `chart:class="chart:bar"` with a class per series; read back from
  either when its groups or classes are two or three of those, unstacked; any other mix stays kept (default).
- **D283** A chart's stacking in a file: XLSX `grouping` `stacked` or `percentStacked` (bars `overlap` 100), ODF
  `chart:stacked` or `chart:percentage`, written and read on a column, bar or area chart only; a line chart's
  stacking is not read, so it stays kept (default).
- **D277** Which ODF charts are read: a sheet's, when every drawing on it (`table:shapes` and in its cells) is a frame
  of one chart object of a type built, reading one block of its own sheet; else every drawing is kept (default).
- **D278** A read ODF chart unchanged: its object's `content.xml` (and a package's `styles.xml`), or a flat file's
  inline document, written in its place under a new object name, to the same ODF form only (default).
- **D279** A shown value axis in ODF: written with `chart:display-label="true"`, as LibreOffice reads an axis
  without it as unlabelled; read as off when missing, `chart:visible="false"` or `chart:display-label="false"`
  (default).
- **D280** A chart's place in ODF: anchored in its cell at its offset, not placed over the sheet by position, as
  LibreOffice draws rows sized to their text shorter than LiveDoc does (default).
- **D293** Validation rules in a file: the closest standard rule for other apps, LiveDoc's exact rule beside it in
  LiveDoc's namespace (the Director's ruling, 2026-11-26).
- **D294** A LiveDoc rule beside a standard rule changed since: the standard rule wins, LiveDoc's dropped and logged
  (the Director's ruling, 2026-11-26).
- **D343** What a file's names LiveDoc reads: one cell or rectangle of a sheet, named by the workbook, read as a named
  range; one of a sheet, of a constant, a formula, several areas, whole lines, another workbook or `#REF!`, or one the
  rules refuse, kept and named (`name_unread`); built-in and hidden names kept, not named (default).
- **D349** Protections in a file: the standard form each suite enforces (a protected sheet, its free ranges) and
  LiveDoc's exact record beside it, fingerprinted, as validation rules (D293, D294) (default).
- **D350** A protected sheet's exceptions in ODF: each cell names an open variant of its style
  (`style:cell-protect="none"`), the shared style untouched, empty cells repeated (the Director's ruling, 2026-11-27).
- **D351** A file's protection password: its hash and Excel's allowances kept on the sheet's protection, written back
  only to its own format while that protection admits Editors or the owner; never asked for, checked or invented
  (the Director's ruling, 2026-11-27).
- **D452** A table's header cells in XLSX: written as their column names, text (a blank header `Column N`, a number
  its text), as Excel holds a table's header and Google's export writes it
  (`plans/assets/0020/research/google-table-export.md`) (default).
- **D477** A column's condition in a file: the one standard column both formats write, as near as each format's
  filter says it; a date as its day number, as Excel compares one; a condition before kept values (default).
- **D478** A hidden row of a file's filter: in XLSX the filter's when the filter has a condition, as Excel's filter
  shows again every row a condition keeps; in ODF only `table:visibility="filter"`, LibreOffice's own (default).
- **D479** A filter view's `guid` in XLSX: the sheet's place (four hex digits) and the view's id in hex, padded, so
  it is the same at every write and unique in the workbook (default).
- **D480** The fallback for a filter that already overlaps a table other than as its filter (stored before D481, or
  read from an OpenDocument file): it stays, its conditions still editable; in XLSX it is LiveDoc's record alone, no
  `autoFilter` nor `_xlnm._FilterDatabase` (Excel repairs a file whose sheet filter overlaps a table), its rows still
  hidden; logged once a read or write (`filter_beside_table`), never reported (the Director's ruling, 2026-11-27).
- **D453** A kept table at an XLSX write named as one of the sheets' own tables (by Excel's rules, case aside): dropped
  and counted (`kept_dropped`), the own table written, as D341 (default).
- **D352** A file's protection LiveDoc does not read (a password-protected `protectedRange`, one of an unprotected
  sheet, the workbook's structure, LibreOffice's options): kept as the file's own; free cells past 50 stay protected,
  named (`protection_cut`) (default).
- **D344** One name twice at a write: a named range before a kept name of the workbook (dropped, `kept_dropped`) and
  before a named function (`function_unwritten`); a name on two sheets written once, from the first in tab order, the
  other named (`name_unwritten`); a kept sheet's name beside it (default).
- **D340** A named function in XLSX: a workbook's `LAMBDA` defined name, the description its `comment` cut to Excel's
  255 characters, argument descriptions and examples left out (`function_cut`); a definition Excel cannot hold wrapped
  by S5 inside the `LAMBDA`; a name Excel refuses left out (`function_unwritten`) (default).
- **D341** A kept defined name of a named function's name at an XLSX write: Dropped and counted (`kept_dropped`), the
  named function written (default).
- **D342** A file's `LAMBDA` name LiveDoc cannot hold: Kept as it came and named (`function_unread`); a sheet's
  `LAMBDA` name kept with its sheet and named (default).
- **D604** A pivot table in a file: the standard form, LiveDoc's exact record beside it, and its output's cells cached
  as values, as Google Sheets exports one (default).
- **D605** A summary a format has no function for (MEDIAN in XLSX, COUNTUNIQUE in both) is written `sum` in the
  standard form, the record keeping it (default).
- **D606** What the standard form does not say is listed on converting (`pivots_simplified`), and its XLSX cache is
  not refreshed on load (default).
- **D607** A record is read while its fingerprint holds, else the pivot table is read as another app's (D608); a pivot
  table with no source is left out of the file, named (default).
- **D608** Another app's pivot table read from its standard form, every part mapped back onto the model, its output
  worked out again in LiveDoc's layout (default).
- **D609** One whose source, fields, grouping or Show As the model cannot hold: kept as it came, its output as values,
  named (`pivot_unread`) (default).
- **D610** Google Sheets' exports read as they say, each case equal to Google's answer where its file says it whole
  (default).
- **D617** An XLSX `fieldGroup` read as the grouping it says: its date levels (Second to Year, but the multi-level ones)
  as date rules, its number ranges as intervals, its discrete items as custom groups; a date range's bounds not read
  (default).
- **D618** An ODF `table:data-pilot-groups` read as the grouping it says, as XLSX's are (D617): date levels, number
  intervals with `auto` bounds open, named groups of members (default).
- **D619** An XLSX pivot table over a table or named range reads it as the range it covers on arrival, a table's
  total row left out; LiveDoc's pivot table keeps that range, growing only as a range does (default).
- **D295** A dropdown XLSX's list cannot say: a rule allowing any value, LiveDoc's rule beside it (default).
- **D296** A standard rule read without LiveDoc's: the closest LiveDoc rule, one a rectangle; error messages and
  titles left out (default).
- **D261** A sheet's own charts beside a drawing kept from its file: Not written, the sheet named (`charts_unwritten`),
  as a worksheet holds one drawing and ODF one `table:shapes` (default).
