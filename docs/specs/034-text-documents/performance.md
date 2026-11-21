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
