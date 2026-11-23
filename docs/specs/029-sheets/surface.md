# Surface

**Status: partly built.** The title row, its menus and toolbar, the formula bar, the grid and the sheet bar are built.

The screen of a spreadsheet, top to bottom, as Google Sheets lays it out. The frame (title row, menu bar, menu
search, toolbar, side panel, dialogs) is the **office shell** shared with plan 0019's documents and specified there;
this page names what a workbook puts in it and specifies the parts only a spreadsheet has. How literal the look is
follows 0019's D2 ruling (S2). Every item's copy is **Title Case**, as every LiveDoc menu item and button is
([Menus](../004-interface-design/menus.md)); Google's own words are kept otherwise.

## Layout

The reference is Google Sheets as captured ([Reference captures](../../research/sheets-open-standard/reference-captures.md#received):
a spreadsheet in use); each band below is checked against it.

| Band        | Height (default) | Holds                                                                                        |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Title row   | 64 px            | The shell's: document glyph, name, star, move, save status, comment history, share, presence |
| Menu bar    | In the title row | File, Edit, View, Insert, Format, Data, Tools, Help (Extensions is left out, C3)             |
| Toolbar     | 40 px            | One row, below                                                                               |
| Formula bar | 30 px            | Name box, fx, the input                                                                      |
| Grid        | The rest         | Column letters, row numbers, cells, frozen panes, overlays                                   |
| Sheet bar   | 38 px            | Add Sheet, All Sheets, sheet tabs, the selection's summary                                   |
| Side panel  | 300 px, right    | Opened by a menu item; one at a time; closes with ✕ or Escape                                |

- A spreadsheet draws the document's tab strip as its sheet bar, at the foot, never at the top: its sheets are its
  tabs ([Spreadsheet](spreadsheet.md#the-workbook-shape)).
- **Hide the Menus** (^, Ctrl+Shift+F) folds the title row and menu bar into the toolbar's row, as Google's
  compact controls do; the choice is the person's, kept in their browser.

## Menu bar

Each menu holds the items of its [parity matrix](parity-matrix.md) rows, in that order, under that spec. An item
whose row is not yet built shows dimmed with "Coming soon" in its hover card; a row left out (C3) has no item. The
menu search (Alt+/, the shell's) finds every item by its name and its submenu's name.

- An item is its row's words before any parentheses, in Title Case; a row whose parentheses list choices is a
  submenu of them, each in Title Case, with a separator where the row parts them with `;` (default, D125).
- A row whose words name Google is matched by LiveDoc's own: Help › Sheets Help is **Help** (default, D126).
- An item counts what it acts on as Google's does: **Insert 3 Rows Above** with three rows selected, **Delete Rows
  2 - 4**, **Up to Row 5** at the active cell's row.
- An item that cannot run now (Unmerge outside a merge, Row Up at the first row) shows dimmed; one that is on (Bold
  in the active cell, Show › Formulas) shows its tick, read as the menu opens.
- An item is bound while the session's role may use it, as [Who may do what](grid-and-editing.md#who-may-do-what)
  says: a Viewer sees Copy, Download, Print, Find, View's own and Help; a Participant also Undo, Redo, Cut, Paste,
  Paste Special › Values Only and Delete › Values; an Editor everything.
- Undo and Redo are the person's one timeline ([Undo](grid-and-editing.md#undo)); Cut, Copy and Paste the grid's
  clipboard, as its keys are.
- Each menu opens with its Alt key, Google's (Alt+F for File in Chrome, Alt+Shift+F in other browsers); the
  shortcuts the grid hears itself are listed beside their items once the grid's keys join the shell's registry.
- The shell's events name the kind: `UI · Opened · SpreadsheetMenu<Name>` as a menu opens, `UI · Used ·
SpreadsheetToolFinder`, never one per item (default, D127).

## Toolbar

Left to right, a hairline between the groups:

| Group     | Controls                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History   | **Search the Menus** · **Undo** · **Redo** · **Print** · **Paint Format**                                                                                |
| View      | **Zoom** (50%, 75%, 90%, 100%, 125%, 150%, 200%; a field for any of 50 to 200)                                                                           |
| Number    | **Format as Currency** · **Format as Percent** · **Decrease Decimal Places** · **Increase Decimal Places** · **More Formats** (the Format › Number menu) |
| Font      | **Font** · **Font Size** (minus, the size, plus)                                                                                                         |
| Text      | **Bold** · **Italic** · **Strikethrough** · **Text Colour**                                                                                              |
| Cell      | **Fill Colour** · **Borders** · **Merge Cells** (and its menu)                                                                                           |
| Alignment | **Horizontal Align** · **Vertical Align** · **Text Wrapping** · **Text Rotation**                                                                        |
| Insert    | **Insert Link** · **Insert Comment** · **Insert Chart** · **Create a Filter** (and filter views) · **Functions** (Σ)                                     |
| End       | **Hide the Menus** (^)                                                                                                                                   |

- Each control reads the active cell (Bold pressed when it is bold) and acts on the whole selection, one undo step.
- A control shares its menu item's id and binding: Format as Currency and Format as Percent are Format › Number's,
  Bold is Format › Text's, Create a Filter is Data's (pressed while the sheet has one).
- **Font Size** shows the active cell's size (10 where it sets none); a size typed is kept within 6 to 96, and minus
  and plus take one point off or on, as Google's do (default, D128).
- **More Formats**, **Horizontal Align**, **Vertical Align** and **Text Wrapping** open the choices of Format ›
  Number, Alignment and Wrapping, the one in force ticked; the control's glyph shows the alignment or wrapping there.
- **Zoom** shows the grid's zoom; its list holds the seven levels, and a whole number from 50 to 200 typed applies
  ([Grid](#grid)).
- A control whose row is not yet built shows dimmed with "Coming soon"; a value field not yet built (Font) shows its
  placeholder (Default) dimmed the same way.
- Colours open the one [colour picker](../004-interface-design/colour-picker.md) in its toolbar skin.
- Controls that do not fit fold from the right into **More** (⋮), never wrapping; on a phone the toolbar scrolls
  sideways, as Google's app does not but a narrow browser window must.
- Every control is a button with the shared Tooltip naming it and its shortcut ("Bold (Ctrl+B)").
- A Participant sees the controls that write values only (Undo, Redo, Zoom, Insert Comment, Functions); a Viewer
  sees Zoom, Print and Search the Menus.

## Formula bar

- **Name box** (96 px): the selection (`B4`, `B4:D9`) or its named range's name; typing a reference, a range or a
  name and Enter selects it; its arrow lists the named ranges, each with its range, and a pick selects it. Rules as
  today ([Sheet](sheet.md#formula-bar)). A sheet's names are its own ([Named ranges](sheet.md#named-ranges)), so the
  list is the open sheet's, and says "No named ranges" when it has none (default, D129).
- **fx** then the **input**: the active cell's input as typed; editing there is editing the cell. It grows to show
  a long input, up to three lines, then scrolls; its foot is a handle (a `separator`, moved by a drag or Up and
  Down) that sets its height in lines, from one to as many as a third of the grid holds, kept for the page; a
  double-click on the handle gives the height back to the input (default, D130).
- While a formula is typed, the bar and the cell colour each reference and its range alike, show the function help
  card (its syntax, the argument being typed in bold, a summary and an example) and offer autocomplete of
  function and named range names ([Grid and editing](grid-and-editing.md#formulas)).
- **F1** while a formula is typed hides the help card, and shows it again; the choice is the person's, kept in their
  browser, as Google's collapsed card stays collapsed (default, D131).

## Grid

Column letters across the top (24 px), row numbers down the left (46 px), the frozen panes with their thick grey
bars to drag, the cells, and the overlays (selection, fill handle, charts, images, presence, comments' corners).
Everything about it is [Grid and editing](grid-and-editing.md).

- **Zoom** scales the column letters, row numbers and cells together inside the grid's frame, from 50% to 200%;
  every other band keeps its size, and everything in the grid works as at 100% (selecting, dragging, editing, menus).
- View › Zoom lists the toolbar's seven levels (50%, 75%, 90%, 100%, 125%, 150%, 200%) as radio items, the level in
  force ticked; a typed level between them ticks none. There is no Fit: a sheet has no page to fit.
- The zoom is the person's own view: never saved, sent or undone, and open to a Viewer. It stays as sheets are
  switched and is 100% each time the spreadsheet opens (default, D133).
- A level picked is one `UI` `Changed` `SpreadsheetZoom` event, whichever way it was picked.

## Sheet bar

Left to right:

- **Add Sheet** (+): adds "Sheet<n+1>" after the last sheet and opens it.
- **All Sheets** (☰): a menu of every sheet, the active one ticked, hidden ones dimmed with "Hidden".
- **Sheet tabs**: each the sheet's name on its colour's underline; the active one raised. A click opens it; a
  double-click renames it in place; a drag reorders; its arrow (and a right-click) opens its menu
  ([Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar)). Tabs past the bar's width scroll with arrows at its end.
- **Summary**, at the right, for a selection of more than one cell: **Sum: 1,234** (numbers only), its arrow a menu
  of Sum, Average, Min, Max, Count and Count Numbers, each with its value; the pick is the person's, kept in their
  browser. It counts the cells a filter shows, and gives up past 100,000 cells ("Too many cells").
  - Sum, Average, Min and Max read the numbers; Count the cells that hold anything; Count Numbers the numbers.
  - With no number among the cells, it shows **Count** whatever the pick, as a sum of nothing says nothing
    (default, D132).
  - Its values are written in the workbook's locale with the active cell's number format, as Google's are.
  - It is a menu button (`aria-haspopup="menu"`), its menu items radio items, the pick ticked; the shown value
    is announced politely as the selection changes.

## Side panels

Opened by their menu items; one at a time, beside the grid (over it on a phone, as a sheet from the foot):
Chart Editor, Pivot Table Editor, Conditional Format Rules, Data Validation Rules, Named Ranges, Named Functions,
Protected Sheets and Ranges, Alternating Colours, Column Stats, Clean-up Suggestions, Slicer, Table, Comments, and
Version History (the shell's). Each is specified with its area.

## Phone and tablet

- A tablet (768 px and up) keeps every band; the toolbar folds into More sooner.
- A phone shows the title row (name and a menu button holding the menus), the formula bar when a cell is edited,
  the grid and the sheet bar; formatting opens as a sheet from the foot (Text, Cell tabs, as Google's app).

## Accessibility

- Every band is a landmark (`banner`, `menubar`, `toolbar`, the grid as `grid`, the sheet bar as `tablist`), reached
  with F6 in turn, and each control has its name.
- Keyboard reach, focus, contrast and reduced motion meet WCAG 2.2 AA; the grid's own rules are in
  [Grid and editing](grid-and-editing.md#accessibility).

## Defaults

- **D125** A menu row's items: Its words before any parentheses, in Title Case; parentheses listing choices make it
  a submenu of them, a `;` a separator (default).
- **D126** A menu row naming Google: Matched by LiveDoc's own words, Sheets Help as **Help** (default).
- **D127** The menus' telemetry: The shell's events with the kind's name, Spreadsheet, never one per item (default).
- **D128** The toolbar's font size steps: One point a press, within 6 to 96 (default).
- **D129** The name box's list: The open sheet's named ranges, each with its range, as names are a sheet's own
  (default).
- **D130** The formula bar's height: Up to three lines by its input; a drag on its foot from one line to a third of
  the grid, kept for the page (default).
- **D131** The function help card hidden by F1: Kept hidden for the person in their browser until F1 again (default).
- **D132** The summary with no number selected: Count, whatever the pick (default).
- **D133** The grid's zoom: Kept for the page across sheets, 100% each time the spreadsheet opens, as
  [Grid and editing](grid-and-editing.md#the-grid) keeps it never saved (default).
- **D134** The grid's scroll room: 10,000,000 px an axis, well under Firefox's ceiling of about 17.9 million and
  Chromium's of about 33.5 million (default).
- **D135** What Read Row and Read Column say: The first 50 cells, then "and N more", as a header row or column
  orients most and a long reading never ends (default).
