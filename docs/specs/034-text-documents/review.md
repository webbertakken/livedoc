# Review

**Status: being built.** Comment threads are kept beside the writing, travel in both formats' files, and the room
judges a Participant's; they are drawn and added in the margin. The comments panel, mentions, assigning, reactions,
suggestions, versions and notifications are still to come.

Comments, suggestions, version history, comparing documents and notifications in a [text document](text-document.md).
The panels and threads are the shared [review surfaces](../012-collaboration/review-surfaces.md), built once for the
office kinds; this spec says what a text document puts in them.

## Editing modes

- **Editing** (⌘⌥⇧Z): changes are made. **Suggesting** (⌘⌥⇧X): changes are made as suggestions. **Viewing**
  (⌘⌥⇧C): read only, comments and suggestions hidden, as printed.
- An editing mode is one person's, never shared, and starts at the most an access level allows: an Editor in
  Editing, a Participant in Suggesting (fork D7, ruled), a Viewer in Viewing.
- The switch sits at the right of the title row ([Editing surface](editing-surface.md#the-title-row)); these are the
  text document's modes on the office shell's switch ([Office shell](../004-interface-design/office-shell.md#modes)).
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

### Threads in the margin

- **Where**: open threads stand in a column to the right of the page, 280 px wide and 16 px from the page's edge
  (default), each level with its stretch's first line, stacked down 8 px apart where they would overlap. While any
  is shown and the window is wide enough, the page moves left to make room, as Google's does; narrower, the column
  lies over the page's right edge. Resolved threads are not drawn; they wait in the comments panel. They are drawn
  at their own size whatever the zoom (default).
- **Selecting**: pressing a thread, or pressing in its highlighted text, selects it: its text is tinted darker, the
  card is raised and moves level with its text, and the cards around it make room. Escape, or pressing elsewhere,
  lets it go.
- **A card**: each comment's author disc, name and time, its text, and for a comment from a file the line "From the
  file"; a thread whose text is gone leads with "Original content deleted" and its quote. The first comment carries
  **Resolve** (a tick) for anyone who may comment. A comment's own author has **Edit** and **Delete** on it; an
  Editor has Delete on every comment. Deleting the first comment deletes the thread, after "Delete this comment
  thread?" (default, as Google asks). A selected thread shows **Reply** below its comments.
- **Adding** (⌘⌥M, Ctrl+Alt+M elsewhere; the toolbar's Add comment; Insert > Comment; the context menu's Comment;
  the margin's Add comment button beside a selection): on the selected stretch of the body, or the word at the
  caret when nothing is selected; a draft card opens level with it, its field focused, **Comment** and **Cancel**.
  The stretch is tinted while the draft is open; Comment begins the thread, Cancel or Escape drops it. With no word
  at the caret, or the caret in a header, footer or note, nothing opens and the status line says "Select some text
  to comment on" (default; Google comments on the body alone).
- **Who**: a session that may comment is an Editor or a Participant holding its adder key; in This Browser, where
  there is no room, the person's participant key signs their comments (default). Anyone else reads the threads and
  sees no Add comment, Reply, Resolve, Edit or Delete. Each comment is signed with its author's name and colour as
  they are when they write it.
- **Phone**: no margin; a thread opens over the page's bottom as a sheet (default), from its highlighted text.
- In the file: comments, replies, resolved state, assignees and reactions as
  [Standard mapping](standard-mapping.md#what-the-model-holds) and its extensions say.

### How a comment is kept

- **Beside the writing, never in it**: a document's threads are one map, `threads`, beside the bodies
  ([Live editing and storage](live-editing-and-storage.md#the-live-model)), as a PDF document's are; adding, replying
  to, resolving or deleting a comment never changes the writing, so it is never an undo step of the writing, never
  copied with the text it is on, and never merges with anyone's typing.
- **The anchor** is a stretch of one document tab's writing: its start and end as positions that follow the text
  (a Yjs relative position each), the start kept before text typed at it and the end before text typed after it, so
  typing at either edge of a commented stretch never stretches it, as Google's does not. Threads overlap freely.
- **Original content deleted**: when every character of the stretch is gone the anchor reads as empty and the thread
  is kept, marked so; undoing the delete brings the anchor back with its text. Only a thread whose quote has text is
  ever deleted.
- **A point comment**: a file's comment on no text (ODF's annotation without an end, Word's reference with no range)
  is kept as a thread on the empty stretch at its point, its quote empty, and never reads as deleted.
- **A comment's text is plain**: a file's comment paragraphs are joined by line breaks and their formatting dropped,
  as Google's comments are plain (default); each line is written back as a paragraph of its own.
- **A thread**: its id, its document tab, its anchor, its quoted text (the stretch as it read when the thread began,
  shown once its text is gone), resolved or open, and its comments in the order they were made.
- **A comment**: its id, text, time, author, mentions, assignee and reactions; edited comments keep their first time
  and note the time of the edit.
- **The author** of a comment made here is its author's adder key on the document
  ([Share roles](../013-workspace/share-roles.md#integrity), SR4) with their name and colour as they wrote it: the key
  says whose it is without saying who, the same person on every device, and different on every document. Every
  session with an identity that may comment carries its key on its ticket, an Editor's as a Participant's.
- **A comment from a file** is never credited to a LiveDoc person: it has the file's name for its author, no key, a
  neutral avatar and the line "From the file", never anyone's picture or colour, and it never reaches an Inbox as
  anyone's ([Comments](../035-pdf-documents/comments.md#authors) on a PDF document holds the same rule).
- **In the files**: a thread is written as the standard's comment at its anchor, its replies and resolved state as
  each format keeps them ([Standard mapping](standard-mapping.md)); a comment's author leaves as its name and comes
  back "From the file". A comment in a header, footer or note is not kept (default; Google places none there) and the
  conversion report counts it, as it counts a comment marker without its pair. Reactions and assignees join the files
  with mentions and assigned actions.
- **The room judges a Participant's update** (fork D7) by what it touches: only `threads`, and in it only comments
  carrying the sender's own key added, edited or deleted, threads begun with one, resolved or reopened, and the
  sender's own key added to or taken from a reaction; anything else asks for Editing and is refused whole
  ([Share roles](live-editing-and-storage.md#share-roles)). A session with no key may read and never comment.
- **An Editor's update is not judged** (default): an Editor may rewrite the whole document, comments included, as
  Google's editor may delete any comment; the editor writes only its own key on what it adds, and a key written for
  someone else by a crafted update is an Editor's to make, as any other edit is.
- **Limits**: a comment's text at most `COMMENT_TEXT_MAX` (2,000) characters, as LiveDoc's comments; at most
  `TEXT_DOCUMENT_THREADS_MAX` threads (2,000, (default)) and `TEXT_DOCUMENT_THREAD_COMMENTS_MAX` comments in one
  (500, (default)). The editor never makes more; the room refuses a Participant's update past them as its judge reads
  it, and an Editor's is bounded by the state's size, as all its writing is.

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
