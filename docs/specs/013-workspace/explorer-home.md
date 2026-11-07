# Explorer Home

**Home** is the Explorer's landing view and the first row of the sidebar's Overview group
([Explorer structure](explorer-structure.md)). It answers the two questions a returning person
brings, in one screen: "what was I working on?" and "what happened while I was away?".

## Route

- Home lives at `/explorer/home`. `/explorer`, and any Explorer URL that names no view, lands on it.
- **The site's front door is Home** ([Purpose](../001-project-vision/purpose.md#the-product-comes-first)). Opening
  `/` sends the reader on to `/explorer/home` before any page is served (the live worker's `302`; the live app's own
  `/` page does the same where no worker is in front), so every Explorer view keeps one address under `/explorer`
  and one shell. The query string goes along.
- The **Timeline** ([Timeline](timeline.md)) lives at `/explorer/timeline`, with a sidebar row of its own under the
  Inbox ([Explorer structure](explorer-structure.md)). What Happened's **See Timeline** link also opens it; its
  breadcrumb is its own (**Timeline**).

## Layout

Home is drawn like every other Explorer page: the header's search field
([Explorer filters](explorer-filters.md#the-field)), the sidebar, and beside it the pane.

- **The page header** opens the pane, as on every Explorer page ([Explorer structure](explorer-structure.md)): the
  title **Home** (the page's `h1`), its Help link ([Contextual help links](../018-help/contextual-help-links.md)),
  **New Document**, and, on a phone, the menu button that opens the
  [mobile drawer](explorer-structure.md#mobile-drawer). There is no banner above it.
- **One column** under it, at every width: **Jump Back In**, then **What Happened**. It scrolls with the page.
- Each section opens with its heading row: the title (16 px, semibold) and the section's quiet link at the right end
  (**See More**, **See Timeline**), a hairline rule under the row.
- Jump Back In's documents are **thumbnails** ([Jump Back In](#jump-back-in)); What Happened's days are a plain
  list under small day labels, straight on the page.
- Home has no import, no folder and no view switch.
- The person's own history (what they created, updated or opened) is not on Home: Jump Back In holds what they
  reach for, and the full record is the Timeline's.

## First run

A person with **nothing yet** gets a small welcome in the pane instead of a Home that waits for history, drawn in
Home's own quiet look: section headings with a rule, and small tiles like Jump Back In's. "Nothing
yet" means, once the Explorer's lists have loaded: no document of their own, none shared with them, none in any
team they belong to, and none stored only in this browser. Until the lists load, Home's body is the ordinary Home
(its skeletons); it never guesses. A list that failed to load says nothing about them, so it is never "nothing yet":
Home stays the ordinary Home. The moment they have a document, Home is the ordinary Home again.

The page header stays as it is (**Home**, Help, **New Document**). Under it, Home holds these sections in place of
Jump Back In and What Happened:

- **Start Blank**: the five blanks, one per mode (Blank Diagram, Blank Whiteboard, Blank Session, Blank
  Illustration, Blank Plan), five across from the `md` breakpoint (two on a phone, three from `sm`). Each is a tile:
  its preview (80 px high, on a hairline-bordered card), its title under it, and its one-line description as a quiet
  line and as its tooltip. Activating one makes that blank at once (`/new?template=<kind>`).
- **Popular Templates**: the first four non-blank templates of the shared Popular list, one row of the same tiles
  four across (two on a phone); activating one makes it at once. A quiet **Browse All Templates** link in the
  heading row opens the wizard (`/new`).
- **Already Have Work?**: up to two plain cards side by side (a white, hairline-bordered card; the raised surface in
  dark mode), each a small title, one quiet line and its control.
  - For a guest on a deployment with sign-in: **Nothing here yet? Sign in**: "If you have used LiveDoc before,
    sign in and your documents come back with you." with a small brand **Sign In** button. A signed-out person who expected
    their work finds the way back first.
  - **Bring It With You**: "Import boards from Miro, draw.io, Excalidraw or Microsoft Whiteboard; each becomes its own
    document." with the Explorer's own **Import From** control, filing into My Documents as it does there.

The welcome's previews are loaded only for a person with nothing yet, so everyone else's Home pays nothing for
them. It follows the share-role rule trivially: it is the person's own Home, with no shared document in reach.

## Jump Back In

Jump Back In is a **[Within reach](../004-interface-design/within-reach.md)** set of the person's documents:
the **4 most used** and the **4 most recent**, no document twice.

- **Most Used**: the documents the person used on the most days in the **last 90 days**. A **use day** is a UTC
  day on which they opened the document ([Opens](#opens)), edited it (an edit needs an open, so the days before
  opens were recorded still count, through their edits) or made it ([Making a document](#making-a-document)).
  Equal counts go to the one used most recently.
- **Recent**: the documents the person used most recently, newest first: the latest of their last open, their last
  edit and their making of it. A document that is both shows under **Most Used**, and Recent takes the next most
  recent instead.
- **Not empty on day one**: every day the person edited a document before opens were recorded counts as a day
  they opened it, so Most Used reflects the work they already did.
- **Making a document is a use**, and a **bulk import is not** ([Making a document](#making-a-document)): what the
  person just made is in Jump Back In at once, opened or not, while one big import never pushes everything else
  out of it.
- Only documents the person can open now: never one in the Trash, nor one whose share link has lapsed or whose
  team they have left.
- A document stored only in this browser ([Offline Mode](../006-document/offline-mode.md)) takes part with this
  browser's own record of its opens and edits ([Opens](#opens)), and carries the **This Browser** pill on its
  thumbnail, as every other row and card of one does.
- Each document is a **tile**: its snapshot thumbnail with its name under it in a small font, and nothing more: no
  line says why it is there (Calm by default). The full name is its accessible name and its tooltip (a long name is
  cut short under the picture). Activating a tile opens the document.
- **Each tile has the document's ⋯ menu**, the same menu its row and card carry everywhere else in the Explorer
  (Rename, Duplicate, Move, Favourite, History, Delete and the rest; a document shared with you gets the
  shared-with-you menu), so it can be changed from Home without opening it. A ⋯ button at the top right of the tile's
  thumbnail opens it. A right-click anywhere on the tile opens it too. Under a mouse the button shows while the tile
  is hovered or has keyboard focus; on touch it always shows. It is a button beside the tile's link, never inside it.
  - The menu opens **beside the tile**, out of its way, never over it: to the tile's right with its top level with
    the tile's, or to its left when the right has no room. Only when neither side has room (a phone, a narrow
    window) does it hang below the ⋯ as other menus do. Either way it stays inside the window. The ⋯ and a
    right-click open it in the same place.
  - **Rename** edits the name in place on the tile, as on an Explorer card; while renaming, the tile does not open.
  - What changes shows at once: a renamed document shows its new name, and a document moved to the Trash or taken
    off Shared With Me leaves Jump Back In (and comes back if the move is undone).
  - The menu is the Explorer's own, so it offers each document what the Explorer does and nothing more
    ([Share roles](share-roles.md)): your own and your team's documents get the full menu, and one
    shared with you gets the shared-with-you menu.
  - A document the Explorer has not loaded (a team library the sidebar has not read yet) has no ⋯: a menu that
    guesses is worse than none, and the tile still opens on click.
- **No row titles.** "Jump Back In" is the section's only title: the two groups carry no visible label and no
  extra screen-reader label, and their order (most used first, then recent) is left to people's intuition
  ([Design principles: Calm by default](../004-interface-design/design-principles.md)). The documents are one list
  of links, named **Jump Back In**, each named by its document's name.
- **See More** opens the **Recent** page: a quiet link at the end of the section's heading row on a desktop or
  tablet, the strip's last tile on a phone. It shows only once Jump Back In has a document: not while it loads, and
  not when it is empty. The Recent page is `/explorer/recent`: every document the person can
  open, most recently saved first (a save by anyone), not by the person's own use as Jump Back In's recent
  group is, with the shared filter chips ([Explorer filters](explorer-filters.md)). Its breadcrumb leads
  back to Home (**Home › Recent**).

### Desktop and tablet

- A **4 by 2 grid** of thumbnail tiles that never scrolls sideways: the top row holds the most used, the bottom row
  the recent, each most used or newest first from the left. Each thumbnail is the column's width and 80 px high, on
  a hairline-bordered white ground, its edge darkening on hover, so the grid's height never depends on the width.

### Phone

- One **sideways-scrolling strip** of at most **8** thumbnails: most used, recent, most used, recent, and so on;
  when one group runs out, the rest of the other follows. Each tile is its thumbnail and name, as in the grid.
- The strip ends in a **See More** tile, the same size as a thumbnail, that opens the Recent page.
- The strip scrolls sideways (touch, trackpad, Shift+wheel, and keyboard focus moving through it). Its trailing
  edge fades to say there is more, and only while there is more.

### Fewer than 8 documents

- Only the documents that exist are drawn: no empty boxes. A short group leaves the rest of its row blank; with no
  most used document at all, the recent ones take the top row.
- The grid keeps its two rows' height whatever lands in it, so nothing below moves when Home loads.
- With **no document at all** it looks as if it held one: a single slot the height of one tile, two columns wide
  (from the first column, a dashed edge), holding the empty state ("No documents yet", "The documents you use most and last
  will gather here."). Only then is Jump Back In shorter than its reserved height: What Happened
  sits under the one row.
- On a phone with no document at all, the strip holds the small [empty state](../004-interface-design/empty-states.md)'s
  heading alone, the size of one tile, and no See More tile.

### Making a document

- **Making a document is a use.** The day a person makes a document is a use day of it, and the moment they make
  it a use, however they make it: the New Document wizard, an import of one document, a duplicate, a copy of a
  document shared with them, or one an AI tool or an API client makes for them. So a document made without being
  opened is in Jump Back In at once.
- **Once a day, as ever.** The wizard opens what it makes: the making and the first open fall on one day, which is
  one use day, not two.
- **A bulk import is not a use.** An import that makes **more than one document in one go** (a Microsoft
  Whiteboard export of several boards, several draw.io files, several Excalidraw files) does not mark its
  documents used, so one big import never pushes everything else out of the recent row. They wait on the Recent
  page and in their folder until they are opened or edited. The import of a single document counts as any other
  making does.
- **The create says so.** Creating a document says whether it counts as a use: `markUsed`, true unless the caller
  sends `false` ([API](../015-api/api.md), `POST /api/documents`). The editor's bulk imports send `false`; any API
  client may, and an AI tool's create may too ([MCP server](../015-api/mcp-server.md), `create_document`).
- Moving a document is not making it: saving an [Offline Mode](../006-document/offline-mode.md) document to the
  cloud, or taking a cloud one offline, is no use of it.
- Only makings from when a making began to count are counted: a document made before that joins at its next open
  or edit, as before.
- A document stored only in this browser counts its making in this browser's record ([Opens](#opens)), by the same
  rule: a bulk import of local documents marks none of them used.

## What Happened

- What **other people** did to documents the person can open, grouped under day headings (**Today**, **Yesterday**,
  then the date). The days are the person's own (their time zone), and the section covers the last **14 days**.
- "Documents the person can open" are the ones they own, the ones in a team they have joined, and the ones shared
  with them through a link that is still live. A link scoped to one tab ([Tab-scoped share links](tab-scoped-share-links.md))
  shows nothing here: the actions name things on tabs the link does not reach.
- "Other people" are everyone but the person, under any identity they have had (a guest id before sign-up counts as
  theirs).
- The actions and their verbs are a closed set, in this order wherever several are named:

  | Action                                         | Verb phrase            |
  | ---------------------------------------------- | ---------------------- |
  | A comment that starts a thread                 | commented              |
  | A comment on a thread that already had one     | replied                |
  | A thread resolved                              | resolved a thread      |
  | A day of edits (one per person per day)        | edited                 |
  | An action assigned to the person               | assigned you an action |
  | An action assigned to anyone else              | assigned an action     |
  | An action completed                            | completed an action    |
  | The document published into one of their teams | shared                 |

- Opens are never listed here: whether someone looked at a document is theirs to know, not the reader's.
- **No filter controls** sit in or above this section. It stays clean; the shared filters live on the other
  Explorer views ([Explorer filters](explorer-filters.md)).
- **Nothing from anyone, no section.** When nobody else did anything in the window, What Happened is left out of the
  page entirely, heading included, rather than set a second empty state under Jump Back In's. While it loads, its
  heading and skeleton hold its place.
- A quiet **See Timeline** link beside the section's heading opens the **Timeline**, shown only once What Happened
  has an entry (not while it loads, not when it is empty), where
  everything that happened, the person's own doings included, can be filtered and paged.
- Every entry is **spot on**. It names:
  - who acted;
  - what they did, as a plain verb phrase (commented, replied, resolved a thread, edited, assigned you an action,
    shared);
  - which document;
  - where the document lives (its space and folder).
- One document's actions on one day form a **group**. A group with one person is shown as that person's entries,
  one per action.
- **Several actions on one document by more than one person collapse into one entry**, a **summary sentence that
  expands**:
  - the people's avatars, overlapped, then one sentence naming them and what they did, e.g. "Priya, Sam and Lee
    commented, edited and assigned you an action in **Payments architecture**";
  - beneath it, where the document lives, how many updates there were and the time of the latest ("Platform team ·
    5 updates · 14:05");
  - a chevron;
  - expanding lists every underlying action, newest first: avatar, who, what, a small icon for the kind, and time.
  - The entry is a disclosure button (`aria-expanded`); collapsed is the default, and the state is not remembered.
  - Each expanded action opens the document.
- A one-person entry is a link that opens the document. A comment or reply shows its words beneath, an action its
  name, on one line; then where the document lives and the time.
- "Where the document lives" reads the team's name for a document in a team (whoever reaches it, its owner included)
  or **My Documents**, then `›` and the folder when it has one; a
  document shared with the person reads **Shared by** and the owner's name.
- A person without a known name is **Someone**. A summary names at most three people, then "and N others".
- Times are clock times in the person's own time zone and locale (`14:05`, `2:05 PM`), under the day heading that dates
  them.

## Unread

Viewing Home counts as having looked: it moves the Timeline feed's unread mark exactly as the Timeline page does
([Timeline](timeline.md) §2.5), once per visit, and says where the mark stood before, so what is new to the person
can be marked.

- In What Happened, an entry newer than that mark carries a **New** pill, as the Timeline's cards do: the word,
  never colour alone. A summary is new when its latest action is.
- A person who has never looked sees none: marking a whole history new would be noise.
- The mark is the one the first read of the visit reports; a retry does not move what is marked.
- The sidebar's Home badge clears when Home has been read.

## Opens

An **open** is the editor loading a document for a person to look at.

- It counts for whoever opens it: the owner, a teammate, or a visitor through a share link. A visitor always has an
  identity (their guest id, or their account), so their open is theirs.
- Its **day** is recorded **once per person per document per day** (UTC, the day boundary every coalesced event
  uses), at the day's first open. Every open, the first of the day or not, moves the person's **last open** of the
  document, which is what Recent reads.
- These are **not** opens: a snapshot or thumbnail, an embed ([Read-only embeds](embeds.md)), a duplicate, Take
  Offline, the Google Drive mirror, and any read through the public API or an AI tool.
- Opens are **private**. Only the person who opened a document ever sees that they did: in their Jump Back In, never in What Happened, a document's
  History, a team's feed, or the Timeline feed ([Timeline](timeline.md)).
- Offline Mode documents never reach the server, so the server records none of their opens. **This Browser counts
  them instead**: the editor opening a document stored only here adds the day to that document's own record in
  this browser, by the same once-per-UTC-day rule, keeping the days of the last 90, and moves its last open. Its
  last edit is the record's own save time. Making a document here starts that record with the day and the moment
  it was made, as an open would, unless it came in a bulk import ([Making a document](#making-a-document)). So
  Jump Back In places it among the rest by the same rule. The record lives and dies with the document's local
  record and never leaves the browser.

### Guests, sign-up and deletion

- Guests have Home in full, keyed to their guest id.
- Signing up moves a guest's opens to the account with the rest of their data ([Auth + guest access](../014-identity/auth-and-guest-access.md)).
  A document opened under both identities keeps both histories: its use days are the days of either, and its last
  open the later of the two.
- Deleting the account deletes its opens. Deleting a document for good deletes everyone's opens of it; a document in
  the Trash only leaves Home until it is restored.
- An open older than a year is forgotten, the Timeline's retention ([Timeline](timeline.md) §3.5).

## States

Every state keeps the layout it lands in: headings are in place from the first paint, and each section's skeleton
has the size of what replaces it, so nothing shifts (CLS 0). The one exception is a person with no document at all:
Jump Back In's single empty slot is shorter than the skeleton, so What Happened rises once, on a page with nothing
else on it.

| State                 | What shows                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Loading               | Each section's skeleton: both groups' tiles (the phone's strip), three entry rows                              |
| Jump Back In, partial | What exists, no empty boxes (see [Fewer than 8 documents](#fewer-than-8-documents))                            |
| Jump Back In, empty   | One tile-high slot: empty state "No documents yet": "The documents you use most and last will gather here."    |
| What Happened, empty  | The section is left out: no heading, no link, no empty state. It is the page's last section, so nothing moves. |
| Read failed           | "Home could not load. Check your connection and try again." with **Try again**, in place of the body           |

Under reduced motion nothing animates: no skeleton pulse, no chevron turn, no smooth scrolling.

## Telemetry

One-liners on the closed vocabulary ([Telemetry](../017-telemetry/telemetry.md)), never a name or an id:

- `Home·Opened·Landing` / `Nav`: Home shown, as the page the Explorer opened on or after starting elsewhere.
- `Home·Selected·JumpBackIn.MostUsed` / `JumpBackIn.Recent`: a document opened from Jump Back In, by the group it
  belongs to (most used or recent), wherever it sits.
- `Home·Selected·JumpBackIn.SeeMore`: See More followed to the Recent page (the link or the phone's tile).
- `Home·Selected·WhatHappened`: a document opened from What Happened.
- `Home·Opened·Group`: a summary entry expanded.
- `Home·Loaded·Retry`: a failed read retried.
- `Home·Opened·Welcome`: the first-run Home shown.
- `Home·Selected·Welcome.Blank` / `Welcome.Template` / `Welcome.AllTemplates` / `Welcome.SignIn`: a start taken
  from it (a blank card, a template card, Browse All Templates, Sign In). `Welcome.Search` and `Welcome.StartBlank`
  belonged to the banner's template field and are no longer recorded.

## Help

The help centre's [Home](../../../apps/help/app/explorer/timeline/page.mdx) article describes Home (Jump Back In, What Happened) and the Timeline.

## Accessibility

- Each section is a landmark (`section`) named by its heading (**Jump Back In**, **What Happened**).
- Jump Back In's documents are one list named **Jump Back In**; each document is one link named by its document's
  name (plus **This Browser** for a document stored only here). No row or group carries a label of its own.
- A summary entry's expanded list is the region its disclosure button controls (`aria-controls`).
- Keyboard order follows the reading order: See More (desktop and tablet), Jump Back In's documents in their order
  (then the See More tile on a phone), then What Happened.
- WCAG 2.2 AA: contrast, visible focus, and targets of at least 24 by 24 px.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D65** Which migration number: 0063; 0061 and 0062 are taken by open branches (default).
- **D66** How the server tells an open from any other tab read: The editor's first-tab read carries `X-Document-Open: 1`,
  unless embedded; nothing else does (default).
- **D67** Which day What Happened uses when no time zone is sent: UTC (default).
- **D68** How many actions one What Happened read holds: 200, newest first; a capped read logs (default).
- **D69** Whether a shared document names its team and folder: No: the owner's filing is theirs; both are null for `via: 'shared'`
  (default).
- **D70** Use days of a document opened as guest and as account: The days of either; a day under both counts once; the
  last open is the later (default).
- **D71** Whether Remove from Timeline hides a Home entry: No: it is a verb of the Timeline feed only (default).
- **D72** Largest Timeline page: Retired: Home has no Timeline column and no paged read (default).
- **D73** Home's rate limit: 60 reads per 60 s per resolved owner (default).
- **D74** Who "you" is in "assigned you an action": The assignee id is the person's or one of their aliases; an invited
  member row is not (default).
- **D75** What else viewing Home does: Moves the unread mark by the Timeline's visit rule; seeds nothing (default).
- **D76** Which edit days seed frecency: Retired: edit days count as use days at read time (D126), so nothing is seeded
  (default).
- **D77** Order of documents equal on every Within reach measure: Document id ascending (default).
- **D78** Order of the people in a group: Newest action first (default).
- **D79** How a reconstructed edit written before the mark is told apart: Stored more than 60 s after its own time;
  marked once by migration 0063 (default).
- **D80** How far the frecency seed reaches: Retired: nothing is seeded (D126) (default).
- **D94** What the Timeline feed's page is called once Home is its own view: **Timeline**, its sidebar row's label (the
  spec names it); the route and the kind keep their names (default).
- **D95** Which time zone Home sends: The browser's own (`Intl.DateTimeFormat().resolvedOptions().timeZone`), so days
  match the clock the person reads (default).
- **D96** Where the Timeline's alternation restarts: Retired: Home has no Timeline column (default).
- **D97** Whether the phone switch remembers its tab: Retired: Home has no Recent / Timeline switch (default).
- **D98** How early the next Timeline page loads: Retired: Home has no Timeline column to page (default).
- **D99** How many avatars a summary overlaps: Three, then a `+N` disc (default).
- **D100** Thumbnail sizes: Grid tiles share the section's width at 80 px high; strip 128 × 80 (default).
- **D101** The Timeline column's width: Retired: Home has no Timeline column (default).
- **D102** Whether Home's header keeps the Help link: Yes: every section's header carries it; it is not an action on
  Home (default).
- **D103** Where See Timeline sits: In What Happened's heading row, at its end, so it never moves when entries load
  (default).
- **D104** Where this browser counts opens of its local documents: In the document's own IndexedDB record (`opens`), so
  the count goes wherever the record goes (default).
- **D126** How most used is not empty on day one: A real edit day counts as a use day, always: the edit history reaches
  back a year, so no one-off seed (default).
- **D127** Which migration number: 0065; 0064 is taken (default).
- **D128** How wide the 4 by 2 grid grows: The section's full width, thumbnails a fixed 80 px high, as in the chosen
  mockup (default).
- **D129** How a local record of the earlier `opens` shape reads: Its last open day and last open; the next open
  rewrites it in the new shape (default).
- **D130** Where the Recent page's breadcrumb leads: Home › Recent: Recent is reached from Home and has no sidebar row
  (default).
- **D131** How the grid keeps two rows' height with fewer documents: A fixed minimum height of two tile rows on the list
  (default).
- **D132** Whether Hide from Recent leaves Jump Back In: No, as before: Hide from Recent tidies the Recent page; Jump
  Back In is what the person reaches for (default).
- **D133** Whether making a document counts as a use: Retired: the spec decides (Making a document): a making is a use,
  a bulk import is not (default).
- **D134** What the create's opt-out is called: `markUsed`, a boolean, default `true`; the CLI flag `--no-recent` maps
  to `markUsed: false` (default).
- **D135** What "more than one document in one go" counts: The documents the import sets out to make, not those that
  land: two boards, one failing, mark none (default).
- **D136** Where a making is recorded: On the creation's own Timeline event (`markUsed: true` in its snapshot): no new
  table, no extra write (default).
- **D137** Whether the backfill's creation may overwrite a real one: No: it keeps an existing row, as the reconstructed
  edit does, so a mark is never cleared (default).
- **D138** Whether the copy route takes `markUsed`: No: a copy is one document made on purpose, so it always counts
  (default).
- **D139** How a malformed `markUsed` is refused: 400 `bad_request` "invalid markUsed", as the document dates are;
  logged `reason=mark_used_invalid` (default).
- **D140** How a local making enters this browser's record: The record starts as a first open would: `{ days: [today], lastOpenedAt: now }`
  (default).
- **D168** How Jump back in keeps its height with a short or empty group: Retired: the groups share one grid with no
  labels (`D131` holds its height) (default).
- **D169** Which documents the hero's sheets show: Retired: Home has no hero (explorer-home.md "Layout") (default).
