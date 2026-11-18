# Sheets on an open standard

Follow the references below only as needed; never upfront.

Research for making the spreadsheet a document type of its own, native to an open standard, looking and working
as Google Sheets does. Gathered 2026-11-18; each claim is tagged verified (how), inferred (from what) or assumed.
The specs in `docs/specs/029-sheets/` state what the product does; this folder records why.

## Decisions and recommendations

| Question                                 | Recommendation                                                                                                                                                                                                 | Why, in a line                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The standard (C1)                        | **Ruled: ODF 1.4 and XLSX both native; a file keeps the format it arrived in** (the research had recommended ODF alone)                                                                                        | One live model both map onto; formulas in each file's own syntax; each file validated against its own schema   |
| Functions a format lacks                 | ODF: as LibreOffice writes them (`COM.MICROSOFT.*`, `ORG.LIBREOFFICE.*`); XLSX: as Excel names them; the 52 Google-only names by a convention per format (S5)                                                  | Other applications recalculate what they know and show the cached value for the rest                           |
| Google against OpenFormula or Excel (S6) | Google's meaning in the grid; each file names the function whose meaning matches in its format                                                                                                                 | The request is Google's behaviour; each file stays honest                                                      |
| Workbook shape (S1)                      | One tab holds the workbook                                                                                                                                                                                     | The shape every file document already has; one tab, one file                                                   |
| Engine                                   | Extend `@livedoc/sheets`                                                                                                                                                                                       | No candidate is free of copyleft and paid tiers and on Google's semantics; ours holds the ids, writes and undo |
| Recalculation                            | A compact columnar store, then a Web Worker, then iterative calculation                                                                                                                                        | 350 bytes a cell today; 20 million cells need about 25                                                         |
| Grid                                     | Keep the windowed DOM grid                                                                                                                                                                                     | Smooth and accessible today; Google's look needs no canvas                                                     |
| Storage                                  | A row per cell, styles in a table, layout in its own table past a size                                                                                                                                         | Inside a Durable Object's 10 GB and 8 MB row                                                                   |
| Charts                                   | The workbook's own objects, drawn by the canvas's chart code as a pure function                                                                                                                                | One to one with the file; no canvas in a workbook tab                                                          |
| Pivot tables                             | A pivot model evaluated into a read-only region; a data pilot in the file                                                                                                                                      | Not built today                                                                                                |
| Fetching functions (S4)                  | A Worker with guards, optional when self-hosted; `IMPORTRANGE` between LiveDoc documents                                                                                                                       | Parity without exposing viewers or private addresses                                                           |
| Google services (C3)                     | **Ruled: left out**: scripting, macros, add-ons, any assistant, smart chips, `GOOGLEFINANCE`, `GOOGLETRANSLATE`, data connectors, AppSheet; `DETECTLANGUAGE` joins the list of rows that could read either way | Core only                                                                                                      |
| File libraries                           | Our own readers and writers over the repo's zip code and `saxes`, in 0019's shared package                                                                                                                     | Small, Web-API only, Workers-safe                                                                              |
| Security                                 | Every case in [security](security.md) a test with a named rejection                                                                                                                                            | Imports and fetches are untrusted                                                                              |

## Forks found

- **S5** The convention for Google-only functions, per format: in XLSX, Google's own `__xludf.DUMMYFUNCTION` wrapping ; in ODF, `ORG.LIVEDOC.*`; both with the cached value. **Ruled 2026-11-18.**
- **S6** Which wins where Google Sheets differs from OpenFormula or Excel: Google's meaning. **Ruled 2026-11-18.**
- **S7** The grid's limit: Google's current 20 million cells ([inventory](google-sheets-inventory.md#limits)). **Ruled 2026-11-18.**

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
