# Performance

**Status: specified.** The budgets below hold for what is built; each later area keeps to them.

How fast a [PDF document](pdf-document.md) opens, how its pages scroll, what it holds in memory, and what it adds to
what the editor downloads. Measured on the tracer bullet (plan 0022, Phase 4) and held to the platform's
[web performance](../016-platform/web-performance.md) rules.

## Budgets

| Measure                                                   | Budget                                                                                          | Measured                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| The engine's binary (`pdfium.wasm`), gzipped              | Under 2,200 KiB, loaded only with a PDF tab, in its worker                                      | 2,088 KiB (4,647 kB before compression)            |
| The engine's worker chunk (the reader's glue, the writer) | Under 320 KiB gzipped, loaded only with a PDF tab                                               | 284 KiB                                            |
| The surface's own chunk                                   | Under 48 KiB gzipped, loaded only with a PDF tab                                                | 28 KiB                                             |
| The document route's first load                           | Within its budget in `apps/live/first-load-budget.json`; no engine, surface or model code       | 1,036 KiB of 1,060; 2 KiB over `main` without PDFs |
| The engine started and the file open, local stack         | Under 500 ms for a file read whole                                                              | 165 to 331 ms, from 840 bytes to 93 MB             |
| Opening a short file, local stack, unthrottled            | Surface ready under 1,000 ms; page one drawn under 1,500 ms                                     | Ready 485 to 944 ms; page one 580 to 1,001 ms      |
| Opening a 1,000-page file, the same way                   | As a short file: every page's size is read without loading a page                               | Ready 485 to 919 ms; page one 580 to 1,036 ms      |
| Opening a 100 MB file read whole, local stack             | Page one drawn under 3,000 ms `(default)`                                                       | 93 MB: ready 1,003 ms; page one 1,436 ms           |
| Layout shift while opening                                | CLS under 0.1                                                                                   | 0.001                                              |
| Scrolling, unthrottled, at 1,800 and 6,000 px a second    | No main-thread task over 50 ms; the page under the middle of the view drawn in 99 frames of 100 | None; drawn in every frame; frames 17 ms at p95    |
| Scrolling at 4x CPU                                       | No main-thread task over 100 ms `(default)`                                                     | Slowest 82 ms; frames 50 to 67 ms at p95           |
| A jump to the end of a 1,000-page file                    | The last page drawn within 500 ms                                                               | 88 ms; 279 ms at 4x CPU                            |
| Memory of the page's process, a 1,000-page file           | Under 640 MiB while scrolling `(default)`                                                       | 296 to 415 MiB open; 524 MiB at its peak           |
| Memory of the page's process, a 100 MB file read whole    | Under `PDF_WORKER_MAX_BYTES` (1 GiB)                                                            | 93 MB: 506 to 545 MiB open; 724 MiB at its peak    |

- The route's 2 KiB are the kind's hosting: its host, its bus and the room's two branches for its ops. None of
  `@livedoc/pdf-documents` is in a first-load script (a search of every one for the model's and the engine's names).
- A dropped file is a document once its bytes are hashed and stored: 0.5 to 0.9 s for files up to 6 MB, 12.7 s for
  93 MB on the local stack. Page one shows 0.8 to 1.3 s after that.
- The largest contentful paint (272 to 612 ms) is the shell's, not the page's: a canvas is no candidate for it. The
  time to page one above is read from the surface (`data-pdf-page-drawn`).
- A three-line highlight is 670 bytes of live changes, so `PDF_LIVE_CHANGES_MAX_BYTES` (4 MiB) holds about 6,200 of
  them before the stored file is replaced ([Saving](saving.md#limits)).
- At 4x CPU the tasks of 50 to 82 ms while scrolling are a whole-page picture put on its canvas; tiles
  ([Reading surface](reading-surface.md#the-pages)) make each put smaller.
- Taken under load (28 cores, load 34 to 45): the workstation is shared, so the measured numbers are upper bounds.
  One run of the 93 MB file was ended by the machine's low-memory guard, the page's process at 588 MiB, while other
  work had left the machine under a tenth of its memory; the run recorded here was made with 15 GB free. A quiet run
  is still to be recorded.

## How it is measured

- The production build on the e2e stack (`scripts/e2e-stack.mjs`), Chromium, dark, 1440 by 900:
  `node apps/live/scripts/pdf-document-measure.mjs <base-url> <file.pdf>... [--cpu 4]`.
- **A dropped file**: the file dropped on the Explorer, until the document's address shows and page one is drawn.
- **Opening**: a new browser with nothing cached opens the document, then reloads it; from navigation until the
  surface reports ready (`data-pdf-surface="ready"`) and page one is drawn, with the layout shift and every
  main-thread task over 50 ms. The surface's `[pdf] opened` line says how long the read and the engine took.
- **Scrolling**: the wheel at a reading pace and a fast one, 8 s each; every frame's length, every main-thread task
  over 50 ms, and whether the page under the middle of the view is drawn in each frame.
- **Memory**: the resident memory of the page's process, which holds the engine's worker, read from the system.
- **Code**: the gzipped chunks in the export, and `node scripts/first-load.mjs live` against a build of `main`.
- Files: a one-page file of 840 bytes, a 14-page paper (1 MB), a 1,008-page file (1.1 MB), a one-page A1 plan (6 MB)
  and a 5-page file of pictures (93 MB), from the plan's corpus.
- Measured 2026-11-22 on the developer workstation (assumed representative of a recent laptop, not of a phone).
