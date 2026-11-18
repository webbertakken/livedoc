# Standard mapping

**Status: specified.** Nothing is built.

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
