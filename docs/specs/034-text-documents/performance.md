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
| The document route's first load                          | Within its budget in `apps/live/first-load-budget.json`; Yjs and the file mapping never in it | 1,533 KiB of 1,536               |

The throttled open is the editor's own: a text document still loads the canvas editor around its surface.
[Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md) takes the canvas out of a text document's load,
and its open must then fall well below a canvas document's; the budget is tightened in that change.

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
