# Spreadsheet

**Status: specified; the model and the store are built** (plan 0020 Phases 4 and 5). `/new?kind=spreadsheet` makes
one (Sheet1, born `.ods`), in LiveDoc or This Browser; its sheet tab opens on a bare surface (title row with File ›
Open and Download, formula bar, grid, sheet bar showing who is on each sheet), and File › Open makes one from an
`.ods` or `.fods`. Its sheets are one workbook held to its limits, live for everyone, offline and copied whole; the
api adds, renames and deletes sheet tabs and saves settings ([Sheet store](sheet-store.md#changing-the-workbook)).
Until it ships, the [Plan Sheet](sheet.md) is what LiveDoc has; the overhaul retires it (plan 0020, "Phase 16: migrate
and retire").

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
- A spreadsheet's tabs are never shared with another document, nor another's into it (tab linking, [Tabs in many
  documents](../006-document/tab-document-many-to-many.md)): its sheets live in its own room, so the link is refused
  (`tab_not_linkable`); **Copy To** copies a sheet instead.
- The editor offers none of these: in a spreadsheet the canvas's add, duplicate, import-into-tab and copy-to-document
  actions say "A spreadsheet holds only sheets." and change nothing (default).
- Until Plan's Sheet tabs are migrated, a `sheet` tab is a spreadsheet's exactly when its document has a workbook
  row, and a Plan Sheet tab otherwise; only a spreadsheet refuses other kinds (default).
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

- **Add Sheet** adds `Sheet<n>` after the last sheet; **Insert** › **Sheet** (Shift+F11) adds it after the open
  sheet, as Google's does (D170); either opens it.
- **Duplicate** names the copy "Copy of <name>", or when that is taken "Copy of <name> 2" and up, by the sheet
  name's rules (default, D171); the copy holds the sheet's cells and its layout (sizes, hidden lines, groups,
  freeze, merges, filter, rules), not its named ranges, which are the workbook's and stay with the original
  ([Named ranges](sheet.md#named-ranges), D298), and opens.
- **Rename** (and a double-click on a tab, and Alt+1 on the open one) turns the tab into a field: Enter or leaving it
  saves, Escape keeps the name; a name the rules refuse says why and keeps the old one (default, D172).
- Renaming a sheet rewrites every formula that names it, as today ([Formulas](formulas.md#other-sheets)).
- **Delete** asks "Delete <name>?", saying every reference to it becomes `#REF!`; deleting the open sheet opens the
  sheet after it, else the one before (default, D173).
- Deleting a sheet makes every reference to it `#REF!`; Undo puts it back with its id.
- **Move Right** and **Move Left** move the sheet one place, dimmed at the end it cannot pass; a drag moves it to
  where it is let go (D176). `SHEET` and `SHEETS` count the sheets in the new order.
- **Change Colour** draws the tab's name on an underline in the colour picked; **Reset** takes the colour off. The
  colour and whether the sheet is hidden are the sheet's own, kept with its look and sent as its writes are; a
  duplicate keeps the colour (default, D177).
- **Hide Sheet** takes the tab out of the bar; the last sheet left to show is never hidden or deleted, by anyone.
  Hiding the open sheet opens the next sheet shown after it, else the one before; a sheet someone else hides while it
  is open stays open, its tab shown, until another sheet opens (default, D179).
- A hidden sheet is listed in **All Sheets**, dimmed with "Hidden"; picking it there, or in **View** ›
  **Hidden Sheets**, shows it again and opens it (default, D180). Its formulas and the formulas reading it work as
  ever, and the files keep it hidden.
- Hiding is tidiness, never protection: a Participant or a Viewer sees the hidden sheets listed, dimmed, and cannot
  open them, yet a download holds them (default, D178).
- **Move Right**, **Move Left**, Alt+Up and Alt+Down pass the hidden sheets: each steps to the next sheet shown
  (default, D181).
- **Copy To** › **New Spreadsheet** makes an untitled spreadsheet, in this one's format and settings, holding the
  sheet as "Copy of <name>"; **Existing Spreadsheet** opens a picker of the spreadsheets the person owns, newest
  first, with a search by name, and puts the copy last in the one picked, named by the sheet name's rules
  (default, D183).
- A copy holds the sheet's cells, formats and layout (sizes, hidden lines, groups, freeze, merges, filter, rules), not
  its named ranges or card tables, which belong to its spreadsheet; a formula naming another sheet keeps the name and
  reads the sheet of that name where it lands, `#REF!` while there is none, as Google's does (default, D184).
- A large sheet goes in parts, as a file opened does ([Files and print](files-and-print.md#a-file-sent-in-parts)); a
  part refused takes the half-made copy back out (or bins the new spreadsheet) and says the copy failed.
- Once copied, a dialog says so, with **Open Spreadsheet** opening it in a new browser tab (default, D185).
- Copy To is everyone's who may read the sheet: it changes nothing here, and a download carries the same; the copy
  lands only where the person may edit (default, D186).
- **Protect Sheet** waits for protected sheets and ranges ([Data tools](data-tools.md#protected-ranges), plan 0020
  Phase 10) and **View Comments** for comments (Phase 11): both stay in their places, dimmed.
- Each is one undo step on the person's one timeline ([Undo](grid-and-editing.md#undo)) and is sent live to everyone
  on the workbook: undoing an add or a duplicate deletes the sheet, kept, and redoing puts it back with its ids;
  undoing a delete puts the sheet back with its ids where it was; undoing a move puts it back after the sheet it
  followed; undoing a rename gives the old name back; undoing a colour, a hide or a show gives the sheet its look back.
- Only an Editor changes the sheets: Add Sheet shows for an Editor alone; a tab's menu opens for everyone, the items
  their role may not use dimmed, as the menu bar's are (default, D174).
- Telemetry: the kinds of change `AddSheet`, `DuplicateSheet`, `DeleteSheet`, `MoveSheet`, `SheetColour`,
  `HideSheet`, `ShowSheet` and `CopySheet` ([Telemetry](#telemetry)); a rename is `Title`.

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
- Cells are counted as Google counts them: the grid's rows times columns, summed over every sheet, filled or not
  (default). Adding rows, columns or a sheet past it is refused (`workbook_full`).
- Up to 1,000,000 rows over every sheet (Webber, 2026-11-18): rows are kept by id, about 62 MB of memory a million
  in a room of 128 MB (measured), so the grid's 20 million cells reach a million rows only one column wide. Adding a
  row past it is refused (`workbook_full`).
- Built: every sheet of a spreadsheet takes these limits, in the editor (the rows Add Rows, Insert and a paste may add
  are what the workbook has room for) and in the api (a write or a new sheet past them is refused by name, counted
  from the stored orders without reading them); a Plan Sheet keeps its own. Opening a file reads up to them too, and says what it cut
  ([Files and print](files-and-print.md#a-file-sent-in-parts)).
- A workbook stores up to 1 GiB of cells (default; `workbook_full`).
- A sheet's name breaking its rules is refused (`sheet_name_invalid`), one another sheet has (case aside) too
  (`sheet_name_taken`).
- A write past a limit is refused with a named rejection (`workbook_full`, `sheet_too_large`, `input_too_long`),
  and an import past one is cut and says so ([Sheet store](sheet-store.md#limits)).
- Budgets for load, typing, scrolling and recalculation at these sizes are set from the tracer bullet and held by
  tests ([Performance](performance.md)).

## Telemetry

The `Spreadsheet` category: `Created` (above), `Opened`, `Imported` and `Exported` with the format (`Ods`, `Fods`,
`Xlsx`, `Csv`, `Tsv`, `Pdf`, `Html`), `Changed` with the kind of change (the closed `SHEET_CHANGE_KINDS`, grown as
the area specs add kinds), `Converted` with the format it went to, `Used` with a function's name from the closed catalogue. Never content.
