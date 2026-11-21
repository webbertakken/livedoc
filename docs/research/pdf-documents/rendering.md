# Rendering

How pages reach the screen: tiles, the text over them, many pages, deep zoom, phones and print. Researched November
2026; timings are from the engine spikes ([The engine](engine.md)).

## Drawing

| Design                            | How                                                                                                                | For                                                                                          | Against                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A. One canvas a page**          | Each visible page drawn whole at the zoom                                                                          | Simple; right up to about 200%                                                               | At 6400% a Letter page is 52,224 by 67,584 CSS pixels: 14 GB as RGBA, past any canvas                   |
| **B. Tiles from the engine**      | The engine's worker draws a rectangle of a page (`renderPageRect`) into a bitmap that is transferred, never copied | Memory is the screen's, at any zoom; a tile is cached, and redrawn alone when a mark changes | A tile cache to bound and to invalidate                                                                 |
| **C. Vector output (SVG or DOM)** | The page's operators replayed as SVG                                                                               | Sharp at any zoom for free                                                                   | No engine here writes it; fonts and blends differ from every reader; heavy pages are thousands of nodes |

**Recommended: B**, with A's whole-page bitmap as the first thing shown (a low-resolution page arrives in one draw,
tiles sharpen it). Tiles are `PDF_TILE_PX` square (a default of 512 CSS pixels, at the device's pixel ratio capped
at 2 on phones).

- The engine lives in a worker for two reasons: a hostile file never parses on the main thread, and a slow page
  (825 ms for 6 MB of plans, verified) never blocks scrolling or typing.
- Canvas limits to respect: 16,384 pixels a side and 268 million pixels in Chromium, less on iOS (assumed: the
  commonly cited figures, measured per browser in Phase 20).

## Many pages

- Pages are **virtualised**: only the pages near the viewport have canvases; the rest are boxes of the right size.
- Every page's size is needed for the scrollbar before anything is drawn. The engine reads all of them without
  loading a page (verified: `EPDF_GetPageSizeByIndexNormalized` is in the build; a 1,008-page file opens in 12.5 ms).
- Page 501 of 1,008 drew in 140 ms and the last in 19 ms (verified), so jumping far is as fast as scrolling near.

## Text over the page

The page is a picture. Selecting, searching, marking and reading aloud need its text as text.

| Design                             | How                                                                                  | For                                                                   | Against                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **A. Transparent text in the DOM** | A span per run, placed and scaled over its glyphs                                    | The browser's own selection, find and screen reader; what PDF.js does | Thousands of spans a page; browser selection jumps between columns |
| **B. Selection drawn by LiveDoc**  | The engine's glyph boxes hit-tested; the selection drawn as rectangles               | Follows the PDF's own text order; exact quads for a mark; cheap       | Nothing for a screen reader; copy and find are LiveDoc's own       |
| **C. Both**                        | B for the pointer and for marks; A's text, hidden from sight, as the accessible tree | Each does what it is good at                                          | Two structures from one source to keep in step                     |

**Recommended: C.** A mark needs B's quads anyway (a highlight is stored as quadrilaterals in page space), and
[Accessibility](accessibility.md) needs a real tree.

## Zoom

- 10% to 6400% (Acrobat's range, assumed: its zoom menu), fit width, fit page, actual size.
- A zoom gesture scales the tiles already there at once and redraws sharp ones behind them, so the pinch never waits
  for the engine.

## Memory

- The engine's memory is the file (or the ranges read of it, [Bytes](bytes.md)) plus what it has parsed: 18 MB for
  a 1 MB paper, 109 MB for a 93 MB file loaded whole (verified).
- Pages the person has left are closed in the engine; tiles are kept to a budget in bytes (`PDF_TILE_CACHE_BYTES`,
  a default of 128 MiB on desktop, 48 MiB on a phone: assumed, set from measurements in Phase 4).

## Print

- **Print** hands the browser the baked PDF itself, so the browser's own print path draws it at the printer's
  resolution (inferred: every desktop browser prints a PDF it is shown). Marks are in the bake or left out of it, as
  the person chose.
- Where a browser cannot print a PDF from a page (phones), pages are drawn at 150 dpi into a print-only document.
- Dark pages never reaches print: print takes the bake, which never passed through that step
  ([Dark pages](dark-pages.md)).
