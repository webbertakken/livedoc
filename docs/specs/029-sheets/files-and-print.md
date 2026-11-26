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
- Built for CSV and TSV: **File › Open** takes a `.csv`, `.tsv` or `.txt` as a new spreadsheet (Create New
  Spreadsheet; the other ways come with File › Import):
  - Its text is read as UTF-8 (a byte order mark or none), as UTF-16 when a byte order mark says so, else, when it
    is not UTF-8, as Windows-1252 (default, D117).
  - A `.csv` is split by the separator it was written with, by the rules of [Sheet](sheet.md#csv) (comma,
    semicolon or tab); a `.tsv` and a `.txt` by tabs (default, D117).
  - Its one sheet is named after the file and holds at least a new sheet's grid; each value is read as if typed in
    the workbook's locale, so numbers, dates, percentages and formulas are read as such
    (Convert Text to Numbers, Dates and Formulas on, as by default).
  - It is read up to the workbook's limits, each cut named in the read's losses, as any file's.
  - The spreadsheet is made in the format a new one is ([Spreadsheet](spreadsheet.md#making-a-spreadsheet)), with
    Google's meaning, as its formulas are typed (default, D117).
- Telemetry: `Spreadsheet · Imported · <Format>` with the location.

### A file sent in parts

- A file is read up to the workbook's limits ([Spreadsheet](spreadsheet.md#limits)): a sheet's rows and columns, the
  rows over every sheet, the grid's cells and 200 sheets; past them it is cut, each cut named in the read's losses
  (shown to the person in the [import report](#the-import-report)).
- The new spreadsheet is made with each sheet's first 1,000 rows and 26 columns and as many of its cells as one
  request of 4 MB carries; the rest follows in writes, in order: each sheet's other rows, its other columns, its
  cells, then the charts read from the file ([Charts in the file](standard-mapping.md#charts-in-the-file)) in one
  layout write once every cell they read is there, each write within a write's own limits (default, D86).
- Then what the file holds that the model does not, its kept content ([Standard
  mapping](standard-mapping.md#unknown-content)), up to its sizes (D113), in requests of its own (D114).
- While it is sent, the title row shows **Opening “<name>”… <n>%**, the share of rows, columns and cells sent.
- A part refused moves the half-made spreadsheet to the Bin and says the file could not be opened; nothing half-made is
  left in the Explorer.

### The import report

- A file opened that left anything behind opens its spreadsheet with the **import report**, a dialog titled
  **Opened “<name>”** saying "Some of what the file holds is not in the spreadsheet:", then one line a kind, counted,
  naming up to three sheets, cells, codes or parts, as the conversion dialog lists ([Converting](#converting)), and
  **OK** (default, D120).
- It is shown once, to the person who opened the file, on the spreadsheet the file made; nothing left behind is
  silent, and a file that left nothing behind opens without it.
- Its lines, in this order (default, D120):
  - **Sheets**: "3 sheets past the 200th are left out"; "1 chart sheet is left out: Chart1".
  - **Limits**: "1 sheet is cut to the spreadsheet's limits: Data"; "Cells past the first 2,000,000 are left out of
    1 sheet: Data" ([Limits](#limits)).
  - **Formulas**: "4 formulas LiveDoc cannot read keep only their last values: Data!B2, Data!B3 and Data!C9" (a
    reference to another workbook, a table's structured reference).
  - **Text**: "1 cell's text is cut to 50,000 characters".
  - **What may run**: "The file's macros are removed and never run"; "The file's digital signature is removed, as
    LiveDoc changes what it signed"; "2 embedded objects are left out".
  - **Kept content**: "3 things the file holds could not be kept"
    ([Standard mapping](standard-mapping.md#unknown-content)).
  - **Number formats**: "2 number formats LiveDoc cannot read are left out: Data!A1"; "1 number format is shown as
    near as LiveDoc can: [$-F800]dddd"; "Formats over long runs of empty cells are left out of 1 sheet: Data".
  - **Styles**: "Rotation, indents, patterned fills and other styling are left out of 2 sheets: Data and Totals".
  - **Format rules**: "1 conditional formatting rule LiveDoc cannot read is left out: Data!A2"
    ([Format rules in the file](standard-mapping.md#format-rules-in-the-file)).
  - **Validation rules**: "1 data validation rule LiveDoc cannot read is left out: Data!A2"
    ([Validation in the file](standard-mapping.md#validation-in-the-file)).
  - **Sizes**: "Row heights and column widths past the most a sheet holds are left out of 1 sheet: Data".
  - **Charts**: "Charts are left out of 1 sheet that keeps the file's own drawings: Data"
    ([Charts in the file](standard-mapping.md#charts-in-the-file)).
  - **Sheet names**: "2 sheet names are changed to fit: “Data” becomes “Data (2)”".
- A file's preview picture (its thumbnail) is not listed: it shows nothing in the sheet, and LiveDoc's files carry
  none.

### Import security

Every case of [Security](../../research/sheets-open-standard/security.md) is a test citing it
(`packages/sheets/src/files/import-security.test.ts`), each with its named rejection or its line in the import report:

- A file past 100 MB is refused before it is read (`package_too_large`); so is a package inflating past 200 MB or
  holding more than 5,000 entries. One entry's inflation ratio has no cap of its own: deflate's is at most 1,032 to 1,
  and the shared budget bounds what every entry inflates to (default, D122).
- A DOCTYPE is refused (`xml_doctype_refused`); no entity is ever resolved.
- Macros, scripts, signatures and embedded programs are dropped, never run and never written back, and listed.
- A text cell starting `=` stays text, never a formula; a CSV download writes it safe ([Sheet](sheet.md#csv)).
- A link opens only by an allowed scheme ([Formulas](formulas.md#functions)); a reference to another workbook keeps its
  last value, listed as a formula LiveDoc cannot read.
- However few bytes repeat them, a file makes at most 200 sheets (`sheets_cut`) and 2,000,000 cells (`cells_cut`);
  its names and other kept content stay within their sizes (`kept_too_large`, D113). Styles make no table in the
  model: each cell carries its own format, so a file's styles cost no more than its bytes and the cells they format.
- Fetching functions and regular expressions are guarded where they run ([Formulas](formulas.md)).

## Download

**File › Download**: Microsoft Excel (.xlsx), OpenDocument (.ods), Flat OpenDocument (.fods), PDF (.pdf), Web Page
(.html, zipped), Comma-Separated Values (.csv, the active sheet), Tab-Separated Values (.tsv, the active sheet).

- The workbook's own format downloads as it is; the other format is a **conversion** (below), listing its losses in
  the dialog before the download runs (**Download** and **Cancel**); the download is a converted copy, and the
  workbook keeps its own format.
- CSV and TSV are injection-safe, as today ([Sheet](sheet.md#csv)).
- Built for CSV and TSV: the open sheet's every row and column up to its last filled cell, each value as shown,
  written by the api (in this browser for a spreadsheet in This Browser) as `<spreadsheet> - <sheet>.csv` (or
  `.tsv`), UTF-8; a TSV is a CSV with tabs for commas, quoted the same way, so it reads back whole (default, D118).

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
  - **Formulas that may answer differently**: "2 formulas may answer differently in OpenDocument: CEILING and SORT",
    each formula calling a function the spreadsheet's meaning (Google's for one made in LiveDoc) and the new format's
    standard answer differently ([The file's meaning](formulas.md#function-catalogue), D100). Converting gives a
    spreadsheet with a file's meaning the new format's; one with Google's keeps it.
  - **Validation rules other apps hold more simply**: "3 data validation rules work more simply in Excel: option
    colours, chips and arrows, multiple selections and checkboxes", counted by rule, naming what is lost in this
    order; listed on every conversion and download to the other format, as both formats carry the same standard rule
    ([Validation in the file](standard-mapping.md#validation-in-the-file)). "in other apps" for OpenDocument.
  - **Kept from the file**: "4 things kept from the OpenDocument file stay behind: drawings, notes and named ranges",
    the kept content ([Standard mapping](standard-mapping.md#unknown-content)) counted by element, named by kind, the
    three most common first; it stays with the spreadsheet, and converting back writes it again (D109).
  - When there is none: "Everything in this spreadsheet fits the Excel format."
- While it checks, the dialog says **Checking what the .xlsx file can hold…** with **Convert** off; a check that fails
  says "This spreadsheet could not be checked. Try again." with **Try Again** and **Cancel**, and nothing changes.
- A conversion the api refuses or cannot reach closes the dialog and says "The spreadsheet could not be converted. Try
  again." in the title row; the format stays as it was.
- **Undo** converts back, and **Redo** again, without the dialog: nothing in LiveDoc changed but the format and its
  meaning, which undo restores with it, so the way back loses nothing.
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

A file up to 100 MB, read up to 2,000,000 cells (D121); the workbook's limits
([Spreadsheet](spreadsheet.md#limits)); a print up to 1,000 pages.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D86** How a file's sheets are sent: Made at a new sheet's grid with what fits one 4 MB request, the rest in writes
  (default).
- **D87** What converting changes: The file format alone; what the new format cannot hold stays in LiveDoc and is left
  out of each file written in it (default).
- **D88** How the conversion dialog lists its losses: One line a kind, counted, naming up to three sheets or functions
  (default).
- **D117** A CSV or TSV opened: UTF-8, UTF-16 by its byte order mark, else Windows-1252; a `.csv`'s separator
  detected, a `.tsv`'s and a `.txt`'s a tab; made in a new spreadsheet's format with Google's meaning (default).
- **D118** A CSV or TSV downloaded: The open sheet, named `<spreadsheet> - <sheet>` as Google names it; a TSV quoted
  as a CSV is (default).
- **D120** The import report: A dialog on the spreadsheet a file made, shown once, one line a kind, counted, naming
  up to three, in the order above; a file's thumbnail not listed (default).
- **D121** Cells one file makes: 2,000,000, the rest left out and listed (`cells_cut`); a file of two million repeated
  cells takes about 550 MB through the read, the sheets and their parts (measured in Node); safe range 1,000,000 to
  4,000,000 (default).
- **D122** One package entry's inflation ratio: No cap of its own; the shared byte budget bounds every entry
  (default).
