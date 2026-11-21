# The standard, and what "any PDF" is in the wild

What a PDF is by its standards, and what arrives in practice. Researched November 2026.

## The documents

| Standard                           | Is                                                                             | Where                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ISO 32000-2:2020 (PDF 2.0)         | The current core specification                                                 | At no cost from the PDF Association, with its errata and ISO/TS 32001 and 32002 (verified: pdfa.org/resource/iso-32000-2) |
| ISO 32000-1:2008 (PDF 1.7)         | What most files in the wild are written to                                     | Adobe's public copy (assumed)                                                                                             |
| ISO 19005-1 to -4 (PDF/A)          | Archiving: self-contained, no encryption, fonts embedded; part 4 is on PDF 2.0 | iso.org/standard/71832.html for part 4 (verified)                                                                         |
| ISO 14289-1 and -2 (PDF/UA)        | Accessibility: tagged, a logical reading order; part 2 (2024) is on PDF 2.0    | iso.org/standard/82278.html for part 2 (verified)                                                                         |
| ETSI EN 319 142-1 (PAdES baseline) | Signatures in a PDF: levels B-B, B-T, B-LT and B-LTA                           | etsi.org, V1.2.1 (verified: its Table 1 names the four levels)                                                            |

"Claiming conformance to PDF/UA-2 or PDF/A-4 is invalid for PDF 1.x documents" (verified: the PDF Association's
best practice guide), so a file's version bounds what it may claim.

## What the design leans on

Each is how the format works; the tag says how this research knows.

- **A file is objects, a cross-reference and a trailer**, read from the end. A change may be **appended** as a new
  section with its own cross-reference and trailer pointing at the one before, leaving every earlier byte in place:
  an **incremental update** (verified: every incremental save a spike made keeps the arriving bytes as a prefix and
  passes `qpdf --check`).
- **A signature covers a byte range** of the file as it stood when signed, so appending keeps it valid and rewriting
  breaks it (verified: PDFium reads each signature's byte range; poppler's `pdfsig` calls a signature valid after an
  incremental highlight and unverifiable after a rewrite).
- **Since PDF 1.5 the cross-reference and most objects may be compressed streams** (verified: 32 of the corpus's 112
  files cannot be read without them), so no reader can be a text scanner.
- **What sits on top of a page** is separate from the page's content: annotations in the page's `Annots`, interactive
  fields in the document's `AcroForm`, signatures as fields (verified: a highlight is one new object and one changed
  page dictionary, about 400 bytes). This is the line between Reviewing and Editing.
- **A page's content** is a stream of drawing operators with its fonts and pictures as resources; text is glyph
  codes in a font's own encoding, not characters (verified: PDFium's `FPDFText_SetText` re-encodes; a page
  regenerated draws the same on 87 of 88 corpus pages).
- **Encryption** is the standard security handler in revisions 2 to 6 (RC4 40 and 128 bit, AES-128, AES-256), an
  open ("user") password and a permissions ("owner") password (verified: the corpus's five revisions, and files
  made here with qpdf at 256 bits). Permissions are a request to the reader, not a lock: a file opened without the
  owner password is fully readable (verified: the locked derived file opens and draws in every reader).
- **Linearisation** orders a file so its first page can be shown before the rest arrives (verified: `qpdf
--linearize` makes one; every reader opens it). An incremental update leaves a file no longer linearised
  (assumed: ISO 32000-2 Annex F).
- **XFA** forms are deprecated in PDF 2.0 (assumed: ISO 32000-2's list of deprecated features); PDF.js draws them
  only when asked (`enableXfa`), PDFium's public build shows their static fallback (inferred: the spikes drew XFA
  files' first pages alike in both, with XFA off).
- **Scripts**: a file may carry JavaScript on the document, a page, a field or a mark (verified: the corpus's
  `actions` and `fields` groups; EmbedPDF's engine lists them without running them).

## In the wild

Measured on the corpus (verified by the spikes unless tagged):

- **Versions**: of the 102 files poppler reads, PDF 1.7 is 53, 1.5 is 16, 1.4 is 12, 1.6 is 10, 2.0 is 6, 1.3 is 4
  and 1.2 is 1. A test corpus is not the web: surveys of crawled PDFs put 1.4 to 1.7 at the large majority
  (assumed: the PDF Association's corpus reports, not re-read here).
- **Damage** is ordinary. Of 11 damaged or fuzzed files, PDFium opens 8 and PDF.js 8; both rebuild a
  cross-reference whose `startxref` is spoiled; neither opens a file truncated before its compressed
  cross-reference. A decompression bomb (`bomb_giant.pdf`) opens in both without exhausting memory at 72 dpi.
- **A password** is asked for by six files; a seventh encrypts only its attachments, which PDFium and poppler open
  and PDF.js asks a password for.
- **New filters arrive**: the Brotli prototype opens only in PDF.js 6.5; PDFium reads it as a file with no pages.
  "Any PDF" is a moving target, and the named refusal must say "a newer kind of PDF" rather than "damaged".
- **Features to expect and name**: forms (AcroForm and XFA), signatures, layers, attachments, portfolios
  (collections), rich media, 3D, geospatial pages, article threads, page labels, page transitions, output intents
  (assumed: ISO 32000-2's table of contents). Phase 3's parity matrix gives each a row: shown, kept untouched, or
  refused.

## What LiveDoc claims, proposed for the spec

- It **opens** PDF 1.0 to 2.0 and says which of the named refusals applies when it cannot.
- It **writes** in the file's own version, raising it only when a change needs a newer feature, and says so.
- It **keeps what it does not understand**: an incremental update never touches it, and a rewrite carries it across.
- It **never claims** PDF/A or PDF/UA for a file it changed: a conformance mark that no longer holds is removed with
  a notice, and a validator (veraPDF) is the judge in tests
  ([The corpus and the validators](corpus-and-validators.md)).
