# Starting and finding

**Status: specified; a first slice is built.** Built: adding a tab's PDF from a file, and a PDF arriving by a drop on
the Explorer. Everything else here is specified, not built.

How a [PDF document](pdf-document.md) comes to be in the Explorer and is found again.

## Starting one

Fork F12, ruled (Webber, 2026-11-26): **a PDF document is offered in the New Document flow**, blank or from a file.
A PDF also arrives, or is made from another document:

- **A PDF arrives** by a drop, a paste, an import, a sync, the Drive mirror or an agent
  ([Files, print and sync](files-print-and-sync.md#opening)).
- **New Document** (the Explorer's menu and the `/new` wizard) offers **PDF document**: it makes a **Blank PDF**, one
  empty A4 page (default), and offers **Open a PDF file**, whose chosen PDF becomes a document in the current folder,
  opened once stored ([New Document menu](../013-workspace/new-document-menu.md#the-blanks),
  [New document route](../007-editor/new-document-route.md#choosing-a-mode)). `/new?kind=pdf-document` makes a Blank
  PDF.
- **A Blank PDF** is a real PDF file (PDF 1.7, one page, no content), written in the browser and stored as any PDF
  is; everything a PDF document does, it does from there (adding text, pages, fields).
- **Another document kept as a PDF**: a text document's, a spreadsheet's or a canvas tab's Download as PDF offers
  "Keep in LiveDoc as a PDF document", which stores the written PDF beside its source
  ([Files, print and sync](files-print-and-sync.md#other-kinds-meeting-a-pdf)).
- **Adding a tab** to a document offers **PDF from a file** ([PDF document](pdf-document.md#a-pdf-tab-from-a-file)).
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
