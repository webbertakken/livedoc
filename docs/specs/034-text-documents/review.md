# Review

**Status: specified.** Nothing is built.

Comments, suggestions, version history, comparing documents and notifications in a [text document](text-document.md).
The panels and threads are the shared [review surfaces](../012-collaboration/review-surfaces.md), built once for the
office kinds; this spec says what a text document puts in them.

## Editing modes

- **Editing** (⌘⌥⇧Z): changes are made. **Suggesting** (⌘⌥⇧X): changes are made as suggestions. **Viewing**
  (⌘⌥⇧C): read only, comments and suggestions hidden, as printed.
- An editing mode is one person's, never shared, and starts at the most an access level allows: an Editor in
  Editing, a Participant in Suggesting (fork D7, ruled), a Viewer in Viewing.
- The switch sits at the right of the title row ([Editing surface](editing-surface.md#the-title-row)).
- A mode never grants more than the level: Viewing shows the menus and toolbar a Viewer sees, and the writing is read
  only; a mode the level does not allow is not listed.
- Until suggesting is built, Suggesting is listed dimmed ("Coming soon") and a Participant starts in Viewing.
- The mode is kept while the document is open, never stored: each open starts at the level's mode `(default)`.
- Telemetry: `UI · Changed · TextDocumentMode` when a person changes it.

## Comments

- **Adding**: select text and ⌘⌥M, the toolbar's Add comment, Insert > Comment or the context menu; a comment button
  appears in the right margin beside a selection. The thread opens in the margin beside its text.
- **A thread**: the first comment and its replies, each with its author, time, and **Edit** and **Delete** for its own
  author; **Resolve** (a tick) closes it; a resolved thread can be **Reopened** from the comments panel.
- **Mentions**: `@` or `+` in a comment lists the document's people and the owner's contacts; mentioning someone who
  cannot open the document offers to share it ([Comment mentions](../012-collaboration/comment-mentions.md)).
- **Assigning**: a mention offers **Assign to <name>**; an assigned comment is an action, as LiveDoc's assigned
  actions are ([Assigned actions](../012-collaboration/assigned-actions.md)), shown in the assignee's Inbox.
- **Reactions**: emoji on a comment, as Google's.
- **Highlight**: the commented text is tinted; the selected thread's text darker.
- **The comments panel** (comment history, ⌘⌥⇧A): every thread, with filters **All**, **For you**, **Open**,
  **Resolved**, and by document tab; a press scrolls to the text.
- **Keys on a selected comment**: R reply, J next, K previous, E resolve, U exit; ⌘⌥ N then C / P then C between
  comments.
- **Deleting the text** a comment is on keeps the thread, marked "Original content deleted", as Google does.
- In the file: comments, replies, resolved state, assignees and reactions as
  [Standard mapping](standard-mapping.md#what-the-model-holds) and its extensions say.

## Suggesting

- In Suggesting mode, typed text is an **insertion** suggestion (in the author's colour, underlined), deleted text a
  **deletion** suggestion (struck through), and a formatting change a **format** suggestion; each opens a card in the
  margin: "Add: …", "Delete: …", "Format: bold", with the author and time, **Accept** (a tick) and **Reject** (×), and
  a reply thread.
- Adjacent changes by one person merge into one suggestion, as Google merges them.
- Suggestions are kept in the file as tracked changes (ODF `text:tracked-changes`, OOXML `w:ins` / `w:del` /
  `w:rPrChange`), so Word and LibreOffice show them as tracked changes and theirs arrive as suggestions.
- A suggestion on a structural change (a table row, a page break, a picture) is shown with its kind's card.

## Reviewing suggestions

Tools > Review suggested edits (⌘⌥ O then U): a floating panel with **Accept all**, **Reject all**, the count, Next and
Previous, and **Preview**: Show suggested edits, Preview accept all, Preview reject all.

## Compare documents

Tools > Compare documents: choose another LiveDoc text document (or a version), an attribution name, and "Include
comments from the selected document"; it makes a new text document holding the first with every difference as a
suggestion attributed to that name.

## Version history

- File > Version history > See version history (⌘⌥⇧H): the document is shown read-only at the chosen version with
  the panel at the right: versions by date, grouped by day, each with its editors; **Only show named versions**; the
  current version first.
- **Show changes**: edits since the previous version tinted in each editor's colour; ⌘⌥ N then R / P then R step
  through them.
- **Name current version** (File > Version history), or a version's menu: Name this version, Restore this version,
  Make a copy.
- **Restore this version** makes a new version equal to it; nothing is lost.
- Automatic versions are taken after every 30 minutes of edits or 1,000 edit operations, whichever first
  (`TEXT_DOCUMENT_VERSION_EVERY`, (default)); named ones are kept forever, automatic ones thinned after 30 days to one
  per day ([Live editing and storage](live-editing-and-storage.md#versions)).

## Notifications

Tools > Notification settings: comments (all, only yours and mentions, none) and edits (a daily digest or none),
sent by email where the host has email configured ([Profile and email notifications](../014-identity/profile-and-email-notifications.md)); where it is not, the
setting is not shown and the Inbox carries them. Nothing is sent to someone who cannot open the document.

## Share roles

| Role            | Comments                            | Suggestions                            | Versions                 |
| --------------- | ----------------------------------- | -------------------------------------- | ------------------------ |
| **Editor**      | All                                 | Make, accept, reject                   | See, name, restore, copy |
| **Participant** | Add, reply, resolve, react, mention | Make (D7), reply; never accept         | See (as a Viewer does)   |
| **Viewer**      | Read                                | Read (in Editing and Suggesting views) | None, as Google's Viewer |

## Telemetry

`Comment · Added · TextDocument`, `Comment · Resolved · TextDocument`, `Element · Added · TextDocumentSuggestion`,
`Element · Changed · TextDocumentSuggestion<Accepted|Rejected|AcceptedAll|RejectedAll>`,
`UI · Changed · TextDocumentEditingMode<Mode>`, `Document · Opened · TextDocumentVersionHistory`,
`Document · Changed · TextDocumentVersion<Named|Restored>`, `Document · Created · TextDocumentCompare`. Never text.
