# File libraries

Follow the references below only as needed; never upfront.

What reads and writes ODS, XLSX, CSV, TSV, PDF and HTML, in the browser and in Workers. Researched 2026-11-18;
licences and sizes from npm (verified).

## What the repo has

- `packages/office-packages/src/zip/zip-reader.ts`: reads stored and deflated Zip entries through `DecompressionStream('deflate-raw')`,
  every offset bounds-checked, under a byte budget shared by the whole import (a zip-bomb guard); `zip-writer.ts`
  writes stored entries with CRC-32 (verified, read). Both are browser-safe and Web-API only, so they run in Workers
  too (inferred: `DecompressionStream` is a Workers API).
- CSV and TSV in `packages/sheets/src/csv.ts` with separator detection and formula-injection-safe downloads
  (verified, `sheet.md` "CSV").

## Candidates

| Need | Candidate                                                         | Licence    | Weight          | Fit                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------- | ---------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zip  | The repo's own reader and writer                                  | MIT (repo) | none            | Writing needs deflate (an `.ods` may store `content.xml` deflated or stored; `mimetype` must be first and stored, inferred from Part 2): `CompressionStream('deflate-raw')` adds it |
| Zip  | fflate 0.8                                                        | MIT        | 0.8 MB unpacked | Fast, but a dependency for what Web APIs already do                                                                                                                                 |
| XML  | `saxes` 6                                                         | ISC        | 164 KB          | A streaming parser: right for 20-million-cell files; no DOM in Workers                                                                                                              |
| XML  | fast-xml-parser 5                                                 | MIT        | 1.3 MB          | Whole-tree; memory heavy on large `content.xml`                                                                                                                                     |
| XML  | `@xmldom/xmldom` 0.9                                              | MIT        | 440 KB          | A DOM in Workers; whole-tree                                                                                                                                                        |
| XLSX | SheetJS (`xlsx` on npm 0.18.5)                                    | Apache-2.0 | 7.5 MB          | npm's copy is frozen at 0.18.5 (2022) and newer builds ship from SheetJS's own CDN (assumed: its README; the GitHub mirror was last pushed 2024-04-18, verified)                    |
| XLSX | ExcelJS 4.4                                                       | MIT        | 22 MB           | Node streams at heart; heavy for a browser (inferred)                                                                                                                               |
| XLSX | Our own SpreadsheetML reader and writer over the same zip and XML | MIT        | small           | The parts needed are few: workbook, sheets, shared strings, styles, defined names, charts, comments (inferred)                                                                      |
| PDF  | The browser's print to PDF from a print view                      | none       | none            | Google's "Download PDF" is a rendered print; a static print view with `@page` rules matches it (inferred)                                                                           |
| HTML | Our own writer (one table per sheet, zipped as Google does)       | MIT        | small           |                                                                                                                                                                                     |

## Recommendation

- One shared package owns zip and the XML stream (0019's "standard's package"): move the zip reader and writer
  there, add deflate through `CompressionStream`, and adopt **`saxes`** for streaming XML (ISC, small, runs in
  Workers). This is 0019's to rule as the package's owner; this plan proposes it there.
- ODS, XLSX, CSV, TSV and HTML: our own readers and writers over it. PDF: a print view, printed by the browser.
- No SheetJS (its npm line is frozen; its current builds come from outside npm) and no ExcelJS (weight).
