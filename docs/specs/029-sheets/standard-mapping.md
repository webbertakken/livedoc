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
| Named ranges, named functions                         | `table:named-range`, `table:named-expression`                                                                               | `definedNames`                                                                 |
| Validation                                            | `table:content-validation`                                                                                                  | `dataValidations`                                                              |
| Conditional formats                                   | `calcext:conditional-formats` (LibreOffice's extension namespace)                                                           | `conditionalFormatting`                                                        |
| Filters, filter views                                 | `table:database-range` with `table:filter`                                                                                  | `autoFilter`; filter views have no XLSX form (Unknown content)                 |
| Protection                                            | `table:protected` and protection keys                                                                                       | `sheetProtection`, `protectedRanges`                                           |
| Comments and notes                                    | `office:annotation` in the cell                                                                                             | `xl/comments*.xml` (notes), threaded comments parts                            |
| Charts                                                | `draw:frame` › `draw:object` holding a chart document (inline in `.fods`)                                                   | DrawingML chart parts through `xl/drawings`                                    |
| Pivot tables                                          | `table:data-pilot-table`                                                                                                    | pivot cache definition, records and table parts                                |
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
| Date Is Before, After, Is   | `expression`: `AND(ISNUMBER(A1),INT(A1)<DATE(2026,1,5))`                                         | `formula-is(...)`, the same formula                                                                   |
| Custom Formula Is           | `expression`                                                                                     | `formula-is(...)`                                                                                     |
| Colour Scale                | `colorScale`: `cfvo` `min`, `max`, `num`, `percent`, `percentile`; `color@rgb`                   | `calcext:color-scale-entry`: `minimum`, `maximum`, `number`, `percent`, `percentile`; `calcext:color` |
| Style                       | `dxf`: `font/b`, `i`, `u`, `strike`, `color`; `fill/patternFill/bgColor`                         | `fo:font-weight`, `fo:font-style`, underline, line-through, `fo:color`, `fo:background-color`         |

- A condition's value is written as a number when it reads as one (a date as its day number), else as text.
- **Read**: a `cellIs` or ODF comparison whose operand is a number or a text is its condition; any other operand (a
  reference, a formula) and `notBetween` read as the same test written as a Custom Formula Is. An empty or not empty
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
  the first column of numbers is the x. Each series is written as references to its cells in the file's own syntax
  (`'Models'!$B$2:$B$40`, `Models.B2:Models.B40`), so the chart reads them live in every suite; an empty cell is a gap
  (XLSX `dispBlanksAs="gap"`). A chart with no data is written with no series.
- **Look**: its type (Column and Bar as clustered bars, Line, Area, Scatter as markers, Pie, Doughnut with a half
  hole), its stacking on a Column, Bar or Area chart (XLSX `grouping` `stacked` or `percentStacked`, bars with
  `overlap` 100; ODF `chart:stacked` or `chart:percentage` on the plot area) (default, D283), its title and axis titles, its legend's place or none, values on the marks, the value axis (deleted when
  off), each series' own colour, a scatter series drawn as a line, and its alt text. Its palette is LiveDoc's: a series
  with no colour of its own takes the reading suite's (default, D260).
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
  line chart's only when `standard`. It reads a sheet's charts only when its drawing holds
  nothing else, every anchor a chart that qualifies and no chart naming a part of its own (`r:id`); otherwise the
  drawing stays kept whole and none of its charts is read (default, D275). ODF reads a sheet's charts only when every
  drawing on it, in its `table:shapes` and in its cells, is a `draw:frame` holding one chart object (and its
  replacement picture, title and description) that qualifies; otherwise every drawing stays kept and none of its
  charts is read (default, D277). A frame in `table:shapes` is placed by its position over the sheet's line sizes; one
  in a cell (LibreOffice's "To cell") on that cell, its `svg:x` and `svg:y` the offset into it. Lengths are read in
  any of ODF's units. A series reads its cells by `chart:values-cell-range-address`, its name by
  `chart:label-cell-address`, a scatter's x by the first series' `chart:domain` (a later series has none or the
  same), the labels by the x axis's `chart:categories`. The look is read from the chart document's automatic styles:
  a bar chart by `chart:vertical`; stacking by `chart:stacked` and `chart:percentage` on a bar or area chart; a
  stacked or percentage line chart, 3-D, smoothed, combined (a series of another class) or
  secondary-axis charts are not read; values on the marks by `chart:data-label-number="value"` on every series (or
  the plot area); the value axis off when it is missing, `chart:visible="false"` or `chart:display-label="false"`;
  a series' colour by its fill (stroke on a line chart), a scatter series a line unless `draw:stroke="none"`, its
  colour then the stroke's; the alt text by the frame's `svg:desc`, else its `svg:title`, when it is not the title.
- **Kept while unchanged**: a chart read from a file keeps its file XML beside it (a kept part, named on the chart),
  with a sum of what it was read as: its type, stacking, titles, legend, values, axis, alt, place and size, and its cells by
  position. A write whose chart sums the same writes the kept XML in its place, under a new part name; a chart changed
  here (its look, its range, its place, or the cells moved by an insert or a delete) is written from the model, the
  sheet named (`chart_rewritten`). A conversion writes every chart from the model (default, D276). ODF keeps a chart
  object's `content.xml` (a flat file's inline `office:document`, its bindings declared on itself), and a package's
  object its `styles.xml` beside it; kept XML is written only to the ODF form it was read from, so a package's chart
  written to a flat file, or a flat file's to a package, is written from the model and named (default, D278).
- Any other chart stays kept content.

## Unknown content

- Whatever a file holds that the model does not (an embedded chart, a format's own setting, a smart chip, a filter
  view in XLSX that only ODF could hold) is kept with the workbook as the file's own XML, by where it sat, and written
  back untouched to the same format. Built in `@livedoc/sheets/files` (`KeptContent`).
- Every construct the mappings above do not read yet is kept until its mapping is built (charts and pictures, notes
  and comments, merges, named ranges, validation and format rules, filters, protections; XLSX's print settings), as
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
  Part 3 RELAX NG schema (extended conformance where `calcext:` and `loext:` content is kept), checked in CI.
- **OpenFormula**: an evaluator of the **Small** group to start, the **Large** group as the definition of done
  (OpenFormula Part 4 §2.3), measured by the oracle corpus ([Formulas](formulas.md#the-oracle)).
- **XLSX**: every `.xlsx` written validates against ECMA-376 Transitional's schemas, checked in CI, and opens in
  Excel, LibreOffice and Google Sheets with the same values.
- Built: `pnpm --filter @livedoc/sheets validate:files` writes one workbook per construct group (values, formulas,
  arrays, number formats, Excel's bounds) in all three files, validates each against its schema with Jing, and has
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
- **D261** A sheet's own charts beside a drawing kept from its file: Not written, the sheet named (`charts_unwritten`),
  as a worksheet holds one drawing and ODF one `table:shapes` (default).
