# Plan's links to a spreadsheet

**Status: specified.** Nothing is built.

What Plan reads from or writes to a sheet, re-homed onto the [spreadsheet](spreadsheet.md) (C4, ruled 2026-11-18:
keep them; card tables are C6, default kept).

## Reading a sheet from another document

- Every link below names a **sheet** by the document, the workbook tab and the sheet's id, and its cells by row and
  column ids, as today's links name a Sheet by its sheet id ([Plan tabs](../026-plan/plan-tabs.md#figures-from-a-sheet)).
- The workbook may be in the same document (a workbook tab beside Plan tabs) or in another; across documents the
  reader's own access decides: a reader who may not open that spreadsheet sees "You don't have access to this
  spreadsheet" in place of the figure or chart, never its values.
- Values are worked out by the same engine; across documents they are read through the api, which works them out
  with the reader's access, and pushed when the source changes, at most once a second per link.
- A source sheet deleted, or its cell's row or column deleted, reads as today ("This sheet was deleted.", "The cell
  it read was deleted.").

## Dashboards

- **Sheet Figure**, **Column Summary**, **Trend** and **Sheet Chart** keep their behaviour; their source picker lists
  the document's workbook tabs' sheets and **Another Spreadsheet…** (a picker of the spreadsheets the person may
  open), each sheet named "<Sheet> · <Spreadsheet>".
- A **Sheet Chart** slot shows a chart of the workbook ([Charts](charts.md)) or a new chart over a range, drawn by the
  same chart code; it is no longer a chart element on the dashboard tab.
- A Dashboard slot showing a **Sheet tab** shows the workbook tab's active sheet, read-only, with **Open** to go to it.

## Form responses

- A form whose responses go to a sheet writes each response as a row of a sheet of a workbook: **New Spreadsheet**
  (the starter's choice: a spreadsheet "<Form> Responses" in the form's folder), a **workbook tab** "<Form>
  Responses" in the form's document, or a sheet of a spreadsheet the Editor may edit.
- Rows are appended as today ([Forms](../030-forms/forms.md)), by the api with the form's access, never the
  responder's.

## Card tables and the `CARD` functions

C6 (default: kept): a card table links rows of a sheet to cards of **one document's** item store, named on the
table; a workbook tab in the same document links its own cards as today, and a spreadsheet links another
document's cards with an Editor's access to both. `CARD`, `CARDS`, `CARDCOUNT` and `CARDSUM` read the linked
document's items. No card table code is written before C6 is ruled.

## Starts and tours

- Start Planning's **Spreadsheet** tile makes a workbook tab ([Templates](templates.md)), not a Sheet tab.
- The Plan tour's Spreadsheets track moves to a spreadsheet tour of its own, run in a spreadsheet.

## Who may do what

As each link's own spec says; reading across documents never widens anyone's access.
