# Moving content into rooms

Documents saved before [Document storage](document-storage.md) keep their content in D1.
They move into their rooms once, in the release that makes the rooms the content's home, each one verified.
D1's content tables stay, untouched, until every document has verified, and a later release drops them.

Modelled on upstream's migrate tool (`b0f6444618`: snapshot, plan, apply, verify, resumable), sized for docs.nu:
14 documents, 14 tabs, about 16 KB of tab content in a 1.05 MB database (read on 2026-10-27).

## Words

- **Move**: one document's content copied from D1 into its room, with its room state, in one room transaction.
- **Moved**: a room that holds its document's content; it never reads D1's content tables again.
- **Content hash**: a SHA-256 over a document's content in one canonical order, the same function on both sides.
- **Move record**: D1's row per document saying whether it has moved and what both sides counted and hashed.
- **Legacy room**: the key-value Durable Object a document had before, renamed aside, holding its room state.

## The rooms change class

- The rooms so far are key-value Durable Objects, and a Durable Object class cannot change its storage backend.
- The release renames the old class aside as the legacy room and makes a new SQLite-backed class `DocumentRoom`,
  under the same binding, so every caller keeps its name.
- The class change ships in a release of its own, before any content moves, and hands over each room's state.
- The legacy room class ships only to hand over its storage; the release that drops D1's content tables deletes it.

## Handing over room state

- A room takes over its legacy room's state on its first request after the class change, before answering it: every
  key the legacy room stores (the order state, the ledger, the live poll, the baton, selections, agent presence),
  verbatim, then the room's ordering, baton, poll and agents are restored from them.
- The worker names the document on every call it makes to a room, so the room knows whose legacy room to ask.
- A handed-over room records that it has, and never asks again; a new document's room finds nothing to take.
- Once the state is stored, the room asks its legacy room to delete its storage; a failure is logged and left.
- A handover that fails leaves the room as it was and answers 503 with a retry; the next request tries again.
- Collaboration carries on through the handover: a reconnecting editor finds the same epoch and order, the ledger
  still merges into the next save, and a running poll keeps its answers.
- Content stays in D1 throughout; this release changes where room state lives and nothing else.

## A move

- **When.** A document moves on the first request its room receives after the release, before the room answers it,
  or when the sweep reaches it, whichever comes first; the second finds it moved and does nothing.
- **One at a time per document.** The room holds every other request until its move has finished.
- **What it copies**: from D1, the document's tabs, tab order and folders, tab stats, image references, changesets
  and their parts, items, sheets, cells and sheet references, and the document row's slide deck, item catalogue and
  counters. The room state was handed over already (above).
- **In one transaction, verified inside it.** The room writes all of it, then reads back what it now holds and
  counts and hashes it with the same function it hashed the D1 rows with.
  Two sides that differ undo the transaction: the room stays unmoved and the move record says `mismatch`.
- **Recorded.** A move that commits writes both hashes and both tab counts to the document's move record as `moved`.
- **A failed move** (a throw, a mismatch, D1 out of reach) leaves the room as it was and is logged; the request that
  started it answers 503 with a retry, and the sweep tries the document again.
- **Then the outbox.** A moved room's first drain pushes its summary, Inbox rows, images and search text as any
  write would.
- **Shared tabs.** Two documents that held the same tab in D1 each take a copy, list each other as holders, and are
  in step from then on ([Tab ↔ document many-to-many](tab-document-many-to-many.md)).

## The sweep

- Every minute, while any document is not `moved`, the api moves up to 25 of them, those never tried first.
- A document whose last try failed or mismatched is tried again at most once an hour.
- It is resumable (a run picks up what is left) and idempotent (a moved room does nothing).
- A document created after the release is born moved and never swept.
- A document in the Trash moves like any other, so a restore finds its content.

## The operator's tool

A command run on the operator's machine, reading D1 through wrangler, never writing:

- `plan`: per document, the tab count, the content bytes and the content hash, computed from D1, before the release.
- `verify`: reads every move record and recomputes each document's hash from D1 independently; it passes when every
  document is moved, every hash matches the plan and both sides of every record agree.
- Both print a table and exit non-zero on any document that does not pass.

## Rollback

- Before the release's deploy: nothing has moved; nothing to undo.
- After it, the previous Worker version can be restored; it reads D1's content tables, which the move never wrote,
  so every document shows its content as it was at the move. Edits made in rooms after the move are not in D1, so a
  rollback after people have edited loses those edits unless they are copied back first.
- Documents created after the move live only in their rooms, so the previous Worker shows them empty.
- The move release rebuilds the Inbox index keyed by document; before restoring the previous Worker, the index is put
  back in its old shape, empty, or the previous Worker's saves of tabs with comments or actions fail. The exact SQL is in
  the docs.nu runbook (`docs/operations/docs-nu.md` "Rollback").
- The class change's release cannot be rolled back: Cloudflare does not roll back a deployment that applied a
  Durable Object migration. A fault there is fixed forward; content, still in D1 then, is never at risk.

## Dropping D1's content tables

A later release, once `verify` passes on docs.nu, drops the content tables, the move records, the sweep, the move
code and the legacy room class.
Self-hosters upgrade through both releases in order; the drop refuses to run while any document has not moved.

## Production

Every write to docs.nu (the deploy, the D1 migrations, the drop) is Webber's to run.
The plan's output, the exact commands and this rollback are put to him before each.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D17** How the rooms become SQLite-backed under the same name: Rename the key-value class aside
  (`LegacyDocumentRoom`), then a new SQLite `DocumentRoom` (default).
- **D18** When a document moves: On its room's first request, and by a sweep every minute, whichever comes first
  (default).
- **D19** Which rows the content hash covers: The copied rows only; stats, image references, board statuses and holders
  are recomputed, not hashed (default).
- **D20** The sweep's pace: 25 documents a minute, 6 at once, failures retried at most hourly (default).
- **D21** What a request answers while its move fails: 503 `content_moving` with `Retry-After: 5` (default).
- **D22** The operator tool's form: A Node script over `wrangler d1 execute --json`, refusing any statement but `SELECT`
  (default).
- **D23** How a room knows whose legacy room to ask: Every worker-to-room call carries `X-Document-Id`, set by the one
  stub helper in `room-client.ts` (default).
