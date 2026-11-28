# Review

**Status: partly built.** Notes, and comments in the grid and in the files, are built; comments through agents,
version history and a cell's edit history are not.

Notes, comments, version history and a cell's edit history in a [spreadsheet](spreadsheet.md), through the review
surfaces plan 0019 specifies and builds for every document kind outside the canvas (comment threads, version
history, the mode switch). This page names what a spreadsheet adds.

## Notes

**Status: built.** A note is plain text the cell holds, as Google's notes are: no author, no replies, no mentions,
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

**Status: partly built.** Threads in the sheet store, their write and the grid (marker, hover card, thread card,
Comments panel, keys, the Inbox) and in the files are built; the agents' commands are not. A comment thread is a conversation about a cell or a range, as Google's are: authors, replies,
mentions, assignees, reactions, resolve and reopen, the same thread 0019 specifies for every office kind
([Review surfaces](../012-collaboration/review-surfaces.md#comment-threads)) and a text document builds
([Comments](../034-text-documents/review.md#comments)). This page names what a spreadsheet adds.

### Where a thread lives

- **In the sheet store**, beside the cells and never in them (Webber, 2026-11-28): each sheet's threads by id, in the
  room's `sheet_threads`, read with the workbook and written by a **thread write** on the sheet's threads route. Adding,
  replying to, resolving or deleting a comment never changes a cell, is never an undo step and never merges with
  anyone's typing, as a text document's comments do not.
- **A thread**: its id, its sheet, its **anchor** (a range by row and column ids, `r1`, `c1`, `r2`, `c2`, one cell
  when they meet), resolved or open, and its comments in the order they were made.
- **A comment** is a text document's comment ([How a comment is kept](../034-text-documents/review.md#how-a-comment-is-kept)):
  its id, plain text (1 to `COMMENT_TEXT_MAX`, 2,000 characters), time, edit time, author, mentions, assignee and
  reactions. Its **author** is the writer's adder key on the document with their name and colour as they wrote it,
  stamped by the api from who sends the write, never read from it; a file's comment has the file's name for its
  author, no key, and reads "From the file".
- **The anchor follows its cells** through inserted, moved and sorted rows and columns, since their ids do. Its range
  is drawn while all four of its ids are on the sheet, else only its top-left cell. When its top-left cell's row or
  column is deleted the thread is kept and reads "The cell this comment was on was deleted" in the Comments panel,
  with no marker; undoing the deletion brings the row or column back with its id, and the marker with it (default,
  D653). A merged area's thread is its top-left cell's.
- **Copies**: copying cells, Duplicate, Copy To and Make a Copy of a sheet carry no threads: a thread is a
  conversation about the original's cells, as a pasted element leaves its own behind (default, D654).
- **A spreadsheet in This Browser** holds no comments: a comment needs an author on the document, which only a synced
  spreadsheet has; Insert › Comment and its keys are dimmed there, each hint saying to sync (default, D656).
- **Limits**: up to 1,000 threads a sheet (`SHEET_THREADS_MAX`) and 500 comments a thread
  (`SHEET_THREAD_COMMENTS_MAX`), as cell threads today; more are refused (`threads_full`, `thread_full`).

### The thread write

- `POST /api/documents/:id/sheets/:sheetId/threads` with one op: **start** (a new thread: its id, anchor and first comment), **reply**,
  **edit** (a comment's text, its mentions and assignee), **remove** (a comment; the first one takes the thread),
  **resolve** (resolved or reopened) and **react** (an emoji added or taken back by the sender's key).
- **Who may** ([Who may do what](#who-may-do-what)): an Editor and a Participant start, reply, resolve, reopen and
  react; each edits and removes their own comments by their key, and an Editor removes anyone's. A Viewer sends none
  (`forbidden`). A Participant's write is judged by the room as a text document's is (fork D7): their own key only.
- **Answered and relayed** as the thread's whole state after the op (or its id, gone), each with the thread's own
  count of changes, so a session keeps the latest state it has seen whatever order relays arrive in; a session that
  reconnects reads the workbook's threads again. The cells' ordered writes never carry a thread, so a Viewer's
  session, which never receives one, sees no gap. A Viewer's read of the workbook's threads answers none (as [What a Viewer receives](../034-text-documents/review.md#what-a-viewer-receives)).
- Refusals: `thread_invalid` (a malformed op, an anchor off the sheet, a text out of bounds), `thread_gone` (a
  thread or comment no longer there), `threads_full`, `thread_full`, `forbidden`.

### In the grid

- **Insert › Comment**, the toolbar's **Insert Comment**, the cell menu's **Comment** and **Ctrl+Alt+M** (⌘⌥M) open a
  new thread's card on the selection (the selection's last range is its anchor), or the active cell's thread when it
  has an open one. The card sits to the right of the anchor, as Google's: the comment field with `@` and `+` mentions
  and **Assign To**, **Comment** and **Cancel**.
- **The marker**: the anchor's top-left cell of an open thread shows an orange triangle in its top-right corner
  (`#f59e0b`, the comment colour, 6 px, as a note's), drawn with the cells. A cell with a note and an open thread
  shows the comment's triangle alone; the hover card shows the note first, then the thread (D644). A resolved thread
  shows no marker.
- **Hovering** an anchored cell for a moment (400 ms) shows the thread's card read-only: its first comment, its
  author and "N more"; a press on the cell or Ctrl+Alt+M opens the thread's card, with its replies, Reply, Resolve,
  Edit and Delete on one's own comments (an Editor's on any), and reactions.
- **The Comments panel** ([The comments panel](../012-collaboration/review-surfaces.md#the-comments-panel), the shell's
  `OfficeCommentsPanel`) lists every thread of the spreadsheet: each row labelled by its sheet and range
  (`Budget!B4:C9`), grouped by sheet (the kind's own filter), with All / For you and All / Open / Resolved. A press
  on a row opens its sheet with the anchor selected and its card open. The title row's comment history opens it.
- **Keys**: Ctrl+Alt+Shift+A opens the Comments panel; Ctrl+Alt+N, C and Ctrl+Alt+P, C move to the next and previous
  thread of the sheet in reading order (rows, then columns); on a selected thread R replies, J and K move, E edits
  one's own last comment, U and Escape let it go, as a text document's.
- **Accessibility**: an anchored cell is announced ", has comment" (after ", has note"); the card is a labelled
  region whose comments are a list, its fields labelled; focus returns to the grid when it closes.

### Mentions, assignees and the Inbox

- Mentions and **Assign To** are a text document's ([Mentions](../034-text-documents/review.md#mentions),
  [Assigning](../034-text-documents/review.md#assigning)): an assigned thread is an action in the assignee's Inbox.
- The room pushes each open thread to the collaboration index (`collab_threads`, anchor `cell`, the sheet's tab), so
  the Inbox lists it with its sheet and range; a Viewer gets no Inbox row of them.

### In the files

- XLSX keeps a thread as Excel does, a threaded comment with its persons and the legacy comment Excel writes beside it,
  and ODF as an annotation on the anchor's top-left cell holding the conversation as text; LiveDoc's record beside
  each keeps what the format cannot (the range, colours, mentions, assignees, reactions, a note on the same cell), so a
  round trip through LiveDoc keeps the thread whole and other applications show it as text
  ([Comments in the file](standard-mapping.md#comments-in-the-file), D657-D660).

### Agents

- The comment commands take a spreadsheet's cell or range (`--cell B4`, `--range B4:C9` on the sheet the ref names),
  so an agent starts, replies to, resolves and reopens a thread as on any document; `read_sheet` gives each anchored
  cell its open thread's count, and the cells view prints it (`💬 2`).

### Carried over

- Plan Sheet cell threads ([Sheet](sheet.md#cell-comments)) are moved onto their spreadsheet's sheet by the
  migration (Phase 16), each re-anchored to its cell's ids.

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
  (the marker and the hover card, never the note box).
- **Comments**, as a text document's ([Share roles](../034-text-documents/review.md#share-roles)): an Editor and a
  Participant start, reply, resolve, reopen, react and mention, and edit and delete their own comments, an Editor
  anyone's; a Viewer receives none, as Google's Viewer, and sees no marker, card or panel (default, D655).
- Version history and edit history: Editors see both; Participants and Viewers see neither, as Google's.

## Accessibility

Corner markers are announced with the cell ("has note", "has comment"); Ctrl+Alt+N, C and Ctrl+Alt+P, C move between
comments ([In the grid](#in-the-grid)).

## Limits

Up to 1,000 threads a sheet and 500 comments a thread, as cell threads today; a note up to 50,000 characters
(`SHEET_NOTE_MAX`), longer refused (`note_too_long`).

## Telemetry

`Spreadsheet · Changed · Note`; `Comment · Added · Spreadsheet`, `Comment · Resolved · Spreadsheet`,
`Comment · Added · SpreadsheetReaction`, `UI · Opened · SpreadsheetPanelComments` and the mentions' and actions' own
events, as a text document's; versions use the shell's events.

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
- **D653** A thread whose top-left cell's row or column is deleted: kept, no marker, "The cell this comment was on
  was deleted" in the Comments panel, back with an undone deletion; never resolved by the deletion (default).
- **D654** Copying cells or a sheet (Duplicate, Copy To, Make a Copy) carries no threads (default).
- **D655** A Viewer receives no comment threads of a spreadsheet, as a text document's Viewer (default).
- **D656** A spreadsheet in This Browser holds no comment threads; Insert › Comment is dimmed with a hint to sync
  (default).
