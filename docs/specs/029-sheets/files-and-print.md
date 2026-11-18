# Files and print

**Status: specified.** Nothing is built.

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
- Files: `.ods`, `.fods`, `.xlsx`, `.xlsm` (macros kept, never run), `.xls` is refused ("Save it as .xlsx first",
  default), `.csv`, `.tsv`, `.txt` (as TSV).
- Every guard of [Security](../../research/sheets-open-standard/security.md) applies, each with its named rejection.
- Telemetry: `Spreadsheet · Imported · <Format>` with the location.

## Download

**File › Download**: Microsoft Excel (.xlsx), OpenDocument (.ods), Flat OpenDocument (.fods), PDF (.pdf), Web Page
(.html, zipped), Comma-Separated Values (.csv, the active sheet), Tab-Separated Values (.tsv, the active sheet).

- The workbook's own format downloads as it is; the other format is a **conversion** (below), listing its losses in
  the dialog before the download runs.
- CSV and TSV are injection-safe, as today ([Sheet](sheet.md#csv)).

## Converting

- **File › Convert to Excel (.xlsx)** or **Convert to OpenDocument (.ods)**: changes the workbook's file format, one
  undo step, after a dialog listing what the other format cannot hold ("3 filter views will be dropped") with
  **Convert** and **Cancel**. Nothing is lost silently.

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
