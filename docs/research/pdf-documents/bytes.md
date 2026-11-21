# Bytes

Where a PDF's bytes live, how they get there and back, and how large one file may be (fork F6). Researched November 2026. The blob store is the file tab's ([File tab](../../specs/006-document/file-tab.md)): this plan builds it, and
the file tab and local copies consume it.

## What exists

- The api holds bytes in two R2 buckets, `IMAGES` and `BUG_SCREENSHOTS`; a file's bytes have no store (verified:
  `apps/api/wrangler.toml`).
- An image is uploaded in one request through the Worker, capped at 10 MB, stored under its SHA-256, read back
  through the Worker with the owner's or the share code's gate; without the bucket the api answers
  `503 images_unavailable` (verified: `apps/api/src/routes/images.ts`).
- A text document's file rides the create as base64, under the api's 8 MB body cap, "so a file past about 6 MB waits
  for a direct upload" (verified:
  [Files and print](../../specs/034-text-documents/files-and-print.md#opening)).

## The platform's limits

Verified on Cloudflare's own pages, 2026-11-21 (developers.cloudflare.com: Workers limits, R2 limits, R2 uploads):

| Limit                        | Value                                                            |
| ---------------------------- | ---------------------------------------------------------------- |
| A request body into a Worker | 100 MB on the Free and Pro plans, 200 MB on Business             |
| A Worker's memory            | 128 MB an isolate, WebAssembly included                          |
| A Worker's CPU time          | 10 ms a request on Workers Free; up to 5 minutes on Workers Paid |
| A Worker's size              | 64 MiB uncompressed                                              |
| An R2 object                 | 5 TiB; 5 GiB in one upload                                       |
| An R2 multipart upload       | Parts of 5 MiB to 5 GiB, at most 10,000, each part retried alone |

Elsewhere: GitHub warns at 50 MB a file (verified: the file tab's spec cites it) and refuses a file past 100 MB
(assumed: GitHub's documented limit, not re-read).

## Getting the bytes in

| Design                                    | How                                                                                         | Limit                  | Resumes      | Self-hosting                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- | ------------ | ------------------------------------------------------------ |
| **1. One streamed request**               | The browser sends the file; the Worker streams the body into `put`, never holding it        | The plan's 100 MB body | No           | Needs only the bucket binding                                |
| **2. Parts through the Worker**           | The browser sends parts of 8 MiB; the Worker streams each into `uploadPart`, then completes | 10,000 parts           | Yes, by part | Needs only the bucket binding                                |
| **3. Signed addresses straight to R2**    | The Worker signs an address; the browser uploads to R2 itself                               | 5 GiB in one request   | With parts   | Needs R2's S3 keys as a secret and a CORS rule on the bucket |
| Base64 in the create (as a text document) | The file inside the JSON body                                                               | About 6 MB             | No           | Nothing                                                      |

- Design 3 moves the largest files with the least Worker time, and costs every self-hoster a second credential and a
  bucket rule. Designs 1 and 2 use the binding the api already has.
- **The key is the content's SHA-256**, computed in the browser before the upload starts, so a file LiveDoc already
  holds is never sent again. R2 checks a single upload against a SHA-256 it is given (assumed: `put`'s `sha256`
  option, not yet run); for parts, the Worker hashes what passes through it (assumed: `crypto.DigestStream`).
  Hashing costs CPU the Workers Free plan does not have (10 ms), which the self-hosting notes must say.

**Recommended**: 1 for a file up to `FILE_SINGLE_UPLOAD_MAX_BYTES` (a default of 32 MiB), 2 above it, so a dropped
connection never costs more than one part. 3 is not built.

## Getting the bytes out

- **Whole**: the Worker streams the object, gated as an image read is.
- **By range**: R2 reads a byte range, and the Worker passes a `Range` request through. PDFium opens a file through
  a block reader (`FPDF_LoadCustomDocument`), so it can be fed ranges as it asks for them (verified in a spike: the
  callback works in the WebAssembly build). What it asks for, in 64 KiB blocks:

| File                     | Size   | Pages | Blocks to open | Blocks to draw page one | Share of the file |
| ------------------------ | ------ | ----- | -------------- | ----------------------- | ----------------- |
| A paper                  | 1.0 MB | 14    | 2              | 4 of 16                 | 25%               |
| The same, linearised     | 1.0 MB | 14    | 3              | 3 of 16                 | 19%               |
| A book                   | 2.6 MB | 352   | 3              | 6 of 40                 | 15%               |
| 1,008 pages              | 1.1 MB | 1,008 | 3              | 10 of 18                | 56%               |
| One page of vector plans | 6.3 MB | 1     | 2              | 96 of 96                | 100%              |

- Loading a file whole instead costs its size in the engine's memory and the wait for all of it: a 93 MB file showed
  page one at 1.8 s over loopback with 109 MB of engine memory, a 224 MB one at 3.6 s with 259 MB; PDF.js, reading
  by range, showed them at 0.6 s and 1.0 s (verified: headless Chromium; over a real network the whole-file wait is
  the download).
- So: **a file under `FILE_WHOLE_READ_MAX_BYTES` (a default of 8 MiB) is fetched whole**, which is one request and
  the simplest path; a larger one is read by range, page one first.

## This Browser

| Design                             | For                                                                                                                                                  | Against                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The origin private file system** | A file by its SHA-256; a worker reads any range of it synchronously, which is what the engine's block reader wants; no copy through structured clone | A second local store beside IndexedDB                                                                                                                                                                                 |
| **IndexedDB, as a Blob**           | The store offline documents already use                                                                                                              | A Blob is read asynchronously; the engine's reader is synchronous, so the whole file is loaded into memory first                                                                                                      |
| **Inside the offline record**      | Nothing new                                                                                                                                          | Every offline record is read whole by the Explorer's lists (verified: [Live editing and storage](../../specs/034-text-documents/live-editing-and-storage.md#this-browser)), so each list would read every PDF's bytes |

**Recommended**: the origin private file system, keyed by SHA-256, with the offline record holding only the key and
the size; IndexedDB Blobs where it is missing (assumed: support in current Chromium, Firefox and Safari, to be proven
in Phase 6's tests on all three).

## Self-hosting without object storage

- As images do: without the bucket the kind is unavailable, with a named failure (`503 files_unavailable`, copy
  "This server has no file storage."), and everything else works. The file tab's spec already names "no file storage".
- Passed over: holding the bytes in the room's own rows in 1.9 MB chunks, as a text document's state is. It would
  work up to tens of megabytes and makes a second blob store to keep true.

## Usage

- Each distinct blob counts once per owner, as the file tab says; a previous base counts while it is kept.
- A baked copy is never stored for its own sake: it is made when asked.

## The numbers for F6

| Cap                | What decides it                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25 MiB (today's)   | Fits one request with headroom; half of GitHub's warning                                                                                            |
| **100 MB**         | The largest body a Worker takes on Cloudflare's Free and Pro plans; GitHub's limit for one file; a phone holds it by range without loading it whole |
| 1 GB               | Reachable only by parts; the engine reads it by range; a repository cannot hold it; an agent or the api Worker (128 MB) cannot open it at all       |
| No cap, usage only | The platform's 5 TiB; every limit above still bites, with nothing saying so                                                                         |

- Whatever the cap, **work the servers do with the engine** (a thumbnail, search text, a bake for a sync) fits only
  a file the Worker's 128 MB can hold whole, since a Worker cannot read ranges synchronously: about 32 MiB with the
  engine's own memory beside it (inferred: 128 MB less the 4.6 MB binary, its 16 MB starting memory and working
  room). Above that the browser makes them ([What the servers need](servers.md)).
- **Recommended for F6: 100 MB** (`FILE_MAX_BYTES` 100,000,000), for every file tab, with the refusal copy "This file
  is larger than 100 MB, the most LiveDoc holds for one file."
