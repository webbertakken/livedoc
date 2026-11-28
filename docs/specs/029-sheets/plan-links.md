# Plan's links to a spreadsheet

**Status: specified; dashboards' figures and charts, the Spreadsheet slot and form responses are built.** A Sheet
Figure, Column Summary, Trend or Sheet Chart reads a sheet of a spreadsheet, a Spreadsheet slot shows one's first
sheet, and a form writes its responses into one; the `CARD` functions read the cards' document the settings name, in
the editor and in the api's downloads, links, views and pictures. Cards From in Settings and the starts are not built
yet.

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
  columns by id, the rows hidden and the sheet's one-cell named ranges (D505), and what draws it among those rows
  and columns: their sizes, merged cells, hidden columns, the grid and header switches and the charts reading only
  them (D507); none of its tools (protections, filters, validation, comments) and no images.
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
  same chart code; it is no longer a chart element on the dashboard tab: the **Sheet Chart from a spreadsheet** below.
- A Dashboard slot that showed a **Sheet tab** shows a spreadsheet's first sheet, read-only, with **Open** to go to it:
  the **Spreadsheet** slot below; the [migration](migration.md) re-points the slots that show a Sheet tab.

### The Sheet Chart from a spreadsheet

- **Choosing the chart**: Choose a Chart lists the document's own Sheets, then **Spreadsheets** as a figure's picker
  does; for a spreadsheet's sheet picked, **Its Charts** are the charts on that sheet, each its type and range
  ("Column Chart · A1:C6"; "No charts yet" when it has none), and **New Chart** takes a range typed as A1 on that
  sheet and a type, as for a Sheet of the document. Either fills the slot, one step, and closes the picker.
- **What it is** (D508): the slot's content `{ type: 'sheet-chart', documentId, sheetId }` with the chart's id
  (`chartId`) for one of the sheet's charts, or the range by ids and the type (`range`, `chartType`) for a new one;
  no element on the dashboard tab.
- **What it shows**: the chart drawn by the spreadsheet's own chart code (`sheetChartElement`, [Charts](charts.md)) at
  the slot's size, its data read from the sheet as a figure reads it (D505), so an edit to the cells, or to the
  chart itself in the spreadsheet (its type, range, palette, legend, titles), shows within 10 seconds.
- **Missing**: while it loads, "Loading the chart…"; a first read that fails, **Couldn’t load the chart.** with
  **Retry**; no access, too large, and a sheet deleted read as a figure's do; a chart deleted from the sheet, "This
  chart was deleted." with **Clear Slot**; a range whose cells were deleted draws the chart with no data.
- **Changing it**: the slot cog's **Change Chart** (an Editor's) opens Choose a Chart on the spreadsheet's sheet.
- **In an image export** the slot draws the chart the page last read, else "Loading the chart…".
- **Share roles**: as a Sheet Chart's: an Editor adds and changes it; a Participant and a Viewer see it.

### The Spreadsheet slot

- **Offered** as From a Sheet's fifth choice in Add to Slot, **Spreadsheet** ("A spreadsheet's first sheet,
  read-only."). It needs a sheet's room, as a Sheet tab's slot does (What fits), so a smaller slot leaves it out and
  names sheets in its line.
- **What it is**: the slot's content `{ type: 'spreadsheet', documentId }`, the spreadsheet's id (`''` until one is
  chosen); it names no sheet, so it follows whichever sheet is first (D507).
- **Choosing the spreadsheet**: a new one shows **Spreadsheet** over **Choose a Spreadsheet** (an Editor's; "Waiting
  for its spreadsheet." to anyone else), which opens the person's own spreadsheets as a figure's picker lists them
  (newest first, searched by name); picking one fills the slot, one step. **Change Spreadsheet** in the slot cog's
  Slot section (an Editor's) opens the same list.
- **What it shows**: a header with the spreadsheet's name and its first sheet's ("<Sheet> · <Spreadsheet>") and
  **Open**, which opens the spreadsheet in a new browser tab; under it the first visible sheet from A1 as a picture
  of its cells, formats, merged cells and charts, drawn by the same renderer as a spreadsheet's previews, scrolled
  inside the slot when larger (D507). Nothing in it is edited, selected or typed into; it is read again as a figure
  is (D505), so an edit in the spreadsheet shows within 10 seconds.
- **Missing**: while it loads, "Loading the sheet…"; a first read that fails, **Couldn’t load the sheet.** with
  **Retry**; a spreadsheet the reader may not open, or gone, "You don't have access to this spreadsheet."; one too
  large, "This spreadsheet is too large to read here."; one with no visible sheet, "This spreadsheet has no sheets
  to show." Each keeps Choose a Spreadsheet for an Editor.
- **In an image export** the slot draws the picture the page last read, else "Loading the sheet…".
- **Share roles**: an Editor chooses and changes the spreadsheet; a Participant and a Viewer read it and use Open
  (the spreadsheet then decides what they may do there).

## Form responses

- A form whose responses go to a sheet writes each response as a row of a sheet of a spreadsheet: **New Spreadsheet**
  (a spreadsheet "<Form> Responses" in the form's folder, its one sheet "Form Responses 1", as Google names it), or a
  sheet of a spreadsheet the Editor may edit, picked as a dashboard picks one ("<Sheet> · <Spreadsheet>").
- The form's destination keeps the spreadsheet's id beside the sheet's (`documentId` on `form.sheet`); a destination
  with none is a Sheet tab of the form's own document, as before, until the [migration](migration.md) moves it.
- **The connection** (D506): choosing a spreadsheet's sheet connects the form to it, made by an Editor who may edit
  both the form's document and the spreadsheet. The spreadsheet keeps it (the form's document, its Form tab and the
  sheet; at most 20 forms), as it keeps the spreadsheets its `IMPORTRANGE`s read, never on a copy. Choosing another
  destination takes the form's old connection back.
- Rows are appended as today ([Forms](../030-forms/forms.md)), by the api, in the spreadsheet's room, with the form's
  connection, never the responder's access nor anyone's at that moment: a response lands while the spreadsheet keeps a
  connection for that form and that sheet, and the sheet is there.
- A spreadsheet trashed or gone, its sheet deleted, or the connection taken back pauses the form as a broken
  destination does: "Its sheet was removed. Choose where responses go." The builder learns it by reading the sheet as
  a dashboard does, with the Editor's own access; a spreadsheet they may not open reads "You don't have access to this
  spreadsheet. Choose where responses go."
- **In the spreadsheet**: a sheet a form writes to wears a form mark on its sheet tab ("Takes responses from a form");
  its tab menu's **Unlink Form** (Editors) takes every connection to that sheet back, as Google's Unlink Form does, and
  the form pauses.
- The response count opens the spreadsheet in a new browser tab; the Inbox names the form alone, as the spreadsheet's
  name lives in its own room.
- The starters that answer into a sheet (Feedback, Event RSVP) and agents' forms still make a Sheet tab until Plan's
  starts move (below).

## The `CARD` functions

C6 (ruled 2026-11-18: functions only):

- `CARDCOUNT`, `CARDSUM`, `CARD` and `CARDS` stay ([Formulas](formulas.md#plan-cards)) and read the cards of the
  Plan document the spreadsheet names (a link an Editor sets in Settings), live; with none set they read `#REF!`
  ("Choose the cards' document in Settings"). A migrated spreadsheet names the document its Sheets came from.
- The cards' document is one of the workbook's [settings](settings.md) (**Cards From**), saved with them and kept by
  a copy of the spreadsheet: a copy reads the same cards, and each reader still reads them with their own access.
- The cards are read with the reader's own access, never the spreadsheet's share link: the Plan document's items, and
  its card types and its boards' column names (what State reads), from its plan. They are asked again every 10
  seconds while the spreadsheet is open and its page shown (D509); until the first answer the cells show
  **Loading…**. A reader who may not open the cards' document, or one since deleted, reads `#REF!` ("You don't have
  access to the cards' document"), never its cards.
- Outside the editor (exports, images, agents), they read the cards' document with the asker's own access.
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
- **D506** A form writes into a spreadsheet through a connection the spreadsheet keeps, made by an Editor of both, not
  by checking the form owner's access at each response: the owners may differ, a response is answered by no signed-in
  person, and the spreadsheet lists what writes into it (Google's linked form shows on its sheet, and Unlink Form
  ends it). Each response still checks the connection, its sheet and the spreadsheet.
- **D508** A Sheet Chart from a spreadsheet names the chart by its id rather than holding a copy, as Google's linked
  chart follows its source: a change to the chart in the spreadsheet shows on the dashboard, and the chart's look
  lives in one place. A new chart over a range keeps only its range and type, so it looks as a new chart of that type
  in the spreadsheet would. Its Charts lists the charts the link carries (those reading only the first 2,000 rows
  and 200 columns, D507).
- **D509** A spreadsheet asks the cards' document for its cards every 10 seconds while its page is shown, as a
  dashboard asks a linked sheet (D505): a page holds no socket to another document's room. An answer naming the same
  items' version, card types' version and column names as the last changes nothing, so no card function recalculates.
- **D507** The Spreadsheet slot names the spreadsheet alone and shows its first visible sheet, as the spec asks, so
  reordering the spreadsheet's tabs changes what it shows. It is a picture, not a grid: the pure renderer agents'
  previews use (`spreadsheetSheetImage`), on the light paper, from A1 up to 4,000 px each way (its bound), so the
  read-only view and a version's picture share one renderer and nothing in it can be edited. Images over cells show
  their alt text, as another document's images are not served to this page.
