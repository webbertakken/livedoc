# Standard mapping

**Status: partly built.** Both formats read and write sheets, cells, formulas and arrays (`@livedoc/sheets/files`);
styles, number formats, unknown content and the other rows of the table below are ahead.

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
  (1,048,576 and 16,384, `XFD`), and read back as that range.

### Excel's grammar in detail

- A function Excel added after 2007 carries Excel's prefix: `_xlfn.` for each name of MS-XLSX §2.2.2's future
  function list and of Excel's dynamic arrays, `_xlfn._xlws.` for `FILTER` and `SORT`; the list is XlsxWriter's
  record of both ([Working with formulas](https://xlsxwriter.readthedocs.io/working_with_formulas.html)).
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

## Unknown content

- Whatever a file holds that the model does not (a macro library, an embedded object, a format's own setting, a
  smart chip, a filter view in XLSX that only ODF could hold) is kept with the workbook as the file's own XML, by
  where it sat, and written back untouched to the same format.
- Kept content whose anchor is gone (its sheet deleted, its cells cleared) is dropped at the next write, and the
  write's report says so; nothing is dropped silently.
- Converting to the other format carries only what the model holds; the conversion lists what it leaves behind
  before it runs ([Files and print](files-and-print.md#converting)).

## Conformance claimed

- **ODF**: every `.ods` and `.fods` written is a conforming OpenDocument 1.4 spreadsheet document, valid against the
  Part 3 RELAX NG schema (extended conformance where `calcext:` and `loext:` content is kept), checked in CI.
- **OpenFormula**: an evaluator of the **Small** group to start, the **Large** group as the definition of done
  (OpenFormula Part 4 §2.3), measured by the oracle corpus ([Formulas](formulas.md#the-oracle)).
- **XLSX**: every `.xlsx` written validates against ECMA-376 Transitional's schemas, checked in CI, and opens in
  Excel, LibreOffice and Google Sheets with the same values.

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
