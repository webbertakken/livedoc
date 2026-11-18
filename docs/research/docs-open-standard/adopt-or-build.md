# Adopt or build

Which open-source editors and office suites could carry the text document, judged against LiveDoc's hard constraints:
MIT repository, no copyleft or paid tier in the core, nothing gated as "Pro", static frontends and Workers only,
self-hosting with no outside service ([AGENTS.md](../../../AGENTS.md) "Hard constraints"). Researched November 2026.
Versions and licences are from `npm view` on 2026-11-18 (verified) unless marked.

## Whole suites and document editors

| Candidate                      | Licence and tiers                                                                                                                                                         | Runs where                | Verdict                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| LibreOffice / Collabora Online | MPL-2.0 core; Collabora Online is a server (assumed)                                                                                                                      | A C++ server per document | Out: needs a server; breaks Workers-only and self-hosting                                     |
| ONLYOFFICE Docs                | AGPL-3.0 server (assumed); the React wrapper is Apache-2.0 (verified) but only frames the server                                                                          | A document server         | Out: copyleft, and a server                                                                   |
| SuperDoc (`superdoc` 2.32)     | AGPL-3.0, with a proprietary DOCX engine licence (verified)                                                                                                               | Browser                   | Out: copyleft and a proprietary engine                                                        |
| CKEditor 5 (49.1)              | "See LICENSE.md": GPL or commercial; pagination, track changes, export are paid (assumed)                                                                                 | Browser                   | Out: copyleft or paid                                                                         |
| Tiptap (`@tiptap/core` 3.34)   | MIT core; Tiptap Pages, comments, collaboration history are paid (inferred: [Tiptap Pages](https://tiptap.dev/docs/pages/getting-started/overview) sits in its paid docs) | Browser                   | Core usable; its paid parts out; adds a layer over ProseMirror the repo already uses directly |
| Lexical (0.53)                 | MIT                                                                                                                                                                       | Browser                   | Possible, but a second editor framework beside ProseMirror                                    |
| Quill (2.0.3), Slate (0.147)   | BSD-3, MIT                                                                                                                                                                | Browser                   | Too thin for pages, tables and tracked changes                                                |

## Building blocks

| Piece            | Candidate                                                                                                                                        | Licence           | Verdict                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Editor core      | ProseMirror (already in `apps/live`, 1.25 / 1.42)                                                                                                | MIT               | **Adopt** (already adopted)                                                                                                              |
| Tables           | `prosemirror-tables` 1.8.5                                                                                                                       | MIT               | **Adopt**: merged cells, column resize, cell selection                                                                                   |
| CRDT and binding | `yjs` 13.6, `y-prosemirror` 1.3, `y-protocols` 1.0                                                                                               | MIT               | **Adopt** ([live model](live-model.md))                                                                                                  |
| Zip              | The repo's own reader and writer (`packages/office-packages/src/zip/zip-reader.ts`, `zip-writer.ts`) on `DecompressionStream` with a byte budget | MIT (ours)        | **Adopt**, moved to a shared package for the api too; fflate 0.8 (MIT) if streaming falls short                                          |
| XML              | `saxes` 6.0 (ISC), `fast-xml-parser` 5.12 (MIT)                                                                                                  | permissive        | **Adopt one**: saxes is a streaming, non-validating parser that refuses external entities by design (assumed)                            |
| DOCX             | `docx` 9.15 (MIT, writes), `mammoth` 1.13 (BSD-2, reads to HTML, lossy), `docx-preview` 0.4 (Apache-2.0, renders)                                | permissive        | **Build** our own mapping over the shared XML layer; the libraries each hold a model of their own that the round trip would lose through |
| PDF              | The repo's hand-rolled PDF writer (`export-tab-pdf.ts`, images); `pdf-lib` 1.17, `jsPDF` 4.2, `pdfmake` 0.3 (MIT)                                | MIT               | **Adopt pdf-lib** for text PDFs with embedded fonts, or the browser's print to PDF; decided in Phase 14                                  |
| Pagination       | Paged.js 0.4 (MIT); Tiptap Pages (paid)                                                                                                          |                   | **Build** on the article's measured layout ([layout engine](layout-engine.md))                                                           |
| HTML sanitising  | DOMPurify 3.4 (MPL-2.0 or Apache-2.0)                                                                                                            | permissive choice | **Adopt** under Apache-2.0 for HTML import                                                                                               |
| RTF              | `rtf.js` 3.0 (MIT, renders RTF to HTML)                                                                                                          | MIT               | Judged in Phase 14 against a small own reader                                                                                            |

## What is adopted, what is built, and why

- **Adopted**: ProseMirror and `prosemirror-tables` for editing; Yjs for the live model; the repo's zip and PDF code;
  one XML parser; DOMPurify for HTML.
- **Built**: the ODF model and its reader and writer, the DOCX mapping, the layout and pagination, the office shell,
  review (suggestions as tracked changes, comments), and every export but PDF.
- **Why**: every whole-suite candidate is copyleft, paid, or a server. Everything adopted is MIT, ISC, BSD or Apache,
  runs in a browser and in a Worker, and leaves the model LiveDoc's own, so the file round trip is ours to prove.
