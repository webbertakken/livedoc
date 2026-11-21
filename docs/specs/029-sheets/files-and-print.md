# Files and print

**Status: partly built.** File › Open, Download in `.ods`, `.fods` and `.xlsx`, and Convert; the rest is
specified.

How a [spreadsheet](spreadsheet.md) comes in, goes out, is printed, copied, shared and synced: Google Sheets' File
menu on LiveDoc's own sharing. Both native formats are equals (C1, ruled 2026-11-18): a workbook keeps the file
format it arrived in ([Standard mapping](standard-mapping.md)).

## Import

**File › Import** (and a file dropped on the grid): a file from the device or a LiveDoc document's file, then:

| Import location                   | Does                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| **Create New Spreadsheet**        | A new spreadsheet of the file, keeping its file format     |
| **Insert New Sheet(s)**           | Its sheets added after the active one                      |
| **Replace Spreadsheet**           | Every sheet replaced; the workbook takes the file's format |
| **Replace Current Sheet**         | The active sheet replaced by the file's first              |
| **Append to Current Sheet**       | Its rows under the last filled row                         |
| **Replace Data at Selected Cell** | Its cells written from the active cell                     |

- CSV and TSV add **Separator Type** (Detect Automatically, Tab, Comma, Custom) and **Convert Text to Numbers, Dates
  and Formulas** (on by default); encoding detected (UTF-8, UTF-16 with a byte order mark, else Windows-1252).
- Files: `.ods`, `.fods`, `.xlsx`, `.xlsm` (an XLSX workbook, its macros dropped and reported, never run:
  [D85](standard-mapping.md#defaults)), `.xls` is refused ("Save it as .xlsx first", default), `.csv`, `.tsv`, `.txt`
  (as TSV).
- Every guard of [Security](../../research/sheets-open-standard/security.md) applies, each with its named rejection.
- Telemetry: `Spreadsheet · Imported · <Format>` with the location.

### A file sent in parts

- A file is read up to the workbook's limits ([Spreadsheet](spreadsheet.md#limits)): a sheet's rows and columns, the
  rows over every sheet, the grid's cells and 200 sheets; past them it is cut, each cut named in the read's losses
  (shown to the person with the import report, a later step of plan 0020 Phase 7).
- The new spreadsheet is made with each sheet's first 1,000 rows and 26 columns and as many of its cells as one
  request of 4 MB carries; the rest follows in writes, in order: each sheet's other rows, its other columns, then its
  cells, each write within a write's own limits (default, D86).
- While it is sent, the title row shows **Opening “<name>”… <n>%**, the share of rows, columns and cells sent.
- A part refused moves the half-made spreadsheet to the Bin and says the file could not be opened; nothing half-made is
  left in the Explorer.

## Download

**File › Download**: Microsoft Excel (.xlsx), OpenDocument (.ods), Flat OpenDocument (.fods), PDF (.pdf), Web Page
(.html, zipped), Comma-Separated Values (.csv, the active sheet), Tab-Separated Values (.tsv, the active sheet).

- The workbook's own format downloads as it is; the other format is a **conversion** (below), listing its losses in
  the dialog before the download runs (**Download** and **Cancel**); the download is a converted copy, and the
  workbook keeps its own format.
- CSV and TSV are injection-safe, as today ([Sheet](sheet.md#csv)).

## Converting

- **File › Convert to Excel (.xlsx)** or **Convert to OpenDocument (.ods)**: changes the workbook's file format, one
  undo step, after a dialog listing what the other format cannot hold ("3 filter views will be dropped") with
  **Convert** and **Cancel**. Nothing is lost silently.
- Converting changes the file format alone: the sheets, their names, cells and formulas stay as they are in LiveDoc,
  and what the new format cannot hold is what each file written in it leaves out (default, D87). What the old file
  carried that LiveDoc does not model is left behind ([Standard mapping](standard-mapping.md#unknown-content)).
- The dialog, **Convert to Excel?** (or **Download as Excel?**, and the same for OpenDocument), lists what the new
  format's file cannot hold that the old one could, one line a kind, counted, with up to three names
  (default, D88):
  - **Sheet names**: "2 sheet names are cut to Excel's 31 characters: “Quarterly results for the northern…” becomes
    “Quarterly results for the north”".
  - **Formulas other apps cannot calculate**: "3 formulas keep only their last values in Excel, which has no
    EUROCONVERT or EASTERSUNDAY"; a formula Excel's grammar cannot hold for another reason says so without names.
  - **Formulas written as values**: "2 formulas are written as their values only" (a spilled range, an intersection or
    a union in OpenDocument; a formula past Excel's 8,192 characters).
  - **Text**: "1 cell's text is cut to Excel's 32,767 characters".
  - **Columns**: "Columns past XFD are left out of 1 sheet: Wide" (Excel's last column; a workbook reaches ZZZ).
  - When there is none: "Everything in this spreadsheet fits the Excel format."
- While it checks, the dialog says **Checking what the .xlsx file can hold…** with **Convert** off; a check that fails
  says "This spreadsheet could not be checked. Try again." with **Try Again** and **Cancel**, and nothing changes.
- A conversion the api refuses or cannot reach closes the dialog and says "The spreadsheet could not be converted. Try
  again." in the title row; the format stays as it was.
- **Undo** converts back, and **Redo** again, without the dialog: nothing in LiveDoc changed, so the way back loses
  nothing.
- Everyone on the spreadsheet sees its new format at once, in the title row's pill.
- Telemetry: `Spreadsheet · Converted · <Format>` (`Xlsx`, `Ods`), the format it went to.

## Print

**File › Print** (Ctrl+P) opens the print settings view over the grid, as Google's:

- Print: Current Sheet, Workbook, Selected Cells; Paper Size (Letter, A4, …, custom); Page Orientation; Scale
  (Normal 100%, Fit to Width, Fit to Height, Fit to Page, Custom Number); Margins (Normal, Narrow, Wide, Custom);
  **Set Custom Page Breaks** (drag the breaks); Formatting (Show Gridlines, Show Notes, Page Order, Alignment);
  Headers and Footers (page numbers, title, sheet name, date, time, custom fields); repeated frozen rows and columns.
- **Next** prints through the browser's print to a page made for it (a print view with `@page` rules), which is also
  how PDF downloads are made.
- Print settings are kept per sheet in the workbook, and in both formats where they hold them.

## Copies, sharing and publishing

- **File › Make a Copy**: a name, a folder, Share With the Same People, Copy Comments; a new spreadsheet in the same
  file format.
- **Share** is LiveDoc's share dialog; **Publish to the Web** is LiveDoc's public link to a read-only view of the
  workbook or one sheet, and an embed; neither names Google.
- **Rename**, **Move to Bin**, **Details**, **Make Available Offline** are the Explorer's and offline mode's own.

## Repositories

- A repository link at the `files` level writes a spreadsheet as its native file ([Native files](../027-repositories/native-files.md)):
  an ODF workbook as `.fods` where the link asks for diffs (default), else `.ods`; an XLSX workbook as `.xlsx`.
- A changed file in the repository folds back as a changeset to the workbook, cell by cell.
- The CLI's `livedoc` commands read and write them ([Agents](sheet-store.md#agents)).

## Who may do what

- **Import**, **Convert**, print settings: Editors. **Download**, **Print**, **Make a Copy**: anyone who may read,
  unless the share link turns off downloading, printing and copying for Viewers (LiveDoc's sharing setting).

## Limits

A file up to 100 MB; the workbook's limits ([Spreadsheet](spreadsheet.md#limits)); a print up to 1,000 pages.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D86** How a file's sheets are sent: Made at a new sheet's grid with what fits one 4 MB request, the rest in writes
  (default).
- **D87** What converting changes: The file format alone; what the new format cannot hold stays in LiveDoc and is left
  out of each file written in it (default).
- **D88** How the conversion dialog lists its losses: One line a kind, counted, naming up to three sheets or functions
  (default).
