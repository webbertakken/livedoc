# Live editing and storage

**Status: specified; a first slice is built.** Built: the layout's `stored` and `marks` roots, a change and what takes
it back for marks, field values, a page's turn and what was deleted of the stored file, the room storing a PDF's
live changes as a live tab kind (`pdf`, `pdf-refused`), its two doors, the digest's pages and marks, the stored
file in the blob store, and the surface bound to the room: sending, reconnecting, the local copy of unconfirmed
changes, the save status, a refused change dropped, a Participant's changes judged by what they touch, the stored file
replaced in the room for the budget, with its previous versions held, the rows of "Concurrent changes" whose roots
are built (marks, field values, a page's turn, a replacement), a change carried across a replacement, one undo
timeline a person, and of presence the page a person is on: sent, said again to whoever joins, and reached by a press
on their avatar in the title row, a copy with its live changes (one's own and someone else's), a document passing to
another owner, a PDF tab never shared between documents, the Trash, and This Browser: a PDF kept and changed there,
arriving there, synced, taken offline, copied and purged, and a cloud PDF's file kept once read. Opening a cloud PDF
without a connection, the stored file replaced for the budget in This Browser, branches, the copy dialog, versions,
what the servers make (but a browser's thumbnail, which is built), the selection an undo puts back and the line a
dimmed Undo says are not built; nor, of presence, a person's colour on a thumbnail, anything held (a text selection,
a mark, an object, a text box typed in) and the mode in an avatar's tooltip, each drawn with the area that shows it.

How a [PDF document](pdf-document.md) is changed by people and agents at once, stored, kept offline, branched,
copied, versioned, searched and listed, when the thing they share is a file of bytes only an engine reads. The
research is [The live model](../../research/pdf-documents/live-model.md),
[Bytes](../../research/pdf-documents/bytes.md) and [What the servers need](../../research/pdf-documents/servers.md).

## The live model

- A PDF document is its **stored file** and its **live changes** ([Saving](saving.md)). The stored file is bytes in
  the [blob store](../006-document/blob-store.md), never altered. The live changes are state in the document's room.
- **Each person's engine holds the stored file and applies the live changes** to show the pages; a bake applies them
  to write a file.
- **The live changes are a sequence CRDT**, Yjs, as a [text document](../034-text-documents/live-editing-and-storage.md)
  is: maps by id, an array for the page order, text types for words people type. The room stores, chunks, compacts
  and catches up such a state for every **live tab kind**
  ([Live state](../006-document/kinds-outside-the-canvas.md#live-state)); a PDF document is one, declaring only what
  is its own.

### The layout

How the live changes lie in the state, so every reader (the surface, the room, the api, agents, the CLI) reads and
writes one shape `(default)`:

| Root          | Type  | Holds                                                                                                              |
| ------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| `stored`      | Map   | `blob`: the stored file these changes are on; `pages`: how many pages it has. Written once per stored file         |
| `pageOrder`   | Array | The pages in order, each a **page name**; absent until a page operation is made                                    |
| `pages`       | Map   | By page name: a page's own changes (rotation, crop, size, label) and, for an inserted page, where it came from     |
| `marks`       | Map   | By mark id: the mark, each property a whole value; a Text mark's words a text type ([Marks](marks.md))             |
| `threads`     | Map   | By mark id: the comment thread on that mark, as LiveDoc's comments are ([Comments](comments.md))                   |
| `fieldValues` | Map   | By the field's full name: its value and who set it ([Fields](fields.md))                                           |
| `objects`     | Map   | By page name, then object name: an edit to page content ([Editing text](editing-text.md), [Objects](objects.md))   |
| `fields`      | Map   | By field id: a field built or changed in Editing ([Building fields](building-fields.md))                           |
| `document`    | Map   | Whole values: properties, bookmarks, headers and footers, watermarks, backgrounds, embedded files added or removed |
| `recognised`  | Map   | By page name: a scanned page's recognised words with their places ([Scans](scans.md))                              |
| `removed`     | Map   | By id: a mark, field or object of the stored file that was deleted                                                 |

- **A page name** is the page's object number in the stored file (`p:<n>`), which page operations never change, or a
  fresh id for an inserted page (`n:<id>`). A page number is where a name sits in the order, never an identity.
- **An object name** is the object's index in the stored file's page (`o:<n>`), or a fresh id for a new one. A mark or
  field the file came with is named by its object number; a new one by a fresh id.
- **The state names its stored file.** A client never applies live changes to a stored file other than `stored.blob`:
  it fetches that file first. A state without `stored` is read as changes on the tab's `blob`, empty.
- **Empty is the common case.** A PDF nobody changed has no state at all; nothing is written by reading
  ([Saving](saving.md#an-unchanged-file)).
- Words never ride a room op as plain text: every change is a Yjs update, as a text document's is.

### A change and what takes it back

- **Every change is a change to one entry** of a root that is a map by id: the entry is **put** (it becomes exactly
  what is given, new or not), some of its properties are **set** or unset, or it is **removed**. A mark made, a
  mark's look changed, a field filled, a page turned and a mark of the stored file deleted are each one such change.
- **Each change has the change that takes it back**, read from the state before it is made: a put is taken back by
  removing the entry or putting what it held; a set by setting what the properties held and unsetting those that were
  absent; a removal by putting the entry back. A change that changes nothing has none.
- **A changeset is several changes as one step**: all are made in one transaction, or none where one is refused, and
  what takes it back is the changes that take each back, last first. An agent's changeset is reverted so
  ([Agents](agents.md#changesets)); a person's Undo is their own timeline ([Undo](#undo)).
- A change is refused whole, writing nothing, by name: `pdf_change_target_missing` (properties set on an entry that
  is not there) and the limits' own names (`pdf_too_many_marks`).
- **A field value** is held by the field's full name: its value (text, or the options chosen of a list that takes
  several), the display name of who set it and when. It is checked and bounded as a mark is, since it arrives from
  other people's browsers.
- **A mark, field or object of the stored file that was deleted** is held in `removed` by its id, with what it was
  (`mark`, `field`, `object`); taking the deletion back removes that entry, and the stored file's own shows again.
- **A page's own changes** are held by its page name; a turn is `rotation`: how far the page is turned, in degrees
  (0, 90, 180 or 270), in place of the file's own.

### Concurrent changes

| Two people at once                            | Result                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Each adds a mark, on one page or two          | Both marks                                                                                                        |
| Both change one mark                          | Per property, the later write wins; both typing in one Text mark keep every character                             |
| Both reply in one thread                      | Both replies, in time order                                                                                       |
| Both fill different fields                    | Both values                                                                                                       |
| Both fill one field                           | The later write wins, as a spreadsheet's cell; the other person's Undo never puts theirs back over it `(default)` |
| One marks a page, another moves or rotates it | The mark stays on its page, wherever the page now is                                                              |
| One marks a page, another deletes it          | The page is deleted; the mark and its thread are kept with it and return if the delete is undone                  |
| Both move pages                               | Each move lands; two moves of one page, the later wins                                                            |
| Both edit different objects of one page       | Both edits                                                                                                        |
| Both edit one picture or shape                | Per property, the later write wins                                                                                |
| One types in a text box, another wants to     | The box is the first person's while they type ([Editing text](editing-text.md#together))                          |
| A change lands as the stored file is replaced | Carried onto the new stored file by its anchor, or reported ([below](#a-change-carried-across-a-replacement))     |

- **Later** is the order the changes were made in, where one was made in sight of the other. Of two made at once,
  neither having seen the other, one wins, the same one for everyone `(default)`.
- **A removal wins over a change to what it removes**: one person changes a mark as another deletes it, and the mark
  is deleted for both `(default)`.
- **A stored file's replacement is one step for everyone**: the room swaps the tab's `blob` and the state in one
  transaction and tells every client with a `pdf-stored` op; a client finishes the frame it is drawing, fetches the
  new file (often already held: the client that baked it has it), and redraws in place
  ([Replacing the stored file](#replacing-the-stored-file)).
- A change that arrives for a stored file the room no longer holds is answered `pdf-refused` with `stored_file_changed`;
  the client re-reads the state and carries the change by its anchor.

### A change carried across a replacement

- **An unconfirmed change** is an entry this browser holds otherwise than the room is known to hold it: made,
  changed or removed here, and not yet confirmed by the room. It is read entry by entry: the root, the id, what the
  room held there and what stands here, so it can be made again on another state.
- **What the room is known to hold** is the state this browser read, every update the room relayed to it, and every
  update of its own the room confirmed
  ([Live state](../006-document/kinds-outside-the-canvas.md#live-state)).
- **When the stored file is replaced under an open surface**, however it learns of it, the surface reads its
  unconfirmed changes before it lets its live changes go, opens the new file, and makes each again on the new state.
  **A local copy made on an earlier stored file** (a tab closed offline, opened after a replacement) is carried the
  same way, and never merged as it is: its updates follow others the new state does not hold.
- A carried change is sent as any change is. It is no step of the person's Undo ([Undo](#undo)).
- A change the room refused for a limit or a level is never carried ([Limits](#limits)).
- **Each is carried by its anchor** `(default)`:

| Unconfirmed                          | Carried as                                                                | Lost when                            |
| ------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------ |
| A mark made                          | The mark; nothing where the new file already holds it under its id        | The new file has no page of its name |
| A mark changed                       | The properties that differ, on the mark; nothing where the mark is gone   | The mark is now the file's own       |
| A mark removed                       | Its removal; a deletion of the file's mark where it is now the file's own | Never                                |
| A field filled                       | The value, by the field's full name                                       | Never                                |
| A field's value cleared              | Its removal, where the new state holds a value                            | The value is now in the file         |
| A page turned                        | The turn                                                                  | The new file has no page of its name |
| A page's turn taken back             | Its removal, where the new state holds a turn                             | The turn is now in the file          |
| Something of the stored file deleted | The deletion, by its id                                                   | Never: an addition keeps every id    |
| A deletion taken back                | Its removal, where the new state holds the deletion                       | The deletion is now in the file      |

- **A mark that is now the file's own** is one the replacement wrote into the new file under its id; a change to its
  look is lost until a file's own mark can be changed ([Marks](marks.md#changing-a-mark)).
- **A lost change is said, never dropped in silence**: "1 change couldn't be placed on the new file." (or
  "<n> changes couldn't be placed on the new file.") `(default)`, logged `[pdf] anchors-lost count=<n>`; what was
  carried is logged `[pdf] changes-carried count=<n> already=<n>`.
- A replacement that renumbers the file's objects (a rewrite) tells each page's new name by its place, so a change is
  carried to the page it was made on; until a rewrite replaces a stored file, every replacement is an addition and
  every name stands.

## Presence

- **On the wire**: `pdf-presence` with the tab, the page name in view, the person's
  [editing mode](editing-modes.md#what-the-others-see), and at most one of: a text selection (page name, first and
  last character), a selected mark or object (its name), a text box being typed in (its name). A person who leaves
  the tab says the tab with no page. Never stored or replayed.
- **Refused** by whoever receives it, drawing nothing, when a name is malformed or the op passes
  `PDF_PRESENCE_MAX_CHARS` as it was sent, logged `[pdf] presence-refused`. A name on the wire is 1 to
  `PDF_PRESENCE_NAME_MAX_CHARS` letters, digits, `:`, `_` and `-` `(default)`; one the receiver's file does not hold
  places nobody.
- **The page in view** is the page under the middle of the view; between two pages, the one last under it
  `(default)`.
- **Drawn** as: the person's colour on their page's thumbnail; their text selection tinted in their colour with their
  name for `PDF_PRESENCE_FRESH_MS` after it moves and on hover; the mark or object they hold outlined in their colour;
  the title row's avatars, a press on one scrolling to that person's page.
- **Sent** at the cursor's rate, the last place always following: the page in view while the tab is the one the
  person is on, what is held while the surface has focus `(default)`. The other pane of a split says nothing: a person
  is on one tab. None go out while a hide-cursors vote is open, and a place already shown is taken back.
- **Whoever joins hears where everyone is.** The room keeps no presence, so each person says their place again when
  someone joins, and when their own connection returns `(default)`.
- **Every role is present**: an Editor's, a Participant's and a Viewer's page are each sent, and each may press an
  avatar to go to that person's page. A Viewer holds nothing.

## Undo

- Undo and redo take back **the person's own changes only**, newest first, on **one timeline across the editing
  modes**: a highlight made in Reviewing and a paragraph retyped in Editing undo in the order they were made.
- One step is one act as the person saw it: a mark drawn, a drag ended, a field left, typing within
  `PDF_UNDO_GROUP_MS` (500 ms), a page operation however many pages it moved, a find and replace across the document.
- Undoing puts the selection and the page back where the change was made.
- **Every root of the layout but `stored` is on the timeline** `(default)`: naming the stored file is nobody's act, and
  taking a first change back leaves it named.
- **Another person's change is never taken back or written over**: a step whose change someone else has since
  changed or removed is passed over, and the press takes back the step before it `(default)`.
- **A replacement of the stored file ends the steps before it**: Undo is dimmed with "Changes before this point are in
  version history." Version history still reaches them ([Saving](saving.md#previous-versions-and-version-history)).
  So does a change the room refused ([Limits](#limits)). A change carried across a replacement is on no timeline.
- An agent's changeset is reverted as a changeset, never by a person's Undo ([Agents](agents.md#changesets)).

## Storage

- The **room** is the **one writer** of the live changes: it applies every change (a person's, an agent's changeset, a
  sync), appends each update to the tab's log before it relays it, and compacts the log into chunks under the row
  cap, as it does for a text document, never through the editor's whole-tab save
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-room)).
- **What the kind declares** to the room's shared live state: its tab kind `pdf`, its frame's op kind `pdf` (its
  refusal `pdf-refused`), its log tag `[pdf]`, its tables (`pdf_updates`, `pdf_chunks`, `pdf_digest`, made by the
  shared schema step and appended to the room's schema), how its updates merge and decode, its sizes and limits, and
  its digest. Nothing of that storage is forked.
- The whole-tab save writes only the tab row: its name, kind, `blob` and `size`.
- **Reading it**: `GET /api/documents/:id/pdf-documents/:tabId/state` answers the whole state as one Yjs update, with
  the tab's `blob` in `X-Stored-File`; with `since` (a state vector) only what lies beyond it. `404 pdf_not_found`
  when the tab is absent or another kind; `400 state_vector_invalid`.
- **Every change names the stored file it was made on**: a `pdf` op in `on`, a posted update in `X-Stored-File`.
- **Sending**: a change goes to the room as one `pdf` op while the room is open and it fits a frame; a larger one (a
  pasted picture's reference, a catch-up after a long time offline) goes by
  `POST /api/documents/:id/pdf-documents/:tabId/updates`, which reaches the room through the shared door for a live
  tab's posted update. `400 update_invalid`, `413 update_too_large`,
  `409 stored_file_changed` when the update names another stored file than the room holds.
- **Reconnecting** is a text document's: the surface reads what the state holds beyond its own, merges it, and sends
  what it holds that the state lacks.
- **The stored file's bytes** are in the [blob store](../006-document/blob-store.md), sent before the tab names them:
  the room refuses a `blob` the store does not hold (`409 blob_missing`).
- **Pictures and files a change brings** (a stamp's picture, a drawn signature, an inserted picture, an embedded
  file, the pages inserted from another PDF) are blobs too, named by SHA-256 in the change and fetched by it; the
  state holds keys, never bytes past `PDF_INLINE_MAX_BYTES`.
- **Revision and hash**: each persisted state has a revision, as every tab has; the tab's hash for a sync is the hash
  of its bake, computed where the bake is made.

### The room's op kinds

| Op kind        | Is                                                     | Declared in         | Who may send                                         |
| -------------- | ------------------------------------------------------ | ------------------- | ---------------------------------------------------- |
| `pdf`          | One Yjs update to the live changes                     | `MUTATION_OP_KINDS` | Editor; Participant for what Reviewing changes       |
| `pdf-stored`   | The stored file was replaced: the new `blob` and state | `MUTATION_OP_KINDS` | Editor; Participant only for a certificate signature |
| `pdf-refused`  | The room's answer to a refused change, with its name   | `MUTATION_OP_KINDS` | The room                                             |
| `pdf-presence` | Where a person is and what they hold                   | `PRESENCE_OP_KINDS` | Anyone on the document                               |

- **The room checks what an update touches**, not only who sent it: a Participant's update may change `marks`,
  `threads`, `fieldValues`, `recognised` and `removed` entries for marks; one touching `pageOrder`, `pages`,
  `objects`, `fields` or `document` is refused whole with `level_too_low`. The check reads the update's changed
  roots, never trusting a client's claim ([Editing modes](editing-modes.md#share-roles)).
- **What an update touches** `(default)`: every root in which it adds, sets or removes anything, however deep. A
  root the layout does not name asks an Editor.
- **`removed`**: a Participant's update may add or take back only entries that are a `mark`'s, before and after.
- **`stored`**: a Participant's update may name the stored file once, where the state names none: its `blob` must
  be the tab's own and its `pages` a page count; after that, `stored` must read as it did.
- **An update that stands on changes the room lacks** (a change sent after one that was refused, before its sender
  heard of the refusal) cannot be judged and is refused untold, logged `[pdf] update-refused reason=unreadable`.
- A Participant's `pdf` op reaches the room as participation does, through the room's own check for a
  [live tab kind](../006-document/kinds-outside-the-canvas.md#live-state), never relayed as sent; a Viewer's is
  refused with `level_too_low`.
- **The door** judges a posted update the same way: `403 level_too_low` for a Viewer's, and for a Participant's
  that asks an Editor; `409 update_unreadable` `(default)` for a Participant's that cannot be judged.

### Replacing the stored file

When and why the stored file is replaced is [Saving](saving.md#when-the-stored-file-is-replaced)'s; this is how.

- **A client replaces it**: it bakes the stored file with the live changes it holds, stores the result in the
  [blob store](../006-document/blob-store.md), and sends the room
  `{ kind: 'pdf-stored', tabId, from, blob, size, pages, reason, at }`: the key it replaces, the new file's key,
  bytes and page count, why (`budget`; the other triggers join with their phases), and the **fingerprint** of the
  live changes the new file holds.
- **The fingerprint** `(default)` is the SHA-256 of what every root of the layout holds, written with its keys in
  order: two states that show the same changes have the same fingerprint, whatever order their updates arrived in.
- **The room refuses**, writing nothing and telling the sender alone, by name:

| Name                  | When                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `level_too_low`       | The sender's level does not allow the reason ([Share roles](#share-roles))         |
| `stored_file_changed` | The tab's `blob` is no longer `from`: someone replaced it first                    |
| `live_changes_moved`  | The room holds changes the new file lacks: its fingerprint is not `at`. Bake again |
| `blob_missing`        | The document's owner does not hold `blob` at `size`                                |
| `files_unavailable`   | The server has no file storage                                                     |

- **Otherwise, in one transaction**: the tab's row names the new `blob` and `size`, the live changes are emptied but
  for `stored` naming the new file and its pages, and the replaced file becomes a **previous version**: its key,
  size, when it was replaced and why, kept by the room beside the tab. Everyone, the sender too, then hears the
  row's change and `{ kind: 'pdf-stored', tabId, from, blob, size, pages, reason }`.
- **Because the room refuses a replacement that lacks anything it holds**, no stored change is ever lost to one: a
  change stored before it is in the new file, and a change sent after it names the old file and is refused
  `stored_file_changed`, to be carried by its sender.
- **Each client, hearing it**, keeps showing the pages it has, fetches the new file, opens it in a fresh engine,
  reads the live changes again and swaps both in at once, keeping its place; a reconnect that missed the op finds the
  state naming another file than its own and does the same.
- **A previous version's bytes stay readable** through the document for as long as they are held
  ([Blob store](../006-document/blob-store.md#holds-and-retention)).
- **A whole-tab save never changes a PDF tab's stored file** `(default)`: the save keeps the `blob` and `size` the
  room holds, whatever it was sent, so a browser that has not heard of a replacement cannot undo it. Logged
  `[pdf] save-kept-stored-file`.
- **For the budget**, an Editor's surface replaces the stored file once its live changes pass `PDF_REPLACE_AT_BYTES`
  and it has been idle for `PDF_REPLACE_IDLE_MS`: nothing changed here or arrived from the room in that time, and
  everything made here is saved. It does so only when the bake is an addition, which keeps every page name and makes
  each live mark the file's own under its id; a file that needs a rewrite waits for an Editor's own act. Refused
  `live_changes_moved`, it waits to be idle again.

### The digest

The room keeps a digest of each PDF tab, renewed when the state or the stored file changes, feeding the outline, the
Explorer and search through the room's outbox ([Document storage](../006-document/document-storage.md)):

- **Counts**: pages, marks, open threads, fields and fields filled, certificate signatures; whether the file is
  protected, and whether any page is a scanned page without recognised text.
- **Content summary**: a PDF document is never "empty": it has a stored file, so the
  [empty document clean-up](../013-workspace/empty-document-cleanup.md) never takes it, and its tab always counts
  as something to draw, so every list asks for its thumbnail. A tab is read so by the file it names, with or
  without live changes.
- **Tab stats**: a PDF tab's size is its stored file's bytes with its row's and its live changes' `(default)`, so
  the Explorer's Details view says what the file weighs
  ([Explorer details view](../013-workspace/explorer-details-view.md)).
- **Search text**: the file's text by page, extracted once per stored file and again only for pages the live changes
  touched, with the words of Text marks, comments and recognised text; capped at `PDF_SEARCH_TEXT_MAX_CHARS`, the
  first pages first. A protected file has none `(default)`.
- **Inbox**: threads and assigned actions, as every kind's ([Comments](comments.md)).

## What the servers make

A thumbnail, search text, an agent's preview and a baked file for a sync each need the engine where no reader is.

| Made                                             | By the api Worker                                                             | Otherwise                                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The first page, for the thumbnail and share card | When the stored file is at most `PDF_SERVER_BAKE_MAX_BYTES` and not protected | A browser that has the file open uploads one, used for display only                             |
| Search text                                      | The same                                                                      | A browser uploads the text it extracted, marked as a browser's                                  |
| A page's picture and text for an agent           | The same                                                                      | Refused by name: `pdf_too_large_for_server`, `pdf_protected`                                    |
| A baked file for a sync, the mirror, email       | The same                                                                      | The stored file with a note of how many changes it lacks; the CLI bakes on the person's machine |

- **What a browser uploads is for display, never the file.** A thumbnail or search text from a browser is stored
  marked as such, replaced by the server's own when it can make one, and never read back into the document.
- The engine in the Worker is a module of its own, loaded on first use, so it adds nothing to the api's start-up for
  any other request ([Web performance](../016-platform/web-performance.md)).
- The room never runs the engine: it stays the document's one writer and must stay responsive.
- Thumbnails follow the snapshot rules that exist: drawn on read, cached, **always light paper**, marks included,
  Dark pages never ([Document snapshots](../006-document/document-snapshots.md)).
- A self-host on a plan without the CPU time to draw a page (Workers Free) falls to the browser for all four, and
  the self-hosting notes say so.

### A browser's thumbnail

The engine is not in the api Worker yet, so the first page a list shows is the one a browser drew.

- **Who sends one**: an Editor's open surface `(default)`. A Participant's and a Viewer's never do, so nobody below
  an Editor decides what a document's preview shows; their marks reach it when an Editor next has the PDF open.
- **Of what**: the PDF tab that is its document's first tab, as every snapshot is of the first tab; the first page in
  the order, with its turn.
- **Never** of a file opened with a password (it has a lock, [Opening](opening.md#passwords)), nor of a
  [This Browser](#this-browser) document, which no server lists.
- **What is drawn**: the page as the engine draws it, on white, with the live marks over it as the surface draws
  them; `PDF_THUMBNAIL_WIDTH_PX` wide, smaller where a side would pass `PDF_THUMBNAIL_MAX_SIDE_PX`. Always light
  paper: Dark pages never reaches it, nor anything a person holds or has selected, nor anyone's presence.
- **As a JPEG** of at most `PDF_THUMBNAIL_MAX_BYTES`: drawn again once at a lower quality when it is more, then
  given up, which is logged.
- **When**: the surface asks whether one is wanted once it has drawn the first page, and sends one when it is; and
  it sends one `PDF_THUMBNAIL_IDLE_MS` after its own last change was confirmed, at most once every
  `PDF_THUMBNAIL_MIN_INTERVAL_MS`. Nothing waits on it and a failure changes nothing: it is logged.
- **Wanted** is: the server keeps snapshots, the tab is the document's first, and no picture is stored for it or the
  one stored was sent before the document was last saved.
- **Stored marked as a browser's** (`thumb/<documentId>/browser`, with the save it was sent at), apart from the
  snapshots drawn from it. An upload removes those, so the next read draws from the new picture; all of it goes
  with the document.
- **Shown** by every delivery path of [Document snapshots](../006-document/document-snapshots.md): a white page
  holding the picture. Until a first one is sent the PDF has none, and its row shows its glyph.
  - The save a picture was sent at may be older than a change the room had not written yet; the next Editor to open
    the PDF then sends another `(default)`.
  - A list that asked before the first picture was sent shows it at its next load `(default)`.
- **Never read back**: the picture is for display, checked as a JPEG of the sizes above, stripped of its metadata,
  and placed in a snapshot LiveDoc draws itself, so nothing in it reaches a page as markup.

| Door                                                      | Answers                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/documents/<id>/pdf-documents/<tabId>/thumbnail` | `{ wanted }`: read as the tab is; false for anyone but an Editor |
| `PUT /api/documents/<id>/pdf-documents/<tabId>/thumbnail` | `204`; the body is the JPEG                                      |

| Refusal                    | When                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `403 level_too_low`        | A Participant or a Viewer sends one                            |
| `404 pdf_not_found`        | The tab is no PDF tab of the document                          |
| `409 thumbnail_not_wanted` | The tab is not the document's first                            |
| `400 thumbnail_invalid`    | Not a JPEG, or a side of 0 or past `PDF_THUMBNAIL_MAX_SIDE_PX` |
| `413 thumbnail_too_large`  | Past `PDF_THUMBNAIL_MAX_BYTES`                                 |
| `503 images_unavailable`   | The server keeps no snapshots (no image storage)               |

## Offline and This Browser

- <a id="this-browser"></a>**A PDF document in This Browser** keeps its stored file in this browser's own store
  under its key ([Blob store](../006-document/blob-store.md#this-browser)); the offline record holds the key and the
  size only, on its tab, so the Explorer's lists never read a PDF's bytes. Its live changes are in the offline
  record, as a text document's are, and it works fully, with no room
  ([Offline Mode](../006-document/offline-mode.md)):
  - The record's `pdfDocuments` holds, per PDF tab, its whole live changes and when they were saved; a tab with none
    reads as its stored file unchanged.
  - A change is saved `PDF_LOCAL_SAVE_MS` after it, and at once when the page is hidden or the tab closes; each save
    merges into what is stored in one transaction, so another browser tab's saves are never undone.
  - **A page's last moment**: a browser does not finish a save begun as its page
    goes. So when the page is hidden, left or the tab closed, what is not saved yet is first written to the browser's
    synchronous storage (`localStorage`), all at once: a **parting copy**, one a browser tab on the PDF. It is
    removed when its save lands.
    - One left behind joins the record when the PDF is next opened here, and before Sync Document or Duplicate reads
      the record; it goes with a record that is deleted.
    - One that cannot be read is removed and logged, never merged.
    - Past `LIVE_TAB_PARTING_MAX_CHARS`, or where the browser refuses it, none is written, which is logged
      `(default)`: a change that large made in a page's last half second is lost.
  - Browser tabs open on the same PDF pass each change to each other on the `livedoc-pdf-document` BroadcastChannel,
    so both stay live.
  - It has one person, its owner, who reviews and edits it as an Editor; no presence is said and nothing is refused
    for a level.
  - **Download** bakes in this browser from the bytes kept here, as any Download does.
  - In the Explorer's lists it always has content: a PDF tab holds a file `(default)`.
  - **A stored file this browser no longer holds** (its storage was cleared or taken back) is said as a file missing
    from storage is: "This PDF's file is missing from storage." Its live changes stay in the record.
  - The stored file is not replaced for the budget here, so the live changes may pass `PDF_REPLACE_AT_BYTES`.
- **A PDF that arrives** for someone whose new documents start in This Browser
  ([Opening](files-print-and-sync.md#opening)) is hashed, kept in this browser's store and named by a new offline
  record; no request carries its bytes or its name.
- **Sync Document** (signing up, the Share gate, the Explorer's menu) sends each stored file to the
  [blob store](../006-document/blob-store.md#getting-bytes-in) first, then the create with each PDF tab and its
  live changes (`pdfDocuments: [{ tabId, state }]`). Until the create is answered the document stays in This Browser.
  - A stored file this browser no longer holds, a server without file storage, an allowance that would be passed and
    live changes past `PDF_LIVE_CHANGES_MAX_BYTES` each stop the sync by name, with the document kept here
    ([Errors](#errors-in-this-browser)).
  - A change saved during the upload counts as a change, as a tab's does: the sync uploads again.
  - Once synced, the bytes stay in this browser as a cloud document's.
- **Take Offline** reads each PDF tab's live changes, which name its stored file, and that file's bytes, from this
  browser when it holds them and from LiveDoc when not; it keeps the bytes here and writes the record, all or
  nothing, before the server copy goes.
  - Previous versions and version history stay behind and go with the server copy `(default)`: This Browser keeps one
    stored file a tab.
  - A browser that refuses the bytes stops it by name and the document stays on LiveDoc.
- **Duplicate** of a This Browser PDF copies each tab's live changes under its new id; the copy names the same key,
  so no byte is copied.
- **The local Trash** keeps the record, its live changes and its bytes; a purge removes the record and forgets each
  key no other This Browser document names.
- **A cloud PDF document** keeps a local copy of its unconfirmed live changes, as a text document does, and its
  stored file in the same local store once read whole: the next open reads the file from this browser.
  - Opened offline it would show from those, and every change waits and merges on return. A cloud document does not
    open without a connection yet ([Offline Mode](../006-document/offline-mode.md#non-goals)), so only the kept
    bytes and the kept changes are built.
- A cloud PDF whose stored file was only read in part shows the pages it has offline, and "Go online to read the
  rest of this PDF." on the others.

### Errors in This Browser

A browser that will not keep a PDF's bytes is said, never hidden, and nothing is half made:

| Name                      | Said                                                                                  | Where                           |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| `local_store_full`        | "This browser has no room to keep this PDF."                                          | A PDF arriving; Take Offline    |
| `local_store_unavailable` | `(default)` "This browser can't keep files, so this PDF can't be kept here."          | A PDF arriving; Take Offline    |
| `blob_missing`            | "This PDF's file is missing from storage."                                            | The pages' place; Sync Document |
| `files_unavailable`       | "This server has no file storage."                                                    | Sync Document                   |
| `usage_exceeded`          | "This document doesn't fit in the file storage that is left."                         | Sync Document                   |
| `live_changes_too_large`  | `(default)` "This PDF has more changes than fit. Download it, then add the download." | Sync Document                   |

Each leaves the document where it was: a refused arrival makes nothing (the file is still on the person's computer),
a refused Take Offline leaves it on LiveDoc, where **Download** hands it out, and a refused sync keeps it here.

## Branches

A [document branch](../006-document/document-branches.md) of a PDF tab is a stored file's key and its own live
changes; a branch costs no second copy of the bytes.

| At the merge                                          | Result                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Both sides are on the same stored file                | The live changes merge as [concurrent changes](#concurrent-changes) do                                           |
| One side replaced the stored file                     | That side's file stands; the other side's live changes are carried onto it by anchor                             |
| Both sides replaced it                                | Main's stands; the branch's becomes a previous version, with a note on the tab                                   |
| A change cannot be carried (its page or text is gone) | An unmerged change, listed beside the result ([Document branches](../006-document/document-branches.md#merging)) |

Comments on a branch are the branch's own, as for every kind. This Browser has no branches.

## Copies, the Trash and versions

- **Make a copy** makes a document whose PDF tab names the same `blob` (the bytes are stored once) with the live
  changes copied; the dialog offers "Copy comments" and, where the file has certificate signatures, says the copy
  keeps them and their validity.
  - **A copy of one's own document** is made by the editor: the new document's PDF tab names the same `blob`, and
    the create carries each PDF tab's live changes (`pdfDocuments: [{ tabId, state }]`, a Yjs update as base64),
    stored as the tab's state before anyone opens it. A state that cannot be read fails the copy rather than leave
    it without its changes.
  - **The create refuses a seed** `400 pdf_seed_invalid` when it names no PDF tab of the request, names one twice, is
    no Yjs update, or names another stored file than its tab's; `413 live_changes_too_large` past
    `PDF_LIVE_CHANGES_MAX_BYTES`. Nothing is made.
  - **Someone else's copy** (a share link's reader, a teammate) is made by the api, room to room, and is theirs: they
    are given the stored file as [a row, never bytes](../006-document/blob-store.md#a-row-given), so the copy opens
    after the original is purged. It counts in their usage; one that would pass their allowance is refused
    `403 usage_exceeded`, said as "This document doesn't fit in the file storage that is left." `(default)`.
  - **A copy has no previous versions**: it begins at the stored file the original is on, with the live changes on
    it. A tab-scoped reader's copy is their tab alone, as every kind's.
- **A document that passes to another owner** (a team's heir, a team document moved into someone's own library) takes
  its stored file and its previous versions with it, given the same way.
- **A PDF tab is never shared between documents** `(default)`: its live changes are one room's, so a tab held by two
  documents would show each its own. Linking one answers `409 tab_not_linkable`, as a spreadsheet's tabs do.
- **The Trash** keeps a deleted PDF document as any document; its blobs stay counted until the Trash lets go.
  - What a trashed document holds stays held, previous versions until their day, so a restore finds every byte.
  - Purging it lets go of them; the retention sweep then deletes what nothing else of that owner holds, after its
    grace ([Blob store](../006-document/blob-store.md#holds-and-retention)).
- **Versions** are a stored file's key and a point in its live changes
  ([Saving](saving.md#previous-versions-and-version-history)); automatic versions are taken after every 30 minutes of
  changes or 1,000 changes, whichever first (`PDF_VERSION_EVERY`, `(default)`, a text document's rule), named ones
  kept for good.

## Limits

| Constant                        | Value     | Why                                                                                        |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `PDF_LIVE_CHANGES_MAX_BYTES`    | 4,194,304 | `(default)` Past it the stored file is replaced ([Saving](saving.md#limits))               |
| `PDF_REPLACE_AT_BYTES`          | 3,145,728 | `(default)` Three quarters of it, so ordinary use never meets the limit itself             |
| `PDF_REPLACE_IDLE_MS`           | 20,000    | `(default)` Long enough that nobody is mid-thought; safe range 5 to 120 s                  |
| `PDF_UPDATE_MAX_BYTES`          | 8,000,000 | `(default)` One posted update: the api's body cap, as a text document's                    |
| `PDF_INLINE_MAX_BYTES`          | 16,384    | `(default)` A picture past it is a blob; under it, it rides the change                     |
| `PDF_SEARCH_TEXT_MAX_CHARS`     | 2,000,000 | `(default)` About a 1,000-page book's text; more is searched in the open document only     |
| `PDF_PRESENCE_MAX_CHARS`        | 512       | `(default)` Three names and two numbers                                                    |
| `PDF_PRESENCE_NAME_MAX_CHARS`   | 80        | `(default)` An inserted page's name is 66 at most, a mark's id 36                          |
| `PDF_PRESENCE_FRESH_MS`         | 3,000     | `(default)` A text document's caret label                                                  |
| `PDF_UNDO_GROUP_MS`             | 500       | A text document's typing group                                                             |
| `PDF_LOCAL_SAVE_MS`             | 500       | `(default)` A change the room has not confirmed by then is kept in this browser            |
| `PDF_LOCAL_SAVE_RETRY_MS`       | 5,000     | `(default)` A failed save in This Browser is written again by itself, as a text document's |
| `LIVE_TAB_PARTING_MAX_CHARS`    | 1,000,000 | `(default)` A parting copy as base64: a fifth of the 5 MB a browser gives `localStorage`   |
| `PDF_THUMBNAIL_WIDTH_PX`        | 480       | `(default)` Twice the widest card a list draws; safe range 240 to 960                      |
| `PDF_THUMBNAIL_MAX_SIDE_PX`     | 1,024     | `(default)` A page four times as tall as wide still fits; the server refuses more          |
| `PDF_THUMBNAIL_MAX_BYTES`       | 200,000   | `(default)` A page of photographs at that size; a list of 50 rows stays under 14 MB        |
| `PDF_THUMBNAIL_IDLE_MS`         | 5,000     | `(default)` Past the room's own write of a change (2 s idle); safe range 2 to 60 s         |
| `PDF_THUMBNAIL_MIN_INTERVAL_MS` | 60,000    | `(default)` One upload a minute from a surface at most, as the room writes                 |

A change past a limit is refused whole and named: `pdf_too_many_marks`, `pdf_too_many_pages`, `update_too_large`,
`live_changes_too_large` (when a replacement cannot be made, with "This PDF has more unsaved changes than fit. Ask
someone who can edit it to open it." for a Participant on a file only an Editor's rewrite can replace).

The room's refusal of a frame reaches its sender alone, as `pdf-refused` with the limit passed or the refusal's
name. The surface then drops its live changes and reads them again from the room, in place: the pages stay drawn, and
what it shows is what everyone holds `(default)`. Nothing of the refused change stays in this browser, so it is
never sent again; a change made in the moment before the refusal was heard goes with it, as the room would have
refused it too. It says "This PDF has more unsaved changes than fit." `(default)` for a limit, or the level's line
of [Editing modes](editing-modes.md#errors), logging `[pdf] change-dropped`. Undo's steps before it end
([Undo](#undo)).

## Share roles

| Role            | Live changes                                                    | Stored file                                             | Versions                 |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------- | ------------------------ |
| **Editor**      | All                                                             | Replaces it by any trigger                              | See, name, restore, copy |
| **Participant** | Marks, threads, field values, drawn signatures, recognised text | Replaces it only by a certificate signature (F7, ruled) | See                      |
| **Viewer**      | None; their presence is their page                              | Reads it                                                | None                     |

## Telemetry and observability

- `Pdf · Undone` and `Pdf · Redone` when a person takes a step back or makes it again, and
  `UI · Used · PdfDocumentFollow` when a press on a person goes to their page; nothing else of its own: each area's
  spec fires for what a person did.
- Fingerprints with the document and tab ids, never content: `[pdf] state-read bytes=<n>`,
  `[pdf] update-refused name=<name>` (the door's), `[pdf] caught-up`,
  `[pdf] stored-file-replaced` ([Saving](saving.md#telemetry-and-observability)),
  `[pdf] replacement-refused name=<name>`, `[pdf] save-kept-stored-file`,
  `[pdf] server-made what=<thumbnail|text|preview|bake> ms=<n>`, `[pdf] server-declined what=<what> reason=<reason>`,
  `[pdf] browser-upload what=<thumbnail|text> bytes=<n>`, `[pdf] browser-upload-refused name=<name>`,
  `[pdf] browser-thumbnail unreadable` (a stored picture that is no JPEG, never drawn),
  `[pdf] thumbnail-sent bytes=<n> quality=<q>`, `[pdf] thumbnail-skipped reason=<reason>`,
  `[pdf] changes-carried count=<n> already=<n>`, `[pdf] anchors-lost count=<n>`, `[pdf] local-copy on-another`,
  `[pdf] presence-refused`.
- The room's shared live state logs its own under this kind's tag
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#live-state)): `[pdf] persisted bytes=<n>`
  (with `via=door` for a posted update), `[pdf] compacted`, `[pdf] update-refused reason=<reason>`,
  `[pdf] edit-refused limit=<limit>`, `[pdf] level-refused level=<level> asks=<level>` and
  `[pdf] digest pages=<n> marks=<n>`.
- A surface replacing the stored file for the budget: `[pdf] replace-asked reason=<reason> stored=<bool> bytes=<n>`,
  `[pdf] replace-skipped reason=<reason>`, `[pdf] replace-store-failed`, `[pdf] replace-refused name=<name>`.
- A copy's live changes: `[pdf] copied bytes=<n>` for each tab seeded, `[pdf] seed-refused name=<name>`.
- A browser that will not keep a PDF's bytes is logged where it is said: `[pdf] refused name=<name>` for a PDF
  arriving ([Opening](opening.md#telemetry-and-observability)), `[pdf] take-offline-refused name=<name>` below.
- In This Browser: `[pdf] saved in this browser bytes=<n>`, `[pdf] save in this browser failed`,
  `[pdf] arrived bytes=<n> where=this-browser`, `[pdf] sync-sent tabs=<n> bytes=<n> held=<n>`,
  `[pdf] sync-refused name=<name>`, `[pdf] taken-offline tabs=<n> bytes=<n> local=<n>`,
  `[pdf] take-offline-refused name=<name>`, `[pdf] kept-read bytes=<n>` (a cloud PDF's file read from this browser).
- A parting copy: `[pdf] parting-copy written chars=<n>`, `[pdf] parting-copy skipped reason=<too_large|refused>`,
  `[pdf] parting-copy joined count=<n>`, `[pdf] parting-copy unreadable`, `[pdf] parting-copy kept error=<error>`
  (one whose save failed, left for the next open).
