# File formats in and out

Google Docs downloads a document as DOCX, ODT, RTF, PDF, TXT, HTML, zipped HTML, EPUB and Markdown (verified:
[Drive export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)), and opens DOCX,
ODT, RTF, TXT, HTML and PDF for conversion (assumed: Drive's "Open with Google Docs"). Researched November 2026;
versions and licences from `npm view` on 2026-11-18 (verified).

| Format            | Out (download)                                                     | In (open, import)                                                         | Library                                                                                      | Where it runs      |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| ODT, FODT         | Native: the package or the flat XML                                | Native, extended conformance kept                                         | Own, on the shared zip and XML layer                                                         | Browser and Worker |
| DOCX              | Native since C1: the document itself, or a converted copy          | Native since C1: held as OOXML, kept content written back                 | Own mapping (`docx` and `mammoth` judged and set aside, [adopt or build](adopt-or-build.md)) | Browser and Worker |
| RTF               | A small writer (paragraphs, runs, tables, pictures)                | A reader for text, formatting, lists, tables; the rest dropped and listed | Own, or `rtf.js` 3.0 (MIT) for reading                                                       | Browser            |
| PDF               | From the page layout, text as text, fonts embedded                 | Text and pictures only, reading order guessed (assumed: what Google does) | `pdf-lib` 1.17 (MIT) out; `pdfjs-dist` (Apache-2.0, assumed) in                              | Browser            |
| TXT               | The text, one line per paragraph                                   | One paragraph per line                                                    | None                                                                                         | Both               |
| HTML, zipped HTML | Semantic HTML with a stylesheet; pictures beside it in the zip     | Sanitised with DOMPurify, mapped into the model                           | DOMPurify 3.4 (Apache-2.0 choice)                                                            | Browser            |
| EPUB              | EPUB 3: XHTML chapters split at Heading 1, a nav document, the zip | Not offered (Google opens none; assumed)                                  | Own, on the zip writer                                                                       | Both               |
| Markdown          | CommonMark with GitHub's extensions                                | The same                                                                  | Own, or the markdown tab's parser once built                                                 | Both               |

## Sizes and fit

- Zip: the repo already reads and writes zips with the platform's `DecompressionStream` / `CompressionStream` under a
  byte budget (verified: `packages/office-packages/src/zip/zip-reader.ts`, `inflate.ts`, `zip-writer.ts`); both streams exist in Workers
  (assumed: Workers implement the Compression Streams API).
- XML: `saxes` and `fast-xml-parser` are pure JavaScript, no DOM needed, so they run in Workers where `DOMParser` does
  not exist (inferred: Workers have no DOM).
- PDF: `pdf-lib` is pure JavaScript; its weight is measured against the editor's bundle budgets before adoption, and
  it loads only when someone downloads a PDF (inferred: dynamic import).

## Finding

Every format is read and written by LiveDoc's own code over two shared layers (zip, XML), except PDF, HTML
sanitising and perhaps RTF reading, which adopt permissive libraries loaded on demand. Agents and repository sync
need ODT and FODT in the Worker too, so the package layer must not depend on the DOM.
