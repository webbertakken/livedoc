# Document storage

Each document's content lives in its own SQLite-backed Durable Object, its `DocumentRoom`, one object per document id.
D1 keeps what the Explorer lists and what reads across documents need, and hears about content through the room's
outbox.
Both sit in the one live service, the api Worker ([One live service](../003-system-architecture/one-live-service.md)).

Ported by hand from upstream `77e511638f` (content into each canvas's room, a listing fed by an outbox) and
`8be9a0be46` (shared tabs between rooms); the outbox mechanics follow upstream's index-app outbox kit
([Upstream](../002-project-scope/livediagram-upstream.md)).

## Words

- **Room**: a document's `DocumentRoom` object; it relays the document's realtime traffic and stores its content.
- **Content**: what a document holds, as opposed to where it is filed or who may open it (the list below).
- **Listing**: the D1 rows the Explorer, Home, the Inbox and the Timeline read; never the content itself.
- **Content summary**: the small JSON a room pushes to its `documents` row: what the listing shows of the content.
- **Outbox**: the room's own table of what D1 still has to hear, a key per changed thing.
- **Drain**: one pass of the room's alarm that pushes outbox keys to D1 and deletes the keys it pushed.
- **Holder**: a document holding a shared tab ([Tab ↔ document many-to-many](tab-document-many-to-many.md)).

## What the room holds

Everything a document holds as content, in its SQLite, made on first use and versioned by its own schema steps:

- **The document row**: the slide deck ([Presentation mode](../012-collaboration/presentation-mode.md)), the item type
  catalogue and its revision, the item counter and revision ([Item types](../026-plan/item-types.md)), the content's
  last save and its creation time.
- **Tabs**: one row per tab, its body as JSON ([Per-tab storage](per-tab-storage.md)), with its revision.
- **Tab order and folders**: the document's tab order and each tab's folder ([Tab folders](tab-folders.md)).
- **Tab stats**: each tab's mode, element count, comment count and size, for the Details view.
- **Image references**: which gallery images each tab places ([Images](../009-elements/images.md)).
- **Agent changesets**: the changeset log and its parts ([Agent changesets](../024-agents/agent-changesets.md)).
- **Items**: the document's cards and their fields ([Working in Plan](../026-plan/plan-mode.md)).
- **Plan board statuses**: which statuses each board shows, derived from the tab, for the document's own reads.
- **Sheets**: each sheet, its cells and which tabs reference it ([Sheet](../029-sheets/sheet.md)).
- **Tab shares**: the other holders of each shared tab, and what they are still to hear.
- **The outbox** (below).
- **Room state**, in the object's key-value storage as before: the order state, the collaboration ledger, the live
  poll, the facilitator baton, selections and agent presence ([API app, Realtime model](../015-api/api.md)).

A tab is still one row, capped at the size in [API app, Tab size](../015-api/api.md); a Durable Object's SQLite holds
at most 2 MB in a row, so the cap stands.

## What D1 keeps

- **The listing**: `documents` (title, owner, team, folder, source, the creation intent, Trash, sharing, the share
  password, dates) with its **content summary**, opens, favourites, tags, hide from Recent.
- **Sharing**: share links, shared-with rows, form links and their reads and reports.
- **Cross-document indexes** the room's outbox feeds: the Inbox's comment threads and actions, the cards assigned to
  someone, the images each document places, and content search ([Content search](../013-workspace/content-search.md)).
- **The Timeline** and everything else not content: people, teams, folders, tokens, images and grants, the Google
  Drive mirror, shape libraries, the workbench, guest voters, telemetry.

No tab body, tab order, tab stat, image reference by tab, changeset, item, sheet or cell is in D1.

## The content summary

`documents.content_summary` is the listing's view of the content, pushed by the room:

- how many tabs the document has;
- the first tab's element count, which decides an empty row's preview;
- the document's stats (last mode, elements, comments, bytes), the Details view's columns;
- whether the document has any content, by the [Empty document clean-up](../013-workspace/empty-document-cleanup.md)'s
  own test (a tab with an element, an article, a form or a filled dashboard slot).

A create writes the first summary with the document, so a new row never reads empty for want of a push.
A summary that is missing reads as unknown: never empty in the Explorer, and never moved to the Trash by the clean-up.

## Reaching the content

- The api Worker authenticates the caller and runs its cross-cutting gates (rate limits, read-only tokens,
  workbench confinement, body caps), then hands every request under `/api/documents/:id/` to the document's room,
  with the caller as plain data.
- The room runs the same route handlers, with the same access checks, against its own SQLite for content and D1 for
  everything else; the editor, the MCP server and the CLI see the same wire.
- Creating a document writes its D1 row and has its room store the content; the request answers once both have.
- Reads that span documents (lists, Home, the Inbox, search) read D1 only, never a room.
- A request about one document's content from outside its routes (a snapshot, an image's place, a copy, a share
  link's preview, a public form's response) asks that document's room.

## The outbox

- **Kept by triggers.** Triggers on the room's tables add a key in the same transaction as every write: the summary,
  each changed tab, the document's images. No write path can forget the listing, and a save makes no D1 round trip.
- **Drained on idle.** The room's alarm drains the outbox 2 seconds after a write, and at most once a minute.
- **Bounded.** A drain pushes at most 50 tabs; the rest go in the next drain, straight after.
  At most 6 D1 writes are in flight at once.
- **Retried.** A drain that fails keeps every key it did not push and tries again a minute later.
  A key written again during a drain stays for the next one.
- **What a drain pushes**: the content summary and `saved_at` to `documents`; per changed tab, its comment threads and
  actions for the Inbox, its cards assigned to someone, and its search text; the document's whole set of placed
  images. A tab that has gone takes its rows and its tab-scoped share links with it.
- **Lag.** The listing, the Inbox, image usage and search trail a write by up to about a minute; the editor and every
  read of one document's content never do.

## Purging and copying

- Purging a document (the [Trash](../013-workspace/trash.md)'s purge, Take Offline, deleting an account) deletes its
  D1 rows and has its room delete everything it stores, after telling the holders of its shared tabs.
- A room that cannot be reached stays owed a purge: D1 keeps a tombstone until the room confirms, tried again by the
  daily sweep. A tombstoned document cannot be opened.
- Copying a document copies its content from one room into the other's, in one transaction there.

## Upkeep

Each room runs its own upkeep from its alarm: changesets past their retention and unreferenced sheets go.
The D1 crons for them, the tab stats backfill and the image reference backfill go away.

## Cost

A room is billed while it answers a request or runs its alarm; an idle document costs nothing and its sockets
hibernate. A document under heavy API traffic keeps its room awake for that traffic.

## Existing documents

Documents saved before this change move from D1 into their rooms once, verified one by one, before D1's content
tables are dropped ([Moving content into rooms](document-storage-move.md)).

## Cross-references

- [Per-tab storage](per-tab-storage.md): why a tab body is a row of its own.
- [Tab ↔ document many-to-many](tab-document-many-to-many.md): shared tabs between rooms.
- [API app](../015-api/api.md): the endpoints and the realtime model.
- [Content search](../013-workspace/content-search.md): what the search text is and how it is matched.
- [Inbox](../013-workspace/inbox.md): what the outbox feeds it.

## Invariants and edge cases

The invariants and edge cases the code and its tests cite by id.

- **G2** no write after purge: `document-outbox.test.ts`.
- **G3** adds one primary-key read of `room_purges` to every request under `/api/documents/:id/`, before the room.
- **R1** schema on first write only: `document-schema.test.ts`, `document-db.test.ts`.
- **R3** every write path keys the outbox: `document-outbox-keys.test.ts`, one case per table.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D7** Which outbox keys a room keeps: Five kinds: `summary`, `tab` (per tab id), `cards`, `items`, `images`; the four
  document kinds share one D1 unit, each tab has its own, so a tab's push fails alone (default).
- **D8** How a drain groups its D1 writes: One D1 batch per unit (the document's, then each tab's), at most 6 in flight;
  only succeeded units' keys go (default).
- **D9** Where the stats and the empty test are worked out: In the room, the D1-era SQL moved unchanged into the room's
  queries (default).
- **D10** Which requests the worker hands to the room: Every path under `/api/documents/:id/`, as upstream; the
  collection (list, create), the realtime admission and the copy stay in the worker (default).
- **D11** The order of a create's two writes: The room first, then the D1 row; a failed D1 insert purges the room
  (default).
- **D12** How an unreachable room is purged later: A D1 tombstone, retried by the daily cron, 300 a run, at most hourly
  per room (default).
- **D13** Which write wins when two holders write in the same millisecond: The larger SHA-256 of the body, so every
  holder picks the same (default).
- **D14** What the row-cap constants are called once D1 no longer holds tabs: `SQLITE_ROW_MAX_BYTES`,
  `SQLITE_ROW_HEADROOM_BYTES`; `MAX_TAB_BYTES` unchanged (default).
- **D15** How a worker call to a content module is prevented: Content modules take `DocumentEnv`; the worker's `Env` has
  no `DOCUMENT_DB`, so it does not compile (default).
- **D16** What a request answers when its room fails: 503 `room_unavailable`, logged with the path (default).
