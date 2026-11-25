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

A full-window mode of the shell: the content read-only at a version, the version list at the right (grouped by day,
editors' colours, named versions, "Only show named versions"), **Show changes**, the version's menu (Name, Restore,
Make a copy), and **Back** (the arrow at the top left) to the current version. The kind supplies the rendering of a
version and of its changes; a PDF document's version is a stored file and a point in its live changes
([Saving](../035-pdf-documents/saving.md#previous-versions-and-version-history)).

## The editing mode switch

Editing, Suggesting, Viewing: a menu in the title row, per person, starting at the most the session's access level
allows. A kind without suggestions (the spreadsheet, where Google has none) offers Editing and Viewing only. A PDF
document declares its own three: Reviewing, Editing and Viewing
([Editing modes](../035-pdf-documents/editing-modes.md)). The switch itself is the office shell's
([Modes](../004-interface-design/office-shell.md#modes)).

## Share roles

As each kind's review spec says; the surfaces render what the session's `can` allows.
