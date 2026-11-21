# The engine

What reads, draws and writes a PDF in LiveDoc. Researched November 2026 by building each candidate as a spike on one
corpus; every number below is from a spike's own output unless tagged otherwise.

## The corpus and the spikes

- **Corpus**: 112 files. 106 fetched from pdf.js's `test/pdfs` (an Apache-2.0 repository), PDFium's
  `testing/resources` (BSD-3-Clause) and the PDF Association's `pdf20examples`, chosen by what "any PDF" names: text,
  scripts (Arabic, CJK, vertical, Type 3), marks, fields, XFA, tagged files, pictures and colour, scans, damaged and
  fuzzed files, encryption (revisions 2 to 6), signatures, linearised files, attachments, outlines, actions and
  PDF 2.0. Six more derived from one paper with qpdf: linearised, AES-256 with an open password, AES-256 locked
  against changes, truncated, its `startxref` spoiled, and repeated to 1,008 pages. Versions 1.2 to 2.0 (verified:
  `pdfinfo`). [The corpus and the validators](corpus-and-validators.md) lists it.
- **Readers**: PDFium as WebAssembly (`@embedpdf/pdfium` 2.15.1, MIT, a build of PDFium with 138 functions of its
  own beside PDFium's public API), PDF.js (`pdfjs-dist` 6.5.438, Apache-2.0), LibPDF (`@libpdf/core` 0.5.3, MIT, its
  font code Apache-2.0), an own parser written for the spike (124 lines), and poppler's `pdfinfo` and `pdftoppm` as
  a reader no candidate shares code with. Licences and versions verified on the npm registry, 2026-11-21.
- MuPDF's build for the web (`mupdf` 1.28.6) is AGPL-3.0-or-later (verified: npm registry), which the licence gate
  refuses ([Third-party licences](../../specs/002-project-scope/third-party-licences.md)); the paid viewers gate
  features by tier, which the open-source rules refuse. Neither was spiked.

## What was measured

| Question                               | PDFium                                   | PDF.js                         | LibPDF                                       | Own parser (124 lines)    |
| -------------------------------------- | ---------------------------------------- | ------------------------------ | -------------------------------------------- | ------------------------- |
| Opens, of 112                          | 102                                      | 102                            | 109, wrongly counting encrypted files        | 66                        |
| Refuses with a reason                  | 5 password, 4 damaged, 1 no pages        | 6 password, 4 damaged          | 3: one truncated, one encrypted and misread, | 32 need cross-reference   |
|                                        |                                          |                                | the Brotli prototype                         | streams, 6 encryption, 8  |
|                                        |                                          |                                |                                              | recovery                  |
| A file asking a password, none given   | Says so (`FPDF_ERR_PASSWORD`)            | Says so (`PasswordException`)  | Reports it open                              | Says so                   |
| Draws a page                           | Yes                                      | Yes                            | No                                           | No                        |
| First pages against the other reader   | Median 0.03% of pixels differ, 90th      | Same                           | n/a                                          | n/a                       |
| (72 dpi, 101 files)                    | percentile 0.7%, none over 5%            |                                |                                              |                           |
| A heavy vector page (6 MB of plans)    | 825 ms                                   | 2,425 ms                       | n/a                                          | n/a                       |
| First page of a 1 MB paper, cold       | 327 ms, of which engine start 56 ms      | 285 ms                         | n/a                                          | n/a                       |
| 1,008 pages: open, then page 501       | 12.5 ms, 140 ms                          | 152 ms, 297 ms                 | n/a                                          | n/a                       |
| Text with positions                    | Yes                                      | Yes                            | Yes                                          | No                        |
| An unchanged file saved                | Never the same bytes (about 340 added)   | n/a                            | The arriving bytes                           | n/a                       |
| One highlight, incremental             | 107,543 bytes added; arriving bytes kept | n/a (its editor rewrites)      | 543 bytes added; arriving bytes kept         | About 400 bytes, where it |
|                                        |                                          |                                |                                              | reads the file at all     |
| A signed file after that highlight     | Signature still valid                    | n/a                            | Signature still valid                        | n/a                       |
| A signed file after a rewrite          | Signature broken                         | n/a                            | Signature broken                             | n/a                       |
| Editing a page's own text              | Yes (`FPDFText_SetText`, then            | No                             | No object model of a page's content          | No                        |
|                                        | `FPDFPage_GenerateContent`)              |                                |                                              |                           |
| A page regenerated, nothing changed    | 86 of 88 pages pixel-identical, one      | n/a                            | n/a                                          | n/a                       |
|                                        | within 0.01%, one 15.5% different        |                                |                                              |                           |
| Signing with a `.p12`                  | No                                       | No                             | Yes, PAdES, 12 ms; valid by poppler's check  | No                        |
| Checking a signature                   | Reads it (byte range, sub-filter,        | No                             | No ("not implemented")                       | No                        |
|                                        | contents); verifies nothing              |                                |                                              |                           |
| Shipped weight, Brotli                 | 1,652 KB binary and 32 KB script         | 113 KB and 311 KB worker;      | 207 KB                                       | A few KB                  |
|                                        |                                          | decoders 92 KB on demand       |                                              |                           |
| In a worker thread                     | Yes                                      | Yes, its own                   | Yes                                          | Yes                       |
| In a Cloudflare Worker (local workerd) | Yes: opens, draws, reads text            | Reads; cannot draw (no canvas) | Yes: an incremental highlight                | Yes                       |

Notes on the rows, each verified by its spike:

- **Rendering does not separate PDFium from PDF.js** on this corpus: where a file differs by more than 5%, poppler
  is the one that differs from both.
- **Timings** are from headless Chromium on a loaded development machine, over loopback: they order the candidates,
  they are not budgets. Phase 4 measures budgets on the tracer bullet.
- **PDFium's incremental save is coarse.** One highlight appends 107 KB to a 1 MB paper, and a page whose content
  was edited appends about the whole file again (1,017,362 bytes on 1,016,315). It appends more than it changed
  (inferred: it writes every object it loaded, not only those it altered).
- **LibPDF's incremental save is exact** but has a hole: a file it could only open by brute-force recovery cannot
  be saved incrementally (`canSaveIncrementally()` answers `brute-force-recovery`), and asking for an incremental
  save then **rewrites the file without saying so**. A caller must ask first.
- **LibPDF opens an encrypted file with no password** and reports its pages; only reading a string or a stream
  would fail later. The reader of record must be one that asks.
- **Regenerating a page's content loses something on one file in 88** (`alphatrans.pdf`, a transparency test).
  Real editing needs a guard: the page drawn before and after, compared outside what the edit touched.
- **In a Cloudflare Worker** PDFium starts only when handed a compiled module (`instantiateWasm` with the imported
  `.wasm`), since a Worker may not compile bytes at run time (verified: local `wrangler dev`). Its binary is 4.6 MB
  of the 64 MiB a Worker may be (verified: Cloudflare's limits page, 2026-11-21), and it must load on demand, as the
  api's PNG renderer does ([Web performance](../../specs/016-platform/web-performance.md)).
- **The own parser** read 66 files and wrote a valid highlight on 61 of them in 124 lines, and draws nothing. Every
  file it could not read needs a decoder (Flate with predictors, object streams), encryption or recovery: the parts
  that make a PDF reader a large and security-critical piece of code.

## The designs

**A. PDFium for everything.** One engine reads, draws, edits and writes.

- For: one parse of the file, the renderer Chrome ships, the only candidate that edits a page's own text, runs in
  the api Worker for thumbnails and search text.
- Against: it cannot sign (C4 needs a signer regardless), and its incremental saves append far more than changed.

**B. PDF.js reads and draws; LibPDF writes.**

- For: a third of the weight (about 630 KB against 1.7 MB), exact incremental saves, signing included.
- Against: neither edits a page's content, so C2's Editing would be an own content editor over LibPDF's raw objects
  (re-encoding typed text into each font's own encoding: unbuilt, large); PDF.js cannot draw in a Worker; the file
  is parsed by two readers that disagree on encrypted files.

**C. An own parser and writer.**

- For: no dependency, full control of every byte.
- Against: the spike reads 59% of the corpus and draws nothing; closing the gap is a renderer, font engines, image
  decoders and encryption, each a place where a hostile file reaches LiveDoc's own code.

**D. PDFium reads, draws and edits pages; LibPDF writes what Reviewing adds.** Found by the spikes.

- PDFium is the one reader and renderer, in the browser's worker and in the api Worker, and the page editor.
- LibPDF, loaded only when a file is written or signed, appends marks, field values and signatures as an exact
  incremental update and signs with a person's `.p12`. Before each write it is asked `canSaveIncrementally()`.
- A page-content edit is written by PDFium as a rewrite, which is what such an edit is to a signature anyway (F8).
- Against: two libraries behind the interface, 1.9 MB in all; LibPDF is a beta (0.5) from one company.

## Recommendation

**D**, behind one narrow interface of LiveDoc's own, so nothing outside the package names either library.

- Real editing (C2) decides for PDFium: it is the only candidate that edits a page's own text, and its regenerated
  pages hold on 87 of 88 corpus pages.
- Signing (C4) and "never rewrite what a change does not touch" decide for LibPDF as the writer of Reviewing's
  changes: 543 bytes against 107 KB for one highlight, and an earlier signature stays valid.
- An unchanged PDF is never passed through an engine: Download hands out the stored bytes
  ([Saving](saving.md)).
- EmbedPDF's engine layer (`@embedpdf/engines`, MIT, 61 KB) already types what Reviewing needs of PDFium (pages,
  tiles, text runs, marks, field values, bookmarks, attachments, redaction, signatures read): Phase 4's tracer
  bullet decides between it and the raw C API (verified: its `PdfEngine` interface; not yet run).
- **Risks, and what stands behind each**: EmbedPDF's build stops (PDFium is BSD-3-Clause and Apache-2.0 and can be
  built for the web from source; the 138 added functions would be lost or rebuilt); LibPDF's interface changes or
  stalls (the own-writer spike shows an incremental writer is small once a parser exists, and `@cantoo/pdf-lib`
  2.11.1, MIT, is maintained); a regenerated page differs (the before-and-after guard above).
- PDFium's binary carries other works (FreeType, OpenJPEG, libjpeg-turbo, zlib, Little CMS and more: assumed from
  PDFium's `third_party` folder, to be read from the build in Phase 5) and needs its embedded-works row.

## Spikes

Kept beside the plan, never committed: `plans/assets/0022/spikes/` (`a-open-all`, `a-change`, `b-open-all`,
`b-change`, `c-render-compare`, `d-signed-chain`, `e-content-roundtrip`, `f-browser`, `g-own`, `worker/`), their
output in `out/`.
