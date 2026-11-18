# Spreadsheet

**Status: specified.** Nothing is built. Until it ships, the [Plan Sheet](sheet.md) is what LiveDoc has; the
overhaul retires it (plan 0020, "Phase 16: migrate and retire").

A **spreadsheet** is a document type of its own: a workbook of sheets, native to both ISO spreadsheet standards,
OpenDocument 1.4 and Office Open XML (C1, ruled 2026-11-18; [Standard mapping](standard-mapping.md)), that looks
and works as Google Sheets does ([Parity matrix](parity-matrix.md)). It is no longer a part of Plan: no Plan tab, palette or board is needed to make,
open or work one.

## Domain language

| Term                                                       | Means                                                                                                    | Never called                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **spreadsheet**                                            | A document whose tabs are all sheet tabs: one workbook                                                   | table, workbook tab           |
| **workbook**                                               | What a spreadsheet holds: its sheets in order, named ranges and functions, styles, settings, file format | sheet store, file             |
| **sheet**                                                  | One grid of a workbook, with its name, rows, columns and cells; it is one tab of the spreadsheet         | worksheet, page               |
| **sheet tab**                                              | A tab of kind `sheet` (`TabKind`) in a spreadsheet: one sheet, outside the canvas, worked on in no mode  | workbook tab, spreadsheet tab |
| **sheet bar**                                              | How a spreadsheet draws its tab strip: at the foot of the grid, as Google Sheets' sheet bar              | sheet strip                   |
| **cell**                                                   | One square of a sheet, named by column letters and row number (`B4`)                                     | field, box                    |
| **input**, **value**, **format**, **range**, **selection** | As in [Sheet](sheet.md#domain-language)                                                                  |                               |
| **file**                                                   | The workbook as bytes in a standard format: `.ods`, `.fods`, `.xlsx`, `.csv`, `.tsv`                     | export (that is the act)      |
| **file format**                                            | Which native format a workbook keeps: ODF (`.ods`, or flat `.fods`) or XLSX                              | type, kind, format (a cell's) |

- A sheet tab is a **kind** ([Domain language](../003-system-architecture/domain-language.md#kind)), never a mode:
  it has no editor mode, elements or layers, as a markdown or file tab has none.
- Plan's **Sheet tab** (the kind `sheet` today, a Plan Sheet filling a Plan tab) is migrated into spreadsheets before
  the kind takes this meaning ([Migration](migration.md)); the two meanings never coexist in stored data.

## The workbook shape

Each sheet is a tab of the document, and a document that holds sheets holds only sheets (S1, ruled 2026-11-18;
[Workbook shape](../../research/sheets-open-standard/workbook-shape.md)).

- A spreadsheet's tabs are its sheets, in the document's tab order. One spreadsheet is one workbook is one file, both
  ways. There are no tabs inside tabs.
- A spreadsheet holds no tab of another kind, and no other document holds a sheet tab: adding one is refused
  (`tab_kind_mixed`), and a paste or an agent's changeset that would mix them is refused with the same rejection.
- The document's tab strip is drawn as the **sheet bar** at the foot of the grid ([Surface](surface.md#sheet-bar)),
  never at the top, even with one sheet; tab folders are not offered in a spreadsheet.
- References between sheets are references between the document's tabs. A reference to another spreadsheet is
  `IMPORTRANGE` ([Formulas](formulas.md#other-workbooks)).
- A share link to a spreadsheet covers the whole workbook: a tab-scoped link is not offered on a sheet tab, since a
  sheet's formulas read other sheets the visitor could not see.
- What belongs to the workbook rather than one sheet lives on the document: the **workbook row** in its room
  ([Sheet store](sheet-store.md#in-a-spreadsheet)).
- A diagram and the sheet it goes with (a template's companion sheet) are two documents, linked
  ([Templates](templates.md)).

## What a workbook holds

- **Sheets**, in tab order: each its name (the tab's name: 1 to 100 characters, unique in the workbook, never `'` at
  either end, none of `[ ] * ? / \ :`), tab colour (the tab's accent), hidden flag, protection, right-to-left flag,
  grid (rows and columns by id, sizes, hidden lines, groups, frozen lines), cells, merges, filters, filter views,
  slicers, validation and format rules, banding, tables, charts, pivot tables, images and drawings.
- **Named ranges** and **named functions** of the workbook.
- **Styles**: the workbook's cell styles, number formats and theme ([Formatting](formatting.md)).
- **Settings**: locale, time zone, recalculation (on change, on change and every minute, on change and every hour),
  iterative calculation (on or off, most iterations 1 to 1,000, threshold) ([Settings](settings.md)).
- **Its file format**: the one it arrived in, or ODF for one made here, kept until a person converts it
  ([Files and print](files-and-print.md#converting)).
- **What the file carried that LiveDoc does not model**, kept and written back untouched to that format
  ([Standard mapping](standard-mapping.md#unknown-content)).

## Making a spreadsheet

- **New**, in the Explorer's new document menu and on Home: **Spreadsheet** makes a document with one sheet tab,
  **Sheet1**, 1,000 rows by 26 columns, as Google Sheets starts (default), and opens it with A1 selected. It is born
  in ODF 1.4, `.ods` (C5, ruled 2026-11-18): no setting chooses otherwise; converting is how one becomes XLSX.
- **From a template**: the spreadsheet templates ([Templates](templates.md)) make a spreadsheet already filled.
- **Open a file**: an `.ods`, `.fods`, `.xlsx`, `.csv` or `.tsv` dropped on the Explorer or picked in its Import
  makes a spreadsheet of it ([Files and print](files-and-print.md)). An `.ods`, `.fods` or `.xlsx` keeps its file
  format; a `.csv` or `.tsv`, which holds one sheet of values, is born in ODF (C5).
- Telemetry: `Spreadsheet · Created · <From>` (`Blank`, `Template`, `Import`).

## Sheets in the sheet bar

The sheet bar is Google Sheets' own ([Surface](surface.md#sheet-bar)). **Add Sheet** (+) adds a sheet tab; a sheet
tab's menu holds:

| Item                                                        | Does                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Delete**                                                  | Removes the sheet, asked first; never the last visible sheet                           |
| **Duplicate**                                               | Adds "Copy of <name>" after it, with everything it holds                               |
| **Copy To** › **New Spreadsheet**, **Existing Spreadsheet** | Copies it into a new spreadsheet, or one the person may edit (a picker of documents)   |
| **Rename**                                                  | Edits the name in place                                                                |
| **Change Colour**                                           | The one [colour picker](../004-interface-design/colour-picker.md), and **Reset**       |
| **Protect Sheet**                                           | Opens Protected Sheets and Ranges on it ([Data tools](data-tools.md#protected-ranges)) |
| **Hide Sheet**                                              | Hides it; never the last visible one; **View** › **Hidden Sheets** shows it again      |
| **View Comments**                                           | Opens the comments of that sheet                                                       |
| **Move Right**, **Move Left**                               | Reorders it; dragging a tab does the same                                              |

- Renaming a sheet rewrites every formula that names it, as today ([Formulas](formulas.md#other-sheets)).
- Deleting a sheet makes every reference to it `#REF!`; Undo puts it back with its id.
- Each is one undo step and is sent live to everyone on the workbook.

## Plan's Sheet tab becomes a spreadsheet

C4 (ruled 2026-11-18: keep them): what Plan reads from a sheet is kept and re-homed onto the spreadsheet.

- A Plan **Sheet tab** becomes a **sheet tab** of a spreadsheet, named as the tab was ([Migration](migration.md)
  says which spreadsheet). Its formulas, formats,
  validation, format rules, comments and charts carry over ([Migration](migration.md)).
- A Dashboard slot and a form's responses that read a Sheet read the same sheet of the workbook, in this document
  or another one the reader may open ([Plan's links](plan-links.md)).
- The `CARD` functions are kept and re-homed the same way; the two-way card table is removed (C6, ruled
  2026-11-18: functions only), its stored rows left as the plain cells they last showed (S3, ruled 2026-11-18).

## Who may do what

Share roles as every feature decides them ([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)):

| Role            | May                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Everything: cells, formats, sheets, rules, charts, pivots, protection, settings, imports                                                          |
| **Participant** | Write values into unprotected cells (typing, pasting values, ticking, picking from a dropdown), comment; never formats, sheets, rules or settings |
| **Viewer**      | Read, select, copy, find, filter views of their own, download, comment where the link allows                                                      |

- A protected range or sheet narrows these further for everyone not named on it, as Google's protection does.

## Left out

Scripting, macros, add-ons, any assistant, smart chips and Google's own services (`GOOGLEFINANCE`,
`GOOGLETRANSLATE`, data connectors, AppSheet) are left out (C3, ruled 2026-11-18); each has its parity row. What an
arriving file holds of them (a macro, a chip, such a formula) is kept and written back, never run: a formula keeps
its text and shows its cached value.

## Limits

- Up to 20 million cells in a workbook (S7, ruled 2026-11-18; Google's own figure, [Inventory](../../research/sheets-open-standard/google-sheets-inventory.md#limits)),
  18,278 columns (A to ZZZ) and 200 sheets; a cell's input up to 50,000 characters.
- A write past a limit is refused with a named rejection (`workbook_full`, `sheet_too_large`, `input_too_long`),
  and an import past one is cut and says so ([Sheet store](sheet-store.md#limits)).
- Budgets for load, typing, scrolling and recalculation at these sizes are set from the tracer bullet and held by
  tests ([Performance](performance.md)).

## Telemetry

The `Spreadsheet` category: `Created` (above), `Opened`, `Imported` and `Exported` with the format (`Ods`, `Fods`,
`Xlsx`, `Csv`, `Tsv`, `Pdf`, `Html`), `Changed` with the kind of change (the closed `SHEET_CHANGE_KINDS`, grown as
the area specs add kinds), `Converted` with the format it went to, `Used` with a function's name from the closed catalogue. Never content.
