# Recalculation at scale

Follow the references below only as needed; never upfront.

How values are worked out for a workbook at Google's limit (20 million cells). Researched 2026-11-18.

## Where it stands

- `Workbook` (`packages/sheets/src/engine/workbook.ts`) evaluates lazily on read and caches; a change forgets the
  cells that read it (a reverse dependency map, `engine/dependencies.ts`) and the volatile ones; deep chains are
  settled iteratively past depth 250; budgets cap a recalculation at 5,000,000 reads (verified, read).
- It runs on the main thread, built in `sheet-store-client.ts` (verified, read). There is no iterative calculation:
  a cycle is `#REF!` (`formulas.md`, verified).
- Held cost about 350 bytes a cell; 1 million cells evaluate in about a second (verified, measured).

## Designs

| Concern               | A. Today's engine, moved to a Worker, on a compact store                                                                                                                                                                                                                                     | B. A new engine on a columnar store with a topological schedule                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Memory                | Values in typed columns per sheet (a `Float64Array` of numbers, a kind byte, an index into strings), formulas as compiled ASTs shared by identical relative shapes (a filled-down column holds one AST) (inferred: shared formulas are what ODF's and OOXML's own shared formula forms save) | The same store                                                                                                                    |
| Order                 | Lazy pull, as now: reads only what the viewport and dependents need                                                                                                                                                                                                                          | Push: a topological order computed once, recomputed on structure changes; Kahn's algorithm finds cycles for iterative calculation |
| Off the main thread   | A dedicated Worker holds the workbook; the grid asks for the viewport's values and gets them in batches; edits post diffs (inferred)                                                                                                                                                         | Same                                                                                                                              |
| Iterative calculation | Cycles detected (Tarjan), each strongly connected component iterated to Google's settings (max iterations, threshold)                                                                                                                                                                        | Native to the order                                                                                                               |
| Volatile              | `NOW`, `TODAY`, `RAND`, `RANDBETWEEN`, `OFFSET`, `INDIRECT` marked, recomputed per Google's recalculation setting (on change, every minute, every hour)                                                                                                                                      | Same                                                                                                                              |
| Spills                | Today's spill shape, kept                                                                                                                                                                                                                                                                    | Same                                                                                                                              |
| Risk                  | Incremental: the 157 functions and their tests stay                                                                                                                                                                                                                                          | A rewrite of a working engine                                                                                                     |

## Recommendation

**A**, in steps: the compact store first (it alone brings 20 million cells within a browser's memory: about 25 bytes
a number cell instead of 350, inferred from typed arrays), then the Worker, then iteration. Budgets are set in
Phase 4 from the tracer bullet and held by `perf.test.ts` at the new sizes.
