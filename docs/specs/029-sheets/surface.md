# Surface

**Status: specified.** Nothing is built.

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
- Colours open the one [colour picker](../004-interface-design/colour-picker.md) in its toolbar skin.
- Controls that do not fit fold from the right into **More** (⋮), never wrapping; on a phone the toolbar scrolls
  sideways, as Google's app does not but a narrow browser window must.
- Every control is a button with the shared Tooltip naming it and its shortcut ("Bold (Ctrl+B)").
- A Participant sees the controls that write values only (Undo, Redo, Zoom, Insert Comment, Functions); a Viewer
  sees Zoom, Print and Search the Menus.

## Formula bar

- **Name box** (96 px): the selection (`B4`, `B4:D9`) or its named range's name; typing a reference, a range or a
  name and Enter selects it; its arrow lists the workbook's named ranges. Rules as today ([Sheet](sheet.md#formula-bar)).
- **fx** then the **input**: the active cell's input as typed; editing there is editing the cell. It grows to show
  a long input (a drag on its foot, as Google's), up to a third of the grid.
- While a formula is typed, the bar and the cell colour each reference and its range alike, show the function help
  card (its syntax, the argument being typed in bold, a summary and an example) and offer autocomplete of
  function and named range names ([Grid and editing](grid-and-editing.md#formulas)).

## Grid

Column letters across the top (24 px), row numbers down the left (46 px), the frozen panes with their thick grey
bars to drag, the cells, and the overlays (selection, fill handle, charts, images, presence, comments' corners).
Everything about it is [Grid and editing](grid-and-editing.md).

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
