# Sheet store

A document's **sheet store** holds every [sheet](sheet.md) of the document: its title, its rows and columns, and
its cells' inputs and formats. Like the [item store](../026-plan/items.md), it lives apart from the canvas: a Sheet
element on a tab only names its sheet, so a sheet of tens of thousands of cells never weighs on the tab's
elements, its snapshots, its changesets or its room.

## Domain language

| Term                      | Means                                                                          | Never called              |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------- |
| **sheet store**           | Every sheet of one document                                                    | workbook, database        |
| **sheet id**              | A sheet's internal id, named by its Sheet element                              | key                       |
| **row id**, **column id** | A row's or column's own id, kept for life whatever its place                   | index (that is its place) |
| **layout**                | A sheet's rows and columns in order, with their sizes, hidden flags and freeze | structure, shape          |
| **cell write**            | A change to cells' inputs and/or formats                                       | update, edit              |
| **layout write**          | A change to rows or columns: insert, delete, move, resize, hide, freeze        | structural change         |
| **sheet rev**             | The sheet's revision, raised by one on every write to it                       | version                   |
| **referenced**            | Named by an element of its document: a Sheet's `sheetId` or a copy's `copyOf`  | used, linked              |

## What a sheet is

- **`id`**: a short random id, unique in its document. A copied document keeps every sheet id, so its Sheet
  elements still frame the right sheets.
- **`tabId`**: the tab it was made on. A sheet belongs to one tab for life: its references to other sheets are
  that tab's, and a tab-scoped link reads only its tab's sheets.
- **`title`**: up to 100 characters, unique among the tab's sheets.
- **Layout**: the rows and the columns, each an ordered list of ids, with each one's size (where set) and hidden
  flag; how many rows and columns are frozen; the merged ranges; the filter (its range and each column's
  condition); the sheet's default column width and row height.
- **Cells**: for each cell with an input or a format, its row id, its column id, its **input** (stored as what it
  means: a number, text, a boolean, or a formula) and its **format**.
- **Who and when**: `createdAt`, `updatedAt`, `updatedBy` (the display identity, a one-way hash as on items).
- **`rev`**: the sheet rev.

### Rows and columns by id

- Every row and column has an id that never changes when rows and columns are inserted, deleted, moved, hidden or
  sorted. Cells are stored by row id and column id; a row's place is only its position in the layout.
- A formula is stored with its references pointing at row and column ids (and other sheets at their sheet id),
  and drawn as `A1` text from the layout of the moment. So:
  - inserting, moving and sorting rows or columns rewrites no cell, and every formula still reads the cells it
    read;
  - deleting a row or column deletes its cells, and a reference to one of them reads `#REF!`; a range with a
    corner in it shrinks to what is left, in the tab's other sheets too (each reading sheet's rewrite stored and
    relayed as a write of its own; the editor makes it part of the deletion's change, so one undo puts it back);
  - renaming a sheet rewrites nothing; a formula naming it shows the new title;
  - a write sent before someone else's layout write lands on the cells its sender meant, wherever they now are.
- A reference to a sheet title no sheet on the tab has is stored by its title and reads `#REF!` until such a
  sheet is there.

## In a spreadsheet

**Status: specified; built but for objects and names unique across the workbook** (each with its
phase). Built in plan 0020 Phase 5: the workbook row with its format and settings, styles, the chunked order, loading
by viewport, the limits, the workbook's doors, offline and copies; in Phase 7, unknown content. What the store becomes for the
[spreadsheet](spreadsheet.md); the rest of this page holds for both until the Plan Sheet retires.

- **A workbook is a document's sheets.** Each sheet tab holds one sheet (its `tabId`); the document's tab order is
  the sheets' order, and a sheet's `title` is its tab's name, kept as one, unique in the workbook, up to 100
  characters. References to other sheets are by sheet id across the document's tabs ([Spreadsheet](spreadsheet.md#what-a-workbook-holds)).
- **The workbook row**: one per spreadsheet, in its room, holding its file format (`ods`, `fods` or `xlsx`), settings
  (locale, time zone, recalculation, iterative calculation), theme, named ranges and named functions, the document the `CARD` functions read, whether its imports may fetch from the web ([Imports](imports.md#allow-access)), the spreadsheets
  its `IMPORTRANGE`s may read ([Formulas](formulas.md#connecting-two-spreadsheets)), its meaning when it was opened
  from a file ([the file's meaning](formulas.md#function-catalogue)), and its rev.
- **Styles** move to a table of their own: each distinct style once, by id; a cell holds a style id instead of its
  format JSON ([Formatting](formatting.md#styles-in-the-model)). A cell write may name a style by its keys; the room
  finds or makes its id. Built: a format that lands in a spreadsheet's cell, by a write, a create, a seed or a copy,
  becomes its style in the same batch, new styles taking the next ids in the order their cells were written; a read
  answers the cell's format again, so the wire, the editor and the agents carry formats as before (default).
- **Layout** stays one JSON a sheet, but for the order of its row and column ids, which lives in a table of its own
  in chunks of 50,000 ids (about 550 KB a chunk, the row cap being 8 MB; [Storage
  research](../../research/sheets-open-standard/storage.md)), always, so a sheet of a million rows stores as one of
  a hundred does (default). Built, for every sheet, a Plan Sheet's too, so there is one way to store an order:
  - Inserting or deleting rows rewrites only the chunks they fall in; a chunk grown past 100,000 ids splits in place.
  - Sorting, or moving rows from one chunk to another, writes the order afresh in chunks of 50,000.
  - A sheet stored before the chunks (or moved in from an older store) reads its order from its layout until its next
    layout write moves it into chunks.
- **Named ranges** are the workbook's: each stays in the layout of the sheet its range lies on, its name unique
  across the workbook, and a formula on any sheet reads it (default).
- **Unknown content** ([Standard mapping](standard-mapping.md#unknown-content)): what a file held that the model does
  not, written back to files of its standard. Built:
  - The workbook row names the standard of its kept content (`odf` or `ooxml`, none until a file's is stored) and
    counts its bytes; converting leaves both as they are (D109).
  - Kept items, each its place, XML, namespace bindings and anchor (a sheet id, and a cell's row and column ids), and
    kept relationships, each its source (the package, the workbook or a sheet by id), id, type and target, in a table
    each, in the file's order; a sheet's go when the sheet is deleted for good.
  - Kept package entries by name, with their media or content type and their own relationships, their bytes in
    chunks of 1 MB under the room's row cap (default, D114).
  - **Keep a file's content**: File › Open sends a file's kept content right after its sheets' parts, and Sync to
    cloud right after its create, in requests of up to 7 MB each, under the api's 8 MB body (default, D114); each
    request adds to what is stored. Editors only, never on a tab-scoped link, as the workbook's other doors.
  - What is kept is checked as it arrives, each refusal named, and nothing of a refused request is stored: a body
    that is not kept content (`kept_invalid`); an item that is not one whole element or one attribute, or holds a
    DOCTYPE, or a place of the other standard (`kept_item_invalid`); an entry whose name is unsafe, one LiveDoc
    writes itself, one the office packages drop, or one stored already (`kept_part_invalid`); a relationship whose
    target leaves the package, or of a type the office packages drop (`kept_relationship_invalid`); an anchor on a
    sheet not the workbook's (`kept_anchor_invalid`); content of the other standard than what is stored
    (`kept_standard_mismatch`); past D113's sizes (`kept_too_large`).
  - Read whole by anyone who may read the spreadsheet (Take offline reads it), never on a tab-scoped link.
- **Objects**: charts, pivot tables, images, drawings, slicers and timelines (tables and filter views in lists of their own), kept in their
  sheet's layout (`objects`, in paint order), each set whole or removed by its id with a layout write, as validation
  rules are; so they load, copy, go offline, undo and stay live as the layout does. Built for charts
  ([Charts](charts.md#the-model)); up to 100 a sheet.
- **Loading by viewport**: opening a workbook fetches its workbook row, sheet list, styles and the active sheet's
  layout and the cells of the rows in view and a screen around them; the rest streams in behind, so a large sheet
  shows before it has loaded. Built:
  - The open tab's sheet comes with its first 200 rows' cells and every sheet with its layout; a sheet with no cells
    is whole already (default).
  - The rest of each sheet loads in pages of 5,000 rows, the open sheet first, then the others in tab order
    (default); rows not loaded yet draw empty.
  - What of a sheet is loaded is always its first rows; a page lands only if the sheet is still at the version it was
    asked at, else it is asked again, and after three misses the whole sheet is fetched (default).
  - While a sheet loads, a change that reaches rows not loaded yet (cells past them, inserting, deleting, moving or
    sorting its rows or columns, or deleting rows or columns of any sheet) waits, saying "This sheet is still
    loading" (default); changing loaded cells and renaming go as ever.
  - An offline spreadsheet loads whole from this browser.
- **Limits**: the spreadsheet's ([Spreadsheet](spreadsheet.md#limits)): 20 million cells a workbook (S7),
  1 million rows over every sheet, 18,278 columns, 200 sheets, 1 GiB of stored cells (default); up to 100,000 rows or columns with their own size a
  sheet (default); a write still 5,000 cells and 1 MB.
- **Referenced by their tabs**: a sheet whose tab is one of a spreadsheet's tabs is referenced by it, so it never waits
  to expire as an unreferenced Plan Sheet does; a sheet tab removed leaves its sheet unreferenced, kept for Undo until it
  expires ([Deleting a sheet](#deleting-a-sheet)).
- **Values are not stored**: as today, the room stores inputs and styles; a file's cached values are written from the
  engine at download, and read from a file only to show a formula LiveDoc cannot evaluate.

### Changing the workbook

Built in the api; the sheet bar and File › Settings call it with the grid surface (plan 0020 Phase 8).

- **Named functions**: the workbook row's `functions`, saved whole (`PUT /workbook/functions`: each checked by the
  rules of [Data tools](data-tools.md#named-ranges-and-named-functions), else `functions_invalid`; more than 100,
  `functions_full`), sent live to everyone on the spreadsheet. A definition's references are stored by ids, each naming its sheet ([Formulas](formulas.md#named-functions), D301); rows or columns deleted inside a range one reads shrink it: the person's browser saves the shrunk list with the deletion and the list as it was with its undo (D301), and the api shrinks it for a deletion made by any other writer.
- **Add a sheet**: a sheet tab and its sheet made as one, after the tab named, first when the name is empty (an undone
  delete of the first sheet), or last when none is.
- A new sheet takes the name given, by the sheet name's rules, or `Sheet<n>`, n the first number from the sheets'
  count plus one that no sheet has (default); it holds 1,000 rows by 26 columns, as a new spreadsheet's (default).
- A sheet added may name its tab and sheet ids (an undo, a sync), a taken one refused (`sheet_exists`).
- **Duplicate a sheet**: an add naming the live sheet it copies (`copyOf`, else `sheet_not_found`): its layout and
  cells copied whole but for its named ranges (D298), after the sheet copied unless `after` names a tab, named "Copy of <name>" by the sheet name's
  rules unless a name is given ([Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar), D171); the workbook's cells
  and grid limits as any add's.
- **Copy a sheet in**: an add carrying its sheet whole (`seed`: its layout and the cells one request carries, the rest
  sent as writes after), checked as a new spreadsheet's seed sheets are; Copy To from another spreadsheet
  ([Spreadsheet](spreadsheet.md#sheets-in-the-sheet-bar), D183).
- **Move a sheet**: its tab after the tab named, or first for an empty name (`tab_not_found` for one not there); the
  order is the document's tab order, which every engine counts sheets in (`SHEET`).
- **Rename a sheet**: its title and its tab's name as one write, by the sheet name's rules.
- **Delete a sheet**: its tab removed, its sheet left unreferenced and kept for Undo until it expires; never the last
  visible sheet (`sheet_last_visible`), nor a sheet hidden when no other is shown.
- **Settings**: saved whole, as the dialog's Save Settings writes them; one that is not a setting is refused
  (`settings_invalid`); the file format is not a setting, converting is ([Files and print](files-and-print.md#converting)).
- **Allow Access** for the imports: once, for good, as a `workbook` op ([Imports](imports.md#allow-access)).
- Editors only, never on a tab-scoped link; on a document that is no spreadsheet, `workbook_not_found`.
- Each counts against the write rate limit and is sent live: the tab list as the document's, a sheet as a `sheets`
  op, the settings as a `workbook` op with the row's rev.
- A refusal is logged `[workbook] refused <name>`; a change done `[workbook] <change> document=<id>`, never content.

## Changing a sheet

- **Create** (placing a Sheet element, a copy, a CSV): a title, its tab and optionally its layout and cells. It
  may name its id (made by the client), and a restore (undo, a sync) its old rev. A **restore** of a sheet
  that is still stored keeps it, and cancels a delete waiting on it being unreferenced.
- **Cell write**: a set of cells by row and column id, each with an input to set or clear and/or format keys to
  set or clear. Two people writing different cells, or different format keys of a cell, never overwrite each
  other; the same input or format key resolves to the last write.
- **Writes made in one moment go as one**: the editor shows each write at once and sends a sheet's cell writes made
  in the same moment (one task, before the next frame) as one, each cell left as the writes in turn would leave it
  (default). Format keys after a whole-format clear of the same cell, one key set to an object twice, a layout or
  title write, different flags (an undo, an unchecked write) or a write's caps start another. Each write stays its
  own undo step.
- **Layout write**: insert rows or columns (new ids, made by the client, at a place given as "after this id"),
  delete them, move them (after an id), resize them, hide or show them, set their group depths, collapse or expand a
  group, put the groups' controls before or after them ([Groups](grid-and-editing.md#groups-and-the-outline)), set
  the freeze, merge or unmerge a range,
  set or clear the filter and its conditions, set or remove a [validation rule](data-validation.md) or a
  [format rule](conditional-formatting.md), or reorder the format rules, set or remove an object (a
  [chart](charts.md#the-model)). A layout write naming an id that is gone does what still makes
  sense (deleting a deleted row is nothing; inserting after a deleted row inserts at its old neighbour, else the
  end).
- A cell write is checked against the sheet's validation rules ([Where values are checked](data-validation.md#where-values-are-checked)):
  a value a Reject rule refuses is refused (`value_invalid`, naming the cell), nothing of the write stored. A write
  sent with `undo` (an undo or redo) or `unchecked` (an import, a card table's sync, a template's start) skips that
  check, and only that check.
- **Sort** is a layout write of the rows (their new order) for a whole-sheet sort, and a cell write for a range.
- **Rename**: a new title; refused when another sheet on its tab has it (`sheet_title_taken`).
- **Delete**: removes the sheet and its cells. **Delete when unreferenced** (the editor's, with its element) removes
  them now if nothing references the sheet, or else as soon as nothing does ([Deleting a sheet](#deleting-a-sheet)).
- Every write answers with what is stored: the changed cells, the layout if it changed, and the sheet rev.
- A write the server could not take for now (no answer, a timeout, a rate limit, a server error) is kept, still
  shown and still ahead of the sheet's later writes, and sent again after a wait that doubles from half a second
  up to 30 seconds, until it lands or the room confirms it. Only a refusal (any other answer) drops it, with a
  toast, and fetches the sheet again.

## Template starts

A Plan template's Sheet ([Spreadsheet templates](../026-plan/plan-templates.md#spreadsheet-templates)) is built as an
element naming its **start** (`start`, a template start's id: `budget-planner`, `timesheet`, `contact-list`,
`task-tracker`) and a fresh `sheetId`, and no sheet yet.

- Each start is one of the [sheet templates](sheet.md#sheet-templates): `budget-planner` the Budget, `timesheet` the
  Timesheet, `contact-list` Contacts, `task-tracker` the Tracker (`TEMPLATE_START_SHEETS`), and so on for every
  spreadsheet template; but one: `blank-spreadsheet` (`BLANK_SHEET_START`, Blank Spreadsheet's) makes an empty sheet,
  titled Sheet 1, with no template, no charts and no setup to await.
- Whatever makes the tabs makes each such sheet from its template at once: titled with the template's name, set up
  in the Banded look, its header frozen, tints for the tab's canvas, light or dark, dates reckoned from that moment;
  the template's chart is added to the tab as a chart element anchored in the Sheet, carrying its first read. The element's `start` is then dropped, so a template's tabs are never
  stored with it: the document is created with the sheets beside the tabs, or a start screen and `add_tab` make the
  sheets right after the tabs.
- An element still carrying `start` with no sheet behind it (a path that missed it) is made from the start by the
  first editor to draw it, as a copy not yet made is, and the mark dropped quietly at once; until then it shows its
  loader, never "no longer in this document". The template's chart is added beside it, quietly, once the server takes
  that editor's sheet. A second editor drawing it at the same moment finds it made (the server refuses their copy) and
  loads it, adding no chart, so the chart is never added twice.
- `start` counts as nothing referenced: the sheet is referenced by its `sheetId` once made.

## Deleting a sheet

A sheet is **referenced** by every element in its document that names it: a Sheet element showing it
(`sheetId`), and a copy not yet made (`copyOf`: a duplicated Sheet, a pasted one, or one on a duplicated tab, which
is made from it when first drawn). A sheet nothing references is **unreferenced**.

- **Delete with the element**: deleting a Sheet element (Delete, Backspace, the selection's trash button, the
  context menu's Delete, the command palette) whose sheet nothing else references asks first, one dialog for the
  whole selection: **Delete Sheet?** ("Sheet 1 and its cells are deleted. Undo brings it back while this page is
  open."), or **Delete 3 Sheets?** for several ("Sheet 1, Costs, Budget and their cells are deleted. Undo brings them back while this page is open."), with **Delete** and **Cancel**. **Delete** removes the elements and
  the sheets with them; **Cancel** removes nothing.
- A sheet something else still references (another Sheet element, a copy not yet made) is not asked about and
  stays: only the element goes.
- The api deletes a sheet the person deleted with its element as soon as it is unreferenced. If the element's
  removal has not reached the api yet, the sheet goes the moment it does.
- **Undo** puts the element back and makes the sheet again as it was (its id, title, rows, columns and cells),
  while the page that deleted it is open. **Redo** removes the element again; its sheet is then left as a Cut's is.
- **Cut**, an agent's or another person's removal, deleting a layer, a tab, or Fill Tab's clearing do not ask and
  do not delete the sheet: it is kept, so a paste, an Undo or a restore brings it back.
- A sheet unreferenced for 30 days is deleted for good. The api notes the moment a sheet becomes unreferenced (or
  referenced again) as the tabs that reference it are saved, and the document's room deletes, in its daily upkeep,
  the sheets unreferenced for longer ([Document storage](../006-document/document-storage.md#upkeep)).
- Deleting a document for good deletes its sheets with it.

## Who may do what

Sheets follow the document's access ([Auth and guest access](../014-identity/auth-and-guest-access.md)):

- **Read** with any access to the document. A visitor on a **tab-scoped** link reads only that tab's sheets.
- **Create, write, rename, delete** with edit access (a tab-scoped edit link: only its tab's sheets).
- An agent token acts as its person; a read-only token reads only.

## Live for everyone

- Every write is pushed to everyone in the document's room at once, in order, with the sheet rev: the changed
  cells, and the new layout if it changed.
- A client that sees a gap in a sheet's revs, or reconnects, fetches that sheet again.
- A spreadsheet that reconnects opens its workbook again by viewport, and a sheet deleted while it was away leaves it.
- A gap in one sheet's revs while connected fetches that sheet whole, as a page missed three times does (default):
  gaps are rare, and the room's ordered stream makes them rarer.
- In a spreadsheet, the sheet bar shows who else is on each sheet: a dot in each person's colour, three at most and
  the rest counted (default), each tab named with them for a screen reader ("Costs, also here: Ann").
- Nothing a browser sends over the room changes a sheet: sheets change only through the api. Presence on a sheet
  (`sheet-presence`) is ephemeral and never stored.

## Loading

- A sheet's cells are fetched when its Sheet element is first drawn on the open tab, together with the other
  sheets on that tab (one request for the tab's sheets), and kept for the session.
- A document with no Sheet element on its open tab fetches nothing.

## Undo

- A person undoes their own sheet changes with the canvas's Undo, in order, mixed with their canvas edits and card
  changes ([Items](../026-plan/items.md#undo)).
- An undo writes back the old inputs and formats of exactly the cells its change touched, and the old layout of
  what its layout change touched (a deleted row comes back with its id, place and cells).
- Undoing a deletion of rows or columns puts back only what the deletion took, into the sheet as it is at the
  undo: the deleted lines' sizes, hidden state and card-table links and drafts, the merges, filter range and named
  ranges it shrank or dropped, a card table's deleted columns. What changed since is kept (a row linked or drafted,
  a merge or a name made), and a merge, filter or name someone changed after the deletion is theirs, not put back.
- Like canvas undo, an undo writes the old value back even over a later change someone else made to that cell.

## Offline documents

- An [offline document](../006-document/offline-mode.md) keeps its sheet store inside its own record, as a
  `sheets` array beside its tabs and items. Every rule above holds, minus the room.
- **Sync to cloud** sends the sheets with the document; **Take offline** fetches every sheet first, all or
  nothing.
- A spreadsheet is made in This Browser as anywhere, and its record keeps the workbook row beside its sheets; **Take
  offline**, **Sync to cloud** and a copy carry the row, so a spreadsheet stays one wherever it goes.
- An offline spreadsheet holds every rule of the api's: its sheets are its tabs', in tab order, named and limited as
  one workbook, and a sheet renamed renames its tab; it loads whole, from this browser.
- An offline spreadsheet downloads as the same file the api writes, written in this browser.
- Its record carries its kept content ([Standard mapping](standard-mapping.md#unknown-content)): **Take offline** reads
  it, all or nothing, before the server copy goes; **Sync to cloud** sends it after the create, and a send refused
  takes the cloud copy back, the local one kept; its downloads and conversion lists read it as the api's do.

## Copies and exports

- **Duplicate** copies the sheet store with the document (same ids), and a spreadsheet's workbook row with it, so a
  copy of a spreadsheet is a spreadsheet, its named functions with it; its kept content comes too.
- A `.livedoc` file (the Drive mirror's) carries the workbook row beside the sheets, optional and additive, and a
  copy imported from one is a spreadsheet.
- **Duplicate Tab** copies the tab's sheets as new sheets on the new tab (new ids, `(copy)` titles kept unique
  per tab), and the new tab's Sheet elements frame the copies. A sheet's kept content stays with the sheet it came
  from (default, D115).
- The `.livedoc` file carries no kept content, so a spreadsheet brought back from one has none (default, D116).
- **The `.livedoc` file** (the Google Drive mirror's document file) carries the sheets; the field is additive,
  so the file stays version 1.
- Images, thumbnails, PDFs and api or MCP renders draw Sheet elements from the store.

## Agents

- Agents read and write sheets through the api, the CLI and MCP ([Agents](../024-agents/README.md)), by sheet
  title (or id) and A1 references, never ids of rows and columns:
  - MCP **`list_sheets`** (a document's sheets: title, tab, size, filled range, the Sheet element framing it),
    **`read_sheet`** (a range's non-empty cells by A1: input, value and what it shows; plus freeze, merges and
    filter, validation rules and format rules), **`change_sheet`** (changes in order: set cells by A1 from rows of
    inputs; clear or format a range; insert or delete rows and columns; sort; freeze; rename; set or clear validation
    rules and format rules) and **`add_sheet`** (place a Sheet element on a tab in
    Plan, optionally filled from rows or CSV text: the tab named, else the first tab holding a sheet, else the first
    tab in Plan; a named tab in another mode, or a document with no tab in Plan, is refused `tab_not_plan` before
    any sheet is made, pointing at `add_tab` with a Sheet template; [Plan tabs](../026-plan/plan-tabs.md#only-in-plan)).
  - CLI: `sheet ls <doc>`, `sheet get <doc> <sheet> [range]`, `sheet set <doc> <sheet> <A1> <value…>` (or `--csv`
    from a file or stdin), `sheet add <doc> [--tab] [--title] [--csv]`, `sheet insert-rows`, `sheet insert-cols`,
    `sheet rm-rows`, `sheet rm-cols`.
- **Shaping a sheet**: `change_sheet` also resizes columns (`resize`: px, or `fit` to what the cells show) and rows
  (`resize`: px, which makes a row sized, or `fit`, which hands sized rows back to automatic; every other row fits
  its text by itself, so an agent that wraps cells sizes no rows: [Row height](sheet.md#row-height)),
  merges and unmerges cells, draws borders (`border`: all, outer, inner, horizontal, vertical, a side, or none;
  solid, dashed, dotted or double), turns the filter on over a range or off, and adds a chart over the sheet's cells
  (`chart`: a type, an A1 range, the columns to chart by header, and the cell its top-left sits on, by default beside the range, in its table's accent family, and on a scatter chart the series drawn as lines by header name, [Lines set by an agent](../009-elements/pie-chart.md#lines-set-by-an-agent)) and takes them off
  (`clear_charts`: every one of the sheet's, or those reading a range); in a spreadsheet it sets and takes off pivot
  tables (`pivot`, `clear_pivots`: [Pivot tables](pivot-tables.md#agents)) and images over cells (`image`,
  `clear_images`: [Inserted objects](inserted-objects.md#images-over-cells)) too. Rows an agent inserts take the formats of the
  row above them, as a spreadsheet's do, so a table keeps its banding and number formats; columns take the look of the
  column left of them but not its number format. A chart sits at a px anchor, so when an agent's change inserts,
  resizes or deletes rows or columns before it, or makes rows before it taller or shorter with their text, the chart
  is moved back onto the cell it sat on. An agent measures rows in the tab's font only when its change reads the tab
  (a chart, a design, a resize, an insert or a delete); any other change measures them as a tab with no font is
  measured, as Inter ([Row height](sheet.md#row-height)), so on a tab that names another font a chart it moves may
  land a little off its cell. A format rule an
  agent adds goes last unless it asks for `first` (the first rule met draws a cell).
  - `fit` on rows takes every sized row among the rows named, hidden ones too, and writes nothing when none is sized.
  - Its answer says how many of several rows held a size, as `read_sheet` shows no row sizes.
  - A fitted column keeps the width it was given; a fitted row holds no size and goes on fitting its text.
  - `resize` takes px or `fit`, never both: the two together are refused (`write_invalid`), on rows and columns.
  - A `resize` is a change of shape: a token with less than edit access is refused it, px and `fit` alike.
- **A design**: `add_sheet` and `change_sheet` take a sheet laid out as a template is
  ([Sheet templates](sheet.md#sheet-templates)): a heading and subtitle over the sheet's width, then blocks (tables
  with a header, rows, a total row, number formats, input columns, dropdown and checkbox columns by header name;
  fields of labels and values, as inputs, values or results; notes), in a look and an accent, with charts over
  tables. It is compiled by the templates' own step (`designWrite`), so it reads as a template does: the title row,
  the banded tables with ruled totals, the tinted inputs, widths fitted to the cells unless given, the header frozen.
  Blocks without a place stack from row 4 down column A, one blank row apart (a table's header first, then its rows,
  then its total), so an agent writes formulas knowing where every row lands; the answer names each block's ranges.
  A design lays out an empty sheet, and is refused on one with cells.
- A read answers at most 5,000 cells of its range and 100,000 characters of cells, and says where to read on.
- Inputs from agents are read as typed in the `en-GB` locale (day before month), unless a value is given as a
  JSON number or boolean; a formula an agent writes that cannot be read is refused (`formula_invalid`, naming the
  cell and why), never stored as `#ERROR!`.
- Values an agent reads are worked out by the same engine the editor uses.
- An agent's call goes to the api as one [sheet changeset](../024-agents/agent-changesets.md#a-sheets-changesets):
  every change of it lands or none does, checked whole against the sheet's and the document's caps; its answer names
  the changeset, which `livedoc changeset revert` undoes.
  `add_sheet` checks its first cells the same way before making the sheet, and deletes the sheet it made when
  filling or placing it fails, so a failed call leaves no unplaced sheet spending the document's cells.
- A delete of rows or columns says which it deleted: as far as the sheet goes, and never the last one (a sheet keeps
  one row and one column, and the answer names the one it kept).

## Agents in a spreadsheet

**Status: specified.** Agents work a [spreadsheet](spreadsheet.md) as they work a Plan Sheet today (above), by sheet
name and A1 references, never ids, with these changes. Built: `read_sheet` and `change_sheet` read a spreadsheet's
sheets as one workbook, in tab order, held to its limits; the sheet list carries the workbook row, so one request
tells them.

- **Views** (`@livedoc/document-views`): a workbook's **outline** (its sheets, each with its used range, tables,
  charts, pivots, named ranges and rules) and a sheet's **cells** view of a range (input, value and shown text), both
  cheap at any size: a read answers at most 5,000 cells and 100,000 characters and says where to read on, as today.
- **Edit operations** over the workbook join agent changesets ([Agent changesets](../024-agents/agent-changesets.md)):
  set cells, clear, format (by style keys), insert, delete and move rows and columns, sort, filter, validation and
  format rules, named ranges, sheets (add, rename, move, hide, delete), charts and pivot tables; a changeset is atomic,
  attributed to its agent and revertable as one.
- **MCP tools**: `list_sheets`, `read_sheet` and `change_sheet` take a spreadsheet and a sheet name; `add_sheet` adds
  a sheet tab to a spreadsheet; `create_spreadsheet` makes a spreadsheet, optionally from a template,
  CSV text or rows; `convert_spreadsheet` changes its file format. `add_sheet`'s Plan-only refusal (`tab_not_plan`)
  is retired with the Plan Sheet.
- **CLI**: `livedoc sheet ls|get|set|add|insert-rows|insert-cols|rm-rows|rm-cols` as today on a spreadsheet, and
  `livedoc spreadsheet new|import|download|convert`; downloads in the workbook's format by default.
- **Previews**: a sheet's range drawn as a PNG through `render-png`, as Plan previews are.
- Values an agent reads are worked out by the same engine; formulas an agent writes are read in `en-GB`, as today.

### Built for agents in a spreadsheet

- **`create_spreadsheet`** (`livedoc spreadsheet new`): a name, and its sheets in order, each a name and optionally its
  first cells as rows or CSV text from A1 (one sheet, `Sheet1`, when none are named); in ODF (C5), its locale
  `en-GB` and time zone UTC; filed as `create_document` files a document, marked as made by its agent. Names follow
  the sheet name's rules and are unique (`sheet_name_invalid`, `sheet_name_taken`, before anything is made); every
  formula is read first (`formula_invalid`, naming the sheet and cell) and a value too long refused (`input_too_long`);
  the room checks the caps as the cells land, and a sheet whose filling is refused leaves the
  spreadsheet made and says which sheets were filled. It answers the document, its link and each sheet's name and id.
- **`add_sheet` in a spreadsheet** adds a sheet tab, named as given (else the next free `SheetN`), after the sheet
  `after` names (by name; last when absent), through the workbook's own door, then fills it as on a Plan tab, the room checking the caps (a refused filling
  deletes the new tab again); a
  `tabId` is refused there (`write_invalid`).
- **`change_sheet` in a spreadsheet** also:
  - `move`: the sheet after the sheet `after` names, or first for `null`; `hide` with `hidden` true or false, never
    the last shown sheet (`sheet_last_visible`). On a Plan Sheet both are refused (`not_spreadsheet`).
  - `chart` puts the sheet's own chart ([Charts](charts.md#the-model)) at the cell `at` names, with `title`,
    `xAxisTitle`, `yAxisTitle`, `legend` (top, right, bottom, left or none), `values`, `axis` (the value axis, shown
    unless false), `stack` (`stacked` or `percent`: a column, bar, area or stepped area chart's Stacking), `smooth` (a line or Combo chart's Smooth Line), `seriesTypes` (a Combo chart's series types by name: column, line, area or stepped-area), `rightAxis` (a line, area, stepped area or Combo chart's series on a second scale, by name), `alt` and `lines` (a scatter's series drawn as lines, by name, kept by their columns; series types and axes are kept by their columns too); `replace`
    names a chart of the sheet by id to put this one in its place, its id and paint order kept (`chart_not_found`
    when it is none). The title options draw on a Plan chart too.
  - `clear_charts` takes the sheet's charts off: those reading cells of a range, or every one; or, given `id`, the
    one chart of that id, the rest kept (`chart_not_found` when it is none; `write_invalid` with a range too). On a
    Plan Sheet an `id` is refused (`not_spreadsheet`).
- **`read_sheet` in a spreadsheet** answers the sheet's charts: id, type, range and columns in A1, the cell it sits
  on, size, titles, legend, values, axis, stacking, smoothing, alt and the series drawn as lines.
- **Views** ([A spreadsheet's views](../024-agents/document-views.md#a-spreadsheets-views)): `read_document` and
  `livedoc tab view` on any of a spreadsheet's tabs answer the workbook outline; `view: "cells"` with a `range` reads
  that tab's sheet a row a line, bounded as `read_sheet` is.
- **`convert_spreadsheet`** (`livedoc spreadsheet convert <doc> <to>`) changes a spreadsheet's file format to `ods`,
  `fods` or `xlsx` ([Converting](files-and-print.md)): it answers what a file of that format cannot hold, in the
  conversion dialog's words, then converts; with `check` it only answers them (D271). Within one standard it is
  refused `format_same_standard`, as the editor's is.
- **`livedoc spreadsheet download <doc>`** writes the spreadsheet's file in its own format, or `--format` `ods`, `fods`,
  `xlsx`, `csv` or `tsv` (the sheet `--sheet` names, the first by default), to `--to` or, without it, under the name
  the api gives it in the working folder (D272). It carries every chart the file's standard holds.
- **`livedoc spreadsheet import <file> [--name <name>]`** opens a file from the computer as File › Open does
  ([Import](files-and-print.md#import)), through the one flow both share (D274): an `.ods`, `.fods`, `.xlsx` or
  `.xlsm` becomes a spreadsheet in the format its bytes are in (C1), a `.csv`, `.tsv` or `.txt` one sheet of a new
  ODF spreadsheet; named after the file, or `--name`; filed as `create_document` files a document, marked as made
  by its agent, its locale `en-GB` and time zone UTC. Its sheets past the first request follow in parts and what the
  model does not hold is kept, as the editor's are ([A file sent in parts](files-and-print.md#a-file-sent-in-parts)).
  A file is refused with the editor's words under its named rejection (`package_too_large` before a byte is read,
  `package_damaged`, `package_encrypted`, `package_wrong_type`, `xml_doctype_refused`, `no_sheets`); a part refused
  after the spreadsheet is made moves it to the Bin, so nothing half-made is left (`import_refused`, the api's code
  named). It prints the document, its sheets and link, then the [import report](files-and-print.md#the-import-report)'s
  lines.
- **Previews**: a spreadsheet's sheet tab draws as its sheet laid out as a Plan Sheet tab is for its image: its cells
  from A1 to the last filled cell and every chart over them, each on its card as the spreadsheet draws it (the
  light paper's surface, a 1 px border, rounded), or a `range` from its top-left, within 4,000 px a side (D273). `GET .../tabs/:tabId/render.svg?range=` answers it, `livedoc tab render --range` writes it as PNG or SVG,
  and `read_document` with `image` (and the cells view's `range`) attaches it.
- **`list_sheets` in a spreadsheet** lists the sheets in tab order, each with whether it is hidden and how many
  charts it holds.

## Limits

A Plan Sheet's; a [spreadsheet](spreadsheet.md#limits)'s sheets take the workbook's instead.

- Up to 200 sheets per document; a create past it is refused (`sheets_full`).
- A sheet has up to 10,000 rows and 200 columns (A to GR); a write past either is refused (`sheet_too_large`); a
  paste or import is cut at it and says so.
- Up to 50,000 cells with an input or a format per sheet, and 4 MB of stored cells; past either, a write is
  refused (`sheet_full`, "This sheet holds the most cells it can").
- Up to 200,000 such cells per document across its sheets (`sheets_full`).
- An input is up to 10,000 characters; a formula up to 8,000 (`input_too_long`).
- Up to 1,000 merged ranges and 5,000 rows or columns with their own size per sheet; up to 200 validation rules and
  100 format rules per sheet.
- A write changes up to 5,000 cells; the editor sends a larger paste, fill or import as several writes, one undo
  step. Writes count against the write rate limit.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D5** Largest room op before clients refetch instead: 256 KB (default).
- **D6** How much the daily expiry deletes per run: 25 sheets read a query, 100,000 cells a batch, 500,000 cells a run
  (default).
- **D7** Sheets named in one GET: 50 (default).
- **D8** Cells an agent reads at once: 5,000 (default).
- **D23** How much one agent read answers: 100,000 characters (`SHEET_READ_CHARS_MAX`), with a note where to read on
  (default).
- **D114** Kept content in the store: package entries in chunks of 1 MB; sent in requests of up to 7 MB each, entries' bytes as base64
  (default).
- **D115** Kept content of a sheet Duplicate Tab copies: Stays with the sheet it came from (default).
- **D271** An agent's conversion: one call lists the losses and converts, as the dialog's Convert would after reading
  them; `check` lists them without converting (default).
- **D272** Where `spreadsheet download` writes without `--to`: the file name the api answers (`Content-Disposition`),
  in the working folder, replacing a file of that name (default).
- **D273** A range's preview: its rows and columns from its top-left, labelled as the sheet labels them, no frozen
  panes; a chart drawn only when its top-left cell is in the range (default).
- **D274** An agent's import: the editor's File › Open flow, moved whole to `@livedoc/sheets/files`, read in the
  agents' locale (`en-GB`) and UTC as `create_spreadsheet`'s, its import report printed after the answer (default).
- **D116** Kept content in a `.livedoc` file: Not carried (default).
