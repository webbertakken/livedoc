# Web performance

What every site on docs.nu loads up front, and the rules that keep it lean. The canvas's own
hot paths (drag, pan, zoom on large boards) are a separate subject:
[Canvas performance](../008-canvas/canvas-performance.md).

## Measuring

The number that matters for a page is its **first-load JavaScript**: the gzipped size of every
script its static-export HTML references. It is measured from a production build (`next build` in
the app), summing the `<script src=".../_next/static/...js">` files a page's HTML names:
`node scripts/first-load.mjs` prints it for every page of every built app (`--json` to diff two
builds, `--chunks <app>` for an app's largest scripts). A change that could grow it is measured
against `main` the same way before it ships.

Why a page carries what it does is read from the Turbopack bundle analyzer (`next analyze`): its route
summary, its table of the largest contributors, and its diff against an earlier snapshot.

Measured 2026-10-11 (gzip level 9), before and after the changes that set these rules:

| Page                                         | Before    | After     |
| -------------------------------------------- | --------- | --------- |
| Editor: `/sign-in`, `/get-started`           | 1,546 KiB | 362 KiB   |
| Editor: `/explorer/home` (and most sections) | 1,780 KiB | 570 KiB   |
| Editor: `/new`                               | 1,877 KiB | 669 KiB   |
| Editor: `/join`, `/drive/*`, `/oauth/*`      | ~1,500    | 316–354   |
| Editor: `/document/<id>`                     | 1,493 KiB | 1,489 KiB |
| Help: an article                             | 238 KiB   | 207 KiB   |
| Telemetry: the dashboard                     | 287 KiB   | 280 KiB   |
| Marketing: `/` (HTML, gzipped)               | 114 KiB   | 93 KiB    |

Then the document page's own first load (measured 2026-10-11 the same way, on top of the above):

| Page                                | Before    | After     |
| ----------------------------------- | --------- | --------- |
| Editor: `/document/<id>`            | 1,489 KiB | 1,240 KiB |
| Marketing: a `/about/features` page | 221 KiB   | 207 KiB   |

Measured 2026-11-15 on `main` at e8e2d1430f, after the performance sweep (what it measured, shipped and set aside:
[Performance sweep](../../research/performance-sweep.md)), with the October number beside it:

| Page                                                  | Now       | October   |
| ----------------------------------------------------- | --------- | --------- |
| Editor: `/document/<id>`, `/embed`                    | 1,560 KiB | 1,240 KiB |
| Editor: `/new`                                        | 802 KiB   | 669 KiB   |
| Editor: `/explorer/all`, `/explorer/folder` and lists | 618 KiB   | n/a       |
| Editor: `/explorer` (Home and most sections)          | 571 KiB   | 570 KiB   |
| Editor: `/drive/open`                                 | 398 KiB   | 316–354   |
| Editor: `/form/<code>`                                | 355 KiB   | n/a       |
| Editor: `/sign-in`, `/get-started`                    | 278 KiB   | 362 KiB   |
| Editor: `/oauth/*`, `/workbench/pair`                 | 261–263   | 316–354   |
| Editor: `/join`, `/drive/connected`                   | 255 KiB   | 316–354   |
| Editor: every route's base (`/`, `/404`)              | 245 KiB   | n/a       |
| Help: an article                                      | 206 KiB   | 207 KiB   |
| Telemetry: the dashboard                              | 300 KiB   | 280 KiB   |
| Marketing: `/about`                                   | 280 KiB   | n/a       |
| Marketing: a `/about/features` page                   | 206 KiB   | 207 KiB   |
| Marketing: `/about` (HTML, gzipped)                   | 94 KiB    | 93 KiB    |

## Rules

### Every page has a budget

Each app keeps a `first-load-budget.json`: an ordered list of page patterns, each with the most
gzipped JavaScript a page it names may load up front. The app's build checks its export against it
(`node scripts/first-load.mjs --check <app>`) and fails, naming the page, what it loads and what it
may, when a page is over its budget or no pattern names it. A budget sits a little above what the
page loads today, so ordinary work passes and a static import that should have been a dynamic one
does not: the Explorer once grew by 400 KiB in a month, unseen, from one import of the template
builders. A budget is raised only on purpose, in the change that needs it, and lowered when a page
shrinks.

### Nothing heavy in what every route ships

The editor app's root layout, its providers and its root `not-found.tsx` ship with **every route**.
Next renders the root not-found slot inside the layout, so its code is part of every page.

- `app/not-found.tsx` renders the editor (that is how a real `/document/<id>` URL reaches it in the
  static export; [New document route](../007-editor/new-document-route.md)), and loads it with
  `next/dynamic`, never a static import. A document URL already has the editor from
  `/document/placeholder`'s own import, so it pays nothing extra; the opening screen covers the one
  tick the import takes.
- The Google Drive mirror's engine loads only in the one tab elected to run it
  ([Drive mirror](../022-drive-mirror/drive-mirror.md)); every other tab, and every person without
  Drive, never downloads it. The token source every signed-in tab needs lives apart from it
  (`lib/drive/browser-tokens.ts`).
- What the root layout mounts imports the api module it calls (`lib/api/self`, `lib/api/preferences`),
  never the api client's barrel (`lib/api-client`): the barrel names every call the editor makes, and
  with it the offline store and the document model, on sign-in and on a form's page alike. The small
  pages someone lands on with one call to make (a team invite, the OAuth consent, pairing) do the same.
- What every route asks of the api is a module of its own: the capability probe is
  `lib/api/capabilities`, apart from the AI requests, which validate elements and so carry the document
  model.
- Code that only needs a colour imports the colour maths (`@livedoc/document`'s `colour-math.ts`), which
  knows no element; the element defaults beside it (`colors.ts`) carry every shape kind. The brand
  mark on the sign-in page once brought 50 KiB of shape code with it.
- A form's page, opened from a link and often on a phone, paints its cover band with the sheet style
  (`lib/page-sheet-style.ts`), which reads a fill's tone and its pattern's ink from `@livedoc/document`'s
  `page-fill-tone.ts`, a leaf beside the colour maths. The panel's presets (`lib/page-paint.ts`) and the
  export frame (`page-frame.ts`) carry the themes and the document model, about 110 KiB the band never
  used. Its answer checks read the bounds a question shares with a Choice field from `@livedoc/items`'
  `limits.ts`, never from the type catalogue, whose glyphs and board code came with it (about 60 KiB).
- `apps/live/app/first-load-lazy.test.ts` fails if any of these become static imports again.

### A surface that is not on screen loads when it is

A dialog, panel or view that renders only behind an open flag or a tab is loaded with
`next/dynamic` (`ssr: false`), the way the editor's Dashboard page and Sheets host already are.
The Explorer's Settings and move picker, and every telemetry dashboard view but the first, load
this way. Where switching to one must stay instant, its code is fetched once the page is idle
(the telemetry dashboard).

The Explorer's search loads with what it searches: the panel, the help registry and the settings
catalogue are one piece of code (`app/explorer/ExplorerSearch.tsx`), fetched ahead once the
Explorer has settled (below), so the first press of the search key finds it in.

What is fetched ahead in pieces shares no code between them: each dynamic import the Explorer fetches ahead
(search, the editor, what makes a document) carries its own copy of every module it shares with another, so what
search names reads leaves that know no editor code. A template's sheet's words come from the starts' names
(`@livedoc/sheets`' `template-start-ids.ts`), never the sheet engine; where the Draw dock sits is
`lib/whiteboard-dock-position.ts`, apart from the dock's shape slots and the palette behind them. With search's own
copies of the sheet engine and the palette, the Explorer fetched 2,281 KiB of JavaScript until idle, 181 KiB of it
modules it already had; without them, 2,142 KiB and 86 KiB.

A pane's code is asked for with its section. An Explorer section's pane (Home, the Timeline, the
Inbox, a team) draws only once the person is known, so left to its dynamic import its code would be
asked for after that answer, and its data after its code. The Explorer asks for the pane as the
section is chosen (`app/explorer/explorer-pane-code.ts`), alongside the reads that let it draw, so
the landing page waits on the person and then on its own data, never on its code in between.

What is fetched ahead waits for the page's own reads. `requestIdleCallback` means an idle main
thread, not an idle connection: a megabyte of the editor's code fetched "on idle" shares the
connection with the reads the landing page is waiting on (at 4 Mbit/s and 100 ms of latency the
Explorer learned who the person was two seconds after it hydrated, behind 57 files fetched ahead).
So what the Explorer fetches ahead (the editor's code and the standby document, what builds a new
document, its search) starts once the landing has drawn what it came to show, or after
`EXPLORER_SETTLE_TIMEOUT_MS = 5000` (default) when it never does, and then on idle
(`app/explorer/explorer-settled.ts`). A section drawn from the Explorer's lists has drawn when they
land. Home has drawn when its own read has answered; a first run, whose welcome is code fetched only
once the lists say there is nothing yet, when that welcome is on screen. Waiting for the lists alone
started a megabyte and a half of downloads at the moment a newcomer's welcome was asked for, and
the welcome showed half a second later than with no waiting at all (4 Mbit/s, 100 ms).

What makes a document loads when one is made. The template builders (every template's elements)
reach the Explorer only through `lib/new-document-content`, which the New Document menu imports at
the moment it prepares a document, and which is fetched ahead of that with the editor's code: once
the Explorer has settled, and when the button is pointed at or focused. `/new` is the page that makes a document, so
it imports the builders as it loads.

### The document page loads what a board may not need on demand

`apps/live/lib/editor-deferred-code.ts` names every module the editor loads on demand, so a surface's
`next/dynamic` and the prefetch below share one import:

- **Content a board may draw on open**: Pages mode's pages and their writing, the Draw dock, tables,
  facilitation panels, sequence diagrams and the Map. Fetched as the editor mounts (`prefetchWhenIdle`), alongside the document
  request, so a board that has one finds its code already in, while the first load does not carry it.
- **Surfaces someone opens**: the Explorer and Layers popovers (mounted from their first opening on,
  then kept, so their state survives), search, the quick style panel, the tool panels, presenting and
  session settings, and the landing of another tool's board (`lib/board-scene/land`, `lib/board-scene-import`)
  that a paste, a drop or an import runs. Fetched once the opened document has rendered and the page is
  idle; a paste before then waits for it.
- **At the press**: the photo import's detection pipeline (and the sticky detector in it) loads when a
  photo is picked; a template's canvas overrides, its catalogue and its tab's name load with its builders
  (`lib/template-builders`) when one is applied.
- **Pictures of the board**: the Map, slide and page thumbnails and a library shape's picture are
  drawn by the SVG renderer (`@livedoc/document`'s `svg-render*`, the code exports use). The board
  itself is drawn by the element views, so the renderer is no part of the first load: the Map
  (`components/canvas/Minimap.tsx`) and a sequence diagram's face (`SequenceFace.tsx`, the renderer's
  own picture of it) are content a board may draw on open, and everything else that draws a picture
  imports the renderer when it first draws one. A tab's content bounds, which a deck fits to and a
  library shape is placed by, are `content-bounds.ts`, apart from the renderer.
- **What waits for on-demand code.** Starting a deck waits for the presentation overlay's code (with
  the deck's unvisited tabs), and the overlay draws in the first slide's commit, so the deck's keys
  listen from its first frame. The top corners give way to a top Draw dock from the commit the dock is
  first drawn in, measured then rather than before it is on the page.
- A panel whose code cannot load (offline behind the load-error card) draws nothing rather than
  throwing into the screen around it.
- `apps/live/app/document/[id]/document-lazy-load.test.ts` fails if any of these become static
  imports again.

### A page loads only the scene it shows

A features page plays one hero scene; the scene catalogue keeps its data apart from the boards
(`hero-scene-data.ts`), so the page loads that scene's board alone.

### Rendering server-side is not free in a static export

Next writes a server component's output into the page's RSC payload as well as its HTML, so moving
content from a client component to a server one moves its bytes from the JavaScript into the HTML
rather than removing them. Measured on the FAQ: 9 KiB less JavaScript, 15 KiB more HTML. Such a move
is made only where it measurably wins.

### A catalogue a page only searches loads when the search does

The help centre's search runs over the whole article registry; the box loads it on the reader's
first focus, hover or keystroke, not with every page. Code that only builds links imports the
registry's data-free helpers (`@livedoc/help-registry/hrefs`), and a help page's telemetry id
is worked out from its path, never by finding the article.

### Nothing cross-origin holds up first paint

The editor's Google Fonts stylesheet is linked `media="print"` and switched to `all` once loaded
([Fonts](../004-interface-design/fonts.md) "Loading"), so it never blocks render. Text paints in
the fallback face until the faces land, and the canvas re-measures each time they do
(`useFontEpoch`).

### Markup nobody can see is not drawn yet

- The home page hero draws a window's board only once the stage is at or next to it, or slides
  past it ([Marketing site](../019-marketing/marketing-site.md) "Hero").
- The features pages' looping illustrations sit in frames with `content-visibility: auto`, so the
  browser skips rendering and animating the ones off screen. Each frame's size is fixed, so this
  never moves layout.

### Layout never shifts after first paint

Content is in its final structure in the static HTML. The help centre groups an article's
sections while rendering, never by rewriting the DOM after hydration, and the reading-time row
holds its height before the time is counted.

A slow device paints a page while it is still parsing it, so a layout never depends on markup
further down the document: the help article's sidebar column is a grid track, there before the
sidebar is, where a flex row let the article take the full width until the sidebar was parsed
(a 0.24 layout shift at 6× CPU throttling).

- A help article's Contents list is worked out from the article while it renders
  (`lib/article-outline.ts`), so it is in the static HTML: it never pushes the sidebar's Learn more
  list down after hydration (a 0.007 shift on every article with related guides), and no observer
  watches the page for headings.

### The first images a visitor sees load first

A gallery's first row loads its images eagerly with
`fetchpriority="high"`; every other card's image is lazy.

### The open path asks in parallel

Opening a document waits on as few round trips in a row as who is asking allows. Nothing is asked
as a different person than the one the session settles, even briefly
([Auth + guest access](../014-identity/auth-and-guest-access.md)).

- **The session and its token together.** A browser whose signed-in hint is `1` asks for its
  session token beside the session read; the read alone still decides who is signed in, and a read
  that answers signed out drops the token. A guest (hint `0` or none) asks for no token.
- **The reader's row and the document together.** Once the reader's id is known (the account's, or
  the guest's signed id), the document, or the share link it follows, is asked for at once, beside
  the participant row, never after it. The editor still opens only once both have answered, as the
  participant they resolved.
- **The order that remains:** the session (and token), then the participant row and the document,
  then the first tab: three round trips for a guest, a signed-in person and a share link alike.
- Guests and share links still wait for the session read before asking for anything: a cleared
  hint must not open a signed-in person's link as a guest (D25).

### Ask once

A request whose answer is the same for the whole page load (the api's `/capabilities`) is made once
and shared; a failed answer is not kept, so the next caller asks again.

### Work only when it can change what shows

A timer that re-renders a large tree (the editor's presence clock) skips its tick while the page
is hidden, catching up when it returns, and while it has nothing to update (nobody else has been
seen on the document).

- The shared clock behind every relative time ("5 min ago") holds still while the page is hidden and
  ticks the moment it shows again.
- A panel that stays mounted once opened draws its pictures only while it is open: the Layers
  panel's row previews are not redrawn on every board change while it is closed.
- Pictures only a panel shows are drawn by that panel: the Slide Deck panel draws its slides'
  pictures while it is open; the editor holding the deck draws none.

### Per keystroke, the least work

- The Explorer's rows narrow a beat behind the lens field (a deferred value), its shared list is
  filtered through a set (it was quadratic), and the address bar follows the field at most every
  250 ms ([Explorer filters](../013-workspace/explorer-filters.md) "URL and carry-over").
- The rich-text editor keeps its toolbar state object while nothing in it changed, so a keystroke
  renders the editor once.
- The autosave compares a tab's metadata key by key, identity first, never the whole tab serialised.
- Requests several surfaces make at once (a team's library) share one in-flight request.

## Delivery

- **A page's own data leaves with its HTML.** A static page whose first view waits on one fixed,
  public api read (the telemetry dashboard's summary) starts it from an inline script at the top
  of its markup, so it travels while the scripts download; the page's code takes that request
  rather than asking again, and asks itself only where the script did not run. Not a
  `<link rel="preload">`: WebKit fetches a preloaded `fetch` a second time, and Firefox does for a
  `cache: 'no-store'` read, and an unused preload is a wasted request.
- **A file a stylesheet loads is a build asset.** A font a page's CSS names is imported by that
  CSS (`url('./…')`), so the build names it by its content under `/_next/static/` and it is cached
  immutable; at a fixed name under `public/` it is revalidated on every visit
  ([Stale builds](stale-builds.md) "Caching rules").
- **The live worker sends no `Link` preload.** A document read carries the owner's headers, which
  no preload can, and the session read (`cache: 'no-store'`) is taken from a preload only by
  Chromium; WebKit and Firefox would fetch it twice.
- **The share page asks the api for its preview on every visit**, a person's too: telling a link
  preview's crawler from a person needs a list of crawlers, which
  [Share-link previews](../013-workspace/share-link-previews.md) does not keep, and a crawler
  missing from it would lose its preview. The shell is fetched alongside, so a person waits only
  when the card is the slower of the two.

## The api

- A query that serves one person starts from that person's rows (their visible documents, their
  candidates) and seeks everything else by index. A query led by a table-wide index (all open
  threads, every document in id order, every document-scoped event) slows as the database grows,
  not as the person's work does. `apps/api/src/db/home-plans.test.ts` pins the plans of the Home and
  Inbox reads against the real migrations.
- Cells named by key are matched as `(row_id, col_id)` pairs, so the primary key seeks each one
  (`apps/api/src/db/sheets-plans.test.ts`).
- A check that needs only a document's owner and team reads that row, not the full document: the tab read,
  the card, sheet, comment and catalogue routes and a document's Timeline read its gate row (`getDocumentMeta`);
  the card routes take the card types from the room. The whole document (its owner's name, its tabs) is read
  only where the answer carries it: opening the document and a document view.
- A share-link visitor's open is recorded from the grant the read already resolved, not a second resolve.
- Reads that do not depend on each other go to D1 together: a team request's team and the caller's membership,
  a team's members and its invite link, a Timeline page and its scope's state.
- Content search ranks and filters its candidates without their text and reads the text by key for the
  matches it answers only (`apps/api/src/db/content-search.test.ts`): 600 matching 32 KB tabs search in about
  half the time.
- A module is deferred behind a dynamic import only when the deploy's "Worker Startup Time" shows the gain. The
  worker is one bundle: a dynamic import wraps every module it reaches for lazy start, so deferring the OpenAPI
  document grew the upload by 430 KB and start-up from about 72 to 97 ms, and it was put back. The PNG renderer,
  wasm in a module of its own, stays deferred.
- A list that names its people reads their profiles in the same statement: a team's members join their
  participant rows (`apps/api/src/db/team-members.test.ts` pins the round trip and the plan).
- A request about one document pays no D1 read for the purge guard: the document's own row keeps it
  ([Document storage](../006-document/document-storage.md) G3). `apps/api/src/routes/document-request-round-trips.test.ts`
  counts the D1 round trips of the requests an open editor makes all the time.
- A realtime room reads a socket's fixed session facts once, not on every frame.
- The tab save reads its document in one query and fetches the room's ledger alongside its other
  reads ([API](../015-api/api.md) "Tab save"); the timeline's event and its scopes are one batch; the
  guest-to-account migration moves its rows in one batch.

## Realtime and saving

- The tab save answers the saved tab's record and its new `rev`, never the content it was sent
  ([API](../015-api/api.md) "Tab save"): the editor reads only the revision, so an echo cost every
  autosave the tab's full size again (95,893 bytes for a 1,000-box tab, now under 200).
  `apps/api/src/routes/tab-put-route.test.ts` pins the answer's keys and size.
- A peer's op reaches what is on screen when it arrives, and each undo or redo snapshot only when
  undo, redo or a cancelled drag restores it ([Realtime conflict resolution](../012-collaboration/realtime-conflict-resolution.md)
  "Undo"). Applied to every snapshot on arrival, one peer save of 20 ops against 500 steps of a
  1,000-element board held the main thread 200 to 300 ms; replayed on restore it takes about 1 ms.
  `apps/live/hooks/canvas/useDocumentHistory.test.ts` counts the passes and checks every step
  against applying each op to every snapshot on arrival.
