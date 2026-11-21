# What the servers need

A PDF's first page as a thumbnail, its text for content search, previews for agents, and a baked file for a sync:
each needs the engine somewhere other than the reader's browser. Researched November 2026.

## What is needed, and by whom

| Need                              | Asked by                                                                                               | Today, for a text document                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| The first page as a picture       | The Explorer's thumbnail, the share card ([Snapshots](../../specs/006-document/document-snapshots.md)) | Drawn in the api Worker from the live state, cached in R2 (verified: `apps/api/src/thumbnail.ts`) |
| The text                          | Content search, through the room's outbox                                                              | The room's digest: plain text, pushed to D1                                                       |
| A page as a picture, text by page | Agents (MCP tools, the CLI)                                                                            | `render-png` in the mcp Worker                                                                    |
| A baked file                      | Repository sync, the Drive mirror, email, an agent's download                                          | The api writes the file from the live state                                                       |

## Where the engine can run

| Place                           | Verified                                                                                                                                           | Bound                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **The api Worker**              | PDFium opens a file, draws a page and reads its text in local workerd, started from the imported compiled module; LibPDF appends a highlight there | 128 MB of memory for the file, the engine and its work; no synchronous range reads, so the file is held whole; 10 ms of CPU on Workers Free |
| **The reader's browser**        | Everything (the engine's home)                                                                                                                     | Only when someone is there                                                                                                                  |
| **The CLI** (Node)              | Every spike ran in Node                                                                                                                            | The person's machine                                                                                                                        |
| **The room** (a Durable Object) | Not tried: the room is the document's one writer and must stay responsive                                                                          | Engine work would block the room's queue                                                                                                    |

## The designs

**A. The api Worker does it all.** On demand, cached: the Worker fetches the base from R2, applies the layer, and
draws, reads or bakes.

**B. The browser does it and uploads the results.** Whoever opens or changes the PDF sends the thumbnail, the text
and (when asked) a baked file.

**C. The Worker where the file fits; the browser otherwise.**

| Judged on                                       | A. Worker                                                                                                                                       | B. Browser                                             | C. Both                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| A file past about 32 MiB                        | Cannot hold it                                                                                                                                  | Works                                                  | Works                                                       |
| A PDF nobody opened (a sync, an agent's upload) | Works                                                                                                                                           | Nothing is made until a person opens it                | Works where it fits                                         |
| Trust                                           | The server's own rendering                                                                                                                      | A browser can upload any picture or text as the file's | The server's where it fits; marked as a browser's otherwise |
| Self-hosting on Workers Free                    | 10 ms of CPU does not draw a page                                                                                                               | Works                                                  | Falls to the browser, said in the self-hosting notes        |
| Start-up of the api Worker                      | The engine is a module of its own, loaded on first use, as the PNG renderer is ([Web performance](../../specs/016-platform/web-performance.md)) | Unchanged                                              | As A                                                        |

**Recommended: C**, with one rule for trust: what a browser uploads is used for **display** (a thumbnail, a preview)
and never as the file. A baked file for a sync is always made by code LiveDoc runs (the Worker, or the CLI on the
person's own machine for a local copy); a file too large for the Worker is synced as its base with its layer beside
it (the file document's own bytes are still exact), and says so.

- **Search text** is extracted once per base, by page, and again only for pages the layer changed; a scan has none
  until it is recognised ([Text recognition](text-recognition.md)).
- **Thumbnails** follow the snapshot rules that exist: render on read, cached, always light paper.
- **Agents** read text by page and the outline from the same extraction; a page preview is the engine's own drawing,
  encoded as PNG (the engine's build has `EPDF_PNG_EncodeRGBA`: verified in its exports, not yet run).

## Numbers still owed

Measured on the tracer bullet in Phase 4, on a deployed Worker, since local workerd's clock and CPU are not the
platform's: the engine's start-up there, the CPU time for a thumbnail and for text extraction, and the largest file
that fits.
