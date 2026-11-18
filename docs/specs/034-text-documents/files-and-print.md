# Files and print

**Status: specified.** Nothing is built.

Opening, importing, downloading, printing, copying, sharing, emailing and trashing a [text document](text-document.md).
Both ODF and OOXML are native (fork C1, ruled): a file keeps the format it arrived in.

## Opening

- **File > Open** (⌘O): a dialog with two tabs, **LiveDoc** (the Explorer's documents, searchable) and **Upload** (a
  file from the computer, or dropped).
- Dropping or uploading a `.odt`, `.fodt` or `.docx` (also `.ott`, `.dotx`, `.docm` with its macros dropped) makes a
  text document **in that format**, named after the file, in the current folder.
- Other formats are **imported**: `.rtf`, `.txt`, `.html`, `.md` (as a text document; a `.md` dropped where pages are
  made stays a [page](../031-markdown/markdown-tab.md), fork D3) and `.pdf` (text and pictures, reading order guessed);
  an imported document is born in ODF (fork C5).
- An import that drops anything shows the **import report** ([below](#import-report)).

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

## Import report

Shown once after an import or a conversion that dropped or kept anything (the **Security limitations** item reopens
it): what was dropped (macros, signatures, external links not followed, scripts in HTML) and what was kept untouched
(form controls, smart chips' data), each by name and count. Nothing in it is ever silent.

## Import security

Every abuse case of the research ([Import security](../../research/docs-open-standard/import-security.md)) has a named
rejection or a reported drop, in [Office packages](../020-import-export/office-packages.md#named-rejections) and here:
`document_too_large` (past `TEXT_DOCUMENT_MAX_CHARS`), `picture_too_large`; remote pictures are never fetched on import
and show **Load picture** for an Editor.

## Printing

- **Print** (⌘P, the toolbar): the browser's print of the laid-out pages, at their paper size, with headers, footers
  and page numbers, and without comments, suggestion colours (suggestions printed as they would be accepted, as
  Google prints them) or the editor's chrome.
- **Print preview** (File): the pages as printed, in Viewing mode, with **Print** and **Close**.

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
