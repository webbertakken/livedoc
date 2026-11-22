# Document tools

**Status: specified.** Nothing is built.

Editing's tools that act on a [PDF document](pdf-document.md) as a whole rather than on one object: headers and
footers, page numbers, watermarks, backgrounds, bookmarks, embedded files, properties, flattening, reducing file size
and comparing. Each is an Editor's unless its role line says otherwise ([Editing modes](editing-modes.md)); each is
one undo step, live for everyone. [Building fields](building-fields.md) and
[Redaction and protection](redaction-and-protection.md) have specs of their own.

## Headers and footers

- **Insert > Header and footer** opens a dialog: six boxes (left, centre, right; header, footer), each taking text
  and tokens from a menu: page number, page count, date (in a format chosen), the document's name, the file's title.
- **Look**: font from the document fonts, size, colour, underline; margins from each edge; "Shrink the page to make
  room" scales the page content away from the header and footer.
- **Pages**: all, a range, odd or even only, "Not on the first page"; different text for odd and even pages.
- **A live preview** on the page in view; presets are named and kept with the account.
- **Page numbers** (Insert > Page numbers) is the same dialog opened on one box with the page number token: its
  style (1, i, a), "Start at", and a pattern ("Page 1 of 14").
- **Update** opens the dialog on what LiveDoc added before; **Remove** takes it out. Several sets may be added, one
  after another.
- A header or footer LiveDoc adds is page content marked as such in the file (as a pagination artifact), so it is
  found again here and by other software, and is not read aloud as body text. One another program added is found by
  the same marking and updated or removed the same way; text that only looks like a header is page text.

- Each of these tools acts on the PDF document that is open. Applying a header, a watermark or a background to
  several files at once, as Acrobat's dialogs offer, is left out: an agent does it, one changeset a document
  ([Agents](agents.md)) `(default)`.

## Watermarks

- **Insert > Watermark**: text (font, size, colour) or a picture or a PDF page; rotation (none, 45° either way,
  custom), opacity, scale relative to the page, position (centred, or offsets from an edge), **behind** or **in front
  of** the page content, the pages it goes on.
- "Show when printing" and "Show on screen" are separate ticks, as the format allows.
- **Update** and **Remove** as headers and footers; several watermarks may be added.
- A watermark is page content marked as a watermark artifact; one is told from a mark by that.

## Backgrounds

- **Insert > Background**: a colour from the one [colour picker](../004-interface-design/colour-picker.md) or a
  picture or a PDF page, with opacity, scale, position and the pages it goes on, drawn behind everything.
- **Update** and **Remove** as above; a file has one background LiveDoc manages at a time, and adding another
  replaces it, asked first.
- A background is not a person's Dark pages: it is in the file, for everyone.

## Bookmarks

A **bookmark** is an entry of the PDF's outline: a title and the place it opens. The Outline panel shows them in
every mode; Editing changes them.

- **Add** (Insert > Bookmark, ⌘⇧B `(default)`; Acrobat's ⌘B is bold in a text box here): a bookmark to the page and zoom in view, titled by the
  selected text or "Page 3", under the selected bookmark.
- **Rename** in place; **Set destination** to the view in front; **Delete**, with its children, asked first.
- **Nest and reorder** by dragging, or by ⌥ with the arrow keys; **Expand all**, **Collapse all**.
- **Look**: bold, italic and a colour, as the format allows.
- **Make bookmarks from headings**: in a tagged file, one a heading, nested by level; in an untagged file, from text
  whose size stands out, listed for the person to tick before any is made.
- A bookmark that runs an action other than going to a place is shown, kept untouched and never run
  ([Security](security.md#links-and-actions)).
- A bookmark whose page was deleted reads "Goes nowhere" until retargeted or deleted.
- Bookmarks are in the file's outline, written at a bake as a rewrite `(default)`.

## Embedded files

A file the PDF carries inside it. The Embedded files panel lists them in every mode
([Security](security.md#embedded-files)); Editing changes them.

- **Add** (Insert > Embedded file, or a drop on the panel): any file under the blob store's cap; shown with its name,
  size, type and an optional description.
- **Rename**, **edit the description**, **delete**; **Save** and, for a PDF, **Open** are everyone's who may read.
- A file pinned to a place on a page is a [Pinned file mark](marks.md#kinds), Reviewing's; the panel lists those
  too, with their page.
- An added file is a blob named in the change; the bake embeds it.
- A portfolio (a PDF that is a collection of files) shows its cover page and lists its files here, each saved or, if
  a PDF, opened as a new PDF document; its layout and navigator are not shown, and are kept untouched.

## Properties

File > Properties, a dialog with four tabs, readable by everyone who reads the document:

| Tab             | Shows                                                                                                                                                                                  | An Editor changes                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Description** | Title, author, subject, keywords; created and modified; the program that made it; PDF version; page size; pages; size; tagged or not; conformance claims; "Fast web view" (linearised) | Title, author, subject, keywords; custom properties (name and value), added and removed |
| **Security**    | Protection and what the permissions ask; signatures; what the file wanted to do and was not allowed; how many scripts it carries, none run                                             | [Protection](redaction-and-protection.md#protection)                                    |
| **Fonts**       | Every font: its name, type, whether embedded and subset, its encoding                                                                                                                  | Nothing                                                                                 |
| **Size**        | What takes the file's bytes: pictures, fonts, page content, marks, fields, embedded files, structure, and the rest                                                                     | [Reducing file size](#reducing-file-size)                                               |

- **Additional metadata** (under Description): the file's XMP metadata as a read-only tree, for whoever needs to see
  exactly what the file says. Importing and exporting XMP files is left out.
- **Initial view** (under Description, an Editor's): the page, zoom and page display a reader opens the file with,
  and whether its bookmarks panel shows; LiveDoc honours a file's initial page and zoom on first open and nothing
  more.
- The file's two metadata homes (its information dictionary and its XMP metadata) are kept in step: a changed value
  is written to both.
- The document's **name** in LiveDoc is the file's name, never its Title property; changing one does not change the
  other.

## Flattening

**Tools > Flatten** writes marks, fields or both into the page content, so they are no longer marks or fields:

- **Marks**: each mark's appearance becomes page content; its thread is kept in LiveDoc as "On flattened content",
  and leaves the file.
- **Fields**: each field's appearance, with its value, becomes page content; the fields are gone, so nothing is
  fillable after.
- A choice of pages, and "Only what prints". Asked first, since only undo and version history bring them back.
- **Download > PDF, flattened** flattens a copy and leaves the document as it is
  ([Files, print and sync](files-print-and-sync.md#downloading)).
- PDF layers are flattened only by that same download's "Merge layers as shown" tick; authoring layers is left out.

## Reducing file size

**Tools > Reduce file size** rewrites the file smaller. A dialog shows what takes the bytes (as Properties > Size)
and three presets, each saying what it does and what it will cost before it runs:

| Preset       | Does                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Light**    | Compresses uncompressed streams, packs objects, removes unused objects and duplicate fonts and pictures. Nothing a person can see changes             |
| **Balanced** | Light, and downsamples pictures above 150 dpi to 150, recompressing photographs as JPEG at high quality                                               |
| **Smallest** | Balanced at 96 dpi and medium quality, subsets fonts embedded whole, removes thumbnails, private data of other software and unused named destinations |

- **Advanced** opens each choice: picture resolution and quality by kind (colour, grey, black and white), which
  fonts to subset or unembed (only fonts every reader has), and what to discard (bookmarks, embedded files, form
  scripts, the structure tree, each named with what is lost).
- The result is shown before it is kept: "4.2 MB becomes 1.1 MB." with **Keep** and **Cancel**; a result that is not
  smaller is said and not kept.
- Removing the structure tree or anything else accessibility needs is never part of a preset, and warns in Advanced.
- It is a rewrite, breaks certificate signatures, and is asked first on a signed file
  ([Signing](signing.md#changes-after-a-signature)).

## Comparing

**Tools > Compare** shows what differs between two PDFs, changing neither; it is everyone's who may read both.

- **What**: this PDF document now and one of its versions; two versions; a signed version and now
  ([Signing](signing.md#the-signatures-panel)); or this and another PDF document.
- **The view**: the two side by side, pages matched, scrolling together, with differences tinted: text inserted,
  deleted and replaced (by word), pictures changed, marks added and removed, pages added, removed and moved.
- **A summary** at the top counts each kind; a list at the side goes to each difference; Next and Previous step
  through them.
- **Options**: compare text only (for scans, their recognised text); ignore marks; ignore headers and footers.
- Pages are matched by their text, so an inserted page shifts the match and is not reported as every later page
  changed.
- **Download a report** writes the summary and the tinted pages as a new PDF.

## Limits

| Constant                    | Value  | Why                                                                               |
| --------------------------- | ------ | --------------------------------------------------------------------------------- |
| `PDF_HEADER_MAX_CHARS`      | 500    | `(default)` One header or footer box                                              |
| `PDF_MAX_BOOKMARKS`         | 20,000 | `(default)` Bookmarks shown and written; a file arriving with more keeps them all |
| `PDF_BOOKMARK_MAX_DEPTH`    | 32     | `(default)` Nesting made here; deeper ones a file brings are shown                |
| `PDF_EMBEDDED_FILES_MAX`    | 500    | `(default)` Embedded files listed and added here; a file with more keeps them all |
| `PDF_CUSTOM_PROPERTIES_MAX` | 100    | `(default)` Custom properties                                                     |
| `PDF_COMPARE_MAX_PAGES`     | 2,000  | `(default)` Pages a side in one compare; more asks for a page range               |

## Share roles

| Role            | Document tools                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Editor**      | Everything here                                                                                   |
| **Participant** | Reads bookmarks, embedded files and Properties; saves an embedded file; compares; changes nothing |
| **Viewer**      | The same as a Participant, with saving following the download setting                             |

## Keyboard and accessibility

- Every dialog is the shell's: labelled fields, a preview with a text equal ("Footer, centre: Page 1 of 14"), focus
  trapped while open.
- The Outline and Embedded files panels are trees and lists with full keyboard reach
  ([Keyboard shortcuts](keyboard-shortcuts.md#panels)).
- Compare's differences are a list as well as tints; each is named ("Page 4: 'thirty days' replaced by 'sixty
  days'") and no difference is shown by colour alone: insertions are underlined, deletions struck through.

## Telemetry and observability

- `Pdf · Added · <HeaderFooter|PageNumbers|Watermark|Background|Bookmark|EmbeddedFile>`, `Pdf · Removed · <the
same>`, `Pdf · Changed · <Properties|InitialView|BookmarksFromHeadings>`, `Pdf · Changed · Flattened.<Marks|
Fields|Both>`, `Pdf · Changed · Reduced.<Light|Balanced|Smallest|Advanced>`, `Pdf · Opened · Compare.<Version|
Signed|Document>`. Never a title, a keyword, a bookmark's words or a file's name.
- Fingerprints: `[pdf] reduce before=<n> after=<n> preset=<name> ms=<n>`, `[pdf] flatten marks=<n> fields=<n>`,
  `[pdf] compare pages=<n> differences=<n> ms=<n>`, `[pdf] artifacts-found headers=<n> watermarks=<n>`.

## Errors

| When                                   | A person sees                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Reduce file size makes nothing smaller | "This PDF is already as small as this setting makes it."                     |
| A watermark's picture cannot be read   | "That picture couldn't be read."                                             |
| An embedded file is too large          | The blob store's own refusal                                                 |
| Two PDFs are too different to match    | "These PDFs share too little to compare page by page." **Compare text only** |
| A tool would break signatures          | The warning of [Signing](signing.md#changes-after-a-signature), first        |
