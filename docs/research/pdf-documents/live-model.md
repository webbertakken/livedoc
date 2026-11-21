# The live model

How a PDF is worked on by several people and agents at once (ruling C1: "edited together live"), when the thing they
share is a file of bytes that only an engine can read. Researched November 2026.

## The designs

**A. The arriving bytes are an immutable base; changes live in the room as a layer; a file is baked when asked.**

- The **base** is the file as it arrived, stored once by its SHA-256 and never altered.
- The **layer** is the set of changes people have made since: marks, field values, comments, page operations, edits
  to a page's own objects. It is live state in the document's room, as a text document's is
  ([Live editing and storage](../../specs/034-text-documents/live-editing-and-storage.md)).
- Each person's engine holds the base and applies the layer to show the pages; a **bake** applies the layer to the
  base and writes a PDF, for Download, sync, the Drive mirror, email and agents ([Saving](saving.md)).

**B. Every change rewrites the bytes; the later write wins.** The file tab's rule
([File tab](../../specs/006-document/file-tab.md#changing-it)), applied to each mark.

**C. A converted model.** The PDF is read into a model of LiveDoc's own (text, pictures, paths), edited there as a
text document is, and written out as a new PDF.

| Judged on                   | A. Base and layer                                           | B. Rewrite the bytes                             | C. Converted model                             |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| Two people marking at once  | Both marks kept: two entries in the layer                   | One upload wins; the other person's mark is lost | Both kept                                      |
| What travels per change     | A few hundred bytes                                         | The whole file (megabytes) per highlight         | A few hundred bytes                            |
| Offline, and back           | The layer merges on return, as a text document's does       | A conflict between two whole files               | Merges                                         |
| Undo per person             | The layer's own, per person                                 | None beyond restoring a previous file            | Per person                                     |
| Agents                      | A changeset is one transaction on the layer, revertable     | A whole-file replace, strict on its base         | A changeset                                    |
| Branches                    | A branch is the base's key and its own layer                | A branch holds its own bytes; merge takes a side | A branch of the model                          |
| Fidelity to the author      | The base is never touched; what no engine understands stays | As good as each rewrite                          | Lost: whatever the model does not hold is gone |
| Signatures a file came with | Valid while the layer holds only what Reviewing adds        | Valid only if each rewrite is incremental        | Always broken                                  |
| An unchanged file           | The stored bytes, by construction                           | The stored bytes                                 | Never the same bytes                           |
| Size in the room            | The layer only; the bytes live in the blob store            | Nothing in the room                              | The whole document, as rows                    |

- B is what the file tab does, and it is right for a file nobody edits inside LiveDoc. For C1 it fails on its first
  row (inferred: the file tab's own rule, "its bytes are never merged").
- C is plan 0019's import of a PDF as a text document: a copy, by design. As the PDF kind's model it fails "the file
  is the author's" (verified: a rewrite by either engine breaks a signature; the round-trip spike shows even
  regenerating one page's content differs on 1 page in 88).

**Recommendation: A.**

## What the layer is

Two shapes were compared for the layer's state:

- **A sequence CRDT (Yjs), as the text document has.** Maps by id for marks, field values and page operations, an
  array for the page order, text types for the words inside a free-text mark or a comment. The room already stores,
  chunks, compacts, catches up and digests such a state for text documents, keeps a local copy of unconfirmed edits,
  and gives each person their own undo (verified: `apps/api/src/text-documents/`, `apps/live/lib/text-document/`).
- **Element operations, as the canvas has.** One operation per changed thing, the later write winning per element.
  It has no offline merge of its own and no per-person undo beyond the canvas's history.

Recommended: the sequence CRDT, in the text document's storage generalised to hold another kind's state, so nothing
is forked. That generalisation is a change to a shared piece and goes through the docs lane (inferred: the tables and
the class are named for text documents).

## What makes a PDF different from a text document

- **Identity is the engine's.** A mark or an edit must name a page and a place in it. Page numbers move when pages
  are reordered, so a page is named by its **object number in the base** (verified: the engine build exposes
  `EPDFDoc_GetPageObjectNumberByIndex` and its inverse), and an object on a page by its index in the base's page.
- **Indexes are only true for one base.** So the base and the layer are a pair: the layer names the base it is on
  (its SHA-256), and a client never applies a layer to another base.
- **A new base is an event for everyone** (a re-bake, [Saving](saving.md)): the room swaps the base's key and the
  layer in one step, and every client reloads the pages it shows.
- **A certificate signature cannot live in the layer.** It signs bytes. Signing bakes the file, signs it, and the
  signed file becomes the new base; marks made afterwards sit on top of it and bake as incremental updates, which
  keep the signature valid (verified: the signed-chain spike).
- **Showing a change before it is baked.** A mark is drawn by LiveDoc over the page from its own geometry, so it
  appears for everyone at once; an edit to a page's own text is applied to that person's engine copy of the page
  and the page redrawn (inferred from the spikes: PDFium regenerates and redraws a page in tens of milliseconds).

## Open, for the blueprint

- Whether two people may edit the **same page's objects** at once, or a page is edited by one person at a time with
  the others seeing it live. Object edits are positional, and two inserts on one page do not commute cleanly.
  Proposed: per object, the later write wins; inserts are appended; a page's edits replay in the room's order.
- How many changes a layer holds before a re-bake is offered (a budget Phase 4 measures).
