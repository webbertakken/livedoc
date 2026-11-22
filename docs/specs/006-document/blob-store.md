# Blob store

**Status: specified; built on LiveDoc's servers.** Built: the `FILES` bucket, what an owner holds, an upload in one
request and in parts, each checked against its key, resuming, usage and the allowance, reads whole and by range gated
by the document's access and its holds, the holds each document tells, the retention sweep, and the named refusals of
those. A Participant's upload, purging and This Browser are not built.

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
- **The allowance is the deployment's** `(default)`: `FILE_MAX_BYTES_PER_OWNER`, the most bytes one owner's blobs
  may count, the same for every owner, set as the gallery's caps are ([Images](../009-elements/images.md)). Unset,
  there is none, as on a self-host; docs.nu sets 1,073,741,824 (1 GiB) `(default)`, in its hosted profile
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

- A [This Browser](offline-mode.md) document's bytes live in the **origin private file system**, one file per key, so
  the engine's worker reads any range of them synchronously and no list ever reads them; the offline record holds the
  key and the size only.
- Where the origin private file system is missing, the bytes are an IndexedDB Blob in a store of their own, read
  whole into memory before use.
- `navigator.storage.persist()` is asked for when the first blob is kept, as offline documents ask. A browser that
  refuses the bytes says so by name (`local_store_full`, `local_store_unavailable`).
- A cloud document's bytes, once read whole, are kept in the same local store for offline opens, the least recently
  opened forgotten first past `FILE_LOCAL_CACHE_MAX_BYTES`; bytes of This Browser documents are never forgotten.

## Without object storage

A self-host without the `FILES` bucket has no blob store. Everything else works:

- every route answers `503 files_unavailable`; a dropped file is answered "This server has no file storage.";
- file tabs and PDF documents cannot be made; the Explorer and the add menu do not offer them;
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
- Without the bucket every route answers `503 files_unavailable`.

## Refusals

| Name                    | Status | When                                                         |
| ----------------------- | ------ | ------------------------------------------------------------ |
| `files_unavailable`     | 503    | The server has no file storage                               |
| `file_too_large`        | 413    | The bytes pass `FILE_TAB_MAX_BYTES`                          |
| `key_invalid`           | 400    | The key is not 64 lower-case hex characters                  |
| `key_mismatch`          | 422    | The bytes do not hash to the key                             |
| `usage_exceeded`        | 403    | The owner's allowance would be passed                        |
| `upload_not_found`      | 404    | A part or a complete for an upload that is gone              |
| `part_invalid`          | 400    | A part out of order, or not `FILE_PART_BYTES` but the last   |
| `size_invalid`          | 400    | `(default)` An upload in parts that names no whole size      |
| `upload_incomplete`     | 409    | `(default)` A complete before every part is stored           |
| `blob_not_held`         | 404    | The document does not hold that key                          |
| `range_not_satisfiable` | 416    | A range past the blob's end                                  |
| `length_required`       | 411    | `(default)` An upload that does not say how many bytes it is |
| `store_failed`          | 502    | `(default)` Object storage did not take the bytes            |

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
`[blob-store] sweep-tripwire`, `[blob-store] purged`, `[blob-store] unavailable`.

## Non-goals

- Signed addresses straight to object storage: they would cost every self-host a second credential.
- Holding bytes in the room's rows: a second store to keep true.
- Deduplicating across owners: one person's key must never tell another that a file exists.
