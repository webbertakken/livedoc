# Live editing and storage

**Status: specified; the room's storage, the digest, the live merge of one body, presence, reconnect catch-up and
the local copy of unconfirmed edits are built.**

How a [text document](text-document.md) is edited by people and agents at once, stored in its room, kept offline,
branched, copied, versioned, searched and listed. The research is
[Live model](../../research/docs-open-standard/live-model.md).

## The live model

- The text document is a **sequence CRDT**, Yjs: the body of each document tab a tree of paragraphs and tables holding
  text with formatting attributes; styles, page setups and lists in maps beside it, comment threads in `threads`
  ([Review](review.md#how-a-comment-is-kept)), suggestions in the writing. ProseMirror
  is a view bound to it.
- The first document tab's (`t.0`) body is the root XML fragment `body`, in y-prosemirror's layout (a `paragraph`
  element holding text) (default). A root type exists in every replica, so no two people ever make it twice.
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
  `kept`), `section_break` (the section's setup and its kept region), `kept_block` (its name and kept XML) and
  `table`, holding `table_row`s of `table_cell`s and `table_header`s, each cell holding blocks as the body does
  ([Tables](tables.md#in-the-editor)).
- **Runs** are a paragraph's text, formatted by attributes: one per text property (`bold`, `italic`, `underline`,
  `strike`, `vertical`, `font`, `size`, `color`, `highlight`, `small_caps`, `transform`), each holding `{ value }`, so
  a `false` that overrides a style's `true` is kept; then `link` (`href`), `text_style` (`id`) and `run_kept`
  (`kept`). Two people formatting one stretch differently each win on their own property.
- **A kept inline** is a `kept_inline` atom inside its paragraph: its name, XML, formatting and link.
- **A picture** is a `picture` atom inside its paragraph: its media key, size, alternative text, title, whether it is
  decorative, crop, formatting and link ([Objects](objects.md#in-the-editor)).
- **An equation** is an `equation` atom inside its paragraph: its maths as one whole value, its formatting and link
  ([Objects](objects.md#equations-in-the-editor)).
- **A field** is a `field` atom (what it shows, its text last drawn, formatting and link); **a footnote's mark** is a
  `footnote` atom naming its note by `story`, with the mark's formatting and link; the note's writing is a
  `story:<id>` fragment, as a header's.
- **Headers and footers** are root XML fragments named `story:<id>`, each in the body's layout; a section (the first in
  `document`, a later one in its `section_break`) holds `headers` as a whole value, its slots naming the fragments
  by id. Two people typing in one header merge by character, as in the body. A pasted section break naming a fragment
  shares it until one of them is made its own (default).
- **Beside the body**: the root map `document` holds `metadata`, `defaults`, the first `section` and the `watermark` as
  whole values; `media` is a root map of the pictures' media by key, each `{ mediaType, part, image }` (a gallery
  image) or `{ mediaType, part, bytes }` ([Objects](objects.md#where-the-bytes-live)), written when a file is opened or
  converted and when a picture arrives;
  `styles` and `lists` are root maps by id, so two people changing two styles never collide; `source` holds what a
  file brought around the model (`json`) and its package entries by name (`entries`, as bytes), written once when the
  file is opened and replaced only by a conversion.
- **Document tabs** ([Text document](text-document.md#what-a-document-tab-is)): the root map `tabs` holds each document
  tab by id as a whole value, `{ name, emoji, depth, order }`, the outline's order by `order` (then id); the tab
  `t.0`'s body is the root fragment `body`, any other's the root fragment `tab:<id>` (default). A map without entries
  is one tab, `t.0`, Tab 1. Two people adding tabs at once both keep theirs; changing one tab at once, the later
  write wins; typing in a tab's body merges by character as in the first. A deleted tab's fragment is emptied.
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
- **One's own selection** follows others' changes: an object one has selected that someone else's change (or a
  suggestion settled) takes away leaves a caret where it was, never an error (`patches/y-prosemirror@1.3.7.patch`
  restores a node selection only where a selectable node still stands).

## Undo

Undo and redo take back the person's own changes only, newest first (`UndoManager` tracking the local origin), with
the caret put back; typing within `TEXT_DOCUMENT_UNDO_GROUP_MS` (500 ms) is one step, as Google groups it. A change to
the document's styles (update to match, use or reset styles) is on the same timeline, one step with the paragraphs it
changes ([Text and paragraphs](text-and-paragraphs.md#update-to-match)).

- A step of the editor that changes no writing (a highlight, a decoration, a selection) never ends the undo step being
  gathered, though it is kept out of undo: `patches/y-prosemirror@1.3.7.patch` ends it only for a change to the
  writing, so typing stays one step while comments, pages and peers redraw between keys.

## Storage

- The **room** holds the text document's CRDT and is the **one writer** of its storage: it applies every edit (a
  person's, an agent's changeset, a sync), appends each update to the tab's log as it applies it and before it
  relays it (default), so nothing relayed is unstored and a hibernating room holds no unsaved edit; never through
  the editor's whole-tab save
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-room)); it is the first live tab kind
  ([Live state](../006-document/kinds-outside-the-canvas.md#live-state)).
- **Chunked under the row cap**: the encoded state is split into rows of at most `TEXT_DOCUMENT_CHUNK_BYTES` in a table
  of its own (`text_document_chunks`: tab, revision, index, bytes), with an update log since the last compaction
  (`text_document_updates`: tab, sequence, bytes); both go with their tab. Compaction folds the log into the chunks,
  as one transaction, when the log passes `TEXT_DOCUMENT_LOG_BYTES` or holds more than `TEXT_DOCUMENT_LOG_UPDATES`
  updates (every read of the state and every digest merges the log, and merging many small updates costs more than
  their count), or on the room's idle alarm.
- **Reading it**: `GET /api/documents/:id/text-documents/:tabId/state` answers the whole state as one Yjs update
  (read access, a tab-scoped link on its own tab); `404 text_document_not_found` when the tab is absent or another kind.
  With `since` (a state vector, base64) it answers only what the state holds beyond it, `400 state_vector_invalid`
  when that is no state vector; either way the state's own vector rides `X-State-Vector`, so a reader learns what
  the room lacks.
- <a id="sending"></a>**Sending**: an edit goes to the room as one `text-document` op while the room is open and its
  update's base64 is at most `TEXT_DOCUMENT_FRAME_CHARS`; a larger one (a long paste, a catch-up after a long time
  offline) goes by `POST /api/documents/:id/text-documents/:tabId/updates`, the update's bytes as the body.
  - The door asks edit access (a tab-scoped link on its own tab only) and answers `204` once the room has stored it;
    `400 update_invalid` when the bytes are no Yjs update, `413 update_too_large` past
    `TEXT_DOCUMENT_UPDATE_MAX_BYTES`, `404 text_document_not_found` when the tab is absent or another kind.
  - The room applies it on the same write queue as the ops, so compaction never folds the log under it; an update
    past `TEXT_DOCUMENT_CHUNK_BYTES` is folded into the chunks at once, since no row of the log may hold it.
  - Everyone else hears it as a `text-document` op when it fits a frame, else as the tab's `stale` op
    (`{ kind: 'text-document', tabId, stale: true }`), on which a surface re-reads the state as on reconnecting.
- <a id="reconnecting"></a>**Reconnecting**: while the room is closed, a surface sends nothing (the room's outbox is
  left to the canvas, and a long spell offline would overflow it); its edits wait in the document and in the
  [local copy](#the-local-copy).
  - Each time the room opens and the surface may have missed something (it loaded while the room was closed, or the
    room closed since), and when the room tells it to re-hydrate, the surface reads what the state holds beyond its
    own (`since`), merges it, and sends what it holds that the state lacks, by op or by the door by size:
    `[text-document] caught-up`.
  - Updates from the room that arrive while the state is being read are held and applied after it, so none fall
    between the read and the binding. Yjs makes all of it harmless to repeat.
- **The file is derived**: the `.odt` or `.docx` bytes are written from the model on download, sync and export; kept
  content and pictures are stored in the room (pictures as R2 objects keyed by hash, as gallery images are).
- **Revision and hash**: each persisted state has a revision, as every tab has, and a hash of the file it writes, so a
  repository snapshot can say how old it is.
- <a id="the-digest"></a>**The digest** is what the room knows of a text document without reading its state: its
  characters, words, pages (estimated without layout: `TEXT_DOCUMENT_WORDS_PER_PAGE` words a page), whether it has
  content (any character or object in a body), its search text (the body's paragraphs, then each header and footer a
  section names, each once, in section order; the counts stay the body's, as Google's word count), and the stored
  state's bytes. It is kept beside the
  tab (`text_document_digest`), rebuilt from the state when the outbox drains the tab, which every stored update
  queues, so it costs nothing per keystroke and lags an edit by one drain (default).
- **The outbox** feeds D1 as for every tab: the content summary (has content when the digest says so), the search text
  (the digest's: the body's plain text, headers, footers, footnotes and comments), and comments and actions for the
  Inbox ([Document storage](../006-document/document-storage.md#the-outbox)).
- **Tab stats**: a text document's characters count where a tab counts its elements, as a spreadsheet's filled cells
  do, and its stored state's bytes join the tab's; words, pages and comments stay in the digest for the Explorer's
  Details.

## Offline

- A new text document goes where any new document goes: This Browser for a guest, LiveDoc for a signed-in person
  ([Save Locations](../006-document/save-locations.md)).
- <a id="this-browser"></a>**A text document in This Browser** holds its state in its document's offline record and
  works fully, with no room ([Offline Mode](../006-document/offline-mode.md)):
  - The record's `textDocuments` holds, per text document tab, its whole state and when it was saved; a tab with
    none reads as the seed.
  - An edit is saved `TEXT_DOCUMENT_LOCAL_SAVE_MS` after it, and at once when the page is hidden or the tab closes;
    each save merges into the stored state in one transaction, so another browser tab's saves are never undone.
  - Browser tabs open on the same text document pass each edit to each other on the `livedoc-text-document`
    BroadcastChannel, so both stay live.
  - **Sync Document** sends each state with the create (`textDocuments: [{ tabId, state }]`), and a save during the
    upload counts as a change, as a tab's does; **Take Offline** reads every text document tab's state into the
    record, all or nothing, before the server copy goes; a **Duplicate** copies the states under the tabs' new ids;
    the local Trash keeps them, and a purge removes them with the record.
  - **Download** writes the file in this browser, from the state, as the room would.
  - In the Explorer's lists it has content once its writing has been saved, told without reading its state (default).
  - Opening a file still makes a LiveDoc document, so the room's guards read it (default).
  - Every offline record is read whole by the Explorer's lists, so a large text document in This Browser costs its
    bytes on each list, as a spreadsheet's sheets do (default).
- <a id="the-local-copy"></a>**The local copy**: a cloud text document edited while the room cannot confirm it (the
  network gone, the room closed, a confirmation late) keeps going, and this browser keeps what the room has not
  confirmed, so closing the tab or a crash loses nothing (default):
  - It lives in IndexedDB, in the `livedoc-text-documents` database's `copies` store, one record per document and tab:
    the update since the state the room last confirmed, and when it was saved.
  - It is written `TEXT_DOCUMENT_LOCAL_SAVE_MS` after an edit the room has not confirmed by then, and at once when the
    page is hidden or left with one unconfirmed; an edit confirmed in time writes nothing.
  - It is deleted once the room has confirmed every edit (each op's cursor, or a catch-up that finds nothing
    missing), so a shared browser keeps no copy of a document beyond its unsent edits.
  - Opening the tab again merges a copy left behind into the state read from the room and sends what the room
    lacks: `[text-document] merge-offline` (updates, bytes). Either way the edits merge by character, nothing lost.
  - A browser without IndexedDB, or one that refuses the write, edits as before and logs
    `[text-document] local-copy-failed`; the room still catches up on reconnect while the page stays open.
- File > Make available offline is LiveDoc's This Browser and offline open.

## Branches

A [document branch](../006-document/document-branches.md) of a text document holds its own CRDT, started from main's
at the branch point; merging applies the branch's updates by character. Where both sides formatted one stretch
differently, main's stands and the branch's is kept as a comment, "Not merged from <branch>: Format: bold".

## Copies, snapshots and versions

- <a id="copies"></a>**A copy** (Make a copy, a tab-scoped visitor's copy, the Explorer's Duplicate) holds each copied
  text document tab's whole state, merged into one, under the tab's new id, so it reads as the source did when copied:
  - the api's copy moves it from room to room with the tabs (the source's room exports it, the copy's imports it);
  - the Explorer's Duplicate of a cloud document reads each state and seeds the new document with it, as the create's
    `textDocuments: [{ tabId, state }]` (base64), beside a file's `{ tabId, file }`
    ([Opening](files-and-print.md#opening)); a state that is no Yjs update is `400 text_document_seed_invalid`.
- <a id="thumbnails"></a>**Thumbnails** draw the first page from the model, without layout (default): a white page
  of the first section's paper, its margins, and the paragraphs from the top, each at its style's size, weight and
  colour, wrapped at an average character width, until the page is full; white in both schemes, as the page is.
  An empty text document has none, as an empty canvas has none (the row shows its icon).
- **Saved**: each rebuild of the digest marks the document saved at that moment, so the Explorer's Modified and the
  thumbnail's freshness follow the writing, an edit late by one drain (default).
- **The Trash**: a text document in the Trash keeps its state; restoring it brings it back whole, and a purge removes
  its state with its tabs ([Trash](../013-workspace/trash.md)).
- **Versions** are kept in the room, beside the state ([Versions](#versions)).

## Versions

<a id="versions"></a>A text document tab's versions ([Review](review.md#version-history)) are kept in its room, beside
its state, and go with the tab: the Trash keeps them, a purge removes them. A copy (Make a copy, Duplicate, a
visitor's copy) and a branch start with none, as Google's copies do (default).

- **A version** is a Yjs snapshot of the tab's state, stored as two parts: its **state vector** (what the state held,
  client by client) and its **deletions**, the delete set it adds over the version before it. A version reads as its
  state vector with the union of its deletions and every earlier kept version's. Garbage collection is off in the room
  and every browser, so every deleted item stays in the state and any version is drawn from the state alone, with no
  stored copy of it.
- Each version also holds its kind (automatic or named), its name, when it was taken, who took it (the restorer, the
  namer; none for an automatic one), the version it was restored from, if any, and its **editors**.
- **What it costs**, measured on a seeded document near the character limit (951,238 characters, 18,375
  paragraphs, written in 120 sessions of 1,000 edits, about a third of them deletions): the state is 4.43 MB with
  every deleted item kept and 4.13 MB without, so keeping them costs about 7%; a whole snapshot grows with every
  deletion ever made, to 100 KB (6.1 MB for 120 of them), so a version keeps only the deletions it adds: 1.9 KB on
  average, 2.7 KB at most, 224 KB for all 120. Reading the newest of them whole takes 7 ms, and equals its whole
  snapshot.
- The deletions of all versions together never exceed the state's own delete set, so a tab's versions grow by their
  state vectors (a few bytes per writer each) and stay far under its state; they are rows in the room, not files,
  so they count toward neither the state's limit nor the owner's file allowance
  ([Blob store](../006-document/blob-store.md)); their own caps bound them.

### Taking a version

- An **automatic** version is taken on the room's write queue, right after storing the update that ends a window:
  `TEXT_DOCUMENT_VERSION_EVERY_MS` since the window's first update, or `TEXT_DOCUMENT_VERSION_EVERY_UPDATES` updates
  in it. The window lives in the room's memory, so an edit writes nothing more; a room woken anew starts one at its
  first update. A quiet tab takes no version, and none is ever missing: the history's **Current version** is the
  state itself.
- A **named** version: naming the current version names the newest version when no update was stored since it, else
  takes a version of now with the name; naming an automatic one makes it named. A named version is kept forever.
- **Thinning**, each time a version is taken: automatic versions older than `TEXT_DOCUMENT_VERSION_KEEP_ALL_DAYS`
  keep the newest of each UTC day; then, while the tab holds more than `TEXT_DOCUMENT_AUTO_VERSIONS_MAX` automatic
  versions or its versions pass `TEXT_DOCUMENT_VERSIONS_MAX_BYTES`, the oldest automatic one goes. Named ones never go.
  A version that goes hands its deletions and editors to the next kept version, so every kept one still reads whole.
- A version whose deletions would pass the room's row (`TEXT_DOCUMENT_CHUNK_BYTES`) is not taken, and one that would
  pass it by taking a thinned version's is kept rather than thinned; each logs `[text-document] version-too-large`.

### Who changed what

- The room records, per tab, each Yjs client id an update writes with, under its sender's adder key and the name and
  colour their session presents, as a comment's author is kept ([How a comment is kept](review.md#how-a-comment-is-kept)):
  the key says whose without saying who, guests and share-link people alike. The first sender of a client id keeps
  it; another key's update with it is stored and logged `[text-document] author-conflict`.
- It records the deletions each sender's updates make, per key, until the next version takes them.
- A version's **editors** are the keys whose client ids wrote between it and the version before it, and those whose
  deletions it holds. A sender without an adder key, and an update posted by the door without one, are recorded as
  none: an unrecorded editor, drawn in the neutral grey.
- The record is written after the update is stored, outside its transaction: writing it never delays, refuses or
  fails an edit. A failed write is logged `[text-document] author-record-failed` and its edits read as unrecorded.

### Restoring a version

- The room takes an automatic version of now, then applies **one change by the restorer**, as one update on the
  write queue, relayed as any other: content written since the version is deleted, content the version holds that
  was deleted since is written again where it stood, and content unchanged since stays, in the document's content
  (its tabs, stories, styles, lists, pictures and settings), never in its comment threads.
- An update stored after the restore read the state stays on top of it: someone typing during a restore keeps
  their later edits.
- It then takes a version of the result, by the restorer, restored from the chosen one.

### The api

Every route is an Editor's (`403 level_too_low` for anyone else), on a text document tab of a LiveDoc document
(`404 not_found` otherwise), under `/api/documents/:id/tabs/:tabId/versions`:

- `GET` lists the versions, newest first, each with its id, kind, name, time, who took it, what it was restored
  from, and its editors (key, name, colour).
- `GET /:versionId` answers the version's snapshot and the one before it (state vector and whole delete set,
  base64), so the browser draws the version and its changes from the state it holds.
- `POST` names the current version (`{ name }`); `PATCH /:versionId` names, renames or (an empty name) unnames one.
  A name past `TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS` is `400 version_name_too_long`; a 41st named version
  `409 named_versions_full`.
- `POST /:versionId/restore` restores it and answers the version of the result.
- **Make a copy** reads the version in the browser and creates the copy as a Duplicate does
  ([Copies](#copies)), its state the version's content as a fresh update.
- A version that is not the tab's is `404 version_not_found`.

## Search and the Explorer

- Content search reads the search text the outbox pushes ([Content search](../013-workspace/content-search.md)).
- The Explorer shows a text document with its glyph (a page with lines), the Kind chip **Text document**, its default
  folder key `kind:text-document`, and its first page as the thumbnail
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-explorer)).

## Share roles

The room relays a text document's updates from an `edit` session unjudged, and judges a `participate` session's by
what they change (fork D7): only the sender's own comments ([How a comment is kept](review.md#how-a-comment-is-kept))
and the sender's own suggestions ([How a suggestion is kept](review.md#how-a-suggestion-is-kept)). An update from a
level too low is refused whole, as every live tab kind's is
([Live state](../006-document/kinds-outside-the-canvas.md#live-state)): its sender alone hears
`{ kind: 'text-document-refused', tabId, name: 'level_too_low' }`. Tests: the judge refuses each forbidden change, and the
room refuses an update its judge asks Editing for.

## Limits

| Constant                               | Value     | Why                                                                                                                                 |
| -------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TEXT_DOCUMENT_CHUNK_BYTES`            | 1,900,000 | Under the room's 2,000,000-byte row cap with room for the row's other columns                                                       |
| `TEXT_DOCUMENT_LOG_BYTES`              | 4,000,000 | (default) Compaction keeps the log to a couple of chunks                                                                            |
| `TEXT_DOCUMENT_LOG_UPDATES`            | 500       | (default) A log of keystrokes merges in about 10 ms at 500 updates, 0.3 s at 5,000 and 5 s at 20,000                                |
| `TEXT_DOCUMENT_MAX_STATE_BYTES`        | 64 MB     | (default) The encoded state with every deleted item kept (versions need them); past it, edits are refused with `document_too_large` |
| `TEXT_DOCUMENT_CARET_MAX_CHARS`        | 256       | (default) A relative position's base64 is a few dozen characters; anything longer is no caret                                       |
| `TEXT_DOCUMENT_CARET_FRESH_MS`         | 1,500     | (default) As long as an article's caret shows its name                                                                              |
| `TEXT_DOCUMENT_WORDS_PER_PAGE`         | 500       | (default) A page of 11 pt Arial at single spacing, for counts that need no layout                                                   |
| A frame of edits                       | 256 KB    | The room's message cap                                                                                                              |
| `TEXT_DOCUMENT_FRAME_CHARS`            | 200,000   | The most base64 one `text-document` op carries: inside the room's 256 KB message cap with room for the envelope                     |
| `TEXT_DOCUMENT_UPDATE_MAX_BYTES`       | 8 MB      | The api's body cap; an update sent by the door past it is refused `update_too_large` and stays in the local copy                    |
| `TEXT_DOCUMENT_LOCAL_SAVE_MS`          | 500       | (default) As long as Google groups typing for undo; an edit the room confirms sooner is never written                               |
| `TEXT_DOCUMENT_UNDO_GROUP_MS`          | 500       | Typing within it is one undo step, as Google groups it                                                                              |
| `TEXT_DOCUMENT_VERSION_EVERY_MS`       | 1,800,000 | (default) Google's 30 minutes of edits                                                                                              |
| `TEXT_DOCUMENT_VERSION_EVERY_UPDATES`  | 1,000     | (default) A burst of edits gets a version before its 30 minutes are up                                                              |
| `TEXT_DOCUMENT_VERSION_KEEP_ALL_DAYS`  | 30        | (default) After it, one automatic version a day                                                                                     |
| `TEXT_DOCUMENT_AUTO_VERSIONS_MAX`      | 1,000     | (default) 30 days of non-stop editing takes 1,440; about 2 KB each, 2 MB at the cap                                                 |
| `TEXT_DOCUMENT_VERSIONS_MAX_BYTES`     | 8 MB      | (default) A backstop: a tab's versions measure a few hundred KB near the character limit                                            |
| `TEXT_DOCUMENT_NAMED_VERSIONS_MAX`     | 40        | Google's limit of named versions a document                                                                                         |
| `TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS` | 100       | (default) A name fits the panel's row in two lines                                                                                  |

A refused edit names its limit; nothing is half applied.

<a id="refused-edits"></a>**Refused edits**:

- The room refuses an update that would take the text document past `TEXT_DOCUMENT_MAX_CHARS` (the digest's characters
  and the characters the update inserts, deletions not counted, so it never lets one through that it should refuse)
  or its stored state past `TEXT_DOCUMENT_MAX_STATE_BYTES`; nothing of it is stored or relayed, and it logs
  `[text-document] edit-refused` with the limit (`characters` or `state`).
- The sender alone hears `{ kind: 'text-document-refused', tabId, limit }`; the door answers
  `413 document_too_large` with the `limit`.
- The editor refuses typing or a paste that would pass `TEXT_DOCUMENT_MAX_CHARS` itself, before anything is sent, and
  says, as a status beside the title: "This text document has reached its limit of 1,020,000 characters." A refusal from
  the room says the same, or "This text document has reached its size limit." for the state's.
- Versions never make room: thinning them frees their own rows, never the state's deleted items ([Versions](#versions)).

## Observability

Fingerprints, each with the document and tab ids and never text: `[text-document] persisted` (revision, bytes,
chunks, ms), `[text-document] compacted`, `[text-document] digest` (characters, words, ms), `[text-document] merge-offline` (updates, bytes), `[text-document]
edit-refused` (limit), `[text-document] branch-merged` (unmerged count), `[text-document] version-taken` (version, kind, trigger, bytes, ms), `[text-document] versions-thinned` (count, bytes), `[text-document] version-too-large` (bytes), `[text-document] version-named` (version), `[text-document] version-restored` (from, to, bytes, ms), `[text-document] author-conflict` (client), `[text-document] author-record-failed` (error); in the browser `[text-document] caught-up`
(bytes sent), `[text-document] sent-by-door` (bytes), `[text-document] local-copy saved|cleared|failed` (bytes).
