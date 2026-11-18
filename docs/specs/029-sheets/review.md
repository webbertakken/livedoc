# Review

**Status: specified.** Nothing is built.

Notes, comments, version history and a cell's edit history in a [spreadsheet](spreadsheet.md), through the review
surfaces plan 0019 specifies and builds for every document kind outside the canvas (comment threads, version
history, the mode switch). This page names what a spreadsheet adds.

## Notes

- **Insert › Note** (Shift+F2): a plain text note on a cell, a black corner triangle; hover shows it, an Editor
  edits it in place. Notes are the cell's, not threads: no replies, no mentions.
- ODF keeps notes as cell annotations, XLSX as legacy comments ([Standard mapping](standard-mapping.md)).

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

- **Editor** adds and edits notes (they are cell content); comments are anyone's whose link allows commenting, as
  everywhere in LiveDoc.
- Version history and edit history: Editors see both; Participants and Viewers see neither, as Google's.

## Accessibility

Corner markers are announced with the cell ("has note", "has comment"); Ctrl+Alt+Shift+N and P move between comments.

## Limits

Up to 1,000 threads a sheet and 500 comments a thread, as cell threads today; a note up to 50,000 characters.

## Telemetry

`Spreadsheet · Changed · Note`; comments and versions use the shell's events.
