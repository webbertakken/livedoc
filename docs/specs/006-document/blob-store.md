# Blob store

**Status: specified.** Nothing is built.

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

- An R2 bucket of its own, `FILES`, beside `IMAGES`; an object's name is the owner's id and the key, so one owner's
  equal files are stored once and two owners never share an object.
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

- Parts go through the api, so a self-host needs only the bucket's binding: no second credential and no rule on the
  bucket.
- An upload names the document it is for and asks edit access to it (participate access for bytes a Participant's
  change brings: a drawn signature, a stamp's picture, a signed file); a tab-scoped link serves its own tab only.
- An unfinished upload is forgotten after `FILE_UPLOAD_ABANDON_HOURS`; its parts count for nothing.
- **Usage is checked before the first byte**: an upload that would pass the owner's allowance is refused with what is
  left ([Open source + distribution](../002-project-scope/open-source-and-business-model.md)).

## Getting bytes out

- `GET /api/documents/:id/files/:key` streams a blob the document holds, gated as the document's content is: the
  owner, a share link's level, a token. A key the document does not hold answers `404 blob_not_held`, whoever asks,
  so a key alone opens nothing.
- **By range**: a `Range` request is passed through to storage and answered `206`; a reader fetches a large file in
  blocks, first page first ([Opening](../035-pdf-documents/opening.md#what-is-read)).
- Responses carry the key as a strong `ETag`, are immutable, and never carry a type that a browser would run:
  `Content-Type: application/octet-stream` with `Content-Disposition: attachment` unless the surface asks for the
  bytes by `fetch`.

## Holds and retention

- A blob is **held** while any tab, branch, previous version, named version, live change or trashed document of its
  owner names its key.
- **Previous versions** are held for `FILE_PREVIOUS_VERSION_DAYS` after they stopped being a tab's bytes, as the
  [file tab](file-tab.md#changing-it) says, or for as long as a named version points at them.
- A blob no longer held is deleted by the retention sweep after `FILE_UNHELD_GRACE_HOURS`, so an upload finished
  moments before its tab names it is never swept.
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
| `FILE_LOCAL_CACHE_MAX_BYTES`   | 536,870,912 (512 MiB) | `(default)` A browser's own quota bites first on a phone                                                 |

A file at the cap travels as 12 parts, each streamed through the api and never held whole, so the api's memory is
untouched by a file's size.

## Tests

- A file of `FILE_SINGLE_UPLOAD_MAX_BYTES` goes in one request; one byte more goes in parts; a file of exactly
  `FILE_TAB_MAX_BYTES` is stored and one byte more is refused before any byte travels.
- An upload dropped after a part resumes from the next part and stores the same key.
- Bytes that do not hash to their key are refused and nothing is kept.
- A range read returns exactly the bytes asked for; a key the document does not hold answers `404 blob_not_held`.
- Without the bucket every route answers `503 files_unavailable`.

## Refusals

| Name                    | Status | When                                                       |
| ----------------------- | ------ | ---------------------------------------------------------- |
| `files_unavailable`     | 503    | The server has no file storage                             |
| `file_too_large`        | 413    | The bytes pass `FILE_TAB_MAX_BYTES`                        |
| `key_invalid`           | 400    | The key is not 64 lower-case hex characters                |
| `key_mismatch`          | 422    | The bytes do not hash to the key                           |
| `usage_exceeded`        | 403    | The owner's allowance would be passed                      |
| `upload_not_found`      | 404    | A part or a complete for an upload that is gone            |
| `part_invalid`          | 400    | A part out of order, or not `FILE_PART_BYTES` but the last |
| `blob_not_held`         | 404    | The document does not hold that key                        |
| `range_not_satisfiable` | 416    | A range past the blob's end                                |

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
bytes=<n> ranged=<bool>`, `[blob-store] swept count=<n>`, `[blob-store] purged`, `[blob-store] unavailable`.

## Non-goals

- Signed addresses straight to object storage: they would cost every self-host a second credential.
- Holding bytes in the room's rows: a second store to keep true.
- Deduplicating across owners: one person's key must never tell another that a file exists.
