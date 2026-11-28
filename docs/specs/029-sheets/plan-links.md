# Plan's links to a spreadsheet

**Status: specified; dashboards' figures are built.** A Sheet Figure, Column Summary or Trend reads a sheet of a
spreadsheet; the Sheet Chart, the sheet slot, form responses, the `CARD` functions and the starts are not built yet.

What Plan reads from or writes to a sheet, re-homed onto the [spreadsheet](spreadsheet.md) (C4, ruled 2026-11-18:
keep them; C6, ruled 2026-11-18: the card functions only).

## Reading a sheet from another document

- Every link below names a **sheet** by the spreadsheet and the sheet's id, and its cells by row and
  column ids, as today's links name a Sheet by its sheet id ([Plan tabs](../026-plan/plan-tabs.md#figures-from-a-sheet)).
- The spreadsheet is always another document than the dashboard's or form's (a document holding sheets holds only
  sheets); the
  reader's own access decides: a reader who may not open that spreadsheet sees "You don't have access to this
  spreadsheet" in place of the figure or chart, never its values.
- Values are worked out by the same engine, in the spreadsheet's room, with the reader's own access:
  `GET /api/documents/<id>/workbook/link?sheet=<sheetId>` answers the workbook's sheets (each its id and name), its
  locale and version, and the sheet as its values: each cell's value where its formula was, its format, its rows and
  columns by id, the rows hidden and the sheet's one-cell named ranges, nothing else of the sheet (D505).
- The page reads a link again every 10 seconds while it shows it and the page is visible, naming the version it holds
  (`since=<version>`); an unchanged workbook answers `unchanged` without working anything out (D505).
- A link reads the first 2,000 rows and 200 columns of a sheet, as much as a figure reads; a workbook past 500,000
  cells, as `IMPORTRANGE`'s bound, reads "This spreadsheet is too large to read here." (D505).
- A spreadsheet that is not there, is trashed, is only in someone's browser, or the reader may not open, reads alike,
  so a link never tells which; a spreadsheet's own links are never read through a tab-scoped share link.
- A source sheet deleted, or its cell's row or column deleted, reads as today ("This sheet was deleted.", "The cell
  it read was deleted.").

## Dashboards

- **Sheet Figure**, **Column Summary**, **Trend** and **Sheet Chart** keep their behaviour; their source picker lists
  the document's own Sheets (until they are migrated), then **Spreadsheets**: the person's own spreadsheets as Copy
  To lists them (newest first, searched by name, D183). Picking one lists its sheets, each "<Sheet> · <Spreadsheet>";
  picking a sheet goes on as for a Sheet of the document (D505).
- A figure from a spreadsheet keeps the spreadsheet's id beside the sheet's (`documentId` on the slot's content); a
  figure with none reads a Sheet of the dashboard's own document, as before.
- Its picture in an image export shows the figure the page last read, else "Loading the sheet…".
- A **Sheet Chart** slot shows a chart of the workbook ([Charts](charts.md)) or a new chart over a range, drawn by the
  same chart code; it is no longer a chart element on the dashboard tab.
- A Dashboard slot that showed a **Sheet tab** shows a spreadsheet's first sheet, read-only, with **Open** to go to it.

## Form responses

- A form whose responses go to a sheet writes each response as a row of a sheet of a workbook: **New Spreadsheet**
  (the starter's choice: a spreadsheet "<Form> Responses" in the form's folder), or a sheet of a spreadsheet the Editor may edit.
- Rows are appended as today ([Forms](../030-forms/forms.md)), by the api with the form's access, never the
  responder's.

## The `CARD` functions

C6 (ruled 2026-11-18: functions only):

- `CARDCOUNT`, `CARDSUM`, `CARD` and `CARDS` stay ([Formulas](formulas.md#plan-cards)) and read the cards of the
  Plan document the spreadsheet names (a link an Editor sets in Settings), live; with none set they read `#REF!`
  ("Choose the cards' document in Settings"). A migrated spreadsheet names the document its Sheets came from.
- In a file each is written by S5's convention with its cached value, in both formats, so other applications show
  the last value and LiveDoc reads it live again on return.
- The **card table** is removed: its links, drafts, Save Card and Cancel Changes, the Controls column, Open Card,
  and the Plan Cards start of Setup Sheet. No file format knows a card table, and a file that leaves and returns
  edited could trash cards. Stored tables are handled by the [migration](migration.md).

## Starts and tours

- Start Planning's **Spreadsheet** tile makes a new spreadsheet ([Templates](templates.md)) and links it from the Plan document, not a Sheet tab.
- The Plan tour's Spreadsheets track moves to a spreadsheet tour of its own, run in a spreadsheet.

## Who may do what

As each link's own spec says; reading across documents never widens anyone's access.

## Defaults

- **D505** Reading a spreadsheet's sheet from a dashboard: its values, formats and rows and columns by id, worked out
  in the spreadsheet's room and read again every 10 seconds while shown (a page holds no socket to another document's
  room; Google's linked charts refresh on asking), bounded by a figure's 2,000 rows, 200 columns and
  `IMPORTRANGE`'s 500,000 cells. The picker lists the person's own spreadsheets, as Copy To does, since the api
  lists no document by when the person last opened it.
