# Spreadsheet performance

**Status: specified.** Budgets are set by the tracer bullet (plan 0020, Phase 4) and written here then.

## What is measured

- **Load**: opening a spreadsheet to its first cells drawn, for an empty one, a 50,000-cell one and one at the limit.
- **Typing**: a keystroke in a cell to its paint; a value saved to every dependent drawn.
- **Scrolling**: frames while wheel-scrolling and jumping (Ctrl+End) at the limit.
- **Recalculation**: a one-cell change at the top of a long chain; a full recalculation; on a 4× slowed CPU too.
- **Memory**: the browser heap with the limit's workbook open.
- **Bundle**: the spreadsheet's code and engine, loaded only when a spreadsheet opens, against
  [Web performance](../016-platform/web-performance.md).

## Where it starts (2026-11-18, the Plan Sheet)

- A 50,000-cell Sheet tab: 5.7 s to its first values (seeded through the api), 60 fps scrolling, 73 MB of heap;
  the engine evaluates 50,000 cells in about 250 ms and holds about 350 bytes a cell (verified, measured;
  [Recalculation research](../../research/sheets-open-standard/recalculation.md)).

## Rules

- A spreadsheet costs nothing to every other document: its code and engine load on first open.
- Recalculation runs off the main thread; the grid never waits on it, showing a cell's last value until its new one
  arrives.
- Only the cells in view and a screen around them are drawn, and fetched first.
