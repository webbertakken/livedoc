# Inbox

**Status: implemented.** An Explorer section, the **Inbox** at
`/explorer/inbox`, that lists across every document the reader can
open: the **open actions assigned to them**, the **open actions they
assigned** to other people, and the **unresolved comment threads they
are in**, and the **forms with responses they have not seen**, as a list and a reading pane. Each row opens the
document on the right tab with the element selected and its action / comment popover already open; a thread can be
answered and resolved from the pane itself.

The Inbox was once called **Activity**, and its data layer keeps that name: it reads the
activity index through `GET /api/activity` (§3) and `useActivityFeed`; the view is `InboxPane`. The old
address, `/explorer/activity`, replaces itself with `/explorer/inbox`
([Folders: Explorer routes](folders.md#explorer-routes)).

Builds on assigned actions ([Assigned actions](../012-collaboration/assigned-actions.md)), comment threads ([Canvas and palette](../008-canvas/canvas-and-palette.md)), the
Explorer's section model ([Folders](folders.md), [Timeline](timeline.md) §8.3), and the hybrid
identity + guest → account migration ([Auth + guest access](../014-identity/auth-and-guest-access.md)).

## Why

Actions and comment threads are element-level collaboration metadata:
they live inside the element, inside the tab JSON, and the only place
that lists them today is the in-editor **Collaborate Panel**
([Assigned actions](../012-collaboration/assigned-actions.md) §5), which is scoped to the tab that is open. Somebody who
has been assigned work on four documents has to remember which four.
[Assigned actions](../012-collaboration/assigned-actions.md) §9 called the cross-document inbox out of scope and named the
reason: the per-element blob model is right for the editor, and a
listing across documents needs a table. This spec adds that table
without moving the source of truth.

The Timeline ([Timeline](timeline.md)) is not this. It records that an action _was
assigned_ and a comment _was added_; it never says whether the action
is still open, and it does not know who is still waiting on a thread.
The Inbox answers the present-tense question: **what is
outstanding for me right now.**

## Non-goals

- Not a replacement for the Collaborate Panel ([Assigned actions](../012-collaboration/assigned-actions.md) §5), which stays
  the in-editor, tab-scoped surface with its Open / Resolved sides.
- No reassigning, editing or reopening from the page, and no verbs on a Plan card, a card thread, a form or a row
  in This Browser: those stay in the editor. The page's own verbs are Reply and Resolve on an element's thread, and
  Mark Done in the editor's panel (§1.5).
- No read state: the Inbox never marks a row Seen, Later or Done of its own; a row leaves when its work is done.
- Done actions and resolved threads are not listed. The page is an
  inbox of what is outstanding, not a history; the Timeline and the
  Collaborate Panel's Resolved side already cover the past.

## 1. What the user sees

An **Inbox** row in the sidebar's **Overview** group ([Explorer structure](explorer-structure.md)), directly
under Home and above the Timeline, with a badge counting the open actions and open Plan cards **assigned to
the reader**. The badge always shows, **0** included, so an empty Inbox reads as done at a glance; it
shows nothing only while the Inbox is loading or failed to load, so it never claims a false 0. The
count only covers work waiting on the reader, not work they handed out.

The Inbox is a **list and a reading pane**: one list of every row, newest first, and beside it the row the reader
has chosen, with what can be done about it. The same component draws it on the page and in the editor's Explorer
panel ([Explorer structure](explorer-structure.md) "The pane").

### 1.1 What a row is

Four kinds of row, each told apart by **why it is here**:

- **My Actions**: open actions whose assignee is the reader, and open Plan cards ([Items](../026-plan/items.md))
  whose Assignee is the reader (§2.4). A self-assignment ([Assigned actions](../012-collaboration/assigned-actions.md):
  the Myself row, the guest to-do case) lands here and only here.
- **Assigned by Me**: open actions the reader assigned to _somebody else_. Self-assignments are excluded so one
  action never appears twice.
- **Comments**: unresolved threads the reader is in. "In" means the reader wrote at least one comment in the thread,
  is @-mentioned in it ([Comment mentions](../012-collaboration/comment-mentions.md)), or the thread is on a document
  the reader **owns** (owners already hear about every new comment by email,
  [Transactional & lifecycle email (Resend)](../014-identity/transactional-email.md)). A Plan card's thread lists
  here too (§2.5), by the same rules.
- **Form Responses**: forms with responses the reader has not seen, in documents they own or reach through a team
  ([Forms](../030-forms/forms.md#hearing-about-responses)). The Inbox badge does not count them.

### 1.2 The list

Every row **newest first** (an action's `updatedAt`, which a reassignment or edit bumps; a card's `updatedAt`, which
any write to the item bumps; a thread's latest comment; a form's latest response), under three date dividers:
**Today** (since local midnight), **Earlier This Week** (the six days before) and **Older**. A divider shows only
over rows it holds. The read is capped at 100 rows per kind (§3); the cap is a ceiling on a list nobody scrolls that
far down, not a paging design.

Each row is three lines:

1. **Who is behind it**, and its age, as the Explorer says it ("12 min ago", "3 hours ago", "yesterday"): who assigned it to the reader (My Actions),
   who it waits on (Assigned by Me), who wrote last (Comments); a Plan card reads **Plan card** and a form
   **Form Responses**, where no one person stands behind the row. The name is semibold when the row asks something
   of the reader: theirs to do, a mention, a thread on their document, new responses.
2. **What it is**: the action's name; the card's **#key title**; the element a thread is on (its label, a table's
   first cell, or "Untitled"); the form's heading.
3. **Why it is here**, as an icon and words: **To Do**, **Waiting on Bo** (the assignee's first name, else "a
   teammate"), **Mentioned You** (a mention wins), **On Your Document** (until the reader comments),
   **You Commented**, or **6 New Responses**; then a **document chip** naming the document (a team document's chip
   leads with the team glyph), and the [This Browser pill](../006-document/offline-mode.md#this-browser-pill) for a
   row in this browser.

The chosen row has a brand edge on its left and a tinted ground. The rows are an ARIA **listbox** (`role="listbox"`,
each row an `option` with `aria-selected`), labelled "Inbox, <filter>"; focus stays on the list while the choice
moves (`aria-activedescendant`). Each row's accessible name is one sentence: what, why, who, where.

### 1.3 The filter bar

Over the list: **All**, **My Actions**, **Assigned by Me**, **Comments** and **Form Responses**, each with its count.
Each chip is a toggle button (`aria-pressed`) in a group labelled "Inbox filters". A filter holding nothing shows
"Nothing in <filter>" with **Show All**. The choice is kept per viewer on this device, beside the Explorer's other
view choices: `livedoc:explorer-inbox-filter:<viewer id>`; an unreadable value reads as All. Changing it clears the
choice of row and says "<filter>: <n> rows" in the Inbox's polite live region.

### 1.4 The reading pane

A region labelled by its title:

- **Where it is**: the document › the tab › the element (a card's board, when it is on one).
- **The title**, a heading (the row's second line).
- **Who and why**, in one sentence: "Priya mentioned you · 25 min ago", "Bo assigned this to you · 2 days ago",
  "Waiting on Sam · 3 hours ago", "6 new responses · 1 hour ago".
- **The verbs** with their keys (§1.5).
- **The body**: an element thread's comments, read when the choice has rested 200 ms (each author's name, colour,
  age and words, oldest first; the row's latest comment while it reads or when the read fails); a card thread's
  latest comment; an action's description; a card's type and board; a form's count.
- **A reply field** where Reply is offered: "Reply to Priya…", **Send** (Cmd/Ctrl+Enter), the field cleared and
  the reply shown under the thread once it is posted.

Side by side, the pane always shows a row: the chosen one, else the first.

### 1.5 The verbs

**Open** (↵) is always there: a link to the row's place in the editor (below), `Activity·Selected` by the row's
kind. The rest are offered only where the page can carry them out, row by row:

- **Reply** (r) and **Resolve** (e) on an **element's thread** whose document lets the reader comment
  (`canComment`, §3): through the comment routes ([Agent presence](../024-agents/agent-presence.md) "Comments"):
  a reply by `POST /api/documents/:id/tabs/:tabId/comments`, a resolve by
  `…/comments/:commentId/resolve`, naming the thread by its first comment (read from
  `GET /api/documents/:id/comments`). `Activity·Added·Reply` and `Activity·Resolved·Thread`.
- **Mark Done** (e) on an **action**, only in the editor's Explorer panel and only for an action on the tab the
  editor has open, through the canvas's own Mark Done, offered when the editor offers it (an action's status has no
  route of its own). `Activity·Resolved·Action`.
- Nothing more on a **This Browser** row (no page here reaches the browser's store but the editor), on a **Plan
  card** or its thread (done is its board's column; a card thread is answered on the card), or on a **form**.

A row whose work is done here (a thread resolved, an action marked done) **leaves the list at once**, and stays gone
for the rest of the visit even if a read made before the index caught up lists it again. A verb that fails keeps the
row and says so under the verbs ("Couldn't send your reply. Try again, or open the document to reply there.",
"Couldn't resolve the thread.", "Couldn't mark it done."), the draft kept. The Inbox keeps **no read state**: no
Seen, Later or Done of its own.

Who may do what, by how the reader reaches the row's document ([Share roles](share-roles.md)):

| Verb      | Editor (own, team, edit link)          | Participant (participate link) | Viewer (view link) |
| --------- | -------------------------------------- | ------------------------------ | ------------------ |
| Open      | Yes                                    | Yes                            | Yes                |
| Reply     | Yes                                    | Yes                            | No                 |
| Resolve   | Yes                                    | Yes                            | No                 |
| Mark Done | Yes, in the editor's panel, on its tab | No (the editor's gate)         | No                 |

The server's comment routes hold the same gate, so a reader whose link changed since the read is refused there and
the pane says the verb failed. A shared document behind a share password refuses the page's verbs (the page carries
no password); the pane says so the same way, and Open leads to the password prompt.

### 1.6 Keys

On the list: **j** / **↓** and **k** / **↑** move the choice, **Home** and **End** jump, **↵** opens the row in the
editor (side by side) or opens the pane (where the pane stands in for the list). Anywhere in the Inbox but a field:
**r** replies (focuses the reply field), **e** resolves or marks done, **Esc** returns from the pane to the list.
Each verb button shows its key (`aria-keyshortcuts`, the key drawn as a `kbd`), except on a touch screen. Alt, Ctrl
and Cmd chords are never the Inbox's.

### 1.7 Narrow

Under 768 px, and always in the editor's panel, the list stands alone; choosing a row (a tap, or ↵) opens the pane
**in its place** (on a phone, over the whole page) with **Back to Inbox**. Opening it adds **one** entry to the
browser's history, keeping the page's history state as it was, so the browser's Back (Android's, an iPhone's swipe)
returns to the list, as Back to Inbox and Esc do. If the open row leaves the list while its entry stands (its work
done, or gone from a re-read), the pane steps back off its own entry, so the next Back leaves the Inbox instead of
doing nothing; and opening a row while that entry is still on top (a step back on its way) replaces it rather than
stacking another. The filter bar becomes a strip of chips that scrolls sideways within itself, so the page never
does. Chips, rows, verbs and Back to Inbox are at least 44 px tall.

### 1.8 Opening a row

**Open lands on the element.** The link is the document's normal URL
(the share-code form for a document shared with the reader, [Read-only embeds (`/embed`)](embeds.md))
with a fragment the editor reads on load:

```
/document/<id>[?s=<code>]#t=<tabId>&el=<elementId>&open=action|comments
/document/<id>[?s=<code>]#t=<tabId>&el=<boardId>&item=<itemId>
```

A card row's link names the board it is on (§2.4): the editor selects
the board, scrolls it into view and opens the card in the item panel
([Items](../026-plan/items.md)), as clicking the card on the board does. A card no board in
its document shows has no tab to land on; its link is
`#item=<itemId>` alone, which opens the document on its usual tab and
opens the card once the item store has loaded (when the tab has no Plan
content the store is not read, and the link degrades to opening the
document).

`#t=` is the existing tab pin ([Per-tab storage](../006-document/per-tab-storage.md)); `el` and `open` are new. Once
the pinned tab's elements have loaded the editor selects the element,
scrolls it into view, and opens the named popover, exactly what a
Collaborate Panel row click does in-editor. The fragment is captured by
an effect declared ahead of the tab-entry effect (which rewrites the
hash to the plain `#t=` form on hydration, as it always has) and
consumed once, so a refresh lands on the tab without re-opening the
popover. It is not read during the first render: on a client-side
navigation from the Explorer, Next commits the new URL after that
render, so the hash would still be the Explorer's. An element the tab no longer holds
(deleted since the page loaded) degrades to opening the tab.

A card thread's row opens the card, as a card's does. A form's row opens the board its responses land on, else its Form
tab.

States:

- **Loading**: skeleton rows in the list's shape.
- **Empty** (nothing under any filter): one `EmptyState` — "Nothing
  waiting on you", with a line explaining what lands here (actions and
  Plan cards assigned to you, actions you assigned, threads you're in) and a link to
  the assigned-actions help article. No New Document CTA: a new document
  does not put anything on this page.
- **Failed**: "Couldn't load your Inbox" with **Try again**. Distinct
  from empty for the same reason the Timeline keeps them apart
  ([Timeline](timeline.md) §2.4): "we couldn't ask" and "there is nothing" are
  different answers.

**rows in This Browser.** A row from a document saved only in this browser ([Offline Mode](../006-document/offline-mode.md))
carries the [This Browser pill](../006-document/offline-mode.md#this-browser-pill) in its third line, after the document
chip, as a label (the row is already an option): the same amber words and glyph, and on hover "Lives only in this browser.
Clearing this browser's site data deletes it." Nobody reads such a row as saved on LiveDoc or visible to anyone
else. Its rows are found in the browser (§2.6) and listed among the server's, in the same list and the same
order; the badge counts them. Its only verb is Open (§1.5).

Coming back to a tab that has been open a while re-reads the list
(`useReturnToTab`, as the Timeline does), merging in place.

## 2. Data model: the collaboration index

Index tables in D1, pushed by each document's room from its outbox ([Document storage](../006-document/document-storage.md#the-outbox)):
a tab's rows are replaced whenever the tab changes, at most about a minute later, so they never drift for long from
the tab they mirror.
The tab JSON stays the source of truth ([Assigned actions](../012-collaboration/assigned-actions.md) §1); the index is a
projection of it that SQL can filter.

```sql
CREATE TABLE collab_actions (
  tab_id TEXT NOT NULL, element_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  element_label TEXT NOT NULL,          -- the row's "where": label / first table cell
  name TEXT NOT NULL, description TEXT NOT NULL,
  status TEXT NOT NULL,                 -- 'open' | 'done'
  assignee_user_id TEXT, assignee_member_id TEXT, assignee_name TEXT,
  assigner_id TEXT NOT NULL, assigner_name TEXT,
  team_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (tab_id, element_id, action_id),
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);

CREATE TABLE collab_threads (
  tab_id TEXT NOT NULL, element_id TEXT NOT NULL,
  element_label TEXT NOT NULL,
  resolved INTEGER NOT NULL,
  comment_count INTEGER NOT NULL,
  participant_ids TEXT NOT NULL,        -- JSON array of comment authorIds
  mentioned_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of @-mentioned user ids + member ids
  latest_text TEXT NOT NULL, latest_author_name TEXT NOT NULL, latest_author_color TEXT NOT NULL,
  first_at INTEGER NOT NULL, latest_at INTEGER NOT NULL,
  PRIMARY KEY (tab_id, element_id),
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);
```

- **Keyed by document and tab, carrying the tab's name.** The tabs live in each document's room, out of D1's
  reach, so a row says everything the read needs. A document's rows die with it (FK cascade from `documents`);
  a tab's go on the document's next push. A shared tab is indexed once per holder, each under its own document.
- **One row per action, one per thread.** An ordinary element carries at most
  one action and an Action panel a list ([The Action Panel](../012-collaboration/action-panel.md)), so `collab_actions` is keyed
  `(tab_id, element_id, action_id)` (migration 0053); an element has one
  thread. Either way a save is a full replace of the
  tab's rows: `DELETE … WHERE document_id = ? AND tab_id = ?` for each table, then one
  `INSERT` per element that carries the thing. Idempotent, and it
  handles an action being deleted, moved, completed, or reassigned
  with no diffing. On a typical tab (no actions, no threads) that is
  two deletes that touch nothing.
- **No email, no comment history.** The thread row keeps the latest
  comment (what the row shows) and the set of author ids (who is in
  it). Every other comment stays in the blob.
- `mentioned_ids` ([Comment mentions](../012-collaboration/comment-mentions.md)) holds every user id and team member id
  @-mentioned anywhere in the thread, from the comments' `mentions`.
- `participant_ids` is a JSON array queried with `json_each`. Not
  indexable, and it does not need to be: the read (§4) is bounded by
  the reader's own library before it ever looks at participants.

- **Form links carry what the Inbox shows of their form.** A form's tab name, heading and board live in its tab,
  in the room; the tab's push writes them onto the tab's `form_links` rows (`tab_name`, `heading`,
  `board_tab_id`, migration 0110), and publishing a form writes them as it stands then. The Form Responses read
  joins nothing else.
- **Plan cards and their threads are pushed whole** (§2.4, §2.5): `inbox_cards` holds every card that is open and
  assigned, or holds an open thread, with `board` (its place for an unscoped reader) and `boards` (every board on
  each tab that shows its status or all cards, for a tab-scoped reader); a card's open thread sits in
  `collab_threads` under the tab key `~cards`, its element id the item id.

### 2.1 Where the writes happen

Every write to a tab in a room, whatever its path (the autosave, a comment through the api, a create, a copy, an
agent's changeset, a Q&A board write, a shared tab's copy taken in), keys the tab in the room's outbox from a
trigger, in the same transaction as the write; the drain replaces that tab's rows in one D1 batch
(`collabStatements` in `drainOutbox`, `document-room/document-outbox.ts`, the one function that writes these tables).
A tab removed from the document, and every tab of a purged document, drops its rows the same way or by cascade.

The rows are derived by a pure function over the tab's elements
(`collabIndexRowsFromElements` in `packages/document`, shared with the browser's read of documents in This Browser, §2.6), which reuses the element-label rule
the Collaborate Panel already applies (`elementDisplayLabel`, moved
into `packages/document` so the panel and the index cannot disagree on
what a row is called).

**Comment times.** A thread's place in the Inbox is its latest comment's time, and that time is the writer's clock. A save (an autosave or an agent's changeset) carrying a comment timed later than the server's now plus `FUTURE_SLACK_MS` (five minutes, a device clock a little ahead) stores it at now when the comment is new, and at its stored time when it is the author's own, edited (`rewriteCommentAuthors`, `apps/api/src/comments.ts`). Without the cap, one comment from a clock running fast, or a bad value, would sit on top of everyone's Inbox for good.

### 2.2 Identity across sign-up: `owner_aliases`

Comment `authorId`s and self-assigned `assignee.userId`s are written
with whatever identity the writer had at the time, a guest participant
id for anyone signed out ([Auth + guest access](../014-identity/auth-and-guest-access.md)). When that guest signs up, their
documents migrate to the account id (`POST /api/migrate`) but the ids
inside the blobs do not, and a later re-index of an untouched tab
would faithfully re-write the guest id. Rewriting blobs on migration
is the wrong fix (every tab of every document, on the sign-up path).

So the migration records the relationship instead:

```sql
CREATE TABLE owner_aliases (
  owner_id TEXT NOT NULL,    -- the current identity
  alias_id TEXT NOT NULL,    -- an identity it used to be
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, alias_id)
);
```

Both `/api/migrate` flows write a row (guest → account, and the legacy
unsigned-guest → signed-guest upgrade), carrying any aliases the source
id had already accumulated so a chain collapses onto the final id. The
Activity read matches `me = {ownerId} ∪ aliases(ownerId)` everywhere it
compares an identity, so a week of guest to-dos is still on the page
after signing up, whatever the blob says. Account deletion drops the
owner's alias rows.

This is deliberately the only consumer in v1. The editor's own
"mine" highlight and delete-own check keep comparing against the
current id; extending them is a separate change.

### 2.3 Backfill

None: every document's first drain after its move into its room
([Moving content into rooms](../006-document/document-storage-move.md)) indexes every tab it holds, and
`collab_index_state` goes with the move.

### 2.4 Plan cards

Plan cards are items in the document's item store ([Items](../026-plan/items.md)), in the document's room.
The room's outbox pushes the open, assigned cards and the boards that place them to `inbox_cards` in D1, and the
read filters that table; the rules below are what the push keeps. Two pieces make that cheap and correct:

- **An expression index on the assignee.** Migration 0073 adds
  `CREATE INDEX items_assignee ON items (json_extract(fields, '$.assignee.id'))`.
  An item's assignee id is `itemPersonId(userId)`, a one-way hash
  ([Items](../026-plan/items.md)); the worker hashes the reader's
  `me` set (§2.2) and the read matches the index with `IN`.
- **`plan_board_statuses`: which statuses a board shows, and which of
  them are Done.** Whether a card is open is a property of the boards,
  not of the card: a status is Done when one of a board's done columns holds it
  ([Done columns](../026-plan/plan-board.md#done-columns)) ([Plan views](../026-plan/plan-views.md) "What a plan view reads"). The
  boards live in tab JSON, so they get the same treatment as actions:
  a per-tab projection in the document's room, written in the tab write's own batch by
  `planBoardIndexStatements` (`db/plan-board-index.ts`, so every path in §2.1 writes it); the room pushes the open
  cards it yields to D1's `inbox_cards`.

```sql
CREATE TABLE plan_board_statuses (
  tab_id TEXT NOT NULL, element_id TEXT NOT NULL,
  board_title TEXT NOT NULL,
  status TEXT NOT NULL,      -- a column's status; '*' for an All Cards board
  done INTEGER NOT NULL,     -- 1 when the column counts as done (isDoneColumn)
  board_order INTEGER NOT NULL, -- the board's index among the tab's boards
  position INTEGER NOT NULL, -- the column's index on its board
  PRIMARY KEY (tab_id, status, element_id), -- the Done check seeks (tab, status)
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE
);
```

An Archive board writes no rows (it shows only archived cards, which
are never listed). An All Cards board writes one `'*'` row, never Done.

A card is listed when, in a document the reader can open (§4):

- its `assignee.id` is the hash of an identity in `me`;
- it is not a linked card (`linked` is absent): a linked card's action is listed already
  ([Linked boards](../026-plan/linked-boards.md) "The Inbox");
- it is not archived (`archived` is not `true`) and not in the Trash
  (`status` is not `trash`);
- no board on any tab of its document marks its status Done. A card
  whose status no board holds (a stray, or a document with no board) is
  open: nothing says it is finished.

Its place is the first board, in tab order then board order, that
holds its status; failing that, an All Cards board; failing that, any
board in the document; failing that, none (the `#item=` link, §1).

Cards the reader assigned to somebody else are **not** listed: an
item records who last wrote it, not who assigned it, so "You Assigned"
stays actions only.

The migration also clears `collab_index_state`, so each reader's next
visit re-runs the §2.3 backfill and indexes the boards saved before
this shipped. The backfill's pre-filter matches `"planBoard":` too.

### 2.5 Card comment threads

A Plan card's comments live in its item (`fields.comments`, [Items](../026-plan/items.md) "Comments"), not in tab
JSON; like §2.4, the room pushes each card's open thread to D1 (`collab_threads` under the tab key `~cards`), and
the read filters those rows in the documents the reader can open (§4). A card's thread is listed when:

- it holds at least one comment and is not resolved;
- the card is neither archived nor in the Trash;
- the reader wrote a comment in it (a comment's `authorId` ∈ `me`), is mentioned in it (a mention's `userId` ∈
  `me`, or its `memberId` is one of the reader's `team_members` rows), or owns the document;
- on a tab-scoped share, a board on the scoped tab shows the card (the same rule as §2.4).

It is placed on a board exactly as §2.4 places a card. The read takes the newest `ACTIVITY_LIST_MAX` by latest
comment. Migration 0074 adds a partial index, `items_open_threads ON items (document_id) WHERE
json_extract(fields, '$.comments.resolved') = 0`, so the read seeks only cards with an open thread in each
visible document (measured: 20,000 cards, 2,000 open 20-comment threads, ~106ms; ~200ms without it). Author ids never leave the worker: the row carries the latest author's name and colour only.

### 2.6 documents in This Browser

A document in This Browser ([Offline Mode](../006-document/offline-mode.md)) never reaches the worker, so the index above
never holds it. The editor reads those documents itself, from the browser's offline store, and lists what it finds with
the server's rows (`readOfflineActivity`, `apps/live/lib/offline/offline-activity.ts`):

- **The same derivation.** Actions and element threads come from `collabIndexRowsFromElements`, Plan boards' statuses
  from `planBoardRowsFromElements` (both in `packages/document`), so a document in This Browser lists exactly what the same
  document would list once synced.
- **Who "me" is.** The reader's owner id and, when this browser still holds one, its guest participant id: a guest's
  self-assignments and comments carry the guest id, and stay theirs after signing in on the same browser. Cards match
  the hashes of those ids (`itemPersonId`), as §2.4 does. There are no team members offline, so no member-id match.
- **What is listed.** The rules of §2.4, §2.5 and §4 with the reader as the owner of every document in This Browser: an open
  action assigned to or by the reader; every unresolved thread, an element's or a card's ("Your document"); an open card
  assigned to the reader that is not linked, not archived, not in the Trash and in no Done column, placed on a board by
  the same preference (a board holding its status, then an All Cards board, then any board, by tab then board order).
  Documents in the local Trash are skipped. Forms take responses through the worker, so a document in This Browser has none
  to list.
- **The shape.** The same wire types, `via: 'own'`, no team and no share code (the plain document URL opens it), marked
  local in the editor so the row shows the pill (§1). Capped at `ACTIVITY_LIST_MAX` per kind, like the server read.
- **Failure.** The offline store failing to answer is logged (`[inbox] offline-read-failed`) and lists nothing local;
  the page's failed state stays the server read's. A browser with no documents in This Browser reads nothing more than the
  index of ids it already holds.

## 3. API

```
GET /api/activity   -> { actions: ActivityAction[], threads: ActivityThread[], cards: ActivityCard[],
                         cardThreads: ActivityCardThread[] }
```

Hybrid identity (session token or `X-Owner-Id`); guests get their own
page, keyed to their participant id. The read is read-only; the pane's verbs (§1.5) go through the comment routes
every other client uses, never a route of the Inbox's own.

Wire types in `@livedoc/api-schema` (`activity.ts`), registered in
the OpenAPI manifest + schema roots ([API documentation (OpenAPI)](../015-api/api-documentation.md)):

```ts
type ActivityPlace = {
  documentId: string;
  documentName: string;
  teamId: string | null;
  // 'own' | 'team' | 'shared' — how the reader reaches the document;
  // shareCode is set only for 'shared', so the client can build the
  // visitor URL (docs/specs/013-workspace/embeds.md).
  via: 'own' | 'team' | 'shared';
  shareCode: string | null;
  tabId: string;
  tabName: string;
  elementId: string;
  elementLabel: string;
};
type ActivityAction = ActivityPlace & {
  id: string;
  name: string;
  description: string;
  assignee: { userId: string | null; name: string | null };
  assigner: { id: string; name: string | null };
  createdAt: number;
  updatedAt: number;
  assignedToMe: boolean;
  createdByMe: boolean; // resolved server-side against me ∪ aliases
};
type ActivityThread = ActivityPlace & {
  commentCount: number;
  latest: { text: string; authorName: string; authorColor: string; at: number };
  firstAt: number;
  youCommented: boolean;
  onYourDocument: boolean;
  mentionsYou: boolean; // an entry of mentioned_ids ∈ me ∪ my team_members rows
  // The reader may comment on the document: they own it, it is in a team they joined, or the link they reach it
  // through is a participate or edit link (docs/specs/013-workspace/share-roles.md). The pane offers Reply and
  // Resolve only where it is true; the comment routes still gate every call.
  canComment: boolean;
};
// An open Plan card assigned to the reader (§2.4). Not an ActivityPlace:
// a card is not an element, and it may have no board to land on.
type ActivityCard = {
  documentId: string;
  documentName: string;
  teamId: string | null;
  via: 'own' | 'team' | 'shared';
  shareCode: string | null;
  board: { tabId: string; tabName: string; elementId: string; title: string } | null;
  id: string; // the item id
  key: number; // the #number
  type: string; // the item type id
  title: string;
  status: string | null;
  updatedAt: number;
};
// A Plan card's unresolved comment thread the reader is in (§2.5): the card's identity and place, and the
// thread's facts as ActivityThread has them.
type ActivityCardThread = Omit<ActivityCard, 'status' | 'updatedAt'> & {
  commentCount: number;
  latest: { text: string; authorName: string; authorColor: string; at: number };
  firstAt: number;
  youCommented: boolean;
  onYourDocument: boolean;
  mentionsYou: boolean;
};
```

## 4. The read, and who sees what

Every row is scoped **first** by the documents the reader can open, the
same three sets the Explorer's Recent already merges: documents they
own, documents in a team they have _joined_ (an `invited` row grants
nothing, [Teams](teams.md)), and documents shared with them whose share is still
live. Only then is the involvement test applied:

- an action is theirs to see when its `assignee_user_id` ∈ me, its
  `assigner_id` ∈ me, or its `assignee_member_id` is one of their
  `team_members` rows (this is how an action assigned to an
  _invited_ address finds its owner once they join, [Assigned actions](../012-collaboration/assigned-actions.md) §1);
- a thread is theirs when they own the document, an author id ∈ me, or
  they are @-mentioned in it: a `mentioned_ids` entry ∈ me or is one of
  their `team_members` rows ([Comment mentions](../012-collaboration/comment-mentions.md)). The row carries
  `mentionsYou`, and its hint reads **Mentioned You** (it wins over "Your
  document").
- a Plan card is theirs when its `assignee.id` is the hash of an id in
  me (§2.4). On a document shared with them through a **tab-scoped**
  link ([Tab-scoped share links](tab-scoped-share-links.md)) they see only the cards that tab's boards
  show: the card's board must be on the scoped tab and hold its status
  (or be an All Cards board).

That order is the security boundary: a name can never leak a row from
a document the reader has lost access to, and it is what keeps the
`json_each` participant scan bounded to one person's library.

A thread's `canComment` comes from the same set: true on a document the reader owns or reaches through a joined
team (both are an Editor's), and on a shared one when the live link they reach it through is a `participate` or
`edit` link; false through a `view` link. It is a hint for the pane, never a grant: the comment routes decide.

A tab linked into two visible documents would list twice; the read
dedupes on (tab, element) for a thread and (tab, element, action) for an
action, preferring the document the reader owns,
then a team's, then a shared one.

## 5. Explorer integration

The section checklist from [Timeline](timeline.md) §8.3: `views.tsx` gains
`{ kind: 'inbox' }`, `routes.ts` maps it both ways (and reads the retired
`/explorer/activity` as the Inbox), `app/explorer/inbox/page.tsx` is the route stub,
`app/explorer/activity/page.tsx` replaces itself with it, `ExplorerSidebar`
gets the Overview row (with `InboxIcon` in
`components/primitives/explorer-icons.tsx`),
`useExplorerPane` names it, `ExplorerPane` dispatches to the
lazy-loaded `InboxPane` (not in `BROWSE_KINDS`; no New Document / New
Folder header actions; Help links the new article), and
`routes.test.ts`'s `STATIC_NODES` lists it. The sidebar badge and the
pane read the same fetch (`useActivityFeed`, held in Explorer state
like favourites), so opening the section never issues a second request
and the badge cannot disagree with the list.

The editor's Explorer panel draws the same `InboxPane`, compact and always narrow (§1.7), from its own
`useActivityFeed`. The editor hands it the open document, the open tab and the canvas's Mark Done (`onToggleActionDone`,
present only when the session may mark an action done), so the pane offers Mark Done on an action of that tab (§1.5).

## 6. Telemetry

A new `Activity` category in `TELEMETRY_CATEGORIES` ([Telemetry + public transparency dashboard](../017-telemetry/telemetry.md)):

- `Activity` / `Opened` when the section renders (once per visit);
- `Activity` / `Selected` with type `Action` | `Card` | `Thread` | `CardThread` | `FormResponses` when Open (or ↵)
  takes a row to the editor;
- `Activity` / `Loaded` / `Retry` when a failed read is retried;
- `Activity` / `Changed` with type `All` | `MyActions` | `AssignedByMe` | `Comments` | `FormResponses` when the filter
  bar changes;
- `Activity` / `Added` / `Reply` when a reply is posted from the pane;
- `Activity` / `Resolved` with type `Thread` (a thread resolved from the pane) or `Action` (an action marked done from
  the editor's panel).

The category keeps the data layer's name. Picking the sidebar row is `UI` / `Selected` / `Sidebar.Inbox`
([Explorer structure](explorer-structure.md#telemetry)).

Never an action name, comment text, document name, or any identity.

## 7. Testing

- `collab-index-rows.test.ts` (`packages/document`): the pure derivation (labels, statuses,
  participant sets, latest-comment selection, tables' first-cell rule).
- `activity.test.ts` (routes): owner gate, the db call is scoped to the
  resolved owner, backfill is dispatched only when unseeded, the
  `assignedToMe` / `createdByMe` / `youCommented` flags.
- `collab-index.test.ts` (db): the SQL statements a save contributes,
  including the two deletes on a tab with nothing, and the copy path.
- The OpenAPI drift test ([API documentation (OpenAPI)](../015-api/api-documentation.md)) pins the new route + schemas.
- `routes.test.ts` round-trips the new section.
- `collab-deep-link.test.ts`: the fragment parser (tab only, tab +
  element, unknown `open`, junk, a card's `item` with and without a
  board).
- `plan-board-rows.test.ts`: the board projection (each done column, All Cards `'*'`, Archive skipped, junk set-ups).
- `activity-cards.test.ts` (db, against real SQLite): assigned to me
  and to an alias, someone else's card, archived, trashed, Done on any
  board, stray status still open, place preference, scoped share,
  a document the reader cannot open.
- `useActivityFeed.test.tsx`: sections split from one read, error vs
  empty, retry, rows in This Browser merged in order and counted.
- `activity-can-comment.test.ts` (db, against real SQLite): `canComment` on an owned, a team and a shared document,
  through a view, a participate and an edit link.
- `inbox-entries.test.ts`: one list newest first, the four filters and their counts, the date dividers, each row's
  who, what and why.
- `inbox-verbs.test.ts`: which verbs each row is offered (an element thread by `canComment`, an action only on the
  editor's open tab, nothing on This Browser, a card, a card thread or a form), and the comment calls they make.
- `useInboxFilter.test.tsx`: the choice kept per viewer, an unreadable value read as All.
- `useInboxPaneHistory.test.tsx`: one history entry per opening, Back closing the pane, a vanished row stepping back
  off its entry, and an opening over a standing entry replacing it.
- `InboxPane.test.tsx`: the listbox and its keys, the filter bar, the pane and its verbs, a done row leaving at once,
  the narrow layout's Back to Inbox, and the telemetry.
- `comments.test.ts` (live api client): the thread list read and its failure.
- `offline-activity.test.ts`: the browser read of documents in This Browser (§2.6): assigned to and by the reader, the
  guest id, threads, open and finished cards, linked cards, trashed documents, placement, the cap.
- `collab-index-rows.test.ts` and `plan-board-rows.test.ts` live in `packages/document` with the functions.
- Help: the registry / icon / colour / articleCount tests pick the new
  article up automatically.

## 8. Docs and help

- Help article **Inbox** under Explorer
  (`apps/help/app/explorer/activity/page.mdx`, the slug kept so links already out there keep
  working), registered with keywords ("activity", "to do", "todo", "assigned to me", "my actions",
  "outstanding", "waiting", "open threads"), a card glyph + hue, and
  an `InboxListAndPane` illustration.
- README / `docs/development/architecture.md` / `docs/specs/005-project-roadmap/prototype-scope.md` gain
  the section; [Assigned actions](../012-collaboration/assigned-actions.md) §9 and [Folders](folders.md)'s sidebar list point here.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D185** How wide the list is beside the reading pane: `22rem`, the width of a three-line row with a 14rem document
  chip (default).
- **D186** How tall the side-by-side Inbox is: `calc(100dvh - 12rem)`, at least `32rem`, so each column scrolls on its
  own under the Explorer's header (default).
- **D187** How many thread reads the pane keeps: 64, newest kept, for the pane's lifetime (default).
- **D188** What the pane shows when the thread read fails: The row's latest comment, quietly; no retry button (default).
- **D189** Whether a draft survives moving to another row: No: a new row starts a fresh draft and clears the last verb's
  error (default).
- **D190** How long a row done here stays gone: The feed's lifetime (the visit), even if a read before the index catches
  up lists it (default).
