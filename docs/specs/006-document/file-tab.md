# File tab

**Status: specified.** Nothing is built.

A **file tab** is a tab of the `file` [tab kind](document.md#domain-language): it holds one file's bytes, exactly, so
**any file can live in LiveDoc** ([Purpose](../001-project-vision/purpose.md#what-it-is)). An image, a shell script, a
JSON file: each is a document with a single file tab. A PDF is the one file that is more: it becomes a
[PDF document](../035-pdf-documents/pdf-document.md), a kind of its own, read, reviewed and edited together. LiveDoc shows what it can of it and keeps the rest
intact, so it syncs back out byte for byte ([Native files](../027-repositories/native-files.md)).

## Domain language

| Term              | Means                                                                            | Never called            |
| ----------------- | -------------------------------------------------------------------------------- | ----------------------- |
| **file tab**      | A tab of kind `file`: one file's bytes, its media type and its mode              | attachment, asset, blob |
| **file document** | A document whose single tab is a file tab                                        | upload, binary          |
| **media type**    | What the bytes are (`image/png`, `application/pdf`), from the name and the bytes | MIME (in copy), format  |

An image placed on a canvas stays an [image element](../009-elements/images.md) in the owner's gallery: it is
re-encoded for the canvas and belongs to the tab it is on. A file tab is a file in its own right, kept as it came.

## What it holds

| Field        | Holds                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `'file'`                                                                                                                                            |
| `blob`       | The key of the bytes in the [blob store](blob-store.md): their SHA-256, so equal files are stored once                                              |
| `size`       | The byte count                                                                                                                                      |
| `mediaType`  | Sniffed from the bytes, falling back to the name's extension, then `application/octet-stream`                                                       |
| `executable` | `true` when the file carried the executable bit, so a script synced out runs as it did                                                              |
| `marks`      | Why a text file is held as a file: **Not UTF-8** or **Too large to edit together** ([Markdown tab](../031-markdown/markdown-tab.md#reading-a-file)) |

The document's name is the file's name without its extension; the extension is kept with the tab
([Native files](../027-repositories/native-files.md#names-and-paths)).

## Showing it

| Media type                           | Shown as                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| PNG, JPEG, GIF, WebP, AVIF, SVG      | The image, fitted; SVG drawn as an image, never inlined, so its scripts never run |
| PDF                                  | Never a file tab: a PDF is a [PDF document](../035-pdf-documents/pdf-document.md) |
| Text under `MARKDOWN_TEXT_MAX_BYTES` | Read-only, monospaced, highlighted by extension                                   |
| Anything else                        | Its name, size and type, with **Download**                                        |

Every file tab offers **Download** and **Replace**. Replace swaps the bytes for another file's, as one edit.

## Changing it

A file tab is **changed whole**: a replace, a sync, or an agent's `replace` changeset with the new bytes. Its bytes
are never merged.

- Two replaces racing each other: the later one wins. The bytes a replace took out stay restorable for 30 days, as
  long as the [Trash](../013-workspace/trash.md) keeps a deleted document: **Previous versions** on the tab lists
  them, with who replaced them and when, and restores one as a new replace.
- A replace from a file whose recorded base is no longer the tab's revision is a conflict, handled by the sync
  ([Native files](../027-repositories/native-files.md#a-file-document)).
- **On a [branch](document-branches.md)** a file tab holds the branch's bytes. A merge takes the side that replaced
  them; when both did, main's stand and the branch's become a previous version, with a note on the tab
  ([Merging](document-branches.md#merging)).

## Limits

| Constant             | Value               | Why                                                                                                  |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `FILE_TAB_MAX_BYTES` | 26,214,400 (25 MiB) | Inside a Worker's request body limit with headroom; GitHub warns at 50 MB, so a wiki stays cloneable |

A larger file is refused with "This file is larger than 25 MB, the most LiveDoc holds for one file." A sync leaves
it in the repository, untouched, and reports it. The cap, uploads, range reads and retention are the
[blob store](blob-store.md)'s. Usage counts every distinct blob once per owner
([Open source + distribution](../002-project-scope/open-source-and-business-model.md)).

## Share roles

| Role            | May                                        |
| --------------- | ------------------------------------------ |
| **Editor**      | Replace, rename, download                  |
| **Participant** | Read and download; comment on the document |
| **Viewer**      | Read and download                          |

## Observability and telemetry

- Fingerprints, with the document and tab ids and never content or names: `[file-tab] stored`, `[file-tab] replaced`,
  `[file-tab] refused-size`, `[file-tab] blob-missing`.
- Telemetry: `Document · Imported · File`, with the type the media type's family (`Image`, `Pdf`, `Text`, `Other`).

## Non-goals

- Editing a file's contents in LiveDoc, other than a markdown file's ([Markdown tab](../031-markdown/markdown-tab.md))
  and a PDF's ([PDF document](../035-pdf-documents/pdf-document.md)), each a kind of its own.
- Previews of office formats, archives or video.
