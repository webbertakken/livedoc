# Review surfaces

**Status: specified.** Nothing is built.

The surfaces the office kinds share for review: comment threads anchored to a range, the comments panel, version
history, and the editing mode switch. Built once for the [text document](../034-text-documents/text-document.md) and
the spreadsheet of plan 0020; each kind says what a range is in its content and what it puts in them
([Review](../034-text-documents/review.md)).

## Comment threads

- A **range anchor** is the kind's own: a stretch of text, a cell or range of cells. The thread component takes the
  anchor's label ("on 'quarterly results'", "on B4:C9") and its live state (present, deleted).
- A thread: comments with author, time, reactions, edit and delete for their author, resolve and reopen, mentions,
  assign; the composer with `@` / `+` mentions. The same data and ops as LiveDoc's comments today
  ([Comment mentions](comment-mentions.md), [Assigned actions](assigned-actions.md)), so the Inbox reads them alike.
- Placed in the margin beside its anchor, stacked down in anchor order 8 px apart when they would overlap; the selected
  thread moves to sit level with its anchor.

## The comments panel

A side panel of the [office shell](../004-interface-design/office-shell.md): filters (All, For you, Open, Resolved, and
the kind's own, such as by document tab or by sheet), each thread's anchor label and first comment, a press going to
it.

## Version history

A full-window mode of the shell: the content read-only at a version, the version list at the right (grouped by day,
editors' colours, named versions, "Only show named versions"), **Show changes**, the version's menu (Name, Restore,
Make a copy), and **Back** (the arrow at the top left) to the current version. The kind supplies the rendering of a
version and of its changes.

## The editing mode switch

Editing, Suggesting, Viewing: a menu in the title row, per person, starting at the most the session's access level
allows. A kind without suggestions (the spreadsheet, where Google has none) offers Editing and Viewing only.

## Share roles

As each kind's review spec says; the surfaces render what the session's `can` allows.
