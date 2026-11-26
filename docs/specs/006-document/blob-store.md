# Blob store

**Status: specified; built on LiveDoc's servers.** Built: the `FILES` bucket, what an owner holds, an upload in one
request and in parts, each checked against its key, resuming, usage and the allowance, reads whole and by range gated
by the document's access and its holds, the holds each document tells, the retention sweep, a row given with a copy
or a change of owner, the named refusals of those, and This Browser's own store (kept, read whole, forgotten, with
its two refusals). A Participant's upload, purging and a read by range from This Browser's store are not built.

The **blob store** is where LiveDoc keeps a file's bytes, exactly: the bytes of a [file tab](file-tab.md), and a
[PDF document](../035-pdf-documents/pdf-document.md)'s stored file, previous versions, pictures and embedded files. One
store serves both kinds, repository sync and local copies. The research is
[Bytes](../../research/pdf-documents/bytes.md).

## Domain language

| Term     | Means                                                                            | Never called                        |
| -------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| **blob** | One run of bytes held exactly, named by its **key**                              | file (a blob has no name), asset    |
| **key**  | A blob's SHA-256, as 64 lower-case hex characters; equal bytes are one blob      | id, hash (in copy), path            |
| **hold** | A tab, a previous version or a live change naming a key; a blob lives while held | reference (that is an image's), pin |

The gallery's images ([Images](../009-elements/images.md)) stay their own store: they are re-encoded for the canvas
and belong to an owner's gallery, never held exactly.

## Where the bytes live

- An R2 bucket of its own, `FILES`, beside `IMAGES`; an object's name is the id of the owner it was stored for,
  the key and a mark of its own, so one owner's equal files are stored once, two owners never share an object by
  uploading the same bytes, and a key stored again after its blob was swept never meets the sweep's delete.
- **What an owner holds is a row, never an object's name** `(default)`: `blobs` in D1 names, per owner and key, the
  size, the object and when it was stored. The row is written before the first byte, as a claim, and is **held**
  only once storage has taken the bytes and checked them. A guest who signs up takes their rows with them, so no
  byte moves; a key the account already held stays the account's, and the guest's row is swept.
- <a id="a-row-given"></a>**A row is given, never bytes** `(default)`: someone who copies another owner's document
  is given a row for each key the copy's tabs name, and an owner a document passes to (a team's heir, a team document
  moved into someone's own library) one for each key the document has told it holds, previous versions too. The row
  names the object the bytes are already in: no byte moves and none is asked of a browser.
  - A given row is its owner's own from then on: held, counted in their usage, kept by their documents' holds alone.
  - The object stays for as long as any row names it, whoever leaves or is swept.
  - A key the receiver already holds stays as it is. A claim of theirs not yet stored (an upload under way) becomes
    the given row; the bytes that upload then stores are deleted, being an object no row names.
  - A copy that would pass the copier's allowance is refused `403 usage_exceeded` before anything is made. A
    document passing to another owner is never refused for it: their usage may stand past the allowance, and the
    next upload is refused until it does not.
  - Only a document someone may read gives its rows, so a key alone still tells nothing and opens nothing.
- **The key is the content's SHA-256**, computed in the browser before anything is sent, so bytes LiveDoc already
  holds for that owner are never sent again: the upload begins by asking, and `200 held` ends it.
- **The store checks the key against the bytes** as they are stored; bytes that do not hash to their key are refused
  (`422 key_mismatch`) and nothing is kept.
- A blob holds no name, type or time: those belong to the tab that holds it.

## Getting bytes in

| File size                            | Way                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Up to `FILE_SINGLE_UPLOAD_MAX_BYTES` | One request: `PUT /api/files/:key`, the body streamed into storage, never held in memory           |
| Above it, up to `FILE_TAB_MAX_BYTES` | Parts of `FILE_PART_BYTES`: begin, one `PUT` a part, complete; a dropped connection costs one part |

- **An upload begins by asking**: `GET /api/files/:key` answers whether the owner already holds the key (`held`
  true: nothing more is sent; false: the bytes are wanted). Not holding is an answer, never an error.
- **In parts**, three doors, each taking `?document=<id>` as the single request does:
  - `POST /api/files/:key/uploads?size=<bytes>` begins. It answers `{ held: true }` for bytes already held, else
    `{ upload, partBytes, parts }`: the upload's id, `FILE_PART_BYTES`, and the numbers of the parts storage
    already has. Beginning again with the same key and size, for the same owner, answers the same upload: that is
    how one resumes, in the same browser or another.
  - `PUT /api/files/:key/uploads/:upload/parts/:n` stores part `n`, counted from 1, and answers `{ parts }`. A part
    is the next one or one already stored (sent again, it replaces itself); every part is `FILE_PART_BYTES` but
    the last, which is what is left of the size. Anything else is `part_invalid`.
  - `POST /api/files/:key/uploads/:upload/complete` puts the parts together and answers `{ stored: true }`.
- **A file in parts is checked as a single request is** `(default)`: the parts are put together under a name of
  the upload's own, and the whole is then stored under its key with the SHA-256 it must have, by storage itself,
  so no key ever names bytes that were not checked and the api hashes nothing. Bytes that do not hash to the key
  end the upload: `422 key_mismatch`, nothing kept.
- Parts go through the api, so a self-host needs only the bucket's binding: no second credential and no rule on the
  bucket.
- An upload names the document it is for (`?document=<id>`) and asks edit access to it (participate access for bytes
  a Participant's change brings: a drawn signature, a stamp's picture, a signed file); the bytes are then the
  document owner's. A tab-scoped link serves its own tab only.
- **An upload that names no document** is stored for the person uploading, who is about to make a document of their
  own with it `(default)`: a dropped PDF's bytes are held before the document that names them exists.
- An unfinished upload is forgotten after `FILE_UPLOAD_ABANDON_HOURS`, by the retention sweep; its parts count for
  nothing.
- **Usage is checked before the first byte**: an upload that would pass the owner's allowance is refused with what is
  left ([Open source + distribution](../002-project-scope/open-source-and-business-model.md)): `403 usage_exceeded`
  with `leftBytes`.
- **The allowance is the deployment's**: `FILE_MAX_BYTES_PER_OWNER`, the most bytes one owner's blobs
  may count, the same for every owner, set as the gallery's caps are ([Images](../009-elements/images.md)). Unset,
  there is none, as on a self-host; docs.nu sets 1,073,741,824 (1 GiB), in its hosted profile
  ([Deployment](../016-platform/deployment.md)). `GET /api/files` answers the caller's own
  `{ bytes, blobs, allowanceBytes }`, `allowanceBytes` null where there is none.

## Getting bytes out

- `GET /api/documents/:id/files/:key` streams a blob the document holds, gated as the document's content is: the
  owner, a share link's level, a token. A key the document does not hold answers `404 blob_not_held`, whoever asks,
  so a key alone opens nothing.
- **A document holds** the key each of its tabs names and each previous version it keeps, until that version's
  day.
- **By range**: a `Range` request is passed through to storage and answered `206`; a reader fetches a large file in
  blocks, first page first ([Opening](../035-pdf-documents/opening.md#what-is-read)).
- Responses carry the key as a strong `ETag`, are immutable, and never carry a type that a browser would run:
  `Content-Type: application/octet-stream` with `Content-Disposition: attachment` unless the surface asks for the
  bytes by `fetch`.

## Holds and retention

- A blob is **held** while any tab, branch, previous version, named version, live change or trashed document of its
  owner names its key.
- **A custom stamp holds its picture** for its owner while it is kept
  ([Custom stamps](../035-pdf-documents/custom-stamps.md#where-they-are-kept)); deleted, its picture is held by
  nothing of its own, and swept as any blob after the grace.
- **A PDF tab holds the pictures its marks name** (a custom stamp's), read from its digest, for as long as a mark
  names them ([Storage](../035-pdf-documents/live-editing-and-storage.md#storage)).
- **Each document tells what it holds.** Its room pushes, with each changed tab, the keys that tab holds
  (`document_blobs` in D1, through the [outbox](document-storage.md#the-outbox)): the tab's own bytes for as long as
  the tab names them, a previous version until its day. A purged document's holds go with it.
- **Previous versions** are held for `FILE_PREVIOUS_VERSION_DAYS` after they stopped being a tab's bytes, as the
  [file tab](file-tab.md#changing-it) says, or for as long as a named version points at them.
- A blob no longer held is deleted by the retention sweep after `FILE_UNHELD_GRACE_HOURS`, so an upload finished
  moments before its tab names it is never swept.
- **The sweep keeps bytes whenever in doubt**, as the [images'](../009-elements/images.md) does: it runs daily,
  reads only what the rooms pushed, waits while any document has not pushed yet, deletes a row only by a statement
  that checks its holds again at that instant, and a run that would delete more than half of the old blobs, and
  more than `FILE_SWEEP_TRIPWIRE_MIN` of them, deletes at most `FILE_SWEEP_TRIPPED_MAX`, oldest first, and logs an
  error. A gap in what the rooms pushed looks exactly like that.
- **Purging** removes a blob at once, held or not, for one reason only: a redaction or removal of hidden information
  that must leave no earlier copy ([Redaction and protection](../035-pdf-documents/redaction-and-protection.md#what-applying-removes)).
- **Usage** counts each distinct key once per owner, previous versions included while they are kept.

## This Browser

A browser keeps bytes of its own, in the **local blob store**: every [This Browser](offline-mode.md) document's, and
a cloud document's once they were read whole.

- The bytes live in the **origin private file system**, one file per key in a `blobs` directory, so no list ever
  reads them; the offline record holds the key and the size only, on the tab that names them.
- Where the origin private file system is missing or cannot be written from a page, the bytes are held whole
  in an IndexedDB store of their own (`bytes`, in the `livedoc-blobs` database), read into memory before use.
- **An index** beside them (`index`, in the same database) names each key held, its size and when it was last used
  `(default)`. A key is held once its bytes are written whole; bytes whose size is not the index's are not there.
- **Read whole** `(default)`: the engine is handed every byte, as from LiveDoc's servers. A read by range from the
  engine's worker joins when the engine reads by range at all ([Opening](../035-pdf-documents/opening.md#what-is-read)).
- `navigator.storage.persist()` is asked for when the first blob of a This Browser document is kept, as offline
  documents ask.
- **A browser that refuses the bytes says so by name**: `local_store_full` (its quota is met, after every forgettable
  blob was forgotten) and `local_store_unavailable` (no origin private file system and no IndexedDB, or one that
  fails). Nothing is half kept.
- **A cloud document's bytes**, once read whole, are kept in the same store, and the next open of that file reads
  them from this browser with no request for the bytes. The least recently used are forgotten first past
  `FILE_LOCAL_CACHE_MAX_BYTES`; a browser that refuses them changes nothing, and logs it.
  - A document is still opened by asking LiveDoc, which says what the person may read; the kept bytes answer the
    read of the file alone, so a key in this browser opens nothing by itself.
  - **Signing out forgets them** `(default)`, so a shared browser keeps no file of an account that left it.
- **Bytes of This Browser documents are never forgotten**: a key any offline record names, in the local Trash too, is
  kept whatever the store weighs. Nor is a key kept within `FILE_LOCAL_FRESH_MS`, so bytes kept a moment before
  their document is written are still there for it.
- **A key no record names any more** (its document purged from the local Trash, or deleted for good) is forgotten
  with it, unless another This Browser document names it. A document synced to LiveDoc leaves its bytes as a cloud
  document's.

## Without object storage

A self-host without the `FILES` bucket has no blob store. Everything else works:

- every route answers `503 files_unavailable`; a dropped file is answered "This server has no file storage.";
- file tabs and PDF documents cannot be made; the Explorer and the add menu do not offer them;
- a browser asks first: `GET /api/capabilities` says `filesEnabled`, and where it says no, a file that would be sent
  is refused before a byte of it is read. Where the answer is not known (the request failed, an older api), the
  file is read and the upload's own answer says it `(default)`. A file kept in This Browser asks nothing;
- a repository sync leaves such files in the repository, untouched, and reports them.

## Limits

| Constant                       | Value                 | Why                                                                                                      |
| ------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `FILE_TAB_MAX_BYTES`           | 100,000,000 (100 MB)  | The [file tab](file-tab.md#limits)'s cap, for every blob (Webber, 2026-11-21)                            |
| `FILE_SINGLE_UPLOAD_MAX_BYTES` | 33,554,432 (32 MiB)   | `(default)` Under it one request is simplest; above it a dropped connection must not cost the whole file |
| `FILE_PART_BYTES`              | 8,388,608 (8 MiB)     | `(default)` Above object storage's 5 MiB least part; 12 parts for 100 MB                                 |
| `FILE_UPLOAD_ABANDON_HOURS`    | 24                    | `(default)` A day to resume                                                                              |
| `FILE_PREVIOUS_VERSION_DAYS`   | 30                    | As the Trash keeps a deleted document                                                                    |
| `FILE_UNHELD_GRACE_HOURS`      | 24                    | `(default)` Longer than any upload                                                                       |
| `FILE_SWEEP_TRIPWIRE_MIN`      | 20                    | `(default)` The images' sweep's own: fewer than that is never a gap in the index                         |
| `FILE_SWEEP_TRIPPED_MAX`       | 100                   | `(default)` A day of a tripped sweep costs at most this many blobs before its error is read              |
| `FILE_LOCAL_CACHE_MAX_BYTES`   | 536,870,912 (512 MiB) | `(default)` A browser's own quota bites first on a phone                                                 |
| `FILE_LOCAL_FRESH_MS`          | 600,000 (10 minutes)  | `(default)` Longer than hashing and writing a file at the cap; safe range 1 to 60 minutes                |

A file at the cap travels as 12 parts, each streamed through the api and never held whole, so the api's memory is
untouched by a file's size.

## Tests

- A file of `FILE_SINGLE_UPLOAD_MAX_BYTES` goes in one request; one byte more goes in parts; a file of exactly
  `FILE_TAB_MAX_BYTES` is stored and one byte more is refused before any byte travels.
- An upload dropped after a part resumes from the next part and stores the same key.
- A file in parts whose bytes do not hash to its key is refused at the end, and its key stays unheld.
- A guest's blobs are the account's after signing up, read under the same documents.
- A blob whose document was purged is swept after its grace; one a tab or a previous version holds never is.
- Bytes that do not hash to their key are refused and nothing is kept.
- A range read returns exactly the bytes asked for; a key the document does not hold answers `404 blob_not_held`.
- Someone else's copy reads its file after the original is purged and swept, counts in the copier's usage, and is
  refused when it would pass their allowance; a document passed to another owner reads its file and its previous
  versions.
- An upload that ends after its claim became a given row leaves no object behind.
- Without the bucket every route answers `503 files_unavailable`.
- This Browser's store keeps bytes and reads the same bytes back, in the origin private file system and in
  IndexedDB; a full store is `local_store_full`, a missing one `local_store_unavailable`; past the cache's limit the
  least recently used go first, and never a key an offline record names or one kept a moment ago.

## Refusals

| Name                    | Status | When                                                          |
| ----------------------- | ------ | ------------------------------------------------------------- |
| `files_unavailable`     | 503    | The server has no file storage                                |
| `file_too_large`        | 413    | The bytes pass `FILE_TAB_MAX_BYTES`                           |
| `key_invalid`           | 400    | The key is not 64 lower-case hex characters                   |
| `key_mismatch`          | 422    | The bytes do not hash to the key                              |
| `usage_exceeded`        | 403    | The owner's allowance would be passed, by an upload or a copy |
| `upload_not_found`      | 404    | A part or a complete for an upload that is gone               |
| `part_invalid`          | 400    | A part out of order, or not `FILE_PART_BYTES` but the last    |
| `size_invalid`          | 400    | `(default)` An upload in parts that names no whole size       |
| `upload_incomplete`     | 409    | `(default)` A complete before every part is stored            |
| `blob_not_held`         | 404    | The document does not hold that key                           |
| `range_not_satisfiable` | 416    | A range past the blob's end                                   |
| `length_required`       | 411    | `(default)` An upload that does not say how many bytes it is  |
| `store_failed`          | 502    | `(default)` Object storage did not take the bytes             |

This Browser's store refuses by name too, with no status, being no request:

| Name                      | When                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| `local_store_full`        | The browser's quota is met, with every forgettable blob already forgotten |
| `local_store_unavailable` | The browser has nowhere to keep bytes, or its storage fails               |

## Share roles

| Role            | May                                                                       |
| --------------- | ------------------------------------------------------------------------- |
| **Editor**      | Store bytes for the document; read any blob it holds                      |
| **Participant** | Read any blob it holds; store only what a participate-level change brings |
| **Viewer**      | Read any blob it holds                                                    |

The owner's setting that turns downloading off for Viewers and Participants hides the controls; it is no lock, since
the bytes reach a browser to be shown.

## Observability

Fingerprints with the document id and the key's first 8 characters, never a name: `[blob-store] held` (asked, already
there), `[blob-store] stored bytes=<n> parts=<n>`, `[blob-store] refused name=<name>`, `[blob-store] read
bytes=<n> ranged=<bool>`, `[blob-store] upload-begun parts=<n>`, `[blob-store] upload-resumed have=<n>`,
`[blob-store] part-stored n=<n>`, `[blob-store] swept count=<n> uploads=<n>`, `[blob-store] sweep-paused`,
`[blob-store] sweep-tripwire`, `[blob-store] purged`, `[blob-store] unavailable`, `[blob-store] given count=<n>
reason=<copy|owner>` (with the receiving document, never a key), `[blob-store] upload-superseded` (an upload's bytes
deleted because its claim became a given row).

This Browser's store logs in the browser, with a key's first 8 characters: `[blob-store] local-kept bytes=<n>
where=<opfs|indexeddb>`, `[blob-store] local-read bytes=<n>`, `[blob-store] local-miss`, `[blob-store] local-refused
name=<name>`, `[blob-store] local-forgotten count=<n> bytes=<n> why=<cache|document|sign-out>`,
`[blob-store] local-persist granted=<bool>`, `[blob-store] local-keep-skipped` (a cloud document's bytes not kept),
`[blob-store] local-forget-failed why=sign-out`.

## Non-goals

- Signed addresses straight to object storage: they would cost every self-host a second credential.
- Holding bytes in the room's rows: a second store to keep true.
- Deduplicating across owners: one person's key must never tell another that a file exists.
