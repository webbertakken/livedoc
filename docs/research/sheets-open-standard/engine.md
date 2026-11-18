# The engine: extend `@livedoc/sheets` or adopt one

Follow the references below only as needed; never upfront.

Researched 2026-11-18. Licences from each repository's licence file or npm (verified), sizes from npm (verified).

## What is there

`@livedoc/sheets`: about 15,800 lines of TypeScript, MIT as the repo, with a parser, stored formulas by row and
column ids, a lazily evaluating `Workbook` with a dependency map, spills, volatile functions, 157 functions in 10
families, criteria, number formats and format codes, CSV, validation and format rules, and 47 test files
(verified, read). It evaluates 50,000 cells with 20,000 formulas in about 250 ms and holds about 350 bytes a cell
(verified, measured 2026-11-18 by a Node script over `Workbook`, `--expose-gc`).

| Cells (¼ formulas) | Build    | Evaluate all | Heap   |
| ------------------ | -------- | ------------ | ------ |
| 50,000             | 36 ms    | 52 ms        | 28 MB  |
| 1,000,000          | 766 ms   | 1,076 ms     | 316 MB |
| 2,600,000          | 2,155 ms | 3,355 ms     | 920 MB |

## The candidates

| Engine                                  | Licence                                               | Weight                                              | Fit                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HyperFormula 3.5                        | GPL-3.0-only or proprietary (verified, `LICENSE.txt`) | 14 MB unpacked                                      | **Ruled out**: copyleft in an MIT core, or a paid licence; both break the hard constraints                                                                               |
| IronCalc 0.9 (Rust to WebAssembly)      | MIT or Apache-2.0 (verified)                          | 2.0 MB `.wasm`, 718 KB gzipped (verified, measured) | Open and capable, Excel's semantics, XLSX only (no ODS in its typings, verified); a second model beside ours, pre-1.0; its functions would still need Google's semantics |
| Univer (`@univerjs/engine-formula` 1.5) | Apache-2.0 core (verified)                            | 41 MB unpacked (verified)                           | A whole suite with its own model and renderer; parts such as XLSX exchange and pivots sit in a paid tier (assumed, from its site; to confirm before any use)             |
| Formula.js 4.6                          | MIT (verified)                                        | 2.4 MB unpacked                                     | Functions only, Excel semantics: a reference to compare against, not an engine                                                                                           |
| fast-formula-parser 1.0                 | MIT (verified)                                        | 0.6 MB                                              | A parser and some functions; last pushed 2025-09 (verified)                                                                                                              |
| LibreOffice in WebAssembly              | MPL-2.0 (assumed)                                     | Tens of MB (assumed)                                | The reference evaluator for the oracle, run headless in CI, never shipped in the browser                                                                                 |

## Recommendation

**Extend `@livedoc/sheets`.** It already holds the ids, writes, undo and room model the rest of LiveDoc depends on;
no candidate is both free of copyleft and paid tiers and built on Google's semantics. What it lacks is built in it,
in the order the plan's phases give: a compact cell store for scale ([recalculation](recalculation.md)), OpenFormula
syntax at the file boundary, the 363 missing functions measured against an oracle (LibreOffice headless for
OpenFormula, Google's exported cached values for Google's semantics), and a Web Worker home. Formula.js and IronCalc
serve as cross-checks in tests where their licences allow (both permissive), never as runtime dependencies.
