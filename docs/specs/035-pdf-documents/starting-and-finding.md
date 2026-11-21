# Starting and finding

**Status: specified.** Nothing is built.

How a [PDF document](pdf-document.md) comes to be in the Explorer and is found again.

## Starting one

Fork F12 `(default)`: **a PDF document is never started from nothing.** A PDF arrives, or is made from another
document:

- **A PDF arrives** by a drop, a paste, an import, a sync, the Drive mirror or an agent
  ([Files, print and sync](files-print-and-sync.md#opening)).
- **The Explorer's New** lists **PDF document**, with its glyph and the line "Upload a PDF"; it opens the file
  chooser, and the chosen PDF becomes a document in the current folder, opened at once.
- **`/new?kind=pdf`** opens the same chooser on the Explorer; there is no blank PDF to land on.
- **Another document kept as a PDF**: a text document's, a spreadsheet's or a canvas tab's Download as PDF offers
  "Keep in LiveDoc as a PDF document", which stores the written PDF beside its source
  ([Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf)).
- **Adding a tab** to a document offers **PDF from a file**.
- There is no template gallery for PDF documents.

## Finding it

- **Kind**: the Explorer's **Kind** chip has **PDF document** (`kind:pdf`), as the first tab's kind
  ([Explorer filters](../013-workspace/explorer-filters.md)).
- **Default folder**: the key `kind:pdf`, named **PDFs**, offered as every kind's default folder is
  ([Default folders](../013-workspace/default-folders.md)).
- **Glyph**: a page with a folded corner and the letters PDF, in the Explorer's glyph style; never another
  company's PDF mark.
- **Thumbnail**: the first PDF page, light paper always, marks included
  ([Live editing and storage](live-editing-and-storage.md#what-the-servers-make)); a protected PDF shows the glyph with
  a lock; a PDF LiveDoc cannot read shows the glyph with a warning mark.
- **Content search** finds text in its pages, recognised text, Text marks and comments, and names the page a match is
  on; a protected PDF is found by its name only `(default)`.
- **The Details view** shows pages, size, and "Signed" or "Protected" where they apply.
- **The row's menu** adds **Download** (the PDF) beside every document's own items.

## Share roles

Starting one in a folder asks what making any document there asks. Finding follows the Explorer's own rules: a
document a person may not read is not listed.

## Telemetry

`Pdf · Imported · <Way>` ([PDF document](pdf-document.md#telemetry-and-observability)) for each start;
`Explorer · Selected · Kind` when the Kind chip gains a value, as for every kind. Never a name.
