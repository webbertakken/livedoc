# Grid and editing

**Status: partly built.** The grid at scale (headers, gridlines, frozen panes, zoom, the accessible mirror) is built.

The grid of a [spreadsheet](spreadsheet.md) and how cells are selected, typed into, filled, moved and copied, as
Google Sheets does. What the Plan Sheet already does carries over unless this page says otherwise
([Sheet](sheet.md#the-grid)); its rows of the [parity matrix](parity-matrix.md) name this page.

## The grid

- A new sheet is 1,000 rows by 26 columns; columns 100 px, rows 21 px, text 10 points in the workbook's default font
  (Google's defaults).
- Column letters run A to ZZZ (18,278); rows to the workbook's limit ([Spreadsheet](spreadsheet.md#limits)).
- Only the cells in view are drawn; positions come from prefix sums of sizes, so a jump to row 1,000,000 costs no
  more than to row 100 ([Grid research](../../research/sheets-open-standard/grid.md)). Finding the line under a point
  is a search of those sums, never a walk of every line.
- A sheet taller or wider than the scroll room (default, D134) scrolls through it in proportion: the scroll bar
  stands for the whole sheet, under every browser's ceiling on an element's size, while panning, a drag at the edge
  and bringing the active cell into view move the cells by the pixels asked.
- Column letters are 24 px tall and row numbers 46 px wide, as Google's (measured on the reference capture).
- Below the last row: **Add [1000] More Rows at the Bottom**, the number editable, as Google's.
- Text runs over empty neighbours (left-aligned to the right, right-aligned to the left, centred both ways) unless
  it wraps or clips; numbers never run over: fewer decimals first, then scientific, then `#####`, as today.
- Frozen rows and columns: dragged by the thick bars at the top-left corner, or View › Freeze; up to the rows and
  columns that leave a third of the grid to scroll, and never past 100 rows and 26 columns
  ([Sheet](sheet.md#freeze), D16). A pick or a drag past either freezes as many as fit; before the grid has a size,
  only the fixed limits hold.
- Gridlines and formulas: View › Show › Gridlines, Formulas (Ctrl+`), Protected Ranges (hatched), Formula Bar.
- Zoom: 50% to 200%, the person's own, never saved.

## Selection

- A click selects a cell; Shift and a click or a drag a range; Ctrl and a click or drag adds a range; a header click
  a row or column; the corner, or Ctrl+A, the sheet (a second Ctrl+A in a data region widens from region to sheet).
- Ctrl+Space a column, Shift+Space a row; Shift and the arrows grow it; Ctrl+Shift and the arrows grow it to the
  data's edge.
- The active cell has a 2 px blue border, the range a light tint and a 1 px border, the fill handle a 6 px square at
  its bottom right; headers it crosses are tinted.
- A person's selection is shown to others in their colour with their name ([Collaboration](#collaboration)).

## Moving around

Every navigation shortcut of the matrix: arrows; Ctrl and the arrows to a region's edge; Home, End, Ctrl+Home,
Ctrl+End; Page Up and Page Down; Alt+Page Up and Page Down a screen sideways; Ctrl+Page Up and Page Down, or
Alt+Up and Down, to the previous and next sheet; Ctrl+Backspace back to the active cell; Tab and Enter move within a
selection without losing it.

## Editing

- Typing replaces the cell; Enter, F2 or a double-click edits it in place; the formula bar edits it too.
- Enter saves and moves down (Shift+Enter up), Tab right (Shift+Tab left); Escape gives it up; Alt+Enter (Ctrl+Enter
  on a Mac) adds a line break; Ctrl+Enter with a range selected fills the range.
- Inputs are read as today ([Formulas](formulas.md#what-a-typed-input-becomes)), in the workbook's locale
  ([Settings](settings.md)).
- **Autocomplete** offers the column's earlier texts while typing (Tools › Suggestion Controls).

### Formulas

- `=` starts a formula. While typing: each reference and its range share a colour; clicking or arrowing in the grid
  inserts a reference (point mode) at the caret; F4 cycles `$` anchors; the function help card shows (F1 hides it);
  names autocomplete (Tab or Enter takes one).
- Ctrl+Shift+Enter wraps the formula in `ARRAYFORMULA`.
- A formula that cannot be read is not saved: the cell keeps the edit open with the error under it ("There was a
  problem: missing `)`"), as Google's.
- Ctrl+` shows every formula instead of its value.

## Fill and move

- **Fill handle**: dragging it copies the cells, or continues a series (numbers by their step, dates by day, month
  or year, `Item 1` → `Item 2`, weekday and month names); Ctrl while dragging switches between copy and series.
- Ctrl+D fills down, Ctrl+R right, Ctrl+Enter the range.
- **Smart Fill**: when a column's typed values follow a pattern of a neighbour, the grid offers to fill the rest
  (Ctrl+Enter accepts; a grey preview first).
- Dragging a selection's border moves its cells (references to them follow); Ctrl while dropping copies.

## Clipboard

- Cut, copy and paste within and between spreadsheets keep inputs, formats, validation and format rules; references
  shift as Google's do, absolute parts stay.
- Paste from Google Sheets and Excel reads their HTML clipboard (formats, merges) and TSV; paste to them writes the
  same, so values, formats and formulas cross both ways (formulas as text in TSV).
- **Paste Special** (Edit › Paste Special, Ctrl+Shift+V values only): Values Only, Format Only, Formula Only,
  Conditional Formatting Only, Data Validation Only, Transposed, Column Widths Only, All Except Borders.
- A paste of more than the write limit is split into parts as one undo step.

## Rows, columns and cells

- Insert rows above or below, columns left or right (as many as are selected), cells shifting right or down; delete
  rows, columns, or cells shifting up or left; Edit › Delete › Values.
- Move rows up or down and columns left or right (Edit › Move, or dragging headers).
- Resize by dragging a header edge (a double-click fits to the data), or **Resize Row** / **Resize Column** (a size
  in px, or Fit to Data).
- A row not sized by hand fits its text, as the Plan Sheet's does ([Row height](sheet.md#row-height)).
- Hide and show rows and columns (arrows mark hidden ones); **Group** (Alt+Shift+→) and **Ungroup** (Alt+Shift+←)
  rows or columns, with +/− in the outline bar to collapse and expand.
- Deleting rows or columns makes references to them `#REF!` and shrinks ranges, as today ([Sheet store](sheet-store.md)).

## Undo

One timeline per person, every change one step, as today ([Sheet store](sheet-store.md#undo)); Ctrl+Z, Ctrl+Y and
Ctrl+Shift+Z.

## Collaboration

- Everyone's selections show in their colours with their name tags; a cell being edited by someone shows their
  outline thicker. Two people in different cells never overwrite each other; the same cell resolves to the later save,
  as today ([Sheet](sheet.md#collaboration)).
- An agent's changes arrive as anyone's, named as the agent.

## Who may do what

- **Editor**: everything on this page.
- **Participant**: types, pastes values, fills values and clears inputs in unprotected cells; never inserts, deletes,
  moves, resizes, hides or groups rows and columns, and a paste lands as values.
- **Viewer**: selects, moves around, copies, zooms; nothing that writes.

## Accessibility

- The grid is a `role="grid"` with `aria-rowcount` and `aria-colcount` of the whole sheet, rows and cells carrying
  their indexes; the active cell is focused and announced with its address and its value as drawn (12%, a date).
- The cells in view are mirrored for a screen reader: a row for each row in view (the frozen ones first), its number
  as its row header, then a cell for each column in view holding its address and its value as drawn, a merge once.
  The drawn letters, numbers and cells are a picture to it; the active cell is always in the mirror, scrolled away or
  not, so focus never names a cell that is not there.
- **Read Row** (Ctrl+Alt+Shift+R) says the active cell's row from its first column to the active cell, and
  **Read Column** (Ctrl+Alt+Shift+C) its column from its first row, as Google's Verbalize to Screen Reader does
  (Option+Shift+R and C on a Mac): each cell's address and value, an empty one as "blank", hidden lines left out.
  It says at most the first 50 cells, then how many more (default, D135); said politely, again on a second press.
- Every action is reachable by the keyboard; the fill handle's work by Ctrl+D, Ctrl+R and Edit's items.
- Range colours in formulas pair with a dashed or dotted border pattern so colour is never the only cue.
- Reduced motion: no animated scroll or selection transitions.

## Errors and limits

- A write past a limit is refused with its named rejection and a toast saying which ("This sheet holds the most
  rows it can: 1,000,000").
- A paste or fill that would run past the grid grows it where the workbook allows, and is cut and said where not.

## Telemetry

`Spreadsheet · Changed · <Kind>` once per change (`Cell`, `Formula`, `Paste`, `Fill`, `SmartFill`, `Rows`,
`Columns`, `Move`, `Resize`, `Hide`, `Group`), never content.
