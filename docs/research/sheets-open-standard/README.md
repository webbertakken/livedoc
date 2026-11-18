# Sheets on an open standard

Follow the references below only as needed; never upfront.

Research for making the spreadsheet a document type of its own, native to an open standard, looking and working
as Google Sheets does. Gathered 2026-11-18; each claim is tagged verified (how), inferred (from what) or assumed.
The specs in `docs/specs/029-sheets/` state what the product does; this folder records why.

## Decisions and recommendations

| Question                     | Recommendation                                                                                                                                             | Why, in a line                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The standard (C1)            | ODF 1.4 spreadsheets, OpenFormula stored, flat `.fods` for repositories; XLSX in and out                                                                   | The open standard by name, a formula language written down, a single-file text form; Excel and LibreOffice both write ODF 1.4 |
| Functions beyond OpenFormula | Written as LibreOffice writes them (`COM.MICROSOFT.*`, `ORG.LIBREOFFICE.*`); the 52 Google-only names under a LiveDoc namespace, always with cached values | Other applications recalculate what they know and show the value for the rest                                                 |
| Google against OpenFormula   | Google's meaning in the grid; the file names the function whose meaning matches                                                                            | The request is Google's behaviour; the file stays honest                                                                      |
| Workbook shape (S1)          | One tab holds the workbook                                                                                                                                 | The shape every file document already has; one tab, one file                                                                  |
| Engine                       | Extend `@livedoc/sheets`                                                                                                                                   | No candidate is free of copyleft and paid tiers and on Google's semantics; ours holds the ids, writes and undo                |
| Recalculation                | A compact columnar store, then a Web Worker, then iterative calculation                                                                                    | 350 bytes a cell today; 20 million cells need about 25                                                                        |
| Grid                         | Keep the windowed DOM grid                                                                                                                                 | Smooth and accessible today; Google's look needs no canvas                                                                    |
| Storage                      | A row per cell, styles in a table, layout in its own table past a size                                                                                     | Inside a Durable Object's 10 GB and 8 MB row                                                                                  |
| Charts                       | The workbook's own objects, drawn by the canvas's chart code as a pure function                                                                            | One to one with the file; no canvas in a workbook tab                                                                         |
| Pivot tables                 | A pivot model evaluated into a read-only region; a data pilot in the file                                                                                  | Not built today                                                                                                               |
| Fetching functions (S4)      | A Worker with guards, optional when self-hosted; `IMPORTRANGE` between LiveDoc documents                                                                   | Parity without exposing viewers or private addresses                                                                          |
| Google services (C3)         | `DETECTLANGUAGE` built in; `GOOGLEFINANCE` and `GOOGLETRANSLATE` left out unless a source is named                                                         | No free, keyless, licence-clean source                                                                                        |
| File libraries               | Our own readers and writers over the repo's zip code and `saxes`, in 0019's shared package                                                                 | Small, Web-API only, Workers-safe                                                                                             |
| Security                     | Every case in [security](security.md) a test with a named rejection                                                                                        | Imports and fetches are untrusted                                                                                             |

## Forks found

- **S5** The namespace for Google-only functions inside the file: `ORG.LIVEDOC.*` or `COM.GOOGLE.*`.
- **S6** Which wins where Google Sheets and OpenFormula differ: Google's meaning (proposed) or OpenFormula's.
- **S7** The grid's limit: Google's current 20 million cells (proposed, [inventory](google-sheets-inventory.md#limits)), or the plan's ten million.

## Files

- ./standard.md - when choosing or defending the file format and formula language (C1)
- ./google-sheets-inventory.md - when listing Google Sheets' menus, toolbar, context menus, panels, dialogs, chips, limits and shortcuts
- ./function-catalogue.md - when checking a function's name across Google Sheets, OpenFormula, LibreOffice's file names and LiveDoc
- ./reference-captures.md - when checking which pictures of Google Sheets the parity matrix is walked against
- ./workbook-shape.md - when deciding where a spreadsheet's sheets live (S1)
- ./engine.md - when weighing building the engine against adopting one
- ./recalculation.md - when working on recalculation at scale: memory, order, Workers, iteration
- ./grid.md - when working on drawing the grid at scale and its accessibility
- ./storage.md - when working on how cells are stored in the room
- ./charts-and-pivots.md - when working on charts or pivot tables
- ./fetching-functions.md - when working on functions that fetch or call a service (S4, C3)
- ./file-libraries.md - when choosing how ODS, XLSX, CSV, TSV, PDF and HTML are read and written
- ./security.md - when hardening imports, exports and fetches
