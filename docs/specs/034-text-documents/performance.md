# Performance

**Status: specified.** The budgets below hold for what is built; each later area keeps to them.

How fast a [text document](text-document.md) opens and how fast typing reaches the screen and the other people on it,
and what it adds to what the editor downloads. Measured on the tracer bullet (plan 0019, Phase 4) and held to the
platform's [web performance](../016-platform/web-performance.md) rules.

## Budgets

| Measure                                                  | Budget                                                                                        | Measured                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| Keystroke to paint, here (Event Timing)                  | Every keystroke within one frame (16 ms); none past 50 ms                                     | Max 16 ms over 60 keystrokes     |
| Keystroke to a peer's screen, local stack                | p95 under 100 ms                                                                              | p50 6 ms, p95 10 ms              |
| Opening, local stack, unthrottled                        | Surface ready p50 under 1,000 ms; LCP under 2.5 s                                             | Ready p50 511 ms; LCP 416 ms     |
| Opening, 4x CPU, 4 Mbit/s, 100 ms                        | Never slower than a canvas document opened the same way                                       | 15.4 s; a canvas document 15.9 s |
| Layout shift while opening                               | CLS under 0.1                                                                                 | 0.005                            |
| The surface's own code (Yjs, y-prosemirror, the surface) | Under 48 KiB gzipped, loaded only with a text document tab                                    | 34 KiB                           |
| The document route's first load                          | Within its budget in `apps/live/first-load-budget.json`; Yjs and the file mapping never in it | 1,020 KiB of 1,060; no canvas    |

The throttled open above was measured while a text document still loaded the canvas editor around its surface.
[Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md) took the canvas out of its load (the route's
first load 1,368 to 1,020 KiB); its open must now fall well below a canvas document's, measured again with Phase 18's
300-page document.

## A 300-page document

The budgets of [Page layout](page-layout.md#performance) for a long document: 8,000 paragraphs (each two lines and an
empty one), 320 pages, 870,000 characters, typed into on page 158 and pasted into there.

| Measure                                        | Budget                                                              | Measured (load 5 to 8 of 28 cores)                     | Measured (load 12 to 45)                                |
| ---------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| Keystroke to paint, here (Event Timing)        | Three in four within one frame (16 ms); none past 50 ms `(default)` | 16 ms at the 75th percentile; slowest 32 to 40 ms      | 16 to 40 ms at the 75th percentile; slowest 32 to 80 ms |
| Pages laid out again after a keystroke         | Within the keystroke's frame                                        | 1 to 3 ms; 16 to 33 ms when the paragraph gains a line | 35 to 56 ms when the paragraph gains a line             |
| Pages laid out again after a paste of 10 pages | 100 ms                                                              | 13 to 26 ms                                            | 16 to 29 ms                                             |
| Opening the file (File > Open), laid out       | (none yet; Phase 18 sets it)                                        | 1.1 to 1.6 s                                           | 1.5 to 5 s                                              |

- Before the work of plan 0019 Phase 9 (box 5) every keystroke there took 16 ms or more, three in four 32 to 40 ms
  and the slowest 48 to 192 ms.
- A keystroke that gives its paragraph another line moves every later page start, so every later page's spacer is
  drawn again (159 of them): the one keystroke past a frame in most runs.
- That keystroke took 150 to 180 ms at times while a layout made a range per block measured: 8,000 live ranges after
  opening, each updated by every spacer added or taken away. Read through one range, it has not passed 60 ms since.
- Taken under load: the workstation is shared, and a run that waited for a quiet machine saw the load rise during it.
  The budget of none past 50 ms is met at load 5 to 8 and missed by one keystroke a run (80 ms) at load 12 and above;
  a measurement on a quiet workstation is still to be recorded (plan 0019).
- Measured with `apps/live/e2e/perf/text-document.perf.ts` (`E2E_PERF=1`, the `perf` project) on the e2e stack.
  The probe is not run on CI runners.

## A keystroke's frame

- The frame that paints a keystroke holds the writing's own work alone: the edit, its live state, and the pages laid
  out again from the paragraph it touched.
- What reads the writing is drawn after that frame is painted, once however many changes came in it: the toolbar's
  pressed states and font size, the ruler, the outline, the footnotes under the writing, the save status, and the
  caret as collaborators are told of it.
- Every React commit while the writing has the focus reads the caret's place in the whole body, so the surface draws
  nothing again for a keystroke that only these parts need.
- What is drawn from the blocks alone (breaks, paragraph boxes, sections, list items) is mapped through an edit of
  text, never worked out again; a list item's own text edited draws the list items again.
- Laying out reads text through one range per document, reused: each range left for the garbage collector makes every
  node added to or taken from the body slower until it is collected (a 320-page layout leaves 8,000).
- A local edit works out no selection in the live state: y-prosemirror walks the body up to the caret for each one,
  read only when a peer's edit arrives, so `patches/y-prosemirror@1.3.7.patch` leaves it unread; an upgrade of
  y-prosemirror carries the patch or drops it once upstream does the same.

## How it is measured

- The production build on the e2e stack (`scripts/e2e-stack.mjs`), Chromium, dark, 1280 by 860.
- **Here**: Event Timing entries of 16 ms or more for `keydown` and `keypress` over 60 keystrokes 40 ms apart.
- **To a peer**: a second browser on an edit link; the time from each of 30 keystrokes until a mutation observer on the
  peer's body sees the character.
- **Opening**: five fresh browser contexts opening the document by its share link until the surface reports ready
  (`data-text-document-surface="ready"`), then the largest contentful paint and the layout shift.
- **Code**: the gzipped chunk holding the surface in the export, and `node scripts/first-load.mjs live`.
- Measured 2026-11-18 on the developer workstation (assumed representative of a recent laptop, not of a phone);
  Phase 18 measures a 300-page text document against the same budgets.
