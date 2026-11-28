# Files and print

**Status: partly built.** Built: Open (a `.odt`, `.fodt`, `.ott`, `.docx`, `.dotx` or `.docm` from the computer, and
`.txt`, `.md`, `.html` and `.rtf` imported), Download in the OpenDocument and Word formats, Rich Text, Plain Text, Web Page, EPUB and
Markdown, conversion. The rest is specified.

Opening, importing, downloading, printing, copying, sharing, emailing and trashing a [text document](text-document.md).
Both ODF and OOXML are native (fork C1, ruled): a file keeps the format it arrived in.

## Opening

- **File > Open** (⌘O): a dialog with two tabs, **LiveDoc** (the Explorer's documents, searchable) and **Upload** (a
  file from the computer, or dropped).
- Dropping or uploading a `.odt`, `.fodt` or `.docx` (also `.ott`, `.dotx`, `.docm` with its macros dropped) makes a
  text document **in that format**, named after the file, in the current folder.
- Other formats are **imported**: `.rtf`, `.txt`, `.html`, `.md` (as a text document; a `.md` dropped where pages are
  made stays a [page](../031-markdown/markdown-tab.md), fork D3) and `.pdf` (text and pictures, reading order guessed);
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
- An import that drops anything shows the **import report** ([below](#import-report)).
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
| Microsoft Word (.docx)    | The document itself when OOXML; a converted copy when ODF, its losses in the download's report         |
| OpenDocument (.odt)       | The document itself when ODF; a converted copy when OOXML                                              |
| OpenDocument flat (.fodt) | LiveDoc's addition: the flat file                                                                      |
| PDF (.pdf)                | The laid-out pages, text as text, fonts embedded, links live, bookmarks from headings, alt text tagged |
| Rich Text (.rtf)          | Paragraphs, runs, lists, tables, pictures                                                              |
| Plain Text (.txt)         | One line per paragraph, UTF-8                                                                          |
| Web Page (.html, zipped)  | Semantic HTML with a stylesheet, pictures beside it                                                    |
| EPUB (.epub)              | EPUB 3, chapters split at Heading 1                                                                    |
| Markdown (.md)            | CommonMark with GitHub's extensions                                                                    |

Each download is named after the document. A Viewer may download unless the owner turned it off for Viewers.
Download as PDF offers "Keep in LiveDoc as a PDF document", which stores the written PDF beside its source as a
[PDF document](../035-pdf-documents/files-print-and-sync.md#other-kinds-meeting-a-pdf); every kind's PDF is written by
the repository's one PDF writer.
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
  picture as its alt text, an equation between dollars, a table of contents as a list of its headings; colours,
  sizes and alignment left out; text that would read as Markdown escaped (default).
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

Shown once after an import or a conversion that dropped or kept anything (the **Security limitations** item reopens
it): what was dropped (macros, signatures, external links not followed, scripts in HTML) and what was kept untouched
(form controls, smart chips' data), each by name and count. Nothing in it is ever silent.

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
  Google prints them) or the editor's chrome.
- **Print preview** (File): the pages as printed, with **Print** and **Close**: it follows Print, pending suggestions
  drawn accepted, never Viewing, which draws them not yet made (director, 2026-11-27).

## Make a copy

File > Make a copy: name ("Copy of <name>"), folder, **Share it with the same people**, **Copy comments and
suggestions**, **Include resolved comments and suggestions**; the copy keeps the format.

## Sharing

Share is LiveDoc's share dialog and roles ([Share roles](../013-workspace/share-roles.md)); **Publish to the web** is
LiveDoc's public view link and embed (either way under C3).

## Email

File > Email: **Email this file** (attach as .docx, .odt, PDF, …, to addresses, with a message) and **Email
collaborators**, where the host has email configured; not shown otherwise. Either way under C3.

## Details

File > Details: owner, location, created, modified (by whom), format, size, and the word count's statistics.

## Trash

File > Move to trash: LiveDoc's [Trash](../013-workspace/trash.md).

## Share roles

Downloading, printing and copying are open to every level unless the owner turned them off for Viewers and
Participants; converting, opening into a folder and trashing are an Editor's (trashing the owner's).

## Telemetry

`Document · Imported · TextDocument<Format>` (Odt, Fodt, Docx, Rtf, Txt, Html, Md, Pdf),
`Document · Exported · TextDocument<Format>`, `Document · Changed · TextDocumentConverted`, `UI · Used · TextDocumentPrint`,
`Document · Duplicated · TextDocument`. Never content.
