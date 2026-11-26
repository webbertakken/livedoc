# Review

**Status: being built.** Comment threads are kept beside the writing, travel in both formats' files, and the room
judges a Participant's; they are drawn and added in the margin, listed in the comments panel and reached from the
keyboard; people react to them, mention one another and assign a comment, a mention or an assignment emailing whom
it names, and the Inbox lists the threads and assigned comments of those they concern. Suggestions are kept in the
writing, travel in both formats' files as tracked changes and the room judges a Participant's; Editors and
Participants suggest in Suggesting mode, from the writing, the menus and the toolbar. Suggestion cards, accepting and
rejecting, versions and notifications are still to come.

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
  only; a mode the level does not allow is not listed. Suggesting shows a Participant an Editor's menus and toolbar,
  its changes being proposals the room judges, with only what can be suggested running
  ([While suggesting](#while-suggesting)).
- The mode is kept while the document is open, never stored: each open starts at the level's mode `(default)`.
- Telemetry: `UI · Changed · TextDocumentMode` when a person changes it.

## Comments

- **Adding**: select text and ⌘⌥M, the toolbar's Add comment, Insert > Comment or the context menu; a comment button
  appears in the right margin beside a selection. The thread opens in the margin beside its text.
- **A thread**: the first comment and its replies, each with its author, time, and **Edit** and **Delete** for its own
  author; **Resolve** (a tick) closes it; a resolved thread can be **Reopened** from the comments panel.
- **Mentions**: `@` or `+` in a comment lists the document's people, the team's members, as LiveDoc's comments do
  ([Mentions](#mentions)).
- **Assigning**: a mention offers **Assign to <name>**; an assigned comment is an action, as LiveDoc's assigned
  actions are ([Assigned actions](../012-collaboration/assigned-actions.md)) ([Assigning](#assigning)).
- **Reactions**: emoji on a comment, as Google's ([Reactions](#reactions)).
- **Highlight**: the commented text is tinted; the selected thread's text darker.
- **The comments panel** (comment history, ⌘⌥⇧A): every thread, with filters **All**, **For you**, **Open**,
  **Resolved**, and by document tab; a press goes to the text ([The comments panel](#the-comments-panel)).
- **Keys on a selected comment**: R reply, J next, K previous, E resolve, U exit; Ctrl+⌘ (Ctrl+Alt) N then C / P then C
  between comments ([Keys on a selected comment](#keys-on-a-selected-comment)).
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

### The comments panel

- **Opening**: the title row's Comment history (a speech bubble with lines, "Open comment history") or ⌘⌥⇧A
  (Ctrl+Alt+Shift+A elsewhere) opens the comments panel on the right, the shell's side panel, as Google's comment
  history; either again closes it. Every session opens it: a Viewer reads it.
- **Its head**: the title **Comments**, then two lists side by side: **All comments** or **For you**, and **All**,
  **Open** or **Resolved** (default: All comments, All; the panel's choices are kept while the document is open).
  A document with more than one document tab adds a third, **All tabs** or each tab by its name (default: All tabs).
- **For you**: the threads where someone else replied after a comment of yours, those with a comment that mentions
  you, and those assigned to you, as Google's.
- **Its list**: every thread the choices let through, by document tab in the outline's order, and within a tab in the
  order the threads were begun (default), each a row: its quote (or "Original content deleted" and the quote, or
  nothing for a point comment), the first comment's author disc, name, time and text (three lines at most), "From
  the file" under a file's author, "1 reply" or "n replies", and for a resolved thread the line **Resolved** with
  **Reopen** for whoever may comment.
  The count of what is listed is said to a screen reader as the choices change ("3 comments").
- **Empty**: "No comments yet" (with "Select some text and press ⌘⌥M to comment." for whoever may comment) when the
  document holds none; "No comments match" when the choices let none through (default copy).
- **A press on a row** goes to its thread: its tab is shown where it is another and its text scrolled into the middle of
  the view; an open thread is selected in the margin, its card focused; a resolved thread's text is selected in the
  writing (default). A thread whose text no longer resolves goes nowhere and says "This comment's text is gone".
- **Reopen** opens a resolved thread again (it returns to the margin); it is the resolve toggle's other half, for an
  Editor or a Participant, never a Viewer.
- **Keys in the panel**: Up and Down move between rows, Home and End to the first and last, Enter goes, as any list.

### Keys on a selected comment

- A thread's card takes the keyboard once it is selected from the keyboard (Move to next or previous comment, Enter
  current comment) or pressed; with the focus on the card itself (never in its fields) the keys are **R** reply (the
  reply field takes the focus), **J** the next thread, **K** the previous one, **E** resolve (then as U),
  **U** exit (the thread let go, the caret back in the writing where it was). Escape lets go too.
- **Move to next comment** (Ctrl+⌘+N then C on a Mac, Ctrl+Alt+N then C elsewhere) and **Move to previous
  comment** (P then C) select the next or previous open thread of the tab shown, after or before the selected thread
  or else the caret, scroll its text into view and focus its card; past the last or before the first nothing moves
  (default).
- **Enter current comment** (Ctrl+⌘+E then C; Ctrl+Alt+E then C elsewhere) selects the open thread whose text holds
  the caret (the shortest where several do) and focuses its card; with none, nothing moves.
- J and K go between the open threads of the tab shown in the writing's order, never wrapping; a session that may not
  comment has J, K, U and Escape, never R or E.

### Reactions

- **Adding**: whoever may comment sees **Add emoji reaction** (a smiley with a plus) on a comment while it is hovered
  or holds the focus; it opens six quick reactions, 👍 ❤️ 😂 😮 😢 🎉, and **More emoji**, which opens the Insert emoji
  dialog and closes it on a pick (default). Picking one already given by oneself takes it back.
- **Drawn** under the comment's text as chips, each its emoji and how many gave it, the quick six first in their order,
  then the others by their characters (default). A chip with one's own reaction is tinted and pressed; a press adds or
  takes back one's own. For a session that may not comment the chips are text, never buttons.
- **Who**: each chip names its people, "You" first for one's own, each other by the name their comments in this
  document carry (the latest), else "Someone" (default): "You and Ada reacted with 👍".
- **Kept** beside the comment's text, one entry per emoji and reactor key, so two people reacting at once never lose
  one; a comment holds at most `TEXT_DOCUMENT_REACTIONS_MAX` (20, default) different emoji, each at most 16 UTF-16
  code units. The room takes a Participant's own key added or taken back alone ([How a comment is kept](#how-a-comment-is-kept)).
- **In the files**: `livedoc:reactions` on the comment (ODF's `office:annotation`, Word's `w:comment`), a JSON object
  of each emoji's reactor keys ([Standard mapping](standard-mapping.md#extensions)); another suite shows the
  comment without them. A reactor key names a person on this document alone, so a file opened as a new document keeps
  the reactions and names their people "Someone".
- Telemetry: `Comment · Added · TextDocumentReaction` when one is added (never the emoji).

### Mentions

- **Writing**: in a draft or a reply, `@` or `+` at the start of the field or after a space lists the document's
  people, as [Comment mentions](../012-collaboration/comment-mentions.md#writing-a-mention) says: the members of the
  team whose library holds the document, joined and invited, except oneself; picking one puts `@handle ` in the
  text. On a personal document, in This Browser and for a guest there is nobody: `@` shows "Mention teammates on a
  team document" and `+` shows nothing.
- **Nobody to share with**: Google also lists the owner's contacts and offers to share the document with someone
  who cannot open it; LiveDoc's people are the team's, who open it already, so there is no share offer
  ([Comment mentions](../012-collaboration/comment-mentions.md#who-can-be-mentioned)).
- **Kept** on the comment as its `mentions`, the shared shape (account id, member id, name, handle), only those whose
  handle is still in the text when it is sent, at most `MENTIONS_MAX` (20); editing a comment keeps those whose handle
  is still in its text, and adds none (default: the edit field lists nobody). The room takes a Participant's own
  comment with mentions in that shape and within the limits, and refuses one past them.
- **Drawn**: an `@handle` that matches one of the comment's mentions is a chip, semibold in the accent on a soft
  tint, in the margin and in the comments panel; an `@word` that matches none is plain text.
- **The email**: once a draft or a reply with mentions is added (never an edit), the editor asks the api to email
  those it names, the way a comment on a canvas does
  ([Comment mentions](../012-collaboration/comment-mentions.md#the-email)): "{author} mentioned you in {document}",
  the comment quoted, **Open the document**; best effort, honouring each person's setting, only where email is
  configured. The [Inbox](../013-workspace/inbox.md#27-text-document-threads) lists the thread for whom it mentions,
  for whom wrote in it and for the document's owner, while it is open; its Open goes to the thread.
- **In the files**: `livedoc:mentions` on the comment (ODF's `office:annotation`, Word's `w:comment`), a JSON array
  of each mention's name and handle, never its account or member id, which say who someone is beyond this document
  (default) ([Standard mapping](standard-mapping.md#extensions)). A file read back draws the chips and reaches nobody.
- Telemetry: `Comment · Mentioned` once for a comment added with mentions (never who), beside
  `Comment · Added · TextDocument`.

### Assigning

- **Offering**: while a draft's or a reply's text names someone it mentions, a checkbox under the field reads
  **Assign to <name>**, for the last of them picked (default), unticked; on a thread already assigned it reads
  **Reassign to <name>**, and is not offered for whom it is assigned to already. Ticking it and sending assigns the
  thread to them.
- **Kept**: the comment that assigns carries its `assignee`, one of its own mentions (the same account id, member id,
  name and handle); the thread is assigned to the assignee of its latest comment that carries one. Editing a comment
  never changes its assignee (default); deleting the comment that assigned takes the assignment back to the one
  before it. The room takes a Participant's own comment only with an assignee that is one of its mentions.
- **Drawn**: an assigned thread's card and its row in the comments panel lead with **Assigned to <name>** ("Assigned
  to you" for the reader), and its Resolve reads **Mark as done** (default, as Google's); marking it done resolves the
  thread, and Reopen opens it again, still assigned.
- **For you** lists the threads assigned to the reader (by account), open or resolved as the second list says.
- **The email**: once a comment that assigns is added, the editor asks the api to email the assignee, as an assigned
  action's ([Assigned actions](../012-collaboration/assigned-actions.md#4-email-notification)): the action's name is
  the comment's first line, cut at a word to 200 characters with an ellipsis, its description the whole comment
  (default); best effort, honouring the assignee's setting, only where email is configured. The
  [Inbox](../013-workspace/inbox.md#27-text-document-threads) lists it as an action under My Actions for the
  assignee and Assigned by Me for whoever assigned it, until it is marked done.
- **In the files**: `livedoc:assignee` on the comment, a JSON object of the assignee's name and handle, never an id
  (default) ([Standard mapping](standard-mapping.md#extensions)); a file read back draws "Assigned to <name>" and
  reaches nobody.
- Telemetry: `Action · Created · TextDocumentComment` when a comment assigns (never who).

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
  conversion report counts it, as it counts a comment marker without its pair. Reactions and mentions
  are kept as [Reactions](#reactions) and [Mentions](#mentions) say, assignees as [Assigning](#assigning) says.
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

### While suggesting

- **Typing** inserts suggested text, after any text it replaces, which is suggested deleted; the caret follows it.
- **Deleting** one's own suggested text removes it; anyone else's text is marked deleted and stays, the caret moving
  past it: before it for Backspace, after it for Delete. Text already suggested deleted is passed over.
- **Enter** suggests a paragraph break; **Backspace** at a paragraph's start suggests a join, or takes back one's own
  suggested break. A deletion across paragraphs marks the text in each and joins the later ones.
- **Formatting** text suggests a format change that keeps the formatting before; formatting one's own suggested text
  simply formats it; formatting text someone else suggested a format change to says "Someone else has suggested a
  change to this formatting." (default) and changes nothing.
- **A paragraph's** style, alignment, indents, spacing or list suggests a paragraph format change keeping its style,
  formatting and list before; one's own suggested paragraph is simply changed.
- **One suggestion**: a change next to the person's own earlier suggestion (touching it, or replacing text) joins it.
- **Not yet**: a change of structure (a table, a section or page break, a table of contents), and what is kept beside
  the writing (page setup, headers and footers, document tabs, styles, list definitions), says "This can't be
  suggested yet." (default) and changes nothing; the controls for the latter are dimmed while suggesting.
- **Pasting** inserts as typing does; what is pasted from suggested text arrives plain in Editing.
- **Undo** takes back one's own suggestions step by step, as any edit.
- The refusal lines show for 5 seconds (`SUGGESTING_NOTICE_MS`, (default)) in the status band.
- **A Participant** sees an Editor's menus, toolbar and context menu in Suggesting, as Google's Commenter does
  ([Office shell](../004-interface-design/office-shell.md#modes)). What can be suggested runs: Edit's Undo, Redo, Cut,
  Paste, Paste without formatting and Delete; Insert's Link, Special characters and Emoji; Format's Text, Align &
  indent, Line & paragraph spacing, Borders and shading and Clear formatting; and the toolbar's Paint format, font,
  size, text formatting, Align, Line and paragraph spacing, indents and Clear formatting. Everything else is dimmed:
  what cannot yet be suggested, what is kept beside the writing, and paragraph styles and lists, whose definitions
  are kept beside the writing too (default).
- Telemetry: `Element · Added · TextDocumentSuggestion` once per suggestion begun, never per keystroke.

### Suggestion cards

- **Where**: each suggestion of the tab shown has a card in the margin beside its first part, stacked with the
  comment threads' cards as they are ([Threads in the margin](#threads-in-the-margin)), and in the sheet on a phone.
- **A card**: the author's disc, name and time (the time of its first part), "From the file" under a file's author,
  and what it does, one line per kind, quoted text cut at 60 characters with an ellipsis (default copy):
  - **Add: “…”** for inserted text, **Delete: “…”** for deleted text, and **Replace: “…” with “…”** when one
    suggestion deletes text and inserts text;
  - **Format: Bold, Italic** naming what a format suggestion changed (Bold, Italic, Underline, Strikethrough,
    Superscript or subscript, Small caps, Font, Font size, Text colour, Highlight colour, Link, Text style; anything
    else "Text formatting");
  - **Add: Paragraph break** and **Delete: Paragraph break** for a break and a join, **Format: Paragraph** for a
    paragraph format suggestion;
  - **Add: Picture** (or the object's name: Equation, Footnote, Field, Bookmark) for an object in a line, **Add:
    Table** (or Section break, Table of contents) for a block, and **Delete: …** for either deleted.
- **Accept** (a tick, "Accept suggestion") and **Reject** (×, "Reject suggestion") on the card: an Editor has both
  on every suggestion; a Participant has Reject on their own alone, which takes it back; a Viewer has neither. In
  Viewing no one has them (default). Either settles the whole suggestion, all its parts, as one change of the
  writing undone with ⌘Z, and the card goes.
- **Selecting**: pressing a card selects it, raised and moved level with its text, as a thread's; a selected comment
  thread is let go, and the other way round. Escape lets it go.
- **Move to next suggestion** (Ctrl+⌘+N then U on a Mac, Ctrl+Alt+N then U elsewhere) and **Move to previous
  suggestion** (P then U) select the next or previous suggestion of the tab shown, after or before the selected one or
  else the caret, scroll its text into view and focus its card; past the last or before the first nothing moves
  (default, as comments).
- Telemetry: `Element · Changed · TextDocumentSuggestionAccepted` and `…Rejected`, once per suggestion settled.

### How a suggestion is kept

- **In the writing, where it stands**, never beside it ([Live editing and storage](live-editing-and-storage.md#the-live-model)),
  so it moves, splits and merges with the text as the text does:
  - an **insertion** is text, or an object in a line, carrying its insertion; it reads as written;
  - a **deletion** is text still in the writing carrying its deletion; it reads as struck through until accepted;
  - a **format** suggestion is text already showing its new formatting, carrying the formatting it had before;
  - a **paragraph break** is a paragraph whose start carries an insertion (Enter while suggesting), a **join** one
    whose start carries a deletion (the break before it deleted while suggesting), and a **paragraph format**
    suggestion a paragraph carrying its style, list and paragraph formatting from before;
  - a whole block (a table, a section break, a table of contents) carries an insertion or a deletion.
- **What each part holds**: its suggestion's id, its author (their adder key, name and colour, as a comment's author:
  [How a comment is kept](#how-a-comment-is-kept)) and when it was made. A suggestion is every part with one id,
  across stretches and paragraphs: one person's adjacent changes share an id, so they read and are accepted as one.
- **One of each kind on a stretch**: a character carries at most one insertion, one deletion and one format
  suggestion. Deleting someone else's suggested insertion while suggesting is a deletion over it; formatting text that
  carries someone else's format suggestion is not offered while suggesting (default).
- **Accepting** an insertion or a paragraph break keeps it and drops its mark; a deletion removes its text, a join
  joins its paragraph to the one before, a format drops what was before. **Rejecting** removes an insertion's text,
  joins a paragraph break's paragraph back, drops a deletion's or a join's mark, and puts a format's before back.
  Either is one change of the writing, undone with ⌘Z.
- **Where**: in the body of each document tab. Headers, footers and notes take no suggestions; while suggesting they
  read as they do in Viewing (default).
- **The room judges a Participant's update** (fork D7): it is theirs when the writing, read with the sender's own
  suggestions rejected, is the same before and after, so it adds, changes or withdraws only the sender's own
  suggestions, never anyone's writing or anyone else's suggestion; anything else asks for Editing and is refused
  whole. The comments' rules stand beside it. An Editor's update is not judged, as with comments.
- **Limits**: at most `TEXT_DOCUMENT_SUGGESTIONS_MAX` suggestions (5,000, (default)) in one document; the editor
  makes none past it and the room refuses a Participant's update past it.
- **In the files**: a suggestion leaves as each format's tracked change ([Standard mapping](standard-mapping.md)) and
  a file's tracked change arrives as a suggestion **From the file**: its author the file's name for them, never a
  LiveDoc person, as a file's comment's. Each tracked change is its own suggestion; adjacent ones of one author are not
  merged (default). A Word move arrives as a deletion where it left and an insertion where it landed (default). A
  file's own "track changes" setting is kept as the file has it, never read as anyone's mode (default). A tracked
  change in a header, footer or note is settled as the file is read, an insertion kept and a deletion dropped, and
  reported `suggestion-in-story`.
- **Search** reads a suggested insertion as the writing it is, and a suggested deletion too, until it is accepted.

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

`Comment · Added · TextDocument`, `Comment · Resolved · TextDocument`, `UI · Opened · TextDocumentPanelComments`,
`Comment · Added · TextDocumentReaction`, `Comment · Mentioned`, `Action · Created · TextDocumentComment`, `Element · Added · TextDocumentSuggestion`, `Element · Changed · TextDocumentSuggestion<Accepted|Rejected|AcceptedAll|RejectedAll>`,
`UI · Changed · TextDocumentEditingMode<Mode>`, `Document · Opened · TextDocumentVersionHistory`,
`Document · Changed · TextDocumentVersion<Named|Restored>`, `Document · Created · TextDocumentCompare`. Never text.
