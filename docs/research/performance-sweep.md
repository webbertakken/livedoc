# Performance sweep, November 2026

A sweep of LiveDoc's performance, measured on 2026-11-15 and shipped in six pull requests the same day.
Its one rule: what a person sees and can do stays the same or gets better; anything else is a design fork for Webber.
The rules it left behind live in [Web performance](../specs/016-platform/web-performance.md).
The canvas's own gestures were out of scope here; see [Canvas performance](./canvas-performance.md).

## Method

- Six discovery reports from a research fan-out named the leads, one report per area.
- The areas: first load, the open path, the editor at rest, realtime and saving, the api and D1, the static sites.
- Every lead was checked in the code and measured before anything was changed.
- First-load JavaScript per page: `node scripts/first-load.mjs` over production exports, gzip level 9.
- Why a page carries a module: the Turbopack bundle analyzer's data (`next analyze`), read as the real module graph.
- An esbuild graph of the same sources over-approximates barrels, so it names modules the bundler never ships.
- Browser timings: built sites in Chromium, medians of interleaved before and after runs.
- Network and CPU were throttled as each table says.
- Api round trips: `document-request-round-trips.test.ts` counts D1 round trips per request over real migrations.
- Worker start-up: the "Worker Startup Time" a deploy logs, not a local evaluation of the module.

## Baseline

First-load JavaScript at fe587eebc2, against the spec's table of 2026-10-11 in brackets.

| Page                          | KiB        | (Oct)        |
| ----------------------------- | ---------- | ------------ |
| `/document/<id>`, `/embed`    | 1,552      | (1,240)      |
| `/explorer/*`                 | 936 to 984 | (570)        |
| `/new`                        | 796        | (669)        |
| `/form/<code>`                | 422        | none         |
| `/sign-in`, `/get-started`    | 404        | (362)        |
| `/join`, `/drive/*`, `/oauth` | 380 to 394 | (316 to 354) |
| Every route's base (`/404`)   | 373        | none         |

- The Explorer had grown by about 400 KiB in a month, unseen, through one import: every template's builders.
- Every route carried about 110 KiB of `@livedoc/document` and 27 of `@livedoc/items` through the api client's barrel.

## What shipped

### Realtime and saving (#182)

- The tab save answers the saved tab's record and its new `rev`, not the tab it was sent.
- A peer's op reaches an undo or redo snapshot only when undo, redo or a cancelled drag restores it.
- A seeded run of 2,000 edits checks every step against the old eager model.

| Measure                                             | Before        | After         |
| --------------------------------------------------- | ------------- | ------------- |
| Tab save answer, 1,000-box tab                      | 95,893 bytes  | under 200     |
| One peer save (20 ops), 500 undo steps, 1,000 boxes | 214 to 305 ms | 0.9 to 6.1 ms |
| Op passes per peer op, 300 past and 100 future      | 401           | 1             |

### The api and D1 (#184, #186)

- The purge guard (G3) holds through the document's D1 row, with no read of its own.
- Gate-only routes read `getDocumentMeta`, not the whole document.
- Team routes and the Timeline read independent rows together; the team member list is one query.
- Image bytes carry an `ETag`; content search reads the text only for the matches it answers.
- #184 also loaded the OpenAPI document lazily; #186 reverted it, because in one bundle it slowed start-up.

| Measure                                             | Before        | After           |
| --------------------------------------------------- | ------------- | --------------- |
| D1 round trips: open a tab                          | 3             | 1               |
| D1 round trips: list cards, sheets, comments, plan  | 3 each        | 1 each          |
| D1 round trips: add a card, a sheet, a comment      | 4, 4, 5       | 2, 2, 3         |
| D1 round trips: open the document                   | 3             | 2               |
| D1 round trips: share visitor's tab read            | 9             | 5               |
| Every other document request (autosave included)    | +1 read       | 0               |
| Team member list (N members)                        | 1 + N queries | 1               |
| Image revalidation after max-age                    | whole image   | 304, 0 bytes    |
| Search, 600 matching 32 KB tabs                     | 321 to 411 ms | 129 to 200 ms   |
| Worker Startup Time, lazy OpenAPI (#184, then #186) | 72 ms         | 97 ms, reverted |

### Delivery and static sites (#187)

- The telemetry dashboard starts its summary request from an inline script while its scripts download.
- The help article and its sidebar sit in a grid row again, and the Contents list is in the static HTML.
- The hero's hand-lettering font is a hashed asset, cached as immutable.

| Measure                                             | Before   | After     |
| --------------------------------------------------- | -------- | --------- |
| Telemetry: summary request starts (slow 4G, 4× CPU) | 2,225 ms | 475 ms    |
| Telemetry: numbers on screen (fast 4G, 4× CPU)      | 2,248 ms | 1,607 ms  |
| Help article with related guides: CLS, cold         | 0.247    | 0         |
| Help `select` article: CLS, warm                    | 0.122    | 0         |
| Features page, repeat visit: font over the network  | 300 B    | 0 (cache) |

### The open path and the editor at rest (#183)

- The document, or its share link, is asked for beside the participant row once the reader's id is known.
- A browser whose signed-in hint is `1` asks for its token beside the session read; the read still decides.
- Closed Layers previews, an unseen slide deck and a hidden tab's clock do no work.

| Measure                                                     | Before      | After |
| ----------------------------------------------------------- | ----------- | ----- |
| Round trips in a row before the first tab, guest            | 4 (5 first) | 3     |
| Same, signed in                                             | 5 (6 first) | 3     |
| Same, share link                                            | 4           | 3     |
| Layer previews per board change, Layers closed, 1,000 boxes | 1,000       | 0     |
| Slide pictures drawn per edit, deck panel closed            | one a slide | 0     |
| Relative-time re-renders per row, hidden for 2 min          | 4           | 0     |

### First load of the editor app (#188)

- The template builders load when a document is made; the Explorer's search loads with what it searches.
- Light pages import the api module they call, never the barrel; colour maths is apart from element defaults.
- A pane's code is asked for with its section; what is fetched ahead waits until the landing has drawn.
- Every page has a first-load budget, checked by each app's build (`first-load-budget.json`).

| Page                                 | Before         | After      |
| ------------------------------------ | -------------- | ---------- |
| Explorer: Home and most sections     | 936 KiB        | 570 KiB    |
| Explorer: All, Folder, Recent, lists | 983 KiB        | 617 KiB    |
| `/sign-in`, `/get-started`           | 404 KiB        | 277 KiB    |
| `/join`, `/join/decline`             | 381 KiB        | 254 KiB    |
| `/oauth/*`, `/workbench/pair`        | 388 KiB        | 260 KiB    |
| `/form/<code>`                       | 422 KiB        | 354 KiB    |
| Every route's base                   | 373 to 380 KiB | 244 to 252 |
| `/document/<id>`                     | 1,552 KiB      | 1,561 KiB  |
| `/new`                               | 796 KiB        | 801 KiB    |

In a browser, a first-time guest, 4 Mbit/s and 100 ms, medians of five interleaved runs:

| What                                          | Production | Preview   |
| --------------------------------------------- | ---------- | --------- |
| Explorer: the welcome on screen               | 4,482 ms   | 3,429 ms  |
| Explorer: JavaScript over the wire until then | 1,647 KiB  | 816 KiB   |
| Explorer: first press of search loads         | 39 KiB     | nothing   |
| Explorer: everything fetched ahead, in total  | 2,299 KiB  | 2,454 KiB |
| `/sign-in`: JavaScript over the wire          | 460 KiB    | 273 KiB   |

- The budget gate failed the rebased build before it merged: every Explorer page was 47 KiB over.
- The cause was a lane name importing one grey from the graph header, which brought its routing and layout.
- The grey became a module of its own (`graph-muted.ts`).

### An offline document's tabs, one record each (R5)

- A This Browser document keeps each tab in its own IndexedDB record beside one document record.
- An autosave reads and writes the one tab it saves and the document record, never the other tabs.
- Version 3 of the store moves every document across in its upgrade, checked tab by tab, all or nothing.
- An older tab holding the store delays the upgrade; a tab a newer build overtakes asks to reload.

| Measure                                          | Before  | After   |
| ------------------------------------------------ | ------- | ------- |
| Bytes one autosave writes, 5 tabs of 1,000 boxes | 509,336 | 102,082 |

### The document page on a slow link (#208, #215)

- The editor's first-load scripts carry V8's compile hint, so Chrome compiles them as they download (#208).
- The open path's reads start as the session answers, while the editor's code still downloads (#215).
- The root heard the session as the editor's code ran: a root state update waits for the editor to hydrate.
- So the early reads hear it outside React; the editor takes their answers from a one-shot pool.

On docs.nu, a first-time guest, 4 Mbit/s and 100 ms, CPU 4x, medians of three (#208):

| Measure                                 | Before    | After     |
| --------------------------------------- | --------- | --------- |
| Shared link: editable                   | 6,030 ms  | 4,785 ms  |
| `/new?template=kanban`: editable        | 6,629 ms  | 5,108 ms  |
| Own document: editable (one traced run) | 6,748 ms  | 4,622 ms  |
| Editor's main script on the main thread | 1,077 ms  | 304 ms    |
| JS heap                                 | 19 MiB    | 25 MiB    |
| `/document/<id>` first load             | 1,523 KiB | 1,525 KiB |

On the local stack behind HTTP/2 and zstd, the same throttling, medians of five interleaved runs (#215):

| Measure                                     | Before    | After                  |
| ------------------------------------------- | --------- | ---------------------- |
| Shared link, first-time guest: editable     | 4,508 ms  | 4,029 ms               |
| Own document, guest owner: editable         | 4,211 ms  | 4,035 ms               |
| Shared link: the first tab's read answered  | 4,299 ms  | 2,940 ms               |
| Own document: the first tab's read answered | 4,034 ms  | 2,842 ms               |
| Every route's base                          | 245 KiB   | 247 KiB                |
| `/document/<id>` first load                 | 1,525 KiB | 1,524 KiB + 5 KiB lazy |

- Locally a read answers in about 0.1 s; on docs.nu the document read takes 0.5 to 1.3 s, more to hide.
- What still waits on the editor's code: a first visit's participant row (a write), then the editor's own render.

### The document read's server time (#214, #217, #219, #220, #227)

- Answers under `/api/documents/<id>/` carry `Server-Timing`, and every api answer its own total and cold marks.
- A room's own work is 13 to 35 ms; a D1 round trip from it 5 to 14 ms. The slow answers were never there.
- Every slow first byte carried `api-cold` or `room-cold`: an isolate starting, fetching and compiling the bundle.
- A woken room no longer writes its move record to D1 before answering; the sweep heals a lost one (#217).
- Opening a document is one D1 round trip: the owner's name rides in the row's query (#220).
- The worker ships minified, names kept, source maps uploaded (#227).
- Minifying raised the deploy's Worker Startup Time (64 to 78 ms before, 96 after) yet cut the cold wait: what a
  fresh isolate pays is mostly fetching and parsing 10 MB, not the top-level CPU that figure counts.

On docs.nu from Amsterdam, curl, a guest's two-tab document:

| Measure                                                  | Before          | After           |
| -------------------------------------------------------- | --------------- | --------------- |
| Room ready gate, first request after a wake              | 15 to 27 ms     | 0 ms            |
| D1 round trips: open the document                        | 2, in series    | 1               |
| Room handler: open the document                          | 12 to 27 ms     | 7 to 11 ms      |
| Upload of the api worker                                 | 10,142 KiB      | 6,642 KiB       |
| Cold api isolate: wait beyond the api's own time, median | 409 ms (n = 35) | 340 ms (n = 29) |
| Cold api isolate: worst of 60 reads, 20 s apart          | 1,276 ms        | 570 ms          |
| Warm read beyond the api's own time, median              | 48 ms           | 53 ms           |

- About half of reads 20 s apart found a cold api isolate (36 and 29 of 60): at this traffic, start-up is the read.
- A woken room adds its own start: `room` 286 to 420 ms against 29 to 33 ms of work inside it.

### The open as one read (#232, #234, #235)

- What made a fast-link open slow was the api's isolate start-up, met by each read on the open's chain.
- A cold isolate answers about 300 ms late; at docs.nu's traffic about half of reads meet one, alone or in a burst.
- Warming one isolate early did not carry: the next read often lands on another, cold one.
- So the chain's length is the cost: four reads in three steps after the session became one (#234).
- The session read leaves with the HTML, from an inline script; the auth bridge takes it (#232).
- A guest id minted for this page reads no participant row before writing it (#232).
- The editor's document read, marked as an open, carries the first tab and the reader's own row (#234).
- The room still makes one D1 round trip: the reader's row is a subquery, the tab the room's own storage.
- The open never waits for the first visit's participant write; it is written beside the open (#235).

On docs.nu, the owner opening a kanban document, headless Chromium, fast link, n = 8 per column, 20 s apart. #232 was
measured twice, after its deploy and again just before #234's: the spread between the two is the noise.

| Measure                                    | Before #232 | #232, after deploy | #232, before #234 | #234   |
| ------------------------------------------ | ----------- | ------------------ | ----------------- | ------ |
| Session read starts, median                | 335 ms      | 108 ms             | 114 ms            | 131 ms |
| First tab's content in, median             | 818 ms      | 638 ms             | 591 ms            | 406 ms |
| Editable, median                           | 955 ms      | 855 ms             | 687 ms            | 498 ms |
| Editable, slowest                          | 1,723 ms    | 1,306 ms           | 1,925 ms          | 964 ms |
| Cold api isolates met before editable, all | 11          | 14                 | 11                | 5      |

- At 4 Mbit/s and CPU 4x the owner's open stays about 4.05 s: it waits on the editor's code, not the reads.
- A shared link, first-time guest, fast link (before #235): the Join prompt at 425 to 995 ms, median 669 (n = 6).
- Its chain: session, the guest id, then the share read beside the participant write, then the first tab.
- The share read asks the document's room for the outline: its own time was 76 to 276 ms.

Where the document page's first load goes (Turbopack analyzer at 9bd7128e01, compressed parts, 2,016 KiB):

| Part                              | KiB |
| --------------------------------- | --- |
| `@livedoc/document` (343 modules) | 349 |
| `components/canvas` (307 modules) | 316 |
| Next and React                    | 170 |
| `hooks/canvas`                    | 119 |
| `components/palette`              | 103 |
| `app/document`                    | 80  |
| `components/chrome`               | 77  |
| `globals.css`                     | 64  |

- A long tail of element kinds at about 1 KiB a module, every kind's face and model, whatever the board holds.
- Loading the face router late frees only 71 KiB: validation, placement and drawing share the element code.
- The router and the palette together free 199 KiB; the palette is on screen at open, so that is a design fork.

### A share link in one read (#240)

- The share read, marked as an open, carries the first tab, as the room answers the visitor's own tab read.
- It carries the visitor's own participant row too, so the editor reads neither before Join.
- The chain is now session, the guest id, then the share read beside the participant write: no tab read after it.
- The share read's own time grew from about 100 ms to 150 to 230 ms: it waits on the room's tab read inside it.

On docs.nu, a shared link, first-time guest, headless Chromium, fast link, n = 8 per column. Before was measured in
alternating pairs with the preview; after, 37 min after the deploy, in the same hour.

| Measure                       | Before #240 | #240     |
| ----------------------------- | ----------- | -------- |
| Tab reads before Join         | 1           | 0        |
| Guest id to editable, median  | 544 ms      | 280 ms   |
| Guest id to editable, slowest | 959 ms      | 597 ms   |
| Join prompt, median           | 1,843 ms    | 1,299 ms |
| Join prompt, slowest          | 2,541 ms    | 1,630 ms |

- That hour the editor's code arrived late (DOMContentLoaded about 500 to 700 ms at the median, up to 1 s).
- So its Join times sit far above #235's (median 535 ms); guest id to editable is the part the reads own.

### The palette strip settles before it is drawn

The 0.0131 shift noted while the sweep worked was the palette strip, traced with the layout-shift entries' sources
and a per-frame log of the strip, its rail and the top line, in a production build:

- The trigger: the Start Tour button joins the actions group after the strip has measured, so it refits after a
  paint (12 tiles to 6 at 1280; at 1440, dropping one brings in More, which widens it, and it refits again).
- The rail eased its width to every refit (armed one frame after mount), and the strip kept its own row until the
  ease ended, then jumped 61 px up: the 0.0131.
- The rail, the whole-pixel box round the card (`SnapWidth`) and the tray each mirrored a measurement into React
  state from a ResizeObserver, a frame behind what they follow.
- Chrome counts what a ResizeObserver callback moves as a layout shift, even before the frame is drawn (seen on a
  bare page and in the trace), so each refit now settles in its commit, never in a resize report.

A blank diagram opened from `/new?template=blank`, Chromium, dark mode, three opens each. Before is docs.nu at
`ffc7f937b4` (a guest's Sign in button on the top line too); after is a local production build of the change.

| Width | Before, docs.nu  | Before, local | After, local |
| ----- | ---------------- | ------------- | ------------ |
| 1280  | 0.0370           | 0.0281        | 0            |
| 1440  | 0.0267 to 0.0273 | not measured  | 0            |

- After, 800 to 1920 wide: a blank diagram and a blank brainstorm, 0 at every width (8 widths).

An article (Webber's ruling: reserve the dock's room). Its strip was drawn first as an infographic page's, since the
pages layer that names the page someone is on loads later, then as an article's with its formatting docked, which
loads with the article's editor later still, on a row of its own. Now the tab's landing page names the kind before
the first frame, and the slot holds the docked row's place, invisible, until the controls arrive.

| Width | Before, local | After, local                             |
| ----- | ------------- | ---------------------------------------- |
| 1280  | 0.0325        | 0 (3 opens)                              |
| 1024  | 0.0526        | 0                                        |
| 1440  | 0.0265        | 0.0055 to 0.0065: the tour button, below |

## Refuted or set aside

About half the leads did not survive a check; they are listed so nobody proposes them again.

Refuted:

- Skip the write-again after a save: the save carries the whole tab, so every peer element is written anyway.
- Drop presence in hidden tabs: the coalescer commits on animation frames, which hidden tabs do not run.
- `listTrash` scans the whole table: the plan seeks by owner and by team (read-only EXPLAIN on docs.nu).
- Prune folded template shelves: folded shelves are visible tiles with preview fans.
- Hero fan opacity: the hidden opening hand is deliberate, so the shuffled deal never visibly swaps.
- A `Link` preload from the live worker: the document read carries owner headers, and only Chromium reuses it.
- Pass the share preview to the client: the card is `{ name }` only; the client still resolves the share.
- The editor's tags provider: already lazy.
- `/new` loads the participant twice: cached for 30 s.
- Persist thumbnails: the browser already caches them for a day.
- Per-render objects: the React Compiler already caches them.
- The page-picture strip: it shares the canvas's copy.
- Lazy OpenAPI in the api worker: reverted, since in one bundle start-up went from 72 to 97 ms.

Not worth it:

- `total_changes()` around room statements: about 18 in-process calls of microseconds a save, unbilled.
- The roster's O(N²): only on hello, leave or rename, at most 100 sockets; one serialisation needs a wire change.
- IndexedDB opened per offline op: async, This Browser documents only, and a held connection must yield to upgrades.
- rAF for peer drag previews and cursor sends: one dragger sends 30 Hz, under the frame rate.
- Correlated self-subqueries in listings: a key seek on the row already in hand.
- The telemetry insert inline: `sendBeacon` never waits (a refused batch is now logged).
- Live and trashed checks on create: one read on a rare path.
- `listSharedWith` in copy: a fallback leg over the caller's own short list.
- Moving the Google Fonts link: non-blocking, and it warms the cache for the editor that follows sign-in.
- Splitting the marketing CSS: one immutable file every page shares; a split adds a chunk per page.
- Compressing PNG icons or caching them longer: 8 to 14 % lossless, on files no page load fetches.
- `"sideEffects": false` for the editor app: 25 KiB on the Explorer.
- With it, a side-effect import added later would vanish in production only.
- Small costs at rest (#183): thumbnail observers, toolbar measuring, the closed search panel, the draft-note scan.
- Also at rest: picker groups, the tool ref effect, the tab summary key, the table key listener.
- Custom themes and shape libraries: asked after the board shows, which paints from its own stored colours.

## Decided

Each fork changed something a person sees, a wire format or stored data, so each was Webber's to decide.
He ruled on 2026-11-15, with the standing requirement that performance must be ultra slick throughout.

To build:

- F1 `/new` loads the template builders at the pick, fetched as `/new` loads when the address names a template (#188).
  Built: `/new` loads 801 to 525 KiB up front and its wizard can be chosen from 1.7 s sooner at 4 Mbit/s; a template
  link opens as fast as before (13.3 s both, bound by the editor's code).
- R5 an offline document's tabs stored one record each, so an autosave writes one tab, not the document (#182):
  built, see "What shipped".
- S3 the telemetry dashboard prefetches no other view when the browser asks to save data (#187).
  Built: with Save-Data on, 4 view chunks (19.7 KiB gzipped) wait until their view is opened.
- O4 the Explorer's long lists draw only the rows in view, with a find that reaches every row (#183). Built: the List,
  Card and Details views and the panel's lists are windowed (full scrollbar, rows drawn as they come into view, at most
  8 a frame); Ctrl F focuses the Explorer's search, or the panel's find field; Back lands on the row it left. A folder of
  1,000 at 4x CPU opened in 0.3 to 0.5 s, not 16 to 35 s (longest task about 0.1 s, not 9 to 13 s), with 800 to 1,250
  elements, not about 37,000, and scrolled to its end where every run had crashed the tab. Tasks over 50 ms remain
  while thumbnails load (their loader's animations and pictures, on a 40-document folder as on a 1,000 one); the
  Details view, which draws none, opened and scrolled with at most two tasks of 55 ms.

Measured, then decided:

- R3 the room's op log kept across hibernation: not built. Production's telemetry held 2 `RealtimeResync` events in
  21 days (25 October to 15 November 2026), beside 2 joins of a shared document and 4 shares, so a persisted log
  could have saved at most two in-place refetches, for two more rows written per op. Reopened when resyncs reach
  several a week ([Resync without reloading the page](../specs/012-collaboration/resync-without-reload.md)) (#182).
- S1 the share-link preview lookup for people: built, narrower than a shorter timeout. From Amsterdam it added 47 ms
  at the median (30 pages, curl), with one in 42 reaching the 1.5 s timeout; from seven nodes outside Western
  Europe, one D1 read on a cold api added 0.3 to 0.9 s (medians of 5, check-host.net, a made-up code). A shorter
  timeout would have cost those crawlers their preview, so the head now goes out before the lookup (scripts and
  styles load meanwhile; the preview tags close the head) and the card is one D1 read, not three (#187, #203).
  Asked alongside the shell, a cold api still held the whole response in 5 of 16 production pages (up to 0.9 s),
  so the card is now asked once the head is on its way.

Declined:

- R1 order written after the broadcast: the output gate keeps an unstored sequence number from reaching peers;
  5 to 30 ms is not worth duplicated or lost ops (#182).
- R4 short tab ids in cursor frames: a wire change for bytes nobody notices (#182).
- A1 browsers caching `/api/capabilities`: its answer carries the build id the stale-build guard reads; the request
  is already shared and off the critical path (#184).
- A2 images immutable for a year: a deleted image would linger; the 304 already removed the bytes (#184).
- S2 help reading time counted at build: 42 of 295 articles would show a different time; the win is invisible (#187).
- O1 guests skipping the session read: a cleared hint would open a signed-in person's document as a guest (D25, #183).
- O3 no avatar heartbeat while the page is hidden: an away person's avatar would vanish for newcomers (#183).

Parked:

- R2 batched element ops: a new op kind needing a version handshake; until room CPU shows on the bill or a busy room
  lags (#182).
- O2 Home deferring the Explorer's lists: #188 already moved Home's request about 1 s earlier; measure again before
  the sidebar fills in late (#183).

## What remains

- The document page's first load, about 1,561 KiB, is a long tail.
- Its measured candidates: the SVG renderer's dispatcher 67 KiB, Plan hooks 47, the board-scene import 24.
- Smaller: templates 18 KiB, the tour 15.
- The form page's cover band brings about 118 KiB of the document model, through `lib/page-paint` and `page-frame`.
- The Explorer fetches 155 KiB more JavaScript in the background since #188.
- Of that, 39 KiB is the search panel fetched ahead; the rest (16 smaller files) is not traced yet.
- Isolate start-up is still a read's largest cost: about 300 ms for a cold api isolate, about 290 for a room.
- A shared link's Join waits on the editor's code booting before the guest id is asked for (#240 measured it).
- On a slow link the open waits on the editor's first load; its levers are element kinds and the palette, loaded late.
- The every-minute move sweep scans documents; the spec's drop release removes it, which is Webber's to schedule.
- Fifteen canvas-gesture leads belong to the canvas session: zoom and pan re-renders, drag previews, snapping.
- Among them, the Minimap runs a whole-board arrow label pass for pictures that draw no labels.
- Those leads are unverified; about half of this sweep's leads did not survive a check.
- A Pages tab's tour is offered by a host that loads after the strip is drawn (`EditorTours`, `PagesTourHost`): its
  button joins the top line a frame late. An article at 1440, whose strip just fits the line, then takes a row of its
  own (0.0055); a slide deck's strip moves 43 px (0.001). Offering it from eager code is a tour refactor of its own.
