# Spreadsheet performance

**Status: specified; budgets set by the tracer bullet** (plan 0020, Phase 4). The budgets below hold for what is built;
each later area keeps to them, and the limit's workbook (S7) is measured against them when the model and grid reach it.

## Budgets

| Measure                                                | Budget                                                                                      | Measured (tracer)                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Keystroke to paint in a cell, here (Event Timing)      | p95 of keystrokes within 24 ms; none past 100 ms                                            | p95 16 to 24 ms; max 24 to 88 ms over 4 runs     |
| A value saved to a peer's screen, local stack          | p95 under 100 ms                                                                            | p50 31 to 39 ms, p95 38 to 49 ms                 |
| Opening, local stack, unthrottled                      | Surface ready p50 under 1,000 ms; LCP under 2.5 s                                           | Ready p50 456 to 496 ms; LCP 428 to 500 ms       |
| Opening, 4x CPU, 4 Mbit/s, 100 ms                      | Within 5% of a canvas document opened the same way                                          | 15.3 to 15.8 s; a canvas document 15.2 to 15.6 s |
| Layout shift while opening                             | CLS under 0.1                                                                               | 0 unthrottled; 0.005 throttled                   |
| The surface's own code                                 | Under 16 KiB gzipped, loaded only with a spreadsheet                                        | 6 KiB                                            |
| The file mapping (`@livedoc/sheets/files` and its XML) | Under 24 KiB gzipped, loaded only for File › Open                                           | 11 KiB                                           |
| The document route's first load                        | Within its budget in `apps/live/first-load-budget.json`; the engine and mapping never in it | 1,534 KiB of 1,536                               |

The throttled open is the editor's own: a spreadsheet still loads the canvas editor around its surface, and its largest
paint comes a step later (14.0 s against 11.6 s) because the surface's chunk follows the editor's.
[Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md) takes the canvas out of a spreadsheet's load;
the opening budgets are tightened in that change.

## What is measured

- **Load**: opening a spreadsheet to its first cells drawn, for an empty one, a 50,000-cell one and one at the limit.
- **Typing**: a keystroke in a cell to its paint; a value saved to every dependent drawn.
- **Scrolling**: frames while wheel-scrolling and jumping (Ctrl+End) at the limit.
- **Recalculation**: a one-cell change at the top of a long chain; a full recalculation; on a 4× slowed CPU too.
- **Memory**: the browser heap with the limit's workbook open.
- **Bundle**: the spreadsheet's code and engine, loaded only when a spreadsheet opens, against
  [Web performance](../016-platform/web-performance.md).

## How it is measured

- The production build on the e2e stack (`scripts/e2e-stack.mjs`), Chromium, dark, 1280 by 860.
- **Here**: Event Timing entries of 16 ms or more for `keydown` and `keypress` over 60 keystrokes 40 ms apart, typed into
  one cell after selecting it in the Name box.
- **To a peer**: a second browser on an edit link; the time from each of 30 values' Enter until a mutation observer on
  the peer's grid sees the value.
- **Opening**: five fresh browser contexts opening the spreadsheet by its share link until the surface reports ready
  (`data-spreadsheet-surface="ready"`), then the largest contentful paint and the layout shift; the throttled open once
  each for a spreadsheet and a blank canvas document.
- **Code**: the gzipped chunks of the export holding the surface and the file mapping, and
  `node scripts/first-load.mjs live`.
- Measured 2026-11-18 on the developer workstation (assumed representative of a recent laptop, not of a phone).

## Where it starts (2026-11-18, the Plan Sheet)

- A 50,000-cell Sheet tab: 5.7 s to its first values (seeded through the api), 60 fps scrolling, 73 MB of heap;
  the engine evaluates 50,000 cells in about 250 ms and holds about 350 bytes a cell (verified, measured;
  [Recalculation research](../../research/sheets-open-standard/recalculation.md)).
- Before the compact store, a number cell held about 150 bytes and a formula cell about 400 in the sheet's Map, and
  the engine about 770 more for each formula worked out (verified, measured in Node at 200,000 cells).

## Held in memory

A sheet's cells live in a compact store, the same in the editor, the api and the MCP worker (default):

- **Typed columns**: each filled cell is a slot holding its kind, its number, its style and its row and column, in
  typed arrays; text is held as strings beside them, and a formula as integers in its page (its shape, then its
  references' ids), or as given when a reference names another sheet or keeps positions.
- **Interned**: row and column ids, styles and formula texts are held once each, however many cells name them.
- **Copy on write by pages**: a sheet's next version shares every page of 4,096 slots with the one before but those
  its write touched, so a write costs the same at 50 cells as at 20 million, and undo keeps the version before.
- **Formulas shared by shape**: a formula's shape is its text with each reference taken out; formulas of one shape
  are parsed once, so a filled-down column holds one parse.
- **The order kept**: cells read back in the order they were first written, as before.

| Measure (1 million cells, 100,000 rows of 10 columns)   | Budget             | Measured (Node, 2026-11-18) |
| ------------------------------------------------------- | ------------------ | --------------------------- |
| Held a number cell, in the store                        | 60 bytes           | 46 bytes                    |
| Held a filled-down formula cell of up to two references | 120 bytes          | 76 bytes                    |
| One cell written into the next version of the sheet     | Under 1 ms of CPU  | 30 µs                       |
| Loading the cells from their stored rows                | Under 1.5 s of CPU | 0.7 s                       |

In the room, a cell write reads of a sheet's order only the rows it names, the first and last rows of the sheet's
validation rules and its first row, found by SQLite in the stored chunks, never the whole order (default): which rows
exist and how they lie against one another is all a cell write asks of it. A change of rows or columns still reads
the order it changes.

| Measure (a sheet of 1,000,000 rows, in the room on node:sqlite) | Budget      | Before         | Measured (2026-11-19) |
| --------------------------------------------------------------- | ----------- | -------------- | --------------------- |
| A one-cell write, start to answer                               | Under 50 ms | 180 to 240 ms  | 7 to 14 ms            |
| Memory a one-cell write holds while it runs                     | Under 5 MB  | About 100 MB   | Under 1 MB            |
| A write of 5,000 cells (one write's most), start to answer      | Under 1 s   | (not measured) | 160 ms, 15 MB         |

`apps/api/src/db/sheet-cell-head.test.ts` holds the read (a cell write never reads its rows' order whole); the times
are measured, not held, as CPU budgets bend under CI coverage.

Measured in Node, whose pointers are 8 bytes; a browser's are 4, so a page holds less (inferred).
`packages/sheets/src/cells/cell-map.perf.test.ts` holds the bytes and the write (the write at four times in CI); the load is
held as growth, ten times the cells under thirty times the time, as coverage on a CI runner bends an absolute budget.

The engine's own values and dependencies are measured apart, and come down with the recalculation engine
([Recalculation research](../../research/sheets-open-standard/recalculation.md)).

## Rules

- A spreadsheet costs nothing to every other document: its code and engine load on first open.
- Recalculation runs off the main thread; the grid never waits on it, showing a cell's last value until its new one
  arrives.
- Only the cells in view and a screen around them are drawn, and fetched first.
