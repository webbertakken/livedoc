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
- O4 the Explorer's panel tree becomes infinite scroll, with a search that finds every row, shown or not (#183).

To measure, then build:

- R3 the room's op log kept across hibernation: count production resyncs (`RealtimeResync`) first (#182).
- S1 the share-link preview lookup for people: measure its real time in production first (#187).

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
- One request for the outline and the first tab would save one more round trip on open (left to the api).
- The every-minute move sweep scans documents; the spec's drop release removes it, which is Webber's to schedule.
- Fifteen canvas-gesture leads belong to the canvas session: zoom and pan re-renders, drag previews, snapping.
- Among them, the Minimap runs a whole-board arrow label pass for pictures that draw no labels.
- Those leads are unverified; about half of this sweep's leads did not survive a check.
