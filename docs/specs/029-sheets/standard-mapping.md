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
| Sheet name, hidden, tab colour                        | `table:name`; `table:display` in its table style; `tableooo:tab-color`                                                      | `sheet@name`, `@state`; `sheetPr/tabColor`                                     |
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
  its own style's format where the file repeats it over at most 1,000 cells; a format over more, or a row's or
  column's default over empty cells, is a whole line's, which the grid does not hold yet, and is named (`formats_cut`)
  (default, D94).

## Unknown content

- Whatever a file holds that the model does not (an embedded chart, a format's own setting, a smart chip, a filter view in XLSX that only ODF could hold) is kept with the workbook as the file's own XML, by
  where it sat, and written back untouched to the same format. Built in `@livedoc/sheets/files` (`KeptContent`).
- Every construct the mappings above do not read yet is kept until its mapping is built (charts and pictures, notes
  and comments, merges, named ranges, validation and format rules, filters, protections; XLSX's print settings and
  column widths), as text documents keep theirs. Styles are not kept: a cell's, row's or column's style beyond its
  number format, and ODF's `styles.xml` (its page layouts, so its print settings, and the named styles a format rule
  applies), wait for [Formatting](formatting.md) to map them, and until then a file's read names them
  (`styles_unread`) (default, D104). XLSX's differential formats (`dxfs`) and table styles are kept in its styles part,
  as kept format rules, tables and pivot tables name them by index; a kept column's `style` index is left out, as it
  names a style LiveDoc does not write (default, D110).
- **Grains**, each kept as the file's own XML with the namespace bindings it needs
  ([Office packages](../020-import-export/office-packages.md), `keptXmlOf`), anchored where it sat:
  - **Workbook**: ODF's `office:spreadsheet` children but its tables and `table:calculation-settings` (which LiveDoc
    writes), each before or after the tables as it sat; `office:scripts`; the automatic styles of the families no
    cell, row, column or table names (`graphic`, `paragraph`, `text`, `chart`), which kept drawings and notes
    name. XLSX's `workbook` children but `workbookPr` and `sheets`.
  - **Sheet**: ODF's `table:table` children but its columns and rows, each before or after them, and its attributes
    but `table:name` and `table:style-name`; XLSX's `worksheet` children but `dimension` and `sheetData`, and its
    `sheet` element's attributes but `name`, `sheetId` and `r:id`.
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

- A file over 100 MB, or one that inflates past 1 GB, or holds more than the workbook's limits
  ([Spreadsheet](spreadsheet.md#limits)), is refused with a named rejection (`package_too_large`, [Office packages](../020-import-export/office-packages.md#named-rejections)), or cut and said so
  where a part can be taken (rows past the limit).
- Every import guard of [Security](../../research/sheets-open-standard/security.md) is a test with a named
  rejection.

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
- **D104** Styles beyond the number format in an arriving file: Not kept; named by the read (`styles_unread`) until
  Formatting maps them (default).
- **D105** A repeated ODF cell's kept attributes and children: Kept on each of its cells up to 1,000 cells, else not
  kept and named (`kept_cut`) (default).
- **D106** Package entries left out of kept content: What the office packages drop (named, `entries_dropped`), and
  XLSX's `calcChain.xml` (default).
- **D107** References inside kept XML: Untouched; they name what they named in the file (default).
- **D108** Kept content of a Strict XLSX, and an XLSX element naming a relationship not kept: Not kept; named
  (`kept_unread`) (default).
- **D109** Kept content after a conversion: Stays with the workbook in its own format, left out of the other
  standard's files, written again once converted back (default).
- **D110** XLSX kept content naming styles: `dxfs` and `tableStyles` kept in the styles part; a kept `col`'s `style`
  left out (default).
- **D111** Kept package entries in a flat `.fods`: Left out, named (`parts_left`) (default).
