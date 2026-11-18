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

## Rules

- A spreadsheet costs nothing to every other document: its code and engine load on first open.
- Recalculation runs off the main thread; the grid never waits on it, showing a cell's last value until its new one
  arrives.
- Only the cells in view and a screen around them are drawn, and fetched first.
