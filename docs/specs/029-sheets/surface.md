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
- **Full Screen** (View › Full Screen) hides the title row, the menu bar and the toolbar, as Google's does; the
  formula bar, the grid and the sheet bar stay. Esc in the grid brings them back, once nothing else takes the key
  (an edit, Paint Format, a copy's marquee, Find).
  - An **Exit Full Screen** button sits at the top right while it lasts, for a touch screen with no Esc, and for
    anyone who forgets the key (default, D187).
  - It is the person's own view, open to a Viewer: never saved, sent or undone, and off each time the spreadsheet
    opens; it is not the browser's full screen (default, D188).

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
- Each menu opens with its Alt key, Google's (Alt+F for File in Chrome, Alt+Shift+F in other browsers); every item
  with a shortcut shows its keys, the grid's own included, and Help › Keyboard Shortcuts (Ctrl+/) lists them all
  ([Keyboard shortcuts](keyboard-shortcuts.md)).
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
- **All Sheets** (☰, Alt+Shift+K): a menu of every sheet, the active one ticked, hidden ones dimmed with "Hidden".
  Picking a sheet opens it; picking a hidden one shows it first, for an Editor (D180).
- **Sheet tabs**: each the sheet's name on its colour's underline; the active one raised. A click opens it; a
  double-click renames it in place; a drag reorders; its arrow (and a right-click, and Shift+F10 or the context menu
  key on a focused tab) opens its menu ([Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar)). Tabs past the bar's
  width scroll with arrows at its end.
  - The arrow shows on the open tab, and on any tab while the pointer is over it, as Google's does; it is a menu
    button named "<name> menu" (default, D175).
- **Summary**, at the right, for a selection of more than one cell: **Sum: 1,234** (numbers only), its arrow a menu
  of Sum, Average, Min, Max, Count and Count Numbers, each with its value; the pick is the person's, kept in their
  browser. It counts the cells a filter shows, and gives up past 100,000 cells ("Too many cells").
  - Sum, Average, Min and Max read the numbers; Count the cells that hold anything; Count Numbers the numbers.
  - With no number among the cells, it shows **Count** whatever the pick, as a sum of nothing says nothing
    (default, D132).
  - Its values are written in the workbook's locale with the active cell's number format, as Google's are.
  - It is a menu button (`aria-haspopup="menu"`), its menu items radio items, the pick ticked; the shown value
    is announced politely as the selection changes.

## Context menus

A right-click opens the menu of what it is on, as a held finger does on a touch screen: a cell's, a row number's, a
column letter's, or a sheet tab's ([Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar)). Over a cell or a header it
selects what it is on first, unless the selection holds it. Ctrl+Shift+\ (⌘⇧\ on a Mac), Shift+F10 and the
keyboard's menu key open the cell menu at the active cell.

Each is the shell's context menu ([Office shell](../004-interface-design/office-shell.md#context-menus)): its items
are the menus' own by id, so one binding runs both, in the order and words of its
[parity matrix](parity-matrix.md) rows, in Title Case (D125). An item not yet built shows dimmed with "Coming soon",
never hidden.

| Place           | Items, a separator between the groups                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A cell or range | Cut, Copy, Paste, Paste Special › · Insert Rows Above, Insert Columns Left, Insert Cells › · Delete Rows, Delete Columns, Delete Cells › · Create a Filter, Filter by Cell Value · Show Edit History · Conditional Formatting, Data Validation · Insert Link, Comment, Insert Note · Convert to Table, View More Cell Actions › |
| A row number    | Cut, Copy, Paste, Paste Special › · Insert Rows Above, Insert Rows Below, Delete Rows, Clear Rows, Hide Rows, Resize Rows · Create a Filter · Conditional Formatting, Data Validation · View More Row Actions ›                                                                                                                 |
| A column letter | Cut, Copy, Paste, Paste Special › · Insert Columns Left, Insert Columns Right, Delete Columns, Clear Columns, Hide Columns, Resize Columns · Create a Filter · Sort Sheet A to Z, Sort Sheet Z to A · Conditional Formatting, Data Validation, Column Stats · Convert to Table, View More Column Actions ›                      |

- **Paste Special** is Edit's submenu; **Insert Cells** holds Shift Right and Shift Down, **Delete Cells** Shift Left
  and Shift Up.
- **View More Cell Actions** › Get Link to This Cell, Define Named Range, Protect Range, Randomise Range, Column
  Stats. **View More Row Actions** › Group Rows, Ungroup Rows, Freeze Up to Row, Get Link to This Range, Define Named
  Range, Protect Range. **View More Column Actions** › Group Columns, Ungroup Columns, Freeze Up to Column, Randomise
  Range, Define Named Range, Protect Range (Smart Chips are left out, C3).
- An item counts what it acts on as the menu bar's do: **Insert 3 Rows Above**, **Delete Rows 2 - 4**, **Clear
  Column B**, **Hide Columns B - D**, **Freeze Up to Row 5**; Ungroup dims where the selection holds no group.
- **Clear** empties the lines of what they hold and their formats; **Hide** hides them; **Resize** opens the Resize
  dialog, its size in pixels or fitted to the data ([Grid and editing](grid-and-editing.md)).
- **Open Link** heads the cell menu while the active cell holds a link, for every role: the way to it without Ctrl or
  ⌘, on a touch screen above all; it is not drawn otherwise (default, D189).
- Who sees what is the menu bar's rule ([Menu bar](#menu-bar)): an item above the session's role is not drawn. A
  Viewer sees Copy, Open Link and the items anyone may use (Get Link, Column Stats); a Participant also Cut, Paste,
  Paste Special › Values Only and Comment; an Editor everything.
- It is a WAI-ARIA menu: focus starts on its first item; Escape, a press outside or an item run closes it, and focus
  goes back to the grid (or the tab).
- Opening one is a `UI · Opened · SpreadsheetContextMenu` event, never one per item (D127).

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
- **D136** Alt+Down on a cell with a dropdown: Opens it, as it always has; elsewhere the next sheet (default).
- **D137** Where Ctrl+Alt+Shift+M moves focus: The toolbar, the first area always there after the grid (default).
- **D138** A format key while a cell is edited: Runs its item on the cell, as Google's does (default).
- **D139** Google's keys for Portugal, Italy, Germany and Spain: Not kept; one set of keys for every locale
  (default).
- **D140** Ctrl+Shift+Enter: Wraps the formula in `ARRAYFORMULA` and keeps the edit open; a wrapped formula or
  any other draft is saved as Ctrl+Enter saves it (default).
- **D141** Show › Formulas: The person's own view, across the sheets while the page is open, never saved; formula
  cells only, left-aligned (default).
- **D142** Paste Special › Transposed: Once, never repeated over a larger selection; formulas shift by where each
  cell lands (default).
- **D143** Pasting rules: Those over the copied cells, cut to them, as new rules; a custom formula shifts, a
  dropdown's source range stays (default).
- **D144** Paste Special from elsewhere: Values Only, Formula Only, Transposed and All Except Borders read text as
  typed; the rest need cells copied in a spreadsheet and say so, as they do when the copy holds none (default).
- **D145** Dragging a selection's border: A mouse's, on one range, within 4 px of its edge and never at the fill
  handle; the block keeps the cell it was grabbed by under the pointer and stays inside the grid; what it lands on
  is replaced without asking, as Google's does, in one undo step (default).
- **D146** Merges in a moved block: Those wholly inside move or copy with it, those wholly under where it lands go;
  any other merge the block or its landing crosses refuses the move, as moving rows does (default).
- **D147** Who moves cells by their border: An Editor and a Participant, a Participant's cells landing as their
  values as a cut's do; a move carrying merges is an Editor's, a Participant told so; a Viewer has no grab
  (default).
- **D148** Smart Fill's sources and block: Up to three filled columns each side of the typed cell, on its row; rows
  around it with anything in them, up to 5,000; at least two typed texts, the first row a header when only the
  rest fit; no offer over a formula (default).
- **D149** Smart Fill's patterns: Fixed text and a source's whole text, first letter, word or text before or after
  a mark, in four cases; the fewest pieces wins, sources before fixed text; rows it cannot give stay empty
  (default).
- **D150** Smart Fill's offer: Grey texts and a card with Accept (Ctrl+Enter) and Dismiss (Escape), ended by any
  other key, press or edit; accepted as typed into cells still empty, one undo step; an Editor's and a
  Participant's (default).
- **D151** Ctrl+Enter outside an edit: Accepts a Smart Fill offer, else nothing; in an edit it fills the selection
  (default).
- **D152** Formulas on the clipboard: In Google's `data-sheets-formula`, relative R1C1, read back from Google Sheets;
  the text form holds values as shown (default).
- **D153** Formats on the clipboard: Bold, italic, underline, strikethrough, colours, both alignments, font size and
  borders inline; read inline or from Excel's class rules, with `mso-number-format` as the number format (default).
- **D154** Merges on the clipboard: Written as spanning cells; a pasted span merges for an Editor when it crosses no
  merge there (default).
- **D155** Rules in a plain paste: Set again over the pasted cells as D143 sets them; a cut takes the rules wholly over
  its cells from their old place; an Editor's paste only (default).
- **D156** One date dragged by the fill handle: Continues by the day, as Google's and Excel's do; Ctrl copies it
  (default).
- **D157** Ctrl+Alt+= and Ctrl+Alt+- over cells: A menu at the active cell with the four inserts or deletes; over
  whole rows or columns they act at once (default).
- **D158** The Resize dialog's sizes: A row from 18 px, a column from 24 px, both to 2,000 px; a number past either
  taken at the bound; OK dimmed without a number (default).
- **D159** How deep groups nest: 7, the most XLSX carries (default).
- **D160** Group and Ungroup over cells: A menu at the active cell offering the rows and the columns, as Google's
  (default).
- **D161** Alt+Shift+↑ and ↓: The innermost expanded group holding the active cell collapses; every collapsed one
  holding it expands, or those whose control sits on it (default).
- **D162** The outline bar: 12 px a depth and 4 px more, beside the row numbers and above the column letters
  (default).
- **D163** Collapsing for a Participant and a Viewer: Their own, never saved or sent; Google's viewers cannot
  (default).
- **D164** Lines inserted inside a group: They join it at the lesser depth of their neighbours; groups stay at
  their places when lines move or are sorted (default).
- **D165** The outline bar's edges: A control with no line on its side takes the other; a group of every line has
  none; the bands stay when the sheet hides its headers (default).
- **D169** Google's line sizes: Held by each new spreadsheet sheet as its own (100 by 21); a sheet made before keeps
  120 by 28 (default).
- **D170** Where a new sheet goes: Add Sheet after the last sheet, Insert › Sheet and Shift+F11 after the open one,
  as Google's do.
- **D171** A duplicate's name: "Copy of <name>", then "Copy of <name> 2" and up when taken (default).
- **D172** Renaming in place: Enter or leaving the field saves, Escape keeps the name; a refused name says why and
  keeps the old one (default).
- **D173** Deleting a sheet: Asked first, naming it and saying its references become `#REF!`; the open sheet deleted
  opens the sheet after it, else the one before (default).
- **D174** Who changes the sheets: An Editor; Add Sheet shows for an Editor alone, a tab's menu opens for everyone
  with what their role may not use dimmed (default).
- **D175** A tab's menu arrow: On the open tab and on a tab under the pointer; a menu button named "<name> menu"
  (default).
- **D176** Dragging a tab: A press moved more than 4 px drags it; a line shows where it lands, between the tabs nearest
  the pointer; letting go moves it there, Escape or letting go where it was moves nothing (default).
- **D177** A tab's colour and hiding: The sheet's own, kept with its look as Sheet Settings are, so undo, the room and
  This Browser carry them; a duplicate keeps the colour (default).
- **D178** Hidden sheets for a Participant and a Viewer: Listed in All Sheets dimmed with "Hidden", never opened;
  View › Hidden Sheets is an Editor's (default).
- **D179** Hiding the open sheet: The next sheet shown after it opens, else the one before; one hidden by someone else
  while open stays open with its tab until another sheet opens (default).
- **D180** Showing a hidden sheet: All Sheets or View › Hidden Sheets ("Hidden Sheets (n)", dimmed at none, opening
  All Sheets); picking it shows it and opens it, one undo step (default).
- **D181** Stepping over hidden sheets: Move Right, Move Left, Alt+Up and Alt+Down step to the next sheet shown
  (default).
- **D183** Copy To: New Spreadsheet an untitled one in this one's format and settings; Existing Spreadsheet a picker of
  the person's own spreadsheets, newest first, searchable; the copy last, "Copy of <name>" in a new one (default).
- **D184** What a copy holds: Cells, formats and layout, not named ranges or card tables; another sheet named in a
  formula is read by its name where the copy lands (default).
- **D185** After a copy: A dialog says so, with Open Spreadsheet opening it in a new browser tab (default).
- **D186** Who copies a sheet: Everyone who may read it, into a spreadsheet they may edit (default).
- **D187** Leaving Full Screen without a key: An Exit Full Screen button at the top right while it lasts (default).
- **D188** Full Screen's keeping: The person's own view for the page, off each time the spreadsheet opens; not the
  browser's full screen (default).
- **D189** A cell menu over a link: Open Link heads it, for every role, drawn only while the active cell holds a link
  (default).
