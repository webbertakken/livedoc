# Comments

**Status: specified.** Nothing is built.

A **comment** on a [PDF document](pdf-document.md) is a thread on a [mark](marks.md): the mark says where, the thread
says what. Threads are LiveDoc's own comments, so mentions, reactions, assigned actions and the Inbox work as
everywhere; and they are written into the file as annotations with replies and state, so a thread survives Acrobat
and an Acrobat comment becomes a thread. The thread, composer and comments panel are the shared
[review surfaces](../012-collaboration/review-surfaces.md); this spec says what a PDF puts in them. The research is
[Comments](../../research/pdf-documents/comments.md).

## Anchors

A PDF's range anchor is a mark, of three shapes:

| Anchor                | Is                                                                     | Its label in a thread            |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| **A stretch of text** | A text mark: highlight, underline, strikethrough, insert, replace      | "on 'quarterly results', page 3" |
| **An area**           | A shape, a drawing, an area highlight, a stamp, a Text mark, a callout | "on an area, page 3"             |
| **A point**           | A note                                                                 | "on page 3"                      |

- **Commenting on selected text** (⌘⌥M, the selection bar's Comment, Insert > Comment) makes a highlight in the
  comment colour and opens its thread; commenting with nothing selected takes the Note tool.
- **Any mark may gain a thread**: pressing a mark and typing in its thread's composer starts one.
- A mark with a thread shows a small count beside it; the selected thread's mark is drawn stronger.

## Threads

As the review surfaces draw them, in the margin beside the page level with their mark, stacked where they would
overlap:

- The first comment and its replies, each with its author, time, **Edit** and **Delete** for its own author.
- **Resolve** (a tick) closes a thread; a resolved thread leaves the margin and can be **Reopened** from the panel.
- **Mentions**: `@` or `+` lists the document's people and the owner's contacts; mentioning someone who cannot open
  the document offers to share it ([Comment mentions](../012-collaboration/comment-mentions.md)).
- **Assigning**: a mention offers **Assign to <name>**; an assigned comment is an action in the assignee's Inbox
  ([Assigned actions](../012-collaboration/assigned-actions.md)).
- **Reactions**: emoji on a comment.
- **Unread**: a thread with comments the person has not seen is marked in the margin and the panel; opening it marks
  it read; **Mark as unread** puts it back. Read state is one person's, never in the file.
- **Review state**, where a file's reviewers set one (Accepted, Rejected, Cancelled, Completed), is shown as a chip
  on the thread and set from the thread's menu; Completed and Accepted read as resolved.
- A thread at the far side of a zoomed page stays reachable: the margin holds it level with its mark, and where the
  margin is off screen the thread opens as a popover on its mark.

## The comments panel

The shell's side panel (⌘⌥⇧A):

- Every thread, by page and place, each with its anchor label, first comment, reply count and state.
- **Filters**: All, For you, Open, Resolved, Unread; by author; by kind of mark; by page range. **Search** finds
  words in comments.
- **Marks without words** are listed under their own filter, so every mark is reachable from the panel.
- A press goes to the thread's mark; arrow keys move between threads; the keys of a selected thread are R reply, E
  resolve, J next, K previous, Escape to leave.
- The panel's menu: **Resolve all**, **Delete all** (an Editor's, asked first), **Import comments**, **Export
  comments**, **Print with comments**, **Download a summary**.

## Authors

- A comment made in LiveDoc is its account's or guest's: name, colour and picture from the server's own record, never
  from what a client sends.
- **A comment read from a file is never credited to a LiveDoc person.** It shows the name the file gives, a neutral
  avatar and the line "From the file"; it never borrows a person's picture or colour, never matches an account by
  name, and never reaches anyone's Inbox as theirs. A file can say any name wrote a comment.
- A reply made in LiveDoc on a thread that came with the file is a LiveDoc comment in that thread.
- A person's name on the comments they make is their display name; changing it changes later comments, as
  everywhere in LiveDoc.

## In the file

| LiveDoc                                   | Written to the file as                                                                  | Read from a file as                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| The anchor mark                           | The markup annotation itself, `NM` its LiveDoc id                                       | Any markup annotation with words or replies starts a thread               |
| The first comment                         | The mark's `Contents`, `T` (the author's name), `M` and `CreationDate`                  | The same                                                                  |
| A reply                                   | A text annotation with `IRT` to the mark and `RT` `R`                                   | The same; replies are ordered by date                                     |
| Resolved                                  | A state reply: `StateModel` `Review`, `State` `Completed`                               | `Completed` or `Accepted` reads as resolved                               |
| A review state                            | A state reply with that state                                                           | The same                                                                  |
| A mention                                 | Its text, as written (`@Name`)                                                          | Plain text; never resolved to a person                                    |
| Formatting in a comment                   | The plain words in `Contents`, the rich form in the annotation's rich text entry        | Rich text read as LiveDoc's own inline formatting; anything else as plain |
| A reaction, an assignment, edits' history | A private entry of LiveDoc's own in the annotation, which other readers ignore and keep | Read back from that entry; absent in a file from elsewhere                |
| The author                                | A name. The file has no place for an account                                            | A name and no account ([Authors](#authors))                               |

- Threads are written as an addition, with the marks ([Saving](saving.md#addition-or-rewrite)).
- A pop-up note other readers show for a mark is the mark's own `Popup`, written closed.
- **Import comments** reads an FDF or XFDF file's annotations onto this PDF as marks and threads, each "From the
  file"; one whose page is absent is listed and skipped. **Export comments** writes every mark and thread as XFDF
  (or FDF), for another reader.
- "Send for review", review trackers and shared review servers are not built: a LiveDoc document is reviewed live,
  by sharing it ([Parity matrix](parity-matrix.md)).

## When the mark goes

- Deleting a mark keeps its thread, marked "On deleted content", listed in the panel until resolved or deleted.
- A thread whose page is deleted is kept with the page and returns if the delete is undone; in the panel it reads
  "On a deleted page".
- A thread whose text was edited in Editing stays on its mark; where the marked text is gone, the mark keeps its
  place on the page and the thread says "The text this was on has changed."
- A stored file replaced from outside carries threads where their anchors hold
  ([Saving](saving.md#when-the-stored-file-is-replaced)).

## Summary

**Download a summary** writes the threads by page, each with its anchor's text, authors, times and state, as a PDF or
`.txt`. **Print with comments** prints the pages with the summary after them
([Files, print and sync](files-print-and-sync.md#printing)).

## Notifications

As every kind's: a mention, a reply on a thread a person is in and an assignment reach the Inbox, and email where the
host has it configured and the person asked for it
([Profile and email notifications](../014-identity/profile-and-email-notifications.md)). Nothing is sent to someone
who cannot open the document.

## Limits

| Constant                        | Value     | Why                                                                        |
| ------------------------------- | --------- | -------------------------------------------------------------------------- |
| `PDF_THREAD_MAX_COMMENTS`       | 500       | `(default)` Comments in one thread; a longer one is closed for new replies |
| `PDF_IMPORT_COMMENTS_MAX_BYTES` | 8,000,000 | `(default)` An FDF or XFDF file; the api's body cap                        |

A comment's own length is LiveDoc's comments' limit.

## Share roles

| Role            | Comments                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **Editor**      | All: add, reply, resolve, reopen, react, mention, assign; delete anyone's; import, export; resolve all |
| **Participant** | Add, reply, resolve, reopen, react, mention, assign; edit and delete their own; export                 |
| **Viewer**      | Read threads and the panel; no composer                                                                |

## Keyboard and accessibility

- A thread is a group named by its anchor label; each comment an article with its author and time; the composer a
  labelled text field; new replies are announced politely while the thread is open.
- Everything the margin does, the panel does too, by keyboard.
- "From the file" is text, not only a neutral avatar.

## Telemetry and observability

- `Comment · Added · Pdf`, `Comment · Resolved · Pdf`, `Comment · Unresolved · Pdf`, `Comment · Mentioned · Pdf`,
  `Pdf · Imported · Comments`, `Pdf · Exported · <Comments|CommentsSummary>`. Never a comment's words or an
  author's name.
- Fingerprints: `[pdf] threads-read count=<n> replies=<n> from-file=<n>`, `[pdf] comments-imported count=<n>
skipped=<n>`.

## Errors

| When                                 | A person sees                                                   |
| ------------------------------------ | --------------------------------------------------------------- |
| An import's file is not FDF or XFDF  | "That file holds no comments LiveDoc can read."                 |
| An import names pages this PDF lacks | "12 comments imported. 3 were for pages this PDF doesn't have." |
| A thread is full                     | "This thread is full. Start a new comment."                     |
| A comment cannot be sent             | It stays in the composer: "Not sent. Try again."                |
