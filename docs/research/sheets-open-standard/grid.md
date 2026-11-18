# The grid at scale

Follow the references below only as needed; never upfront.

How the grid draws 20 million cells and 18,278 columns, and stays accessible. Researched 2026-11-18.

## Where it stands

- A React DOM grid in four regions (frozen corner, frozen rows, frozen columns, body), each drawing only its window
  (`SheetCells.tsx`, verified, read). A 50,000-cell Sheet tab scrolls at 60 fps on this laptop (verified, measured).
- Google Sheets draws its grid on a `<canvas>` with an off-screen accessible layer for screen readers (assumed:
  from its behaviour with a screen reader turned on in Tools > Accessibility).

## Designs

| Concern                  | A. Windowed DOM, as now                                                                                                                                                 | B. Canvas with an accessible mirror                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Cells in view            | About 30 rows × 15 columns at 100% (450 cells); at 50% zoom four times that: cheap for the DOM (inferred)                                                               | Same drawing work, no nodes                                                    |
| Scroll at 18,278 columns | Positions by prefix sums of sizes (a Fenwick tree for 1M rows, inferred); unchanged in kind                                                                             | Same                                                                           |
| Text fidelity            | The browser's own shaping, wrapping, fonts and selection of text                                                                                                        | Canvas text measured and wrapped by hand; rich text and right-to-left are work |
| Accessibility            | Native: `role="grid"`, cells as `gridcell`, the browser's own focus                                                                                                     | A mirror of the visible cells in the DOM; two trees to keep in step            |
| Overlays                 | Charts, images, chips and the cell editor sit in the same DOM                                                                                                           | Overlays over a canvas; hit testing by hand                                    |
| Known ceiling            | Browsers cap an element's size near 33.5 million px in Chromium (assumed): 1 million rows × 21 px is 21 million px, inside it; virtual scroll offsets past it if needed | No ceiling on drawing; the scroll bar is still an element                      |

## Recommendation

**A**: keep the windowed DOM grid, with positions by prefix sums and a virtual scroll offset past the browser's
element ceiling. It is already smooth, already accessible, and Google's look does not need a canvas. Phase 17
proves it at the limit; a canvas is reconsidered only if that proof fails.
