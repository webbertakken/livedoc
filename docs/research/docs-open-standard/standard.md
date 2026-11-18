# The standard: ODF text against OOXML WordprocessingML

Which ISO word-processing format a LiveDoc text document is native to: the model it holds and the file it leaves as.
Researched November 2026. Each claim is tagged **verified** (how), **inferred** (from what) or **assumed**.

## The two candidates

| Question              | ODF 1.4 text (`.odt`, flat `.fodt`)                                                                                                                                                                                                                                                                                                                                                                        | OOXML WordprocessingML (`.docx`)                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Standard              | OASIS Standard, 3 December 2025; ODF 1.2 is ISO/IEC 26300:2015 (verified: [OASIS](https://www.oasis-open.org/2025/12/03/oasis-approves-open-document-format-odf-v1-4-standard-marking-20-years-of-interoperable-document-innovation/), [TDF book](https://books.libreoffice.org/en/GS262/GS26215-OpenSourcesStandardsDoc.html))                                                                            | ISO/IEC 29500 (Strict and Transitional); ECMA-376 (assumed, widely known)                                                     |
| Who governs it        | OASIS OpenDocument TC, vendor-neutral, royalty-free (verified: OASIS release)                                                                                                                                                                                                                                                                                                                              | Ecma TC45 and ISO; Microsoft's applications write Transitional, not Strict (assumed, widely known)                            |
| Schema                | One RELAX NG schema, 610 KB, plus manifest and signature schemas (verified: downloaded from [schemas/](https://docs.oasis-open.org/office/OpenDocument/v1.4/os/schemas/))                                                                                                                                                                                                                                  | XSD sets per part; behaviour often defined by what Word does (assumed)                                                        |
| Flat single-file form | Yes: `office:document` in one `.fodt`, every style, picture (base64) and setting in one XML file (verified: LibreOffice 24.2 wrote one)                                                                                                                                                                                                                                                                    | No flat form in the standard; Word's "Flat OPC" (`.xml`) packs the parts into one XML file but is Word's, not ISO's (assumed) |
| Text model            | Paragraphs and headings (`text:p`, `text:h`) with spans; lists, sections, tables, frames; styles by name with inheritance (verified: schema)                                                                                                                                                                                                                                                               | Paragraphs (`w:p`) of runs (`w:r`); styles; sections as paragraph properties (assumed)                                        |
| Tracked changes       | `text:tracked-changes`, insertion, deletion, format change (verified: schema names `text:changed-region`)                                                                                                                                                                                                                                                                                                  | `w:ins`, `w:del`, `w:rPrChange` and more (assumed)                                                                            |
| Comments              | `office:annotation` with `office:annotation-end` and `office:name`; **no reply threading or resolved state in 1.4** (LibreOffice writes `loext:parent-name`, `loext:resolved`) (verified: neither name occurs in the 1.4 schema)                                                                                                                                                                           | `comments.xml`, threading in `commentsExtended.xml` (Word 2013+) (assumed)                                                    |
| Who opens it          | LibreOffice (native), Microsoft 365 (saves ODF 1.4 by default), Google Docs (opens and downloads `.odt`) (verified: [Microsoft 365 insider blog](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/microsoft-365-apps-now-support-opendocument-format-1-4/4226735) via search snippet; [Drive export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)) | Everything; the de facto exchange format (assumed)                                                                            |
| Diffs and `rg`        | `.fodt` is one XML file: `git diff` and `rg` read it as text (verified: `rg Hello t.fodt` finds the paragraph)                                                                                                                                                                                                                                                                                             | `.docx` is a zip; Flat OPC is text but non-standard (inferred)                                                                |

## What a real file says

- LibreOffice 24.2 (the version on Ubuntu 24.04 and on this machine) converts HTML to `.fodt` and `.odt` headless
  (verified: `soffice --headless --convert-to fodt`).
- It writes `office:version="1.3"` with `loext:` extensions, so its files fail the strict 1.4 schema
  (verified: `jing -i OpenDocument-v1.4-schema.rng t.fodt` reports the version and `loext:opacity`,
  `loext:num-list-format`). LibreOffice 25.2 and later read and write 1.4 (verified by search snippet,
  [LibreOffice 25.2](https://wiki.documentfoundation.org/ReleaseNotes/25.2)).
- Consequence (inferred): validation in CI must hold **our** output to the strict 1.4 schema, and read others' files
  as **extended conformance**: foreign elements and attributes kept, not rejected. The schema validates with
  [Jing](https://repo1.maven.org/maven2/org/relaxng/jing/) when ID-type checks are switched off (`-i`), as the ODF
  Toolkit's validator does (verified: without `-i` Jing refuses the 1.4 schema's ID patterns; with it, it validates).

## Coverage of the Google Docs inventory

Against [the inventory](google-docs-inventory.md), ODF text expresses (verified against the 1.4 schema's element
names, `rg` over the RNG):

- Text and paragraph formatting, paragraph styles, headings 1 to 10, lists (bulleted, numbered, multi-level, restart),
  checklists (no native checkbox list: LibreOffice uses a bullet character; inferred, no `checkbox` list element in
  the schema), borders, shading, keep with next, widows and orphans, line spacing, tab stops.
- Page layout: page styles (`style:page-layout`) with size, orientation, margins, background, columns, headers and
  footers (first, left, right), page numbers and counts as fields; sections; page, column breaks.
- Tables with merged cells, borders, shading, repeated header rows, rows that may not split.
- Footnotes and endnotes (`text:note`, by note class); bookmarks; links; table of contents; fields (date, page, author, title, user variables).
- Images and drawings as `draw:frame` with wrap and position; alternative text (`svg:title`, `svg:desc`);
  equations as embedded MathML objects.
- Tracked changes, comments with ranges, document metadata.
- Not expressed natively (inferred): Google's smart chips (people, dropdowns, places, timers), pageless layout,
  document tabs, comment replies and resolved state, emoji reactions on comments, assigned comments. Each needs an extension namespace or a mapping
  (see [recommendations](recommendations.md)).

## Tooling in browsers and Workers

- Both formats are zip packages of XML. Reading and writing them needs a zip library (fflate, MIT, 0.8.3) and an
  XML parser (saxes, ISC; fast-xml-parser, MIT) (verified: `npm view`). Neither is format-specific; both run in
  browsers and Workers (inferred: pure JavaScript, no Node APIs).
- DOCX has mature JavaScript libraries: `docx` (MIT, 9.15, writes) and `mammoth` (BSD-2, 1.13, reads to HTML, lossy
  by design) (verified: `npm view`). No maintained, permissively licensed JavaScript ODF library was found
  (inferred: WebODF is AGPL and unmaintained since 2016; the ODF Toolkit is Java).

## Finding

ODF 1.4 is the only ISO word-processing format with a vendor-neutral governor, a single schema, and a standard flat
form that git and `rg` read; Microsoft 365 now writes it by default. DOCX remains the exchange format most people hold,
so it must come in and go out faithfully. The model is ours to build either way: no permissive library owns either
format end to end in JavaScript.
