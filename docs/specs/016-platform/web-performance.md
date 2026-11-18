# Web performance

Performance must be ultra slick throughout: every page, every surface, every gesture.

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
summary, its table of the largest contributors, and its diff against an earlier snapshot. Its data, written with
`next experimental-analyze -o`, is the real module graph: `node scripts/first-load-why.mjs <app> <route>` sums a
page's first load by package and folder, names the chain of static imports that brings a module in (`why`), and
what would leave the first load if a set of modules loaded on demand (`cut`).

What a long task is made of is read from a Chromium trace with its CPU profile, never inferred:
`node scripts/trace-long-tasks.mjs <trace.json>` names each main-thread task over 50 ms, its work by kind (scripts,
style, layout, paint, layerize, events) and the functions that held it, a forced layout under the function that
asked for it. `apps/live/scripts/explorer-long-list-measure.mjs --trace <dir>` records one per step of the Explorer's
long-list measure, at 4x CPU.

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

Then `/new` without the template builders up front (Webber's ruling on fork F1, measured 2026-11-15 the same
way): 801 to 525 KiB.

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
- The open path's early reads (`lib/open-path/early-document-reads.ts`, "The open path asks in parallel") load
  by dynamic import, and only at a document's address; every route carries the boot that decides, and the pool.
- `apps/live/app/first-load-lazy.test.ts` fails if any of these become static imports again.

### A surface that is not on screen loads when it is

A dialog, panel or view that renders only behind an open flag or a tab is loaded with
`next/dynamic` (`ssr: false`), the way the editor's Dashboard page and Sheets host already are.
The Explorer's Settings and move picker, and every telemetry dashboard view but the first, load
this way. Where switching to one must stay instant, its code is fetched once the page is idle
(the telemetry dashboard), unless the browser asks to save data (`navigator.connection.saveData`, the Save-Data
setting): then nothing is fetched ahead, and each view loads when it is opened, its skeleton holding its place.

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
the Explorer has settled, and when the button is pointed at or focused. `/new` loads them the same way, through the
same loader (`lib/new-document/new-document-content-loader.ts`): its wizard shows without them, they are fetched once
it has shown and the page is idle, and a choice made before then waits for them. When the address names a
document to make at once (`?template=<kind>`, `?blank=1`), `/new` starts fetching them as its code first runs,
alongside the editor's code, so a template link waits for nothing extra.

### The document page loads what a board may not need on demand

`apps/live/lib/editor-deferred-code.ts` names every module the editor loads on demand, so a surface's
`next/dynamic` and the prefetch below share one import:

- **Content a board may draw on open**: Pages mode's pages and their writing, the Draw dock, tables, sequence
  diagrams and the Map. Fetched as the editor mounts (`prefetchWhenIdle`), alongside the document request, so a
  board that has one finds its code already in, while the first load does not carry it. An element kind's own face
  (facilitation panels among them) loads with its family instead (below).
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

### An element kind's code loads with the board that holds it

Most of the document page's first load is the long tail of element kinds: each kind's face, its behaviours and its
share of the model's switches, whatever the board holds. A **kind family** is the unit that loads on demand: the
kinds that share their code (mind maps; pages and articles; charts, Sankey and dashboards; collaboration panels;
session controls; office furniture and seating; wireframes; web components; embeds (videos and link cards);
concepts; entities; sketches; Event Storming). The plain diagram kinds (shapes, text, arrows, notes, images, pen
strokes, and the diagram furniture: badges, steps, boundaries, keys) are the base and always load. Which family a
kind belongs to follows the palette's grouping: the Behaviour tiles are session controls (default). The charts are
the pie, column and line charts (a chart drawn from a sheet range too) and the Sankey diagram; the Data tiles'
legend is a key, and its progress bars, rings and ratings stay base with it (default). A tab's articles belong to
the pages and articles family whatever elements its pages hold: an article's writing, its zones, its margin notes
and turning it into pages load with it, while reading a tab's pages and articles stays base. A mind map's growing,
laying out, connecting, converting, arranging, outline and its root's halo load with the mind maps family, while
reading a map (its order, its numbers and its groups' boxes, which an export and every change's settling read) stays
base; turning a shape into a mind node waits for the family as a palette press does. An Event Storming board belongs to its
family by its kind: reading a photographed wall into a draft loads with it, and a photo import waits for it before
its photos go up, while a draft's notes and the board's notes, lanes and structure stay base. The
collaboration panels' and the quiz's verbs, and the Behaviour elements' menu setters, load with their families, read
at the press; the panels' wire and the room's live state (polls, Q&A, idea posts, reaction bursts) stay base.

- **The registry.** `apps/live/lib/element-kinds/` names every family, which kinds it holds and its loader, so the
  open path, the palette and the prefetch below share one import per family. Code reaches a family's face,
  behaviours or model parts only through the registry, never through a static import; what every board needs of a
  kind stays base, whatever its family: its wire (validating, normalising and making one), its name and its
  picture in a thumbnail or an export. The registry answers a family that is not loaded yet with a named error, so
  a missed path fails a test rather than drawing a wrong board.
- **At the open.** The open read carries the opened tab ("The open is one read"), so the early reads ask for the
  families it needs (its elements' and its articles') as soon as it arrives, alongside the editor's own code. The
  board's first paint waits for them: a board draws every element with its own face in its first frame, never a
  placeholder that a face later replaces. It waits for them to settle, loaded or failed, with no time limit of its
  own: a chunk fetch ends by itself (default).
- **Another tab.** Opening a tab loads the families it needs before it draws, from the tab's own read. Articles
  that arrive later (a template, a peer's) ask for their family, and their writing draws once it is in.
- **From the palette.** Pointing at or focusing a palette entry fetches its family; a press places the element
  (or arms its tool) once its family is in, so an element is never placed without its face. A press whose family
  cannot load places nothing (default).
- **Once the board has settled.** Every remaining family is fetched when the opened board has rendered and the page
  is idle (`prefetchWhenIdle`), so a paste, a template, a peer's new element or going offline later finds them in.
  An element that arrives before its family (a peer's, in a session's first seconds) draws when its family is in.
  A prefetch that fails is forgotten rather than shown; the family is asked again when something needs it (default).
- **When a family cannot load** (offline before it was fetched), the elements of that family draw nothing and a
  notice at the top of the board, "Part of this board couldn’t load." with Retry, shows while a load something
  waited for has failed (default), and retries by itself once the connection is back; the rest of the board works.
  A family that cannot load because a newer build is live recovers as any other chunk does
  ([Stale builds](stale-builds.md)).
- `apps/live/app/document/[id]/document-lazy-load.test.ts` fails if a family's modules are reachable from the
  first load again, or a first-load file imports a model part its family's entry takes from a package, or reaches
  the package module that defines one through the package's own imports;
  `scripts/first-load-why.mjs` names the chain of imports that brought one back.

### A page's first-load scripts compile as they download

Every script a page's HTML names runs as the page starts, so the editor's build marks each one for compiling on
the way in: `apps/live/scripts/compile-hints.mjs` runs after `next build` and puts V8's file-level hint,
`//# allFunctionsCalledOnLoad`, on the first line of every script some page of the export names. Chrome (136 and
later) then compiles a hinted script's functions on the thread that streams it in, while the rest still downloads,
rather than one at a time on the main thread as the page first calls each. Other browsers read a comment.

- Only first-load scripts carry it. A script only a dynamic import loads stays lazy, as V8 advises: compiling
  what may never run costs time and memory. The editor's own scripts are first-load for the document page, so they
  carry the hint wherever they load, `/new` and the Explorer's fetch ahead included.
- The hint is part of the file, not its name: a browser that still holds an unhinted copy under the same name
  keeps compiling it lazily, as before, until the name changes. Production ships no source maps; one would need
  its mappings moved down a line.
- Measured on the document page (a shared link opened by a first-time guest, a production-shaped local stack:
  HTTP/2, zstd, 4 Mbit/s, 100 ms, CPU 4x): opening the editor's main script took the main thread 1,077 ms, 662 of
  them compiling, and 304 ms with the hint; the first render 412 ms and 215 ms. The main thread's busy time until
  the board was editable fell from 3,326 to 2,185 ms, and the page holds about 7 MiB more of compiled code.
- `apps/live/scripts/compile-hints.test.ts` pins which scripts are hinted, and that a second run changes nothing.

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
- A long Explorer list (the page's List, Card and Details views, the editor panel's lists) draws only the rows near
  the view, its scrollbar the whole list's; find, focus, Back and screen readers are kept whole
  ([Explorer structure](../013-workspace/explorer-structure.md#long-lists)).
- The list itself is fetched whole (`GET /api/documents`), never paged: the sidebar's counts, the lens over every
  document, Recent, Tags, the Details sort and the Explorer's find all read the whole list, and it is small on the
  wire. Measured 2026-11-15: 1,000 documents are 410 KB, 35 KB gzipped, answered in about 23 ms on the local stack;
  the largest library on docs.nu then held 105. Drawing was the cost: at 4x CPU, opening a folder of 1,000 took 16 to
  19 s on the Explorer page (a single task of up to 13 s, about 37,000 elements) and 34.5 s in the editor's panel,
  and scrolling it crashed the tab. Windowed, the same folder opened in 0.3 to 0.5 s with its longest task about
  0.1 s, and scrolled to its end. Measure it again with `apps/live/scripts/explorer-long-list-seed.mjs` and
  `explorer-long-list-measure.mjs`.
- A document thumbnail's motion stays its own: the loader's animations and the picture's crossfade start, repeat and
  end without an event reaching React, stopped at the window by one capture listener
  (`components/panels/thumbnail-motion-events.ts`). Every one bubbled to React's root listener, which looked for a
  handler that is never there: a folder of 30 opening fired 390 `animationstart` events in one task, 215 ms of it at
  4x CPU.
- A thumbnail loader away from the view holds still ([Document snapshots](../006-document/document-snapshots.md)): a
  List view of 1,000 kept 21 loaders past its edge running 252 animations for as long as the folder stayed open.
- A thumbnail loader is the still sketch for its first half second and draws only for a slower snapshot
  ([Document snapshots](../006-document/document-snapshots.md)). While it is still it runs no animation, and a
  drawing one animates its strokes by stroke-opacity and its spinner by its dash offset, never by opacity or a
  transform: an element animating either becomes a composited layer, eleven per loader, and a screen of loaders held
  hundreds, rebuilt every frame while a long list scrolled.

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
- A box sized or placed from a measurement takes it in the commit that changes what it measures (a layout effect,
  or the microtask a MutationObserver reports in), never from a ResizeObserver's state update: Chrome counts what a
  resize callback moves as a layout shift, even before the frame is drawn, and a state update lands a frame later
  still. The editor's palette strip settles this way as a board opens, from 0.027 to 0.037 on every open to none
  ([Toolbar layout](../007-editor/toolbar-layout.md#motion)).

### The first images a visitor sees load first

A gallery's first row loads its images eagerly with
`fetchpriority="high"`; every other card's image is lazy.

### The open path asks in parallel

Opening a document waits on as few round trips in a row as who is asking allows. Nothing is asked
as a different person than the one the session settles, even briefly
([Auth + guest access](../014-identity/auth-and-guest-access.md)).

- **The session read leaves with the HTML.** Every page of the editor app starts its session read from an inline
  script at the top of its head (`lib/boot-session-read.ts`), so it travels while the scripts download, and whatever
  api isolate answers it starts then, not after the page has hydrated. The auth bridge takes that request for its
  first read and asks itself for every later one; where the bridge stands down (the workbench) nothing is asked
  early. It is a read of the session cookie, as the bridge's own is: who is asking is still settled by its answer.
- **The session and its token together.** A browser whose signed-in hint is `1` asks for its
  session token beside the session read; the read alone still decides who is signed in, and a read
  that answers signed out drops the token. A guest (hint `0` or none) asks for no token.
- **The reader's row and the document together.** Once the reader's id is known (the account's, or
  the guest's signed id), the document, or the share link it follows, is asked for at once, never after the
  participant row: a share link's row is asked beside it, a document's rides in its open read. The editor still
  opens only once both have answered, as the participant they resolved.
- **The open is one read.** The document read the editor makes as an open (`X-Document-Open: 1`) answers the tab it
  opens first and the reader's own participant row with the document ([API](../015-api/api.md)), so a document opened
  by its address waits on the session, then one read. Each read on that chain is a toss for a cold api isolate (about
  300 ms on docs.nu, about half of reads at its traffic), so the chain's length, not the bytes, is what an open pays.
  The tab and the row cost the room no more D1 round trips: the tab is the room's own storage, the row a subquery of
  the document's. An answer without them (an api from before) is met by the separate reads, as before.
  A share link's read, marked the same way, carries the same two: the api asks the document's room for the tab, as
  the visitor's own tab read would ask it (their identity, the link's code, the password or grant they sent), so the
  room's gate, redaction and open record are the tab read's own. The room was already asked for the outline.
- **The order that remains:** the session (and token), then the open read: a document by its address and a share link
  alike. A first visit mints its guest id between the two. A password-protected link answers its gate first, and
  opens once the password is right.
- **A guest id this page minted has no row to read.** The api mints a guest id fresh (`POST /api/guest-id`), so its
  participant row cannot exist yet: the row is written, never asked for first, by the editor, by `/new` and by the
  early reads alike. A first visit pays the mint, not a read between it and the write.
- **The open never waits for a write.** The participant row a first visit (or a signed-in name that changed) saves is
  written beside the open, never before it: the editor already holds the name and colour it writes, and opens with
  them. A read of that row made while the save is in flight waits for it (below); a save that fails is logged. On
  docs.nu a share link's first visit waited for the write after its tab had answered, and the write met a cold api
  isolate (about 300 ms) as often as any read.
- **A row being saved answers its own read.** A participant read made while this page's save of that row is in
  flight waits for the save and answers what it wrote: `/new` saves a first visitor's row and hands the document to
  the editor in place, whose read would otherwise ask again and, answered before the save landed, write it twice.
- Guests and share links still wait for the session read before asking for anything: a cleared
  hint must not open a signed-in person's link as a guest (D25).
- **Asked while the editor's code downloads.** The editor's code is the most a page loads (about 1.5 MB), and the
  open path's reads waited for all of it to arrive and run. On a page load that starts at a document's address
  (`/document/<id>`, a share link), what every route ships starts them instead (`EarlyDocumentReadsBoot`), as
  soon as the session read has answered (never on the five-second guest fallback). A sign-in with a guest
  migration still to run asks nothing early: the editor waits for the migration. It hears the session outside
  React (`lib/first-session.ts`): a state update at the root waits for every part of the tree still hydrating,
  which at a document's address is the editor, so the session that answered at 2.6 s reached the page at 3.7 s,
  as the editor's code ran (4 Mbit/s, 100 ms, CPU 4x). It asks what the editor would, in the same order, as the same
  person, with the same headers: the guest's signed id (minted once, the editor's own mint), then a document's open
  read, or a share link's participant row and share read (with the cached grant the editor would send) and then the
  tab the editor would open first (`firstTabToLoad`), marked as an open. Its code is fetched by a dynamic import as the
  page starts, so no other route carries it.
- **The editor takes what was asked early.** Each early answer waits, unread, in a one-shot pool
  (`lib/api/early-reads.ts`) keyed by its address and every header it was asked with; the editor's own request
  (through `apiFetch`) for the same address with the same headers takes it instead of asking again. A request as
  anyone else, or with another password, misses and asks. An answer is taken once. The pool opens as the page
  starts at a document's address and lives `EARLY_READS_WINDOW_MS = 60000` (default), then forgets what it holds;
  an early read the network failed is not kept, so the editor asks itself. A read the page asked itself while the
  pool was open is never asked early as well.
- Nothing is written early but the guest id the editor would mint: a first visit's participant row is still
  written by the editor. A document in This Browser asks the server nothing; an embed, a workbench and every
  other address ask nothing early.

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
- The Explorer's sidebar tree writes a row's tab stop only when it changes: writing the focused row's, even unchanged,
  made the browser lay the whole page out there and then, inside the render. On a folder of 1,000 at 4x CPU that was
  108 ms of the 174 ms click that opened it.

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
  rather than asking again, and asks itself only where the script did not run. The editor app's session read
  leaves the same way, on every page ("The open path asks in parallel"). Not a
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
  missing from it would lose its preview. The head never waits on it: everything but the title
  and the preview tags goes out with the shell, so a person's browser fetches the editor's code
  while the api answers, and only the body waits. The card is one D1 read, and its 1.5 s budget
  is a crawler's: measured outside Western Europe, a cold card took 0.3 to 0.9 s, where a
  shorter wait would cost those crawlers their preview.

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
- Opening a document is one D1 round trip: its row carries its owner's name and colour, and on an open the
  reader's own row, each a key seek on the participant, rather than a second read after the row (`document-request-round-trips.test.ts`).
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
- The worker ships minified, its names kept and its source maps uploaded (`apps/api/src/worker-bundle.test.ts`). A
  fresh isolate, the worker's or a document room's, fetches and compiles the whole bundle before its first answer,
  and on docs.nu that start is the larger part of a slow document open: an answer marked `api-cold` waits about
  340 ms beyond its measures (409 before minifying), one without about 50. A bundle change is judged by that wait,
  read from `Server-Timing`, as well as by the deploy's "Worker Startup Time", which counts only the top-level CPU:
  minifying raised that figure and still cut the wait.
- A list that names its people reads their profiles in the same statement: a team's members join their
  participant rows (`apps/api/src/db/team-members.test.ts` pins the round trip and the plan).
- A request about one document pays no D1 read for the purge guard: the document's own row keeps it
  ([Document storage](../006-document/document-storage.md) G3). `apps/api/src/routes/document-request-round-trips.test.ts`
  counts the D1 round trips of the requests an open editor makes all the time.
- A realtime room reads a socket's fixed session facts once, not on every frame.
- A successful api answer says where its time went in a `Server-Timing` header: the worker's whole answer (`api`)
  and, under `/api/documents/<id>/`, its call to the room (`room`) and, inside the room, its wake on the first
  request after one (`room-wake`), its ready gate (`room-gate`), each D1 round trip in order (`room-d1-<n>`) and its
  handler (`room-handler`). An isolate's first answer is named (`api-cold`, `room-cold`): its start comes before any
  clock runs, so it shows as the time beyond the measures. A refusal or failure carries none: timed step by step, it
  would show which gate a caller failed. Durations only, in whole milliseconds.
- The tab save reads its document in one query and fetches the room's ledger alongside its other
  reads ([API](../015-api/api.md) "Tab save"); the timeline's event and its scopes are one batch; the
  guest-to-account migration moves its rows in one batch.

## Realtime and saving

- The tab save answers the saved tab's record and its new `rev`, never the content it was sent
  ([API](../015-api/api.md) "Tab save"): the editor reads only the revision, so an echo cost every
  autosave the tab's full size again (95,893 bytes for a 1,000-box tab, now under 200).
  `apps/api/src/routes/tab-put-route.test.ts` pins the answer's keys and size.
- An autosave of a This Browser document writes the tab it saves and the small document record,
  never the other tabs ([Offline Mode](../006-document/offline-mode.md) "Where offline documents
  live"): one IndexedDB record per tab. On a five-tab document of 1,000 boxes a tab, a save wrote
  509,336 bytes when the document was one record; it writes 102,082 now (the tab and its
  document record).
  `apps/live/lib/offline/offline-save-bytes.test.ts` counts the bytes every save puts.
- A peer's op reaches what is on screen when it arrives, and each undo or redo snapshot only when
  undo, redo or a cancelled drag restores it ([Realtime conflict resolution](../012-collaboration/realtime-conflict-resolution.md)
  "Undo"). Applied to every snapshot on arrival, one peer save of 20 ops against 500 steps of a
  1,000-element board held the main thread 200 to 300 ms; replayed on restore it takes about 1 ms.
  `apps/live/hooks/canvas/useDocumentHistory.test.ts` counts the passes and checks every step
  against applying each op to every snapshot on arrival.
- The room's catch-up log stays in memory across a wake ([Resync without reloading the page](../012-collaboration/resync-without-reload.md)
  "Measured before persisting it"): 2 resyncs in 21 days of production did not pay for two more rows
  written per op. It is persisted once resyncs after a wake are measured to be several a week.
