# Review

**Status: specified.** Nothing is built.

Notes, comments, version history and a cell's edit history in a [spreadsheet](spreadsheet.md), through the review
surfaces plan 0019 specifies and builds for every document kind outside the canvas (comment threads, version
history, the mode switch). This page names what a spreadsheet adds.

## Notes

**Status: specified.** A note is plain text the cell holds, as Google's notes are: no author, no replies, no mentions,
no reactions. It is cell content beside the cell's input and format, never one of them.

- **Where it lives**: the cell's `note` (1 to `SHEET_NOTE_MAX`, 50,000 characters; line breaks kept, control
  characters other than line breaks refused). A cell holding only a note is a cell. It follows its cell through
  inserted, moved and sorted rows and columns, since the cell's ids do; a deleted row or column takes its notes, and
  undo brings them back.
- **Insert › Note**, the cell menu's **Insert Note** (**Edit Note** on a cell with one) and **Shift+F2** open the note
  box on the active cell (a merged cell's is its top-left cell's): a card at the cell's top right, a plain text field
  holding the note, the caret at its end. Clicking away or Shift+F2 again saves it; **Escape** saves it and returns to
  the grid, as Google's does (default, D643). Saving an empty note removes it. A selection of many cells gets the
  note in each, as Google's does.
- **Delete Notes** (the cell menu, when a selected cell holds one) removes every note in the selection.
- **The marker**: a cell with a note shows a black triangle in its top-right corner (6 px; white on a dark fill, as
  any ink is kept readable). Hovering the cell for a moment (400 ms) shows the note in a read-only card at the cell's
  top right; the note box replaces it while open. A cell with both a note and an open comment thread shows the
  comment's triangle (D644).
- **What carries a note**: copy and cut with the cells (Paste carries notes, Paste Values Only and Paste Format Only
  do not, as Google's do); a sheet's copy; Copy To. Clear Formatting, Delete (the key) and typing leave it, as
  Google's do. Fill down and the fill handle do not copy notes (default, D645).
- **Undo**: each save of the note box, and each Delete Notes, is one change (`Note`), undone and redone as any.
- **Live**: a note travels as a cell change (`n`), so two people on different cells never lose one; on the same
  cell the later save wins, as a cell's value does.
- **Agents**: `change_sheet` sets a range's notes (`note`: the text, or null to remove), `read_sheet` gives each
  cell's `note`, and the cells view prints it after the value (`✎ "<note>"`, cut to 60 characters).
- **Find**: Find and Replace does not search notes, as Google's does not (default, D646).
- **In the files**: ODF keeps notes as cell annotations, XLSX as notes (legacy comments) with the drawing Excel shows
  them by ([Notes in the file](standard-mapping.md#notes-in-the-file)).

## Comments

- **Insert › Comment** (Ctrl+Alt+M): a thread on a cell or range, an orange corner triangle; replies, mentions
  (`+name` or `@name`), **Assign To** making it an action (LiveDoc's assigned actions), **Resolve**, **Reopen**,
  reactions as 0019's threads have them.
- The **Comments** panel (the title row's comment history) lists every thread of the workbook, filterable by sheet,
  For You, Open and Resolved; View › Comments hides, minimises or shows them.
- A thread follows its cell through inserts, sorts and moves (by ids); a deleted cell's thread is resolved with
  "The cell this comment was on was deleted".
- Today's cell threads carry over ([Sheet](sheet.md#cell-comments)), re-anchored to the workbook.
- XLSX keeps threads as threaded comments; ODF keeps them as annotations with LiveDoc's thread data as unknown
  content, so replies survive a round trip through LiveDoc and degrade to text in other applications (listed).

## Version history

- **File › Version History › See Version History** (Ctrl+Alt+Shift+H): the shell's view, the workbook read-only with
  changes highlighted by person's colour, versions grouped by day, **Name Current Version**, **Restore This Version**,
  **Make a Copy**; Show Changes on or off.
- A version is a snapshot of the workbook; restoring is one change, itself a version.

## A cell's edit history

- **Show Edit History** (a cell's menu): a card stepping back through the cell's values, each with who, when and
  what changed (value, formula, format), as Google's; formatting-only changes say "Formatting changed".
- Built from the workbook's change log; reaches back as far as version history does.

## Who may do what

- **Editor** adds, edits and deletes notes (they are cell content, D647); a Participant and a Viewer read them
  (the marker and the hover card, never the note box). Comments are anyone's whose link allows commenting, as
  everywhere in LiveDoc.
- Version history and edit history: Editors see both; Participants and Viewers see neither, as Google's.

## Accessibility

Corner markers are announced with the cell ("has note", "has comment"); Ctrl+Alt+Shift+N and P move between comments.

## Limits

Up to 1,000 threads a sheet and 500 comments a thread, as cell threads today; a note up to 50,000 characters
(`SHEET_NOTE_MAX`), longer refused (`note_too_long`).

## Telemetry

`Spreadsheet · Changed · Note`; comments and versions use the shell's events.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
Notes in the files take three more, D650 to D652, in [Standard mapping](standard-mapping.md#defaults).

- **D643** Escape in the note box: saves and returns to the grid, as Google's (default).
- **D644** A cell with a note and an open comment: one triangle, the comment's colour; the hover card shows both,
  the note first (default).
- **D645** Fill down and the fill handle: never copy notes (default).
- **D646** Find and Replace within notes: not offered, as Google's (default).
- **D647** Who writes a note: an Editor alone; a Participant's writes are values (spreadsheet.md "Who may do what")
  (default).
- **D648** A note's text in a file: plain; ODF's paragraphs joined by line breaks, XLSX's runs joined, their
  formatting dropped, each line written back as a paragraph (ODF) or the text of one run (XLSX) (default).
- **D649** An XLSX note's author: not read (Google's notes have none); written as the file's `LiveDoc` author, its
  text without the author's prefix Excel adds by hand (default).
