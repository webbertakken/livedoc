# Files and print

**Status: partly built.** Built: Open (a `.odt`, `.fodt`, `.ott`, `.docx`, `.dotx` or `.docm` from the computer, and
`.txt`, `.md`, `.html`, `.rtf` and `.pdf` imported), Download in the OpenDocument and Word formats, Rich Text, Plain Text, Web Page, EPUB,
Markdown and PDF, Keep a PDF copy in LiveDoc, Print and Print preview, conversion, the import report and Security
limitations. The rest is specified.

Opening, importing, downloading, printing, copying, sharing, emailing and trashing a [text document](text-document.md).
Both ODF and OOXML are native (fork C1, ruled): a file keeps the format it arrived in.

## Opening

- **File > Open** (⌘O): a dialog with two tabs, **LiveDoc** (the Explorer's documents, searchable) and **Upload** (a
  file from the computer, or dropped).
- Dropping or uploading a `.odt`, `.fodt` or `.docx` (also `.ott`, `.dotx`, `.docm` with its macros dropped) makes a
  text document **in that format**, named after the file, in the current folder.
- Other formats are **imported**: `.rtf`, `.txt`, `.html`, `.md` (as a text document; a `.md` dropped where pages are
  made stays a [page](../031-markdown/markdown-tab.md), fork D3) and `.pdf` ([below](#opening), reading order guessed);
  an imported document is born in ODF (fork C5). Plain Text is a paragraph a line (UTF-8, else Windows' Western
  encoding; a file holding a NUL byte is not text); Markdown reads as Markdown downloads (headings, lists and
  checklists, code blocks in their language, pipe tables with a header row, bold, italic, strikethrough and safe
  links), a picture staying as its alt text in brackets, never fetched, and reported (default). HTML is read as a
  browser parses it: headings, paragraphs, lists (nested, `start`, `type`, checkbox items as checklists), quotes
  indented, `pre` as a code block in its `language-` class's language, tables (header rows, merged cells, backgrounds),
  the formatting an element's own `style`, tags and `font` give, safe links, a picture only from the page's own bytes
  (`data:`), a `math` element as its text, the page's language; stylesheets are never read; scripts, frames,
  objects, embeds and form controls are never read and are reported (default). Rich Text keeps paragraphs with their
  formatting, headings by style or outline level, runs, lists from its list table (numbered in their format from their
  start), tables with their widths, header rows, merges and backgrounds, PNG and JPEG pictures at their size and crop,
  footnotes, bookmarks, links and page numbers; headers and footers, embedded objects (their shown result kept) and
  pictures of other formats are left out and reported; another field is its last shown text (default).
- A `.pdf` dropped or uploaded anywhere else in LiveDoc opens as a [PDF document](../035-pdf-documents/pdf-document.md),
  which stays a PDF. Importing it here is a choice, and a copy: a PDF document's File > Open as a text document, or
  this dialog's Upload with "Import as a text document" ticked.
- **A PDF imported** is read in this browser, by the PDF engine, the one place a PDF is parsed ([The
  boundary](../035-pdf-documents/security.md#the-boundary)); the new document rides the create as a state with its
  import report in it, as a copy does (default). A text document's File > Open takes a `.pdf` and imports it (default).
  A tagged page reads by its tags: headings, paragraphs, lists, tables with their header rows, a figure as its alt text
  in brackets, artifacts (running headers, page numbers) left out. Any other page reads by its geometry (reading order
  guessed): the engine's lines in the file's order, a line joining the paragraph above when it starts in the same column
  and the gap is at most half a line; a paragraph whose lines are at least 1.2 times the body text's height is a
  heading, the tallest Heading 1, then 2 and 3 (default). A page with no text (a scan) and a page whose text was cut at
  the engine's limit are reported; each picture comes at its place: a tagged figure holds the page's pictures in the
  order drawn, an untagged page's picture goes before the first paragraph below its top, any left over after the page,
  at its size on the page up to the text's width; a picture past the engine's size limit, unreadable, or past a page's
  picture limit is left out and reported (default). A password-protected PDF, or one the engine refuses, is refused with
  the PDF document's words; past `TEXT_DOCUMENT_MAX_CHARS` it refuses `document_too_large`.
- An import that drops something a reader would miss shows the **import report** once ([below](#import-report)).
- An opened file rides the new document's create (default): `POST /api/documents` names the text document tab and its
  file (`textDocuments: [{ tabId, file }]`, base64; a copy's `{ tabId, state }` carries a live state instead,
  [Copies](live-editing-and-storage.md#copies)); the room reads it with the package's guards and stores its body as
  the tab's first update (an import names its `type`, `txt`, `md`, `html` or `rtf`), or answers the package's rejection (413 `package_too_large`, 415 `package_wrong_type`, 400
  otherwise) and nothing is made. A create's body is capped at the api's 8 MB, so a file past about 6 MB waits for
  a direct upload (default).

## Downloading

File > Download, in Google's order:

| Item                      | File                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Microsoft Word (.docx)    | The document itself when OOXML; a converted copy when ODF, its losses listed before it downloads       |
| OpenDocument (.odt)       | The document itself when ODF; a converted copy when OOXML                                              |
| OpenDocument flat (.fodt) | LiveDoc's addition: the flat file                                                                      |
| PDF (.pdf)                | The laid-out pages, text as text, fonts embedded, links live, bookmarks from headings, alt text tagged |
| Rich Text (.rtf)          | Paragraphs, runs, lists, tables, pictures                                                              |
| Plain Text (.txt)         | One line per paragraph, UTF-8                                                                          |
| Web Page (.html, zipped)  | Semantic HTML with a stylesheet, pictures beside it                                                    |
| EPUB (.epub)              | EPUB 3, chapters split at Heading 1                                                                    |
| Markdown (.md)            | CommonMark with GitHub's extensions                                                                    |

Each download is named after the document. A Viewer may download unless the owner turned it off for Viewers.
File > **Keep a PDF copy in LiveDoc**, an item beside Download, so a download gains no step (director, 2026-11-28),
writes the PDF as Download as PDF does and stores it as a
[PDF document](../035-pdf-documents/files-print-and-sync.md#other-kinds-meeting-a-pdf) named as its source, kept where
the source is (LiveDoc, or This Browser for a document there), in the folder the person's new documents go to
(default). Its dialog, **Keeping a PDF copy**, says each step as the PDF's does, then "Kept a PDF copy of “<name>”."
with **Open** (the copy in a new tab) and Close; a failure says "The PDF copy couldn’t be kept. Try again.".
Telemetry `Document · Exported · TextDocumentPdfCopy`. Every kind's PDF is written by the repository's one PDF writer.
The PDF is written in the browser from the pages as drawn in the [printing look](#printing): each word where it
stands, in the served document font it was drawn in (fonts.md "Served from LiveDoc"), its structure from the writing.
While it is made, a dialog, **Making the PDF**, says each step (laying out the pages, reading them, drawing the
pictures, writing the PDF); closing it cancels, and a failure says "The PDF couldn’t be made. Try again." in it.
A picture that cannot be read is left out. Telemetry `Document · Exported · TextDocumentPdf`.
A download is `GET /api/documents/:id/text-documents/:tabId/file?type=odt|fodt|docx|txt|md|html|epub|rtf`, written from the live state
(`400 file_type_unknown` for any other type); the other format is a converted copy, its losses counted in the
`X-Conversion-Losses` header.

**The other format** asks first, as a spreadsheet does: **Download as Word?** (or **Download as OpenDocument?**) lists
what the file cannot hold, as [Conversion](standard-mapping.md#conversion) words it, with **Download** and **Cancel**;
with nothing lost it says so and still asks (director, 2026-11-27). The text document keeps its format.

**What every other format holds** (all but the OpenDocument and Word files, which hold the document whole):

- The writing with every pending suggestion accepted, as print has it; no comments; kept content left out.
- Every document tab in the outline's order; with more than one, each tab's name heads its writing (default).
- Footnotes after the writing, numbered as drawn; a field as last shown; an equation in its linear form.
- **Plain Text**: a line a paragraph (`\n`, no byte order mark), a list item after its marker as drawn (☐ and ☑ for
  checklists), a table a line a row with its cells split by tabs, a picture as its alt text in brackets
  (`[Picture]` without one; a decorative one is nothing), notes as `[1] text` (default).
- **Markdown**: headings by level (the Title as `#`, the Subtitle bold), bold, italic and strikethrough, web and
  email links (a link to a place in the document keeps only its text), list items nested four spaces a level,
  checklists as `- [ ]` and `- [x]`, tables as pipe tables (the first row the header, a merged cell's other places
  empty, a table inside a cell as its text), code blocks fenced with their language, footnotes as `[^1]`, a
  picture as Plain Text says it, escaped (`\[A cat\]`), an equation between dollars, a table of contents as a list of
  its headings; colours, sizes and alignment left out; text that would read as Markdown escaped (default).
- **Web Page**: a `.zip` of `<name>.html` and an `images/` folder holding each picture once, as `images/1.png` and
  on in order of first appearance (default). The page is HTML5 in the document's language (`en` when it names none),
  titled with its name, with one stylesheet from its styles: Normal text, the Title, the Subtitle and the headings
  (font, size, weight, slant, colour, alignment, spacing). Headings are `h1`..`h6`, the Title and Subtitle
  paragraphs of their own class (as Google writes them); direct formatting (colour, highlight, font, size,
  alignment, indents) rides on the element; lists are nested `ul`/`ol` (a checklist item with a ticked or empty
  box); tables keep merged cells and header rows; code blocks are `pre` naming their language; links to a place in
  the document go to its bookmark; pictures keep their alt text (a decorative one an empty one), size,
  crop, turn and colours; equations are MathML; footnotes are numbered links to a list after the writing. A
  picture whose bytes LiveDoc could not read is its alt text in brackets, and the download says so, as the other
  files do.
- **Rich Text**: RTF 1.9 that Word and LibreOffice open as drawn: a font and colour table from what the writing
  uses, a paragraph's formatting written whole (its style's and its own, so a reader without styles shows the same),
  headings keeping their outline level, runs with bold, italic, underline, strikethrough, raised and lowered,
  colour, highlight, font, size and small capitals; web links and links to a bookmark as hyperlinks; list items as
  their marker as drawn and a tab under a hanging indent (default); tables with their widths, header rows, merged
  cells and backgrounds (a table inside a cell as its paragraphs, default); PNG and JPEG pictures at their size and
  crop (another kind as its alt text); footnotes as the format's own; an equation in its linear form; the first
  section's paper and margins. Characters beyond ASCII as Unicode escapes.
- **EPUB**: EPUB 3, one chapter a Heading 1 (the writing before the first Heading 1 is a chapter of its own, and
  with more than one document tab each tab's name opens a chapter), the contents listing the chapters, the Web
  Page's markup, stylesheet and pictures, and the footnotes in a last chapter of their own (default). Its title is
  the document's name, its language the document's.

## Import report

What a file held that the text document does not, kept in the document itself so it is never silent and never lost
(director, 2026-11-28):

- **Opened**: what reading the file dropped (macros, signatures, scripts, frames and objects, fields that run things,
  unsafe links, external links and remote pictures not followed, pictures of formats LiveDoc does not draw, parts of
  tables, headers, footers, comments and suggestions it could not place) and what it kept untouched (content LiveDoc
  does not edit, written back as it came), a line a kind, counted, naming up to three of what it was. The room writes
  it when it reads the file, so every copy and every person sees the same report.
- **Converted**: each conversion between ODF and OOXML that the other format could not hold everything of, with the
  lines its dialog listed (the [Conversion](standard-mapping.md#conversion) words), newest first, the last 20 kept
  (default). Undoing the conversion takes its entry away with it; nothing is asked again after converting, as its
  dialog listed the losses first.
- **Shown once**, to the person who opened the file, as the document first loads, when reading it dropped something
  a reader would miss: **Opened “‹name›”**, all its lines, **OK**. Housekeeping alone (a thumbnail picture, spelling
  and layout hints, content kept untouched) never interrupts: most files carry some, and a dialog on every open would
  teach people to dismiss the one that matters (default); it stays listed in Security limitations. A copy, another
  person and a later visit do not see it again unasked.
- **Security limitations** (File) reopens it for anyone who can open the document, Viewers included: both sections,
  or "Nothing was left out or kept aside when this document was opened or converted." when there is nothing.

## Import security

Every abuse case of the research ([Import security](../../research/docs-open-standard/import-security.md)) has a named
rejection or a reported drop, in [Office packages](../020-import-export/office-packages.md#named-rejections) and here:
`document_too_large` (past `TEXT_DOCUMENT_MAX_CHARS`), `picture_too_large`; remote pictures are never fetched on import
and show **Load picture** for an Editor.

- Fields that run things (Word's `DDE`, `DDEAUTO`, `INCLUDETEXT`, `INCLUDEPICTURE`, `LINK`; ODF's DDE connections)
  are dropped and reported; their last shown text stays as text.
- A link to anything but `http`, `https`, `mailto` or a place in the document loses its link and keeps its text,
  reported.

## Printing

- **Print** (⌘P, the toolbar): the browser's print of the laid-out pages, at their paper size, with headers, footers
  and page numbers, and without comments, suggestion colours (suggestions printed as they would be accepted, as
  Google prints them) or the editor's chrome. What the browser prints is the PDF Download as PDF writes, so a print
  and the PDF always agree (director, 2026-11-28).
- **The printing look**, the same for Print, Print preview and the PDF: light paper whatever the scheme; laid out on
  pages whatever the view (a pageless document on its pages' setup, Show print layout off or on a phone); the shown
  document tab only (default); none of the editor's own: comment tints, spelling marks, others' carets and
  selections, bookmark glyphs, non-printing characters, picture and table handles, selected cells, a header's bar.
  Content kept from the file keeps its room but prints as nothing: its placeholder is LiveDoc's own (default).
- **Print preview** (File): the pages as printed, with **Print** and **Close**: it follows Print, pending suggestions
  drawn accepted, never Viewing, which draws them not yet made (director, 2026-11-27). Its bar, **Print preview**,
  stands in place of the menus and the toolbar; the side panels, the ruler and the word count are put away; the
  pages are read only; Escape closes it and ⌘P prints.
- **While a print is made**, a dialog, **Making the print**, says each step as the PDF's does; closing it cancels. The
  browser's own dialog follows. Where the browser cannot print a PDF it is handed, the PDF's pages go to it drawn as
  pictures. A print the browser refuses (it throws, or a page inside another's frame never opens its dialog within
  3 seconds) says so: "Your browser blocked printing. Download the PDF and print it from there.", with **Download
  PDF** and **Cancel** (director, 2026-11-28). A print that cannot be made says "The print couldn’t be made. Try
  again.". ⌘P is never the browser's print of LiveDoc's page.

## Make a copy

File > Make a copy, and the title row's **Make a copy** for whoever may not share, open the shell's **Copy document**
dialog, for every level. The copy is the person's own and keeps the format.

- **Name**: "Copy of ‹name›", focused and selected; an empty name is the default's.
- **Folder**: where the copy goes, **Change** opening the folder picker Move uses, the person's own folders alone (a
  copy is theirs, never a team's): the source's folder for its owner, else My Documents. A document in This Browser
  is copied in This Browser, and has no folder row.
- **Copy comments and suggestions**, off (Google's): off, the copy holds no comment thread and every pending
  suggestion rejected; on, both as they are. Not offered to a Viewer, who receives neither
  ([What a Viewer receives](review.md#what-a-viewer-receives)).
- **Include resolved comments and suggestions**, off, shown only while the one above is on: off, resolved threads are
  left out. A settled suggestion is not kept, so only threads are resolved.
- **Make a copy** (primary) and Cancel. While the copy is made the primary reads "Making a copy…" and the dialog stays;
  made, the copy opens in a new browser tab (opened at the press, so no pop-up blocker stops it, and closed again on a
  refusal) and the dialog closes. A refusal is said in the dialog: "The copy
  couldn’t be made. Try again.", or for files that pass the person's storage the words the canvas's copy says; both
  logged `[text-document] copy refused`.
- **Share it with the same people**: open, awaiting a ruling on what "the same people" are where LiveDoc shares by link.

## Sharing

Share is LiveDoc's share dialog and roles ([Share roles](../013-workspace/share-roles.md)); **Publish to the web** is
LiveDoc's public view link and embed (either way under C3).

## Email

File > Email: **Email this file** (attach as .docx, .odt, PDF, …, to addresses, with a message) and **Email
collaborators**, where the host has email configured; not shown otherwise. Either way under C3.

## Details

File > Details opens the shell's **Details** dialog, read only, for every level: one row each, in this order.

| Row                         | What it says                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Owner                       | "You" for the owner, else the owner's name, else "Not known"                                                                         |
| Location                    | "This Browser"; "My Documents" or the team's name, then its folders ("My Documents › Plans"); "Shared with you" for anyone else's    |
| Created                     | The day and time ("28 Nov 2026, 11:20")                                                                                              |
| Modified                    | The last edit, "28 Nov 2026, 11:42 by Ada" (the name the save status says) where LiveDoc knows it; else the last save's day and time |
| Format                      | "OpenDocument text (.odt)" or "Word document (.docx)"                                                                                |
| Size                        | The stored writing's size as it is now ("12 KB")                                                                                     |
| Pages                       | Only where pages are laid out                                                                                                        |
| Words                       | The word count's, of the whole document ([Word count](tools.md#word-count))                                                          |
| Characters                  | The word count's                                                                                                                     |
| Characters excluding spaces | The word count's                                                                                                                     |

- Dates and numbers are in the reader's own format, as the Explorer's Details view writes them.
- It counts as it opens; a date not known reads "-". The modified row is read from LiveDoc as the dialog opens and
  shows the last save's time until it is (default); one it cannot read stays the last save's.
- Nothing to confirm, so no button row: its × and Escape close it, and the writing has the focus back.

## Trash

File > Move to trash: LiveDoc's [Trash](../013-workspace/trash.md), the same delete as everywhere: no question first;
the editor goes to the Explorer, which says "“‹name›” deleted" with **Undo**. A document in This Browser goes to this
browser's Trash. A delete LiveDoc refuses keeps the document open and says "Could not delete “‹name›”. Try again."
The item is drawn only for whoever may delete the document (its owner, or a member of its team).

## Share roles

Downloading, printing and copying are open to every level unless the owner turned them off for Viewers and
Participants; converting, opening into a folder and trashing are an Editor's (trashing the owner's).

## Telemetry

`Document · Imported · TextDocument<Format>` (Odt, Fodt, Docx, Rtf, Txt, Html, Md, Pdf),
`Document · Exported · TextDocument<Format>`, `Document · Changed · TextDocumentConverted`, `UI · Used · TextDocumentPrint`, `UI · Used · TextDocumentPrintPreview`,
`UI · Used · TextDocumentSecurityLimitations` (File > Security limitations reopened), `UI · Used · TextDocumentDetails`,
`Document · Deleted` (File > Move to trash, as every delete),
`Document · Duplicated · TextDocument`. Never content.
