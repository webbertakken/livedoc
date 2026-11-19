# Live editing and storage

**Status: specified; the room's storage, the digest and the live merge of one body are built.**

How a [text document](text-document.md) is edited by people and agents at once, stored in its room, kept offline,
branched, copied, versioned, searched and listed. The research is
[Live model](../../research/docs-open-standard/live-model.md).

## The live model

- The text document is a **sequence CRDT**, Yjs: the body of each document tab a tree of paragraphs and tables holding
  text with formatting attributes; styles, page setups, lists, comments and suggestions in maps beside it. ProseMirror
  is a view bound to it.
- The first document tab's body is the root XML fragment `body`, in y-prosemirror's layout (a `paragraph` element
  holding text) (default). A root type exists in every replica, so no two people ever make it twice.
- **The seed**: every state is read as one empty paragraph, written by client 0, merged with what is stored; the seed
  is the same bytes everywhere, so it merges with itself, and a surface binds only after it has loaded the state, so
  no surface ever invents a first paragraph.
- **Concurrent edits merge by character**: two people typing in one paragraph both keep every character; typing inside
  a stretch someone deletes keeps the characters typed.
- **Concurrent formatting** of one stretch resolves per attribute, the later write winning; a person never loses text
  to someone's formatting.
- **Kept content** is an atom in the tree: moved and deleted whole, never merged inside.

### The layout

How [the model](standard-mapping.md#the-model) lies in the live state, so every reader (the editor, the room, the
api, agents) reads and writes one shape (default):

- **Blocks** are the body's elements, each attribute a whole value: `paragraph` (`style`, `props`, `list`, `text`,
  `kept`), `section_break` (the section's setup and its kept region) and `kept_block` (its name and kept XML).
- **Runs** are a paragraph's text, formatted by attributes: one per text property (`bold`, `italic`, `underline`,
  `strike`, `vertical`, `font`, `size`, `color`, `highlight`, `small_caps`, `transform`), each holding `{ value }`, so
  a `false` that overrides a style's `true` is kept; then `link` (`href`), `text_style` (`id`) and `run_kept`
  (`kept`). Two people formatting one stretch differently each win on their own property.
- **A kept inline** is a `kept_inline` atom inside its paragraph: its name, XML, formatting and link.
- **Beside the body**: the root map `document` holds `metadata`, `defaults` and the first `section` as whole values;
  `styles` and `lists` are root maps by id, so two people changing two styles never collide; `source` holds what a
  file brought around the model (`json`) and its package entries by name (`entries`, as bytes), written once when the
  file is opened and replaced only by a conversion.
- **The format is the tab's**, never in the state: reading the state as the model takes the tab's `format`.
- **Both ways**: a model written as a state reads back as the same model. A state without the maps beside the body
  (a new text document's) reads them as a blank text document of the tab's format has them, and a paragraph without a
  style is in Normal text.
- **The editor's schema** has a node or mark for every element and attribute here, so binding the editor never drops
  what it cannot show.

## Presence

Each person's caret and selection in their colour with their name for a moment after it moves and on hover, travelling
as presence, never stored or replayed; the title row's avatars; a press on an avatar scrolls to their caret. None go out
while a hide-cursors vote is open.

- **On the wire**: `text-document-caret` with the tab and the selection's `anchor` and `head`, each a Yjs relative
  position (base64), never an offset, so a caret stays by its character whatever is typed before it; `anchor: null`
  when the person leaves the writing. Refused when either is not base64 or past `TEXT_DOCUMENT_CARET_MAX_CHARS`.
- **Sent** while the person's writing has focus and they may edit (Editor, or Participant per fork D7), at the
  cursor's rate, the last place always following, and only while the room is open (default).
- **Drawn** as a caret in their colour on the page, the selection behind it tinted in that colour, and their name above
  the caret for `TEXT_DOCUMENT_CARET_FRESH_MS` after it moves (default); a caret that no longer resolves (its
  characters deleted) is not drawn. Someone who leaves the document takes their caret with them.

## Undo

Undo and redo take back the person's own changes only, newest first (`UndoManager` tracking the local origin), with
the caret put back; typing within 500 ms is one step, as Google groups it.

## Storage

- The **room** holds the text document's CRDT and is the **one writer** of its storage: it applies every edit (a
  person's, an agent's changeset, a sync), appends each update to the tab's log as it applies it and before it
  relays it (default), so nothing relayed is unstored and a hibernating room holds no unsaved edit; never through
  the editor's whole-tab save
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-room)).
- **Chunked under the row cap**: the encoded state is split into rows of at most `TEXT_DOCUMENT_CHUNK_BYTES` in a table
  of its own (`text_document_chunks`: tab, revision, index, bytes), with an update log since the last compaction
  (`text_document_updates`: tab, sequence, bytes); both go with their tab. Compaction folds the log into the chunks,
  as one transaction, when the log passes `TEXT_DOCUMENT_LOG_BYTES`, or on the room's idle alarm.
- **Reading it**: `GET /api/documents/:id/text-documents/:tabId/state` answers the whole state as one Yjs update
  (read access, a tab-scoped link on its own tab); `404 text_document_not_found` when the tab is absent or another kind.
- **Reconnecting**: a surface the room tells to re-hydrate fetches the state again, merges it, and sends what it holds
  that the state lacks; Yjs makes both harmless to repeat.
- **The file is derived**: the `.odt` or `.docx` bytes are written from the model on download, sync and export; kept
  content and pictures are stored in the room (pictures as R2 objects keyed by hash, as gallery images are).
- **Revision and hash**: each persisted state has a revision, as every tab has, and a hash of the file it writes, so a
  repository snapshot can say how old it is.
- <a id="the-digest"></a>**The digest** is what the room knows of a text document without reading its state: its
  characters, words, pages (estimated without layout: `TEXT_DOCUMENT_WORDS_PER_PAGE` words a page), whether it has
  content (any character or object in a body), its search text, and the stored state's bytes. It is kept beside the
  tab (`text_document_digest`), rebuilt from the state when the outbox drains the tab, which every stored update
  queues, so it costs nothing per keystroke and lags an edit by one drain (default).
- **The outbox** feeds D1 as for every tab: the content summary (has content when the digest says so), the search text
  (the digest's: the body's plain text, headers, footers, footnotes and comments), and comments and actions for the
  Inbox ([Document storage](../006-document/document-storage.md#the-outbox)).
- **Tab stats**: a text document's characters count where a tab counts its elements, as a spreadsheet's filled cells
  do, and its stored state's bytes join the tab's; words, pages and comments stay in the digest for the Explorer's
  Details.

## Offline

- Until This Browser holds a text document's state, a new text document is made on LiveDoc whoever makes it, a guest
  included (default).
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
| `TEXT_DOCUMENT_CHUNK_BYTES`     | 1,900,000 | Under the room's 2,000,000-byte row cap with room for the row's other columns                                                                      |
| `TEXT_DOCUMENT_LOG_BYTES`       | 4,000,000 | (default) Compaction keeps the log to a couple of chunks                                                                                           |
| `TEXT_DOCUMENT_MAX_STATE_BYTES` | 64 MB     | (default) The encoded state with its history; past it, versions older than 30 days are thinned first, then edits refused with `document_too_large` |
| `TEXT_DOCUMENT_CARET_MAX_CHARS` | 256       | (default) A relative position's base64 is a few dozen characters; anything longer is no caret                                                      |
| `TEXT_DOCUMENT_CARET_FRESH_MS`  | 1,500     | (default) As long as an article's caret shows its name                                                                                             |
| `TEXT_DOCUMENT_WORDS_PER_PAGE`  | 500       | (default) A page of 11 pt Arial at single spacing, for counts that need no layout                                                                  |
| A frame of edits                | 256 KB    | The room's message cap                                                                                                                             |

A refused edit names its limit; nothing is half applied.

## Observability

Fingerprints, each with the document and tab ids and never text: `[text-document] persisted` (revision, bytes,
chunks, ms), `[text-document] compacted`, `[text-document] digest` (characters, words, ms), `[text-document] merge-offline` (updates, bytes), `[text-document]
edit-refused` (limit), `[text-document] branch-merged` (unmerged count).
