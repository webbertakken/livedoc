# Review surfaces

**Status: being built.** Comment threads and the comments panel are built for the text document; version history
and the mode switch are still to come.

The surfaces the office kinds share for review: comment threads anchored to a range, the comments panel, version
history, and the editing mode switch. Built once for the [text document](../034-text-documents/text-document.md), the
spreadsheet of plan 0020 and the [PDF document](../035-pdf-documents/pdf-document.md); each kind says what a range is
in its content and what it puts in them ([Review](../034-text-documents/review.md),
[Comments](../035-pdf-documents/comments.md)).

## Comment threads

- A **range anchor** is the kind's own: a stretch of text, a cell or range of cells, a mark on a PDF page. The thread
  component takes the anchor's label ("on 'quarterly results'", "on B4:C9", "on an area, page 3") and its live state
  (present, deleted).
- A thread: comments with author, time, reactions, edit and delete for their author, resolve and reopen, mentions,
  assign; the composer with `@` / `+` mentions. The same data and ops as LiveDoc's comments today
  ([Comment mentions](comment-mentions.md), [Assigned actions](assigned-actions.md)), so the Inbox reads them alike.
- Placed in the margin beside its anchor, stacked down in anchor order 8 px apart when they would overlap; the selected
  thread moves to sit level with its anchor.

## The comments panel

A side panel of the [office shell](../004-interface-design/office-shell.md), titled **Comments**, opened by the title
row's Comment history and ⌘⌥⇧A: filters (All, For you, Open, Resolved, and the kind's own, such as by document tab,
by sheet, or by page and kind of mark), each thread's anchor label and first comment, its reply count and resolved
state with Reopen, a press going to it. Built once (`components/office/review/OfficeCommentsPanel.tsx`, its filters
pure in `lib/office/review/comment-filters.ts`); a kind hands it its threads as rows (an id, the anchor label, the
comments, resolved, deleted, the group the kind's own filter reads) and its groups, and does the going.
"For you" reads a comment's author key: the threads where another replied after one of yours, and those that mention
you or are assigned to you once mentions are kept.

## Version history

A full-window mode of the shell, built once and generic over kinds, the text document first; plan 0020's spreadsheet
plugs its own rendering in later. The shell owns:

- **The frame**: the title row replaced by **Back** (the arrow at the top left), the version's name or time, and the
  kind's own actions; the content read-only at the chosen version; the menus, toolbar and comments gone.
- **The panel** at the right, **Version history**: **Current version** first, then the versions newest first,
  grouped by day (Today, Yesterday, then the date), each with its time or name, its editors (a dot of each
  one's colour and their name) and, for one from a restore, "Restored from …"; **Only show named versions**;
  **Show changes**; and each version's menu (Name this version, Rename, Remove name, Restore this version, Make a
  copy), each item offered as the kind allows.
- **The keys**: ⌘⌥⇧H opens it; ⌘⌥ N then R and ⌘⌥ P then R go to the next and previous change; Escape and Back
  leave it, on the current version. Arrow keys move through the list, Enter shows a version (a listbox).
- **Who**: as each kind's review spec says; the shell renders only what the session's `can` allows.

The kind supplies the versions (list, read, name, restore, copy), the rendering of a version and of its changes;
a text document's are in [Review](../034-text-documents/review.md#version-history) and
[Live editing and storage](../034-text-documents/live-editing-and-storage.md#versions); a PDF document's version is
a stored file and a point in its live changes ([Saving](../035-pdf-documents/saving.md#previous-versions-and-version-history)).

## The editing mode switch

Editing, Suggesting, Viewing: a menu in the title row, per person, starting at the most the session's access level
allows. A kind without suggestions (the spreadsheet, where Google has none) offers Editing and Viewing only. A PDF
document declares its own three: Reviewing, Editing and Viewing
([Editing modes](../035-pdf-documents/editing-modes.md)). The switch itself is the office shell's
([Modes](../004-interface-design/office-shell.md#modes)).

## Share roles

As each kind's review spec says; the surfaces render what the session's `can` allows.
