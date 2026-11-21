# Organising pages

**Status: specified.** Nothing is built.

Changing which PDF pages a [PDF document](pdf-document.md) has and how they lie: inserting, deleting, moving,
duplicating, rotating, cropping, resizing, replacing, splitting, extracting, merging and labelling. It is Editing's
([Editing modes](editing-modes.md)), an Editor's. Every page operation is one undo step, live for everyone, and safe
beside someone marking a page that moves. The research is
[The live model](../../research/pdf-documents/live-model.md).

## The organise view

Pages > Organise pages (or the Thumbnails panel widened) fills the pages' place with a grid of thumbnails:

- Each thumbnail shows its page number and label, its size where sizes differ, and the colours of people on it.
- **Select** by a press; ⇧ a range, ⌘ another; a drag from empty space a box; ⌘A all. A field takes a range typed
  ("1-3, 8, odd, even, landscape").
- **A toolbar for the selection**: Insert, Delete, Extract, Replace, Duplicate, Rotate left, Rotate right, Crop,
  Resize, More (Split, Page labels, Reverse order).
- **Zoom** of the grid by its own slider; a double press opens the page in the reading view; Escape or **Done**
  leaves the organise view.
- The Thumbnails panel does the same on a narrow column: drag to reorder, the page menu for the rest.

## Moving and duplicating

- **Drag** selected pages to a gap, shown by a line; ⌥ while dropping duplicates instead; ⌘X and ⌘V move, ⌘C and ⌘V
  copy, within a PDF document and between two open in LiveDoc.
- **Reverse order** reverses the selection, or all pages.
- A page moved keeps everything on it: its marks, threads, fields, links and the bookmarks that point at it.
- A page duplicated copies its content and marks; its field copies take new names ("name#2"), since two fields of one
  name would be one field; its threads are not copied.

## Inserting

| Insert                      | Does                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blank page**              | A page of the size of the one before it (or A4 or Letter by the person's locale in an empty selection), where chosen: before, after, at the start, at the end |
| **From a PDF**              | A file chosen or dropped: all its pages or a range, where chosen                                                                                              |
| **From a LiveDoc document** | Another PDF document's pages; or a text document, a spreadsheet or a canvas tab, written as PDF first                                                         |
| **From the clipboard**      | A copied picture becomes a page fitted to it                                                                                                                  |

- Inserted pages bring their own marks, fields (renamed where a name clashes), links, and their bookmarks as a branch
  under a bookmark named for the file, where **Include bookmarks** is ticked.
- The pages inserted from another file are a blob named in the change: the other file's bytes are held, and the
  bake copies its pages across ([Live editing and storage](live-editing-and-storage.md#storage)).
- **Combine files** (Pages > Combine files) takes several PDFs and LiveDoc documents, lets their order and page
  ranges be set in a list, and makes **a new PDF document** of them all, bookmarked by file; the sources are
  unchanged.
- Inserting a web page by its address is left out ([Parity matrix](parity-matrix.md#left-out)).

## Deleting, extracting and replacing

- **Delete** removes the selected pages, asked first when more than `PDF_DELETE_CONFIRM_PAGES`; a PDF keeps at least
  one page, so deleting all is refused: "A PDF needs at least one page."
- A deleted page's marks and threads are kept with it and return if the delete is undone; their threads read "On a
  deleted page" meanwhile ([Comments](comments.md#when-the-mark-goes)). Bookmarks and links that pointed at it are
  listed before the delete ("3 bookmarks and 2 links point to these pages") and afterwards go nowhere, marked so.
- **Extract** makes a new PDF document from the selected pages, as one file or one a page; **Delete pages after
  extracting** removes them here.
- **Replace** swaps the selected pages for pages of another PDF, one for one from a page chosen: the page content
  changes, and the marks, fields and links on top stay where they were.

## Rotating, cropping and resizing

- **Rotate** turns the selected pages a quarter left or right, or a half, **in the file**: for everyone, in every
  reader. (View > Rotate view turns one person's view only.) Marks turn with their page.
- **Crop** (C): drag a box on a page, or type margins from each edge; apply to this page, the selection, all, odd or
  even pages. It sets the page's crop box: **what is cropped off is hidden, not removed**, and the dialog says so,
  with **Remove hidden information** for removing it
  ([Redaction and protection](redaction-and-protection.md#removing-hidden-information)). **Remove white margins**
  finds each page's content bounds. **Reset** restores the page's own boxes.
- **Resize** sets the page size (a standard size or a custom one, 3 to `PDF_PAGE_MAX_POINTS` points a side): the
  content is scaled to fit or kept at its size and centred, as chosen.
- The trim, bleed and art boxes are kept as the file has them and set only under **Advanced** in the Crop dialog.

## Splitting

Pages > Split makes several new PDF documents from this one, which is unchanged:

- by **number of pages** (every n pages), by **top-level bookmarks** (one file a bookmark, named for it), by
  **file size** (each under n MB), or at **pages chosen** in the grid by split lines;
- each named "<name> part 1" (or its bookmark's title), in the folder of the source;
- marks, fields and links travel with their pages.

## Page labels

- A page's **label** is what the file says the page is called ("iv", "12", "A-3"), apart from its place in the file.
- Pages > Page labels: for a range, a style (1, 2, 3; i, ii, iii; I, II, III; a, b, c; A, B, C; none), a prefix, and
  the number to start from.
- Labels show in the thumbnails, the page field and print ranges; where a file has none, the label is the page's
  number.
- Numbers printed on the pages themselves are [headers and footers](document-tools.md#headers-and-footers); Bates
  numbering is left out ([Parity matrix](parity-matrix.md#left-out)).

## Together

- A page operation is one live change: the page order is a shared array of **page names**, which never change when
  a page moves ([Live editing and storage](live-editing-and-storage.md#the-layout)). So a highlight being drawn on
  page 7 stays on its page when someone moves that page to the front.
- Two people moving different pages both land; two moving one page, the later wins; a page deleted while someone is
  on it shows them "Ada deleted this page." and moves their view to the next.
- Everyone's page field and thumbnails follow at once; each person's reading position stays on the page they were
  reading, wherever it went.
- Each operation is attributed in version history ("Ada moved 3 pages").

## In the file

- Any page operation makes the bake a **rewrite**: the page tree changes ([Saving](saving.md#addition-or-rewrite)).
  Pages untouched keep their content streams byte for byte within the rewritten file.
- A deleted page's content leaves the baked file; it stays in the stored file and previous versions until those go
  ([Saving](saving.md#previous-versions-and-version-history)).
- Pages copied in from another file bring their fonts and pictures, shared where two pages use the same ones.
- A tagged file keeps each page's structure with the page; a deleted page takes its own with it
  ([Accessibility](accessibility.md#what-a-written-file-keeps)).
- A file with certificate signatures is changed only after the warning of
  [Signing](signing.md#changes-after-a-signature).

## Limits

| Constant                   | Value   | Why                                                                        |
| -------------------------- | ------- | -------------------------------------------------------------------------- |
| `PDF_MAX_PAGES`            | 100,000 | `(default)` Pages after an insert ([PDF document](pdf-document.md#limits)) |
| `PDF_PAGE_MAX_POINTS`      | 14,400  | The format's own largest page side without a unit scale: 200 inches        |
| `PDF_DELETE_CONFIRM_PAGES` | 10      | `(default)` Deleting more asks first                                       |
| `PDF_COMBINE_MAX_FILES`    | 100     | `(default)` Files in one Combine                                           |
| `PDF_SPLIT_MAX_PARTS`      | 500     | `(default)` Documents one Split makes; more asks to split coarser          |

The stored file a combine or an insert would make must fit `FILE_TAB_MAX_BYTES`; one that would not is refused before
any byte is written, with the size it would have.

## Share roles

| Role            | Pages                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Everything here                                                                                                         |
| **Participant** | Nothing; Extract and Split, which make new documents and change nothing here, where they may make documents `(default)` |
| **Viewer**      | Nothing                                                                                                                 |

## Keyboard and accessibility

- The grid is a grid to assistive technology: arrow keys move, Space selects, ⇧ extends; each cell is named "Page 3,
  label iv, selected".
- A move has a keyboard equal: ⌘X and ⌘V, or **Move to…** with a page number; nothing is drag-only.
- An operation's result is announced politely ("3 pages moved to the start").

## Telemetry and observability

- `Pdf · Changed · Pages.<Moved|Duplicated|Rotated|Cropped|Resized|Replaced|Labelled|Reversed>`,
  `Pdf · Added · Pages.<Blank|Pdf|LiveDoc|Clipboard>`, `Pdf · Deleted · Pages`,
  `Pdf · Created · <Extract|Split|Combine>`. Never a page's content or a file's name.
- Fingerprints: `[pdf] pages op=<op> count=<n>`, `[pdf] pages-refused reason=<reason>`, `[pdf] combine files=<n>
pages=<n> bytes=<n>`.

## Errors

| When                           | A person sees                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Deleting every page            | "A PDF needs at least one page."                                                |
| A range that names no page     | "There are no pages 40-50. This PDF has 14 pages."                              |
| The inserted file is protected | Its password is asked, as on opening                                            |
| The inserted file is not a PDF | "Choose a PDF file, or a LiveDoc document."                                     |
| The result would be too large  | "These pages would make a file of 41 MB, more than LiveDoc holds for one file." |
