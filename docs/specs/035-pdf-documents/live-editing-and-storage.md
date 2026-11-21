# Live editing and storage

**Status: specified.** Nothing is built.

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

### Concurrent changes

| Two people at once                            | Result                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Each adds a mark, on one page or two          | Both marks                                                                                                         |
| Both change one mark                          | Per property, the later write wins; both typing in one Text mark keep every character                              |
| Both reply in one thread                      | Both replies, in time order                                                                                        |
| Both fill different fields                    | Both values                                                                                                        |
| Both fill one field                           | The later write wins, as a spreadsheet's cell; the other value is in that person's undo                            |
| One marks a page, another moves or rotates it | The mark stays on its page, wherever the page now is                                                               |
| One marks a page, another deletes it          | The page is deleted; the mark and its thread are kept with it and return if the delete is undone                   |
| Both move pages                               | Each move lands; two moves of one page, the later wins                                                             |
| Both edit different objects of one page       | Both edits                                                                                                         |
| Both edit one picture or shape                | Per property, the later write wins                                                                                 |
| One types in a text box, another wants to     | The box is the first person's while they type ([Editing text](editing-text.md#together))                           |
| A change lands as the stored file is replaced | Carried onto the new stored file by its anchor, or reported ([Saving](saving.md#when-the-stored-file-is-replaced)) |

- **A stored file's replacement is one step for everyone**: the room swaps the tab's `blob` and the state in one
  transaction and tells every client with a `pdf-stored` op; a client finishes the frame it is drawing, fetches the
  new file (often already held: the client that baked it has it), and redraws in place.
- A change that arrives for a stored file the room no longer holds is answered `pdf-refused` with `stored_file_changed`;
  the client re-reads the state and replays the change by its anchor.

## Presence

- **On the wire**: `pdf-presence` with the tab, the page name in view, and at most one of: a text selection (page
  name, first and last character), a selected mark or object (its name), a text box being typed in. Never stored or
  replayed. Refused when a name is malformed or the op passes `PDF_PRESENCE_MAX_CHARS`.
- **Drawn** as: the person's colour on their page's thumbnail; their text selection tinted in their colour with their
  name for `PDF_PRESENCE_FRESH_MS` after it moves and on hover; the mark or object they hold outlined in their colour;
  the title row's avatars, a press on one scrolling to that person's page.
- **Sent** while the surface has focus, at the cursor's rate, the last place always following. A Viewer's page is
  sent; a Viewer holds nothing. None go out while a hide-cursors vote is open.

## Undo

- Undo and redo take back **the person's own changes only**, newest first, on **one timeline across the editing
  modes**: a highlight made in Reviewing and a paragraph retyped in Editing undo in the order they were made.
- One step is one act as the person saw it: a mark drawn, a drag ended, a field left, typing within
  `PDF_UNDO_GROUP_MS` (500 ms), a page operation however many pages it moved, a find and replace across the document.
- Undoing puts the selection and the page back where the change was made.
- **A replacement of the stored file ends the steps before it**: Undo is dimmed with "Changes before this point are in
  version history." Version history still reaches them ([Saving](saving.md#previous-versions-and-version-history)).
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
- A Participant's `pdf` op is in `PARTICIPATION_OP_KINDS`.

### The digest

The room keeps a digest of each PDF tab, renewed when the state or the stored file changes, feeding the outline, the
Explorer and search through the room's outbox ([Document storage](../006-document/document-storage.md)):

- **Counts**: pages, marks, open threads, fields and fields filled, certificate signatures; whether the file is
  protected, and whether any page is a scanned page without recognised text.
- **Content summary**: a PDF document is never "empty": it has a stored file, so the
  [empty document clean-up](../013-workspace/empty-document-cleanup.md) never takes it.
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

## Offline and This Browser

- **A PDF document in This Browser** keeps its stored file in the origin private file system under its SHA-256, read
  by range from the engine's worker; the offline record holds the key and the size only, so the Explorer's lists
  never read a PDF's bytes ([Blob store](../006-document/blob-store.md#this-browser)). Its live changes are in the
  offline record, as a text document's are.
- **A cloud PDF document** keeps a local copy of its unconfirmed live changes, as a text document does, and its
  stored file in the same local store once read whole; opened offline it shows from those, and every change waits and
  merges on return.
- A cloud PDF whose stored file was only read in part shows the pages it has offline, and "Go online to read the
  rest of this PDF." on the others.
- **Moving to LiveDoc** (signing up, or Move to My Documents) uploads the stored file, then the live changes; until
  the bytes are confirmed the document stays in This Browser.
- Local storage that refuses the bytes (full, or evicted) is said, never hidden: "This browser has no room to keep
  this PDF." with **Download**.

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
- **The Trash** keeps a deleted PDF document as any document; its blobs stay counted until the Trash lets go.
- **Versions** are a stored file's key and a point in its live changes
  ([Saving](saving.md#previous-versions-and-version-history)); automatic versions are taken after every 30 minutes of
  changes or 1,000 changes, whichever first (`PDF_VERSION_EVERY`, `(default)`, a text document's rule), named ones
  kept for good.

## Limits

| Constant                     | Value     | Why                                                                                    |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `PDF_LIVE_CHANGES_MAX_BYTES` | 4,194,304 | `(default)` Past it the stored file is replaced ([Saving](saving.md#limits))           |
| `PDF_UPDATE_MAX_BYTES`       | 8,000,000 | `(default)` One posted update: the api's body cap, as a text document's                |
| `PDF_INLINE_MAX_BYTES`       | 16,384    | `(default)` A picture past it is a blob; under it, it rides the change                 |
| `PDF_SEARCH_TEXT_MAX_CHARS`  | 2,000,000 | `(default)` About a 1,000-page book's text; more is searched in the open document only |
| `PDF_PRESENCE_MAX_CHARS`     | 512       | `(default)` Three names and two numbers                                                |
| `PDF_PRESENCE_FRESH_MS`      | 3,000     | `(default)` A text document's caret label                                              |
| `PDF_UNDO_GROUP_MS`          | 500       | A text document's typing group                                                         |

A change past a limit is refused whole and named: `pdf_too_many_marks`, `pdf_too_many_pages`, `update_too_large`,
`live_changes_too_large` (when a replacement cannot be made, with "This PDF has more unsaved changes than fit. Ask
someone who can edit it to open it." for a Participant on a file only an Editor's rewrite can replace).

## Share roles

| Role            | Live changes                                                    | Stored file                                                  | Versions                 |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| **Editor**      | All                                                             | Replaces it by any trigger                                   | See, name, restore, copy |
| **Participant** | Marks, threads, field values, drawn signatures, recognised text | Replaces it only by a certificate signature (F7 `(default)`) | See                      |
| **Viewer**      | None; their presence is their page                              | Reads it                                                     | None                     |

## Telemetry and observability

- No telemetry of its own: each area's spec fires for what a person did.
- Fingerprints with the document and tab ids, never content: `[pdf] state-read bytes=<n>`, `[pdf] update-stored
bytes=<n> roots=<names>`, `[pdf] update-refused name=<name>`, `[pdf] caught-up`, `[pdf] compacted`,
  `[pdf] stored-file-replaced` ([Saving](saving.md#telemetry-and-observability)), `[pdf] digest pages=<n> marks=<n>`,
  `[pdf] server-made what=<thumbnail|text|preview|bake> ms=<n>`, `[pdf] server-declined what=<what> reason=<reason>`,
  `[pdf] browser-upload what=<thumbnail|text>`, `[pdf] local-store refused=<reason>`.
