# The corpus and the validators

What LiveDoc's PDF work is tested on, and what says a written file is a good one. Researched November 2026.

## The research corpus

112 files, fetched by a script and never committed (kept beside the plan, with a manifest of each file's SHA-256 and
size). It is the one corpus every spike of this research ran on.

| Group      | Files | From                     | Holds                                                                       |
| ---------- | ----- | ------------------------ | --------------------------------------------------------------------------- |
| text       | 7     | pdf.js                   | A paper, a 352-page book, mixed and standard fonts                          |
| scripts    | 6     | pdf.js                   | Arabic, CJK, vertical writing, ligatures, Type 3 fonts                      |
| marks      | 17    | pdf.js, PDFium           | Every text markup, notes, free text, ink, stamps, lines, shapes, redaction  |
| fields     | 14    | pdf.js, PDFium           | Text, choice and button fields, a tax form filled in, scripts on buttons    |
| xfa        | 4     | pdf.js, PDFium           | Static and dynamic XFA                                                      |
| tagged     | 4     | pdf.js, PDFium           | Structure trees, alternative text, a tagged table                           |
| pictures   | 8     | pdf.js                   | CMYK, JPEG 2000, CCITT, blend modes, shadings, layers, the Brotli prototype |
| scans      | 2     | pdf.js                   | Bilevel and grey scans with no text                                         |
| damaged    | 11    | pdf.js, PDFium           | Fuzzed files, a decompression bomb, broken trailers and cross-references    |
| encrypted  | 5     | PDFium                   | Standard security handler revisions 2, 3, 5 and 6                           |
| signed     | 3     | pdf.js, PDFium           | One and two signatures, a reason                                            |
| linearised | 2     | PDFium                   | Linearised files                                                            |
| structure  | 7     | pdf.js, PDFium           | Outlines (one circular), attachments (one encrypted), named destinations    |
| actions    | 6     | PDFium                   | JavaScript, launch, URI and go-to actions, web links                        |
| basics     | 3     | PDFium                   | The smallest files                                                          |
| large      | 1     | pdf.js                   | 6 MB of vector plans on one page                                            |
| pdf20      | 6     | PDF Association          | PDF 2.0: UTF-8 strings, page-level output intents, an incremental save      |
| derived    | 6     | Made here from one paper | Linearised; AES-256 with an open password; AES-256 locked against changes;  |
|            |       | with qpdf                | truncated; `startxref` spoiled; 1,008 pages                                 |

- PDF versions 1.2 to 2.0 are present; 1.0 and 1.1 are not, and are added by hand-written files in Phase 5
  (verified: `pdfinfo` over the corpus).
- Findings about the corpus itself: validators disagree on pdf.js's `signed_verified.pdf`. poppler's `pdfsig` reads
  "Digest Mismatch" and "not total document signed"; a check with Web Crypto finds its digest and signature valid
  over the whole file (verified: both run). It proves nothing either way, so a validly signed file is made by
  signing one, and both validators agree on every file made that way.
- Missing, and wanted from Webber's own work when a phase needs them: a real signed contract, a bank or government
  form with calculations, a phone scan of several pages, a PDF/A archive copy, a portfolio.

## Licences, and what may live in the repository

| Source                           | Licence of the repository                                                                                                            | In the repository?                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| PDFium `testing/resources`       | BSD-3-Clause (verified: its `LICENSE`)                                                                                               | Yes, with its notice                    |
| pdf.js `test/pdfs`               | Apache-2.0 for the repository; many files are third parties' documents (inferred: the folder holds links for those it may not carry) | Only files pdf.js's own tests generated |
| PDF Association `pdf20examples`  | CC BY-SA 4.0 (verified: its `LICENSE.md`)                                                                                            | No: share-alike; fetched in CI          |
| veraPDF corpus (PDF/A, PDF/UA)   | No licence stated on GitHub (verified: the API answers none)                                                                         | No; fetched in CI                       |
| qpdf's test suite                | Apache-2.0 (verified)                                                                                                                | Yes                                     |
| pyHanko's signed test files      | MIT (verified)                                                                                                                       | Yes                                     |
| Files LiveDoc's own scripts make | The repository's MIT                                                                                                                 | Yes, preferred                          |

The rule Phase 5 follows: the repository holds a **small** corpus of files made by LiveDoc's own scripts or under a
permissive licence, each with its source and licence in a manifest; everything else is fetched in CI by URL and
SHA-256 and cached, as this research fetched it.

## Validators and oracles

Tools that run on a developer's machine and in CI. None ships with LiveDoc, so none meets the licence gate.

| Tool                          | Licence            | Says                                                               | Verified here                     |
| ----------------------------- | ------------------ | ------------------------------------------------------------------ | --------------------------------- |
| `qpdf --check`                | Apache-2.0         | The file's syntax, cross-references and streams hold together      | Run on every file a spike wrote   |
| poppler `pdfsig`              | GPL (a tool only)  | Each signature: its type, what it covers, valid or digest mismatch | Run on every signed spike file    |
| poppler `pdftoppm`, `pdfinfo` | GPL (a tool only)  | A third rendering; versions, pages, encryption                     | Run over the corpus               |
| veraPDF                       | GPL-3.0 or MPL-2.0 | PDF/A and PDF/UA conformance of a written file                     | Not yet run (needs Java, present) |
| Arlington PDF model           | Apache-2.0         | Every dictionary key and type against the ISO 32000 model          | Not yet run                       |
| Chromium (PDFium)             | n/a                | The renderer most people read a PDF with                           | Through the engine itself         |
| Firefox (PDF.js)              | n/a                | The second renderer                                                | Through `pdfjs-dist`              |
| Acrobat, Preview              | n/a                | By hand only: neither runs in CI                                   | Webber's captures in Phase 21     |

- **Render comparisons**: two renderers are compared page by page with `pixelmatch` at threshold 0.3 with
  anti-aliasing ignored; across the corpus PDFium and PDF.js differ on a median 0.03% of pixels, so a tolerance of
  1% per page catches a real difference without flaking (verified: 101 pages; the tolerance is a default for
  Phase 5).
- **A written file passes** when `qpdf --check` is clean, its arriving bytes are a prefix of it where the change was
  incremental, every earlier signature still reads valid in `pdfsig`, and its pages draw as before outside what
  changed.
- On this machine `qpdf` is absent as a package; the research ran the project's own release binary. CI installs it
  from the distribution (assumed: `apt-get install qpdf` on the runner).
