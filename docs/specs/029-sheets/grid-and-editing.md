# Grid and editing

**Status: partly built.** The grid at scale (headers, gridlines, frozen panes, zoom, the accessible mirror) is built.

The grid of a [spreadsheet](spreadsheet.md) and how cells are selected, typed into, filled, moved and copied, as
Google Sheets does. What the Plan Sheet already does carries over unless this page says otherwise
([Sheet](sheet.md#the-grid)); its rows of the [parity matrix](parity-matrix.md) name this page.

## The grid

- A new sheet is 1,000 rows by 26 columns; columns 100 px, rows 21 px, text 10 points in the workbook's default font
  (Google's defaults).
- A spreadsheet's sheet holds those sizes as its own, so its files carry them, a sheet opened from a file takes the
  file's; a Plan Sheet keeps its 120 by 28, and a sheet made before keeps the sizes it was drawn at (default, D169).
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
  a row or column, Shift and a header click grows to it, Ctrl and a header click or drag adds rows or columns; the
  corner, Ctrl+A or Ctrl+Shift+Space the sheet (a second Ctrl+A in a data region widens from region to sheet).
- Ctrl+Space a column, Shift+Space a row; Shift and the arrows grow it; Ctrl+Shift and the arrows grow it to the
  data's edge.
- The active cell has a 2 px blue border, the range a light tint and a 1 px border, the fill handle a 6 px square at
  its bottom right; headers it crosses are tinted.
- A person's selection is shown to others in their colour with their name ([Collaboration](#collaboration)).

## Moving around

Every navigation shortcut of the matrix, heard by the grid while it has focus and no cell is edited:

- Arrows; Ctrl and the arrows to a region's edge; Home and End the row's first and last column; Ctrl+Home `A1`,
  Ctrl+End the last filled cell; Page Up and Page Down a screen up and down; Alt+Page Up and Page Down a screen left
  and right. With Shift, each grows the selection from its anchor to there instead (Shift+Home, Ctrl+Shift+End,
  Shift+Page Down).
- Ctrl+Backspace scrolls the active cell back into view, the selection kept.
- Alt+Up and Alt+Down, or Ctrl+Shift+Page Up and Page Down, open the previous and next sheet, hidden ones passed
  over and nothing past either end; on a cell with a dropdown Alt+Down opens it instead (default, D136). Ctrl+Page Up
  and Page Down are the browser's own, switching its tabs, and are left to it.
- Alt+Shift+Q moves focus to the selection's summary while more than one cell is selected; Escape there brings it
  back to the grid. Alt+Shift+K opens All Sheets ([Surface](surface.md#sheet-bar)).
- Tab and Enter move within a selection without losing it.
- Each key holds as [Keyboard shortcuts](keyboard-shortcuts.md) lists it for the platform: on a Mac Option+Left and
  Option+Right step sheets too, and ⌘+Option+. and , move between the areas; on ChromeOS Alt+Shift+. and ,.

The surface's areas, from anywhere in it: F6 and Ctrl+Alt+. move focus to the next area and Shift+F6 and Ctrl+Alt+,
to the previous one, wrapping round (the title row, the menu bar, the toolbar, the formula bar, the grid, an open
side panel, the sheet bar; [Canvas accessibility](../004-interface-design/canvas-accessibility.md));
Ctrl+Alt+Shift+M moves focus out of the grid to the toolbar (default, D137).

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
- Ctrl+Shift+Enter wraps the formula in `ARRAYFORMULA`: `=A1:A3*2` becomes `=ARRAYFORMULA(A1:A3*2)`, the edit kept
  open with the caret at its end. A formula wrapped already, or a draft that is no formula, is saved as Ctrl+Enter
  saves it (default, D140).
- A formula that cannot be read is not saved: the cell keeps the edit open with the error under it ("There was a
  problem: missing `)`"), as Google's.
- Ctrl+` and View › Show › Formulas show every formula instead of its value: a formula cell draws its formula as
  typed, left-aligned, and every other cell is drawn as before. It is the person's own view, kept across the sheets
  while the page is open and never saved (default, D141).
- F4 outside an edit redoes, as Google's does; in a formula it cycles the `$` anchors.

## Fill and move

- **Fill handle**: dragging it copies the cells, or continues a series (numbers by their step, dates by day, month
  or year, `Item 1` → `Item 2`, weekday and month names); one date continues by the day (default, D156); Ctrl
  while dragging switches between copy and series.
- Ctrl+D fills down, Ctrl+R right, Ctrl+Enter the range: in an edit it saves the input into every selected cell;
  outside one it accepts a Smart Fill offer, and otherwise does nothing (default, D151).
- **Smart Fill**: when a column's typed values follow a pattern of a neighbour, the grid offers to fill the rest
  (Ctrl+Enter accepts; a grey preview first).
  - It looks when a typed text (no formula) is saved in a cell with text beside it: its **sources** are the filled
    columns next to it on that row, up to three each side; its **block** is the run of rows around it with
    anything in the sources, up to 5,000 (default, D148).
  - The column's texts in the block are the **examples**, at least two; the block's first row is dropped as a
    header when the rest fit only without it; a formula in the column's block offers nothing (default, D148).
  - A **pattern** joins pieces of one row: fixed text, and a source's text whole, its first letter, a word split by
    a space or one of `, . @ - _ / ; :` counted from either end, the first letter of a space-split word, or what
    lies before or after the first or last such mark, each as is, in lower, upper or title case (default, D149).
  - The pattern with the fewest pieces that gives every example is offered (pieces from sources before fixed text);
    a row it cannot give (a missing word or mark) is left empty, and with no row to fill nothing is offered
    (default, D149).
  - The offer shows each text in grey in its empty cell, and a card by the edited cell: **Smart Fill**, "Fill N
    cells with the pattern", **Accept** (Ctrl+Enter) and **Dismiss** (Escape); any other key in the grid, a press on
    its cells or another edit ends it (default, D150).
  - Accepting writes the texts as if typed into the cells still empty, one undo step; an Editor and a Participant
    get offers, a Viewer never (default, D150).
- Dragging a selection's border moves its cells (references to them follow); Ctrl (⌥ on Apple devices) while
  dropping copies them, formulas shifting as a paste shifts them.
  - A mouse grabs one range by its edge, never at the fill handle, under a hand; the drag outlines where the block
    lands, kept inside the grid, and what it lands on is replaced without asking, one undo step (default, D145).
  - Merges wholly inside the block go with it, merges wholly under where it lands go; a move that would split a
    merge is refused with "Unmerge the cells first: moving these cells would split merged cells." (default, D146).
  - An Editor and a Participant move cells, a Participant's landing as its values as a cut does; carrying merges
    is an Editor's; a Viewer has no grab (default, D147).

## Clipboard

- Cut, copy and paste within and between spreadsheets keep inputs, formats, validation and format rules; references
  shift as Google's do, absolute parts stay.
  - A paste sets the copied cells' rules again over the pasted cells as Paste Special's rule items do (D143); a cut's
    rules lying wholly over the cut cells leave their old place, others stay; an Editor's paste only (default, D155).
- Paste from Google Sheets and Excel reads their HTML clipboard (formats, merges) and TSV; paste to them writes the
  same, so values, formats and formulas cross both ways.
  - Formulas travel in Google's `data-sheets-formula` attribute, relative to their cell, so a copy into Google Sheets
    and back keeps them; the tab-separated text holds the values as shown, as Google's and Excel's do (default, D152).
  - The HTML carries bold, italic, underline, strikethrough, text and fill colours, horizontal and vertical
    alignment, font size and borders, inline as Google writes them; a paste reads them inline or from Excel's class
    rules, and Excel's `mso-number-format` as the cell's number format (default, D153).
  - A copied merge is written as one cell spanning its rows and columns; a pasted spanning cell becomes a merge when
    an Editor pastes and it crosses no merge already there (default, D154).
- **Paste Special** (Edit › Paste Special, Ctrl+Shift+V values only), each from the last copy or cut:
  - **Values Only**: the values as they show, typed; no formulas, no formats.
  - **Format Only**: the formats alone.
  - **Formula Only**: the inputs, formulas shifted as a paste shifts them; no formats.
  - **Conditional Formatting Only** and **Data Validation Only**: the rules over the copied cells, cut to them, set
    again over the pasted cells as new rules; a custom formula shifts with them, a dropdown's source range stays
    (default, D143).
  - **Transposed**: inputs and formats with rows turned into columns, once, never repeated over a larger selection;
    a formula shifts by where its cell lands (default, D142).
  - **Column Widths Only**: each pasted column takes its copied column's width.
  - **All Except Borders**: a paste with the borders left as they were.
- Values Only, Formula Only, Transposed and All Except Borders also take text copied elsewhere, read as typed; the
  other items need cells copied in a spreadsheet, and say so ("Copy cells in this spreadsheet first"), as they say
  when the copied cells hold none of what they paste (default, D144).
- A paste of more than the write limit is split into parts as one undo step.

## Rows, columns and cells

- Insert rows above or below, columns left or right (as many as are selected), cells shifting right or down; delete
  rows, columns, or cells shifting up or left; Edit › Delete › Values.
- **Ctrl+Alt+=** (⌘+Option+= on a Mac) inserts as many rows above as whole rows are selected, or columns to the
  left as whole columns are; **Ctrl+Alt+-** deletes them. With cells selected either opens a menu at the active cell:
  Insert cells and shift right, Insert cells and shift down, Insert 3 rows above, Insert 2 columns left; or Delete
  rows 2 - 4, Delete columns B - C, Delete cells and shift up, Delete cells and shift left (default, D157).
- Move rows up or down and columns left or right (Edit › Move, or dragging headers).
- Resize by dragging a header edge (a double-click fits to the data), or a header's **Resize row** (**Resize rows
  2 - 4**, **Resize column**, **Resize columns B - D**), which opens the Resize dialog of the same title: **Enter a new
  row height in pixels. (Default: 21)** with its field, holding the first line's size as drawn, or **Fit to data**;
  Cancel and OK, Enter for OK and Escape for Cancel. A size runs from 18 px for a row and 24 px for a column to
  2,000 px, a number past either taken at the bound, and OK is dimmed while the field holds no number (default,
  D158). The default named is the sheet's own.
- **Fit to data**: a column takes the width of its widest value, a row goes back to fitting its text; the lines
  selected change together, one change and one undo step.
- A row not sized by hand fits its text, as the Plan Sheet's does ([Row height](sheet.md#row-height)).
- **Hide**: a header's **Hide row** (**Hide rows 2 - 4**), **Ctrl+Alt+9** the selection's rows and **Ctrl+Alt+0** its
  columns (⌘+Option on a Mac). Hidden lines show a small double arrow on the headers either side that shows them
  again; **Ctrl+Shift+9** and **Ctrl+Shift+0** show the hidden rows or columns within the selection, nothing when it
  holds none. A key composed with AltGr types its character, never a shortcut.
- Deleting rows or columns makes references to them `#REF!` and shrinks ranges, as today
  ([Sheet store](sheet-store.md)).

### Groups and the outline

- A **group** gathers a run of rows, or of columns, to fold away as one, as Google's and Excel's do. Every line has a
  **depth**, how many groups hold it, from 0 to 7, the most XLSX carries (default, D159); a group of depth d is a
  longest run of lines whose depth is at least d.
- **Group** (Alt+Shift+→; Option+Shift+→ on a Mac) adds one to the depth of each selected line: lines inside a group
  nest in it, lines overlapping one's edge extend it and nest where they overlap, and two groups that come to touch
  become one. A line already at depth 7 refuses it with "Groups nest at most 7 deep".
- **Ungroup** (Alt+Shift+←) takes one from each selected line's depth; lines in no group are left as they are, and a
  selection in none does nothing.
- With whole rows or columns selected Group and Ungroup act on them; with cells the keys open a menu at the active
  cell holding **Group rows 2 - 4** and **Group columns B - C** (Ungroup likewise), as Google's does (default, D160).
- View › Group holds **Group rows 2 - 4**, **Group columns B - C**, **Ungroup rows 2 - 4**, **Ungroup columns B -
  C**, then **Expand all row groups**, **Collapse all row groups**, **Expand all column groups**, **Collapse all
  column groups**; an item with nothing to act on is dimmed. A header's menu holds **Group rows 2 - 4** and, on lines
  in a group, **Ungroup rows 2 - 4**.
- **Collapse** folds a group away (its lines hidden) and **Expand** shows it again. A group keeps its own fold, so a
  group inside a collapsed one comes back as it was when the outer one expands, as Google's does.
- **Alt+Shift+↑** collapses the innermost expanded group holding the active cell's row, else its column (columns
  first when whole columns are selected); **Alt+Shift+↓** expands every collapsed group holding it, or, holding none,
  the collapsed groups whose control sits on it (default, D161).
- **The outline bar**: once a sheet has a row group, a band left of the row numbers, 12 px a depth and 4 px more, and
  for column groups a band above the column letters (default, D162). A group draws as a bracket along its lines
  ending in its control, − when expanded and + when collapsed, on the line just before it, as Google's does; on the
  line just after it when the group starts at the first line or the sheet puts the controls after. A control with no
  line on its side takes the other; a group of every line has none, and View › Group expands it. The bands stay when
  the sheet hides its headers (default, D165). Right-clicking the band opens Expand all row groups, Collapse all row
  groups and, for an Editor, **Move +/- button to the bottom** (**to the top**; for columns **to the right**, **to
  the left**).
- Each control is a button named for what it does, **Collapse rows 3 - 5** or **Expand rows 3 - 5**, saying whether
  its group is expanded; the brackets are a picture to a screen reader.
- Collapsed lines are hidden lines in every way (moving the cursor passes them; charts and `SUBTOTAL`'s 101 to 111
  leave them out) but draw no double arrow: Show never expands a group, and Hide never collapses one.
- Lines inserted between two lines of a group join it (the lesser depth of the two), deleted lines take their depth
  with them, and groups stay where they stand when lines are moved or sorted, as Google's are ranges of places;
  a collapsed group whose marked line is deleted stays collapsed (default, D164).
- An Editor groups, ungroups, collapses and expands for everyone, each one change and one undo step. A Participant
  and a Viewer collapse and expand for themselves only, never saved or sent; Google's viewers cannot (default, D163).
- A file carries the groups and their folds both ways ([Standard mapping](standard-mapping.md)).

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
  moves, resizes, hides or groups rows and columns, and a paste lands as values; collapses and expands groups for
  themselves only.
- **Viewer**: selects, moves around, copies, zooms, collapses and expands groups for themselves; nothing that writes.

## Accessibility

- The grid is a `role="grid"` with `aria-rowcount` and `aria-colcount` of the whole sheet, rows and cells carrying
  their indexes; the active cell is focused and announced with its address and its value as drawn (12%, a date).
- The cells in view are mirrored for a screen reader: a row for each row in view (the frozen ones first), its number
  as its row header, then a cell for each column in view holding its address and its value as drawn, a merge once.
  The drawn letters, numbers and cells are a picture to it; the active cell is always in the mirror, scrolled away or
  not, so focus never names a cell that is not there.
- **Read Row** (Ctrl+Alt+Shift+R) says the active cell's row from its first column to the active cell, and
  **Read Column** (Ctrl+Alt+Shift+C) its column from its first row, as Google's Verbalize to Screen Reader does
  (⌘+Option+Shift+R and C, or Option+Shift+R and C, on a Mac): each cell's address and value, an empty one as
  "blank", hidden lines left out. It says at most the first 50 cells, then how many more (default, D135); said
  politely, again on a second press.
- Every action is reachable by the keyboard; the fill handle's work by Ctrl+D, Ctrl+R and Edit's items.
- Range colours in formulas pair with a dashed or dotted border pattern so colour is never the only cue.
- Reduced motion: no animated scroll or selection transitions.

## Errors and limits

- A write past a limit is refused with its named rejection and a toast saying which ("This sheet holds the most
  rows it can: 1,000,000").
- A paste or fill that would run past the grid grows it where the workbook allows, and is cut and said where not.

## Telemetry

`Sheet · Changed · <Kind>` once per change (`Cell`, `Formula`, `Paste`, `Fill`, `SmartFill`, `Rows`, `Columns`,
`Move`, `Resize`, `Hide`, `Group`), never content: Resize and Fit to data are `Resize`, Hide and Show `Hide`, and
Group, Ungroup and an Editor's collapse, expand and control side `Group`.
