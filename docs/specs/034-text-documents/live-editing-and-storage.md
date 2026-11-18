# Live editing and storage

**Status: specified.** Nothing is built.

How a [text document](text-document.md) is edited by people and agents at once, stored in its room, kept offline,
branched, copied, versioned, searched and listed. The research is
[Live model](../../research/docs-open-standard/live-model.md).

## The live model

- The text document is a **sequence CRDT**, Yjs: the body of each document tab a tree of paragraphs and tables holding
  text with formatting attributes; styles, page setups, lists, comments and suggestions in maps beside it. ProseMirror
  is a view bound to it.
- **Concurrent edits merge by character**: two people typing in one paragraph both keep every character; typing inside
  a stretch someone deletes keeps the characters typed.
- **Concurrent formatting** of one stretch resolves per attribute, the later write winning; a person never loses text
  to someone's formatting.
- **Kept content** is an atom in the tree: moved and deleted whole, never merged inside.

## Presence

Each person's caret and selection in their colour with their name for a moment after it moves and on hover, travelling
as presence (`text-document-caret`: a relative position in the CRDT, never an offset), never stored or replayed; the
title row's avatars; a press on an avatar scrolls to their caret. None go out while a hide-cursors vote is open.

## Undo

Undo and redo take back the person's own changes only, newest first (`UndoManager` tracking the local origin), with
the caret put back; typing within 500 ms is one step, as Google groups it.

## Storage

- The **room** holds the text document's CRDT and is the **one writer** of its storage: it applies every edit (a
  person's, an agent's changeset, a sync), persists after each burst settles, never more often than every
  `TEXT_DOCUMENT_PERSIST_MS`, and never through the editor's whole-tab save
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-room)).
- **Chunked under the row cap**: the encoded state is split into rows of at most `TEXT_DOCUMENT_CHUNK_BYTES` in a table
  of its own (`text_document_chunks`: tab, revision, index, bytes), with an update log since the last compaction;
  compaction runs when the log passes `TEXT_DOCUMENT_LOG_BYTES` or on the room's idle alarm.
- **The file is derived**: the `.odt` or `.docx` bytes are written from the model on download, sync and export; kept
  content and pictures are stored in the room (pictures as R2 objects keyed by hash, as gallery images are).
- **Revision and hash**: each persisted state has a revision, as every tab has, and a hash of the file it writes, so a
  repository snapshot can say how old it is.
- **The outbox** feeds D1 as for every tab: the content summary (has content when the body holds any character or
  object), the search text (the body's plain text, headers, footers, footnotes and comments), and comments and actions
  for the Inbox ([Document storage](../006-document/document-storage.md#the-outbox)).
- **Tab stats**: characters, words, pages (estimated without layout: 500 words a page), comments, bytes.

## Offline

- A text document in This Browser holds its CRDT in IndexedDB and works fully; a cloud document opened offline edits
  its local copy. Either merges by character when it reaches the room, nothing lost
  ([Offline Mode](../006-document/offline-mode.md)).
- File > Make available offline is LiveDoc's This Browser and offline open.

## Branches

A [document branch](../006-document/document-branches.md) of a text document holds its own CRDT, started from main's
at the branch point; merging applies the branch's updates by character. Where both sides formatted one stretch
differently, main's stands and the branch's is kept as a comment, "Not merged from <branch>: Format: bold".

## Copies, snapshots and versions

- **A copy** (Make a copy, the Explorer's Duplicate) copies the room's state into the new document's room.
- **Thumbnails** draw the first page, at the Explorer's size, from the model without layout of later pages.
- <a id="versions"></a>**Versions** are Yjs snapshots (state vector and delete set) with names, kept in the room; the
  CRDT keeps deleted items while any version needs them (garbage collection off, compacted by snapshot), so any
  version renders without a stored copy ([Review](review.md#version-history)).

## Search and the Explorer

- Content search reads the search text the outbox pushes ([Content search](../013-workspace/content-search.md)).
- The Explorer shows a text document with its glyph (a page with lines), the Kind chip **Text document**, its default
  folder key `kind:text-document`, and its first page as the thumbnail
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-explorer)).

## Share roles

The room relays a text document's mutation ops only from an `edit` session, and its suggestion and comment ops from a
`participate` session as participation (`PARTICIPATION_OP_KINDS`), refusing a Participant's op that is not a
suggestion or comment (fork D7); a Viewer's are dropped. Tests: the room refuses each forbidden op for each level.

## Limits

| Constant                        | Value     | Why                                                                                                                                                |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEXT_DOCUMENT_PERSIST_MS`      | 2,000     | As the markdown tab's: a burst settles into one write                                                                                              |
| `TEXT_DOCUMENT_CHUNK_BYTES`     | 1,900,000 | Under the room's 2,000,000-byte row cap with room for the row's other columns                                                                      |
| `TEXT_DOCUMENT_LOG_BYTES`       | 4,000,000 | (default) Compaction keeps the log to a couple of chunks                                                                                           |
| `TEXT_DOCUMENT_MAX_STATE_BYTES` | 64 MB     | (default) The encoded state with its history; past it, versions older than 30 days are thinned first, then edits refused with `document_too_large` |
| A frame of edits                | 256 KB    | The room's message cap                                                                                                                             |

A refused edit names its limit; nothing is half applied.

## Observability

Fingerprints, each with the document and tab ids and never text: `[text-document] persisted` (revision, bytes,
chunks, ms), `[text-document] compacted`, `[text-document] merge-offline` (updates, bytes), `[text-document]
edit-refused` (limit), `[text-document] branch-merged` (unmerged count).
