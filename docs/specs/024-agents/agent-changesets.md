# Agent changesets

**Status: built.** Closed livediagram-app/livediagram.app#343. Operations are the full
[edit operations](edit-operations.md), in the line form or JSON, plus `replace`. Every answer carries the [lint](diagram-lint.md) of the tab it leaves; the
[agent presence](agent-presence.md) refresh is not built yet.

Every agent write to a tab is a **changeset**: one atomic write, applied by the api, sequenced by the document's
room, shown live to everyone with the tab open, credited to the person whose token wrote it, and revertable as one
unit. The whole-tab `PUT` stays the editor's own autosave path and nothing else's (see
[Whole-tab saves and tab renames](#whole-tab-saves-and-tab-renames)).

## Why

Before changesets an agent wrote a tab with the editor's whole-tab `PUT` ([API app](../015-api/api.md), "The
persistence boundary"). That write never reached the room, so:

- **A person never saw the agent's edit** until they reloaded, and their next autosave of the tab, built from a copy
  without it, erased it from the stored tab.
- **An agent erased a person's edits.** The MCP's `update_document` read the tab, waited while the model thought,
  then wrote the whole tab back over anything saved in between.
- **A personal document had no room**, on the premise that it has one writer. An agent is a second writer.

## What a changeset is

| Field        | Meaning                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `cs_` and 10 base32 characters, minted by the api                                                                                                                                                       |
| `documentId` | The document                                                                                                                                                                                            |
| `tabId`      | The one tab it writes; a changeset never spans tabs                                                                                                                                                     |
| `agent`      | The token id and the owner id; absent when a signed-in session writes                                                                                                                                   |
| `summary`    | Optional, up to 80 characters, written by the agent ("add payment service"); shown in the toast and the history                                                                                         |
| `body`       | Either ordered [edit operations](edit-operations.md), or one `replace` (graph, Mermaid, template, dashboard, a new Form tab's `form`, or elements, which may make a new Board or Sheet tab with `kind`) |
| `base`       | Optional: the tab revision the agent read, and a fingerprint of every element the operations target                                                                                                     |
| `results`    | The result lines it printed, kept for `GET /api/documents/:id/changesets/:changesetId` and `changeset show`                                                                                             |
| `rev`        | The tab revision the changeset produced                                                                                                                                                                 |
| `elementOps` | The `ElementOp`s it compiled to (`add`, `update`, `remove`, `reorder`), the unit the room and editors apply                                                                                             |
| `inverse`    | The element ops that undo it, computed from the before-images                                                                                                                                           |

- **Atomic.** Every operation lands or none does. A rejected changeset writes nothing and says why.
- **One tab, one changeset.** A new tab is a changeset that creates it (`replace` on a tab id the document lacks).
  A `replace`'s name names the tab it creates; on an existing tab it is ignored.
- **A new document** is not a changeset: nothing else can hold it yet. `POST /api/documents` creates it, compiling
  graph, Mermaid or template tabs with the same engine.
- **A fingerprint** covers the element without its live multi-writer fields (`LIVE_ELEMENT_FIELDS`: comments,
  answers, ideas, ticks and the like), which people change through deltas that never conflict with an agent's
  edit.

## The tab revision

Every tab carries `rev`, an integer that every write to it increments: an editor save, a changeset, a revert.
Every tab read returns it (the `rev` field and an `ETag`). It is how an agent says what it read and how an editor
says what it has seen.

## The write path

1. **Submit.** `POST /api/documents/:id/tabs/:tabId/changesets` with the body and optional base. Any identity with
   edit access to the tab may submit; only a token makes it an agent changeset. `?dryRun=1` runs steps 2 to 4 and
   returns the plan without writing.
2. **Check the base** (see [Conflicts](#conflicts)).
3. **Check held elements** (see [Held elements](#held-elements)).
4. **Compile.** The shared engine resolves selectors, applies the operations to the stored tab, normalises and lays
   out what they touched ([Edit operations](edit-operations.md)), and validates the result with `isValidTab`.
5. **Write** the tab with compare-and-swap on `rev`. A lost race repeats steps 2 to 5 once, then answers `409`.
6. **Record** the changeset in `agent_changesets`, in the document's room with the tab, in the same transaction
   ([Document storage](../006-document/document-storage.md)), with its element ops and inverse.
7. **Relay** it to the submitting document's room as one sequenced `changeset` op. A relay failure is logged and
   never fails the write: the room's store already holds it, and step 8 keeps it there. A tab shared with other
   documents reaches them as a body send ([Tab ↔ document many-to-many](../006-document/tab-document-many-to-many.md)),
   not as a changeset.
8. **Merge on save.** An editor's tab `PUT` carries `X-Changeset-Seen: <rev>`, the highest changeset revision it has
   applied. The api re-applies every recorded changeset after that revision to the incoming tab before writing,
   element by element:
   - an element the changeset **added** and the save lacks is added back;
   - an element the changeset **changed or removed** takes the changeset's version only when the save still holds
     the element exactly as the changeset found it (its before-image fingerprint). A save holding anything else
     changed it after, so the person's version stands. Taking the changeset's version keeps the save's live fields;
   - a **reorder** is re-applied only when the save still holds those elements in the order the changeset found.
     A save without the header (a bundle older than this spec) is treated as having seen nothing newer than
     `CHANGESET_MERGE_WINDOW_MS` (10 minutes) ago.

Because the merge reads the stored changesets rather than the room's relay, a changeset survives a dropped relay, a sleeping room and an
editor that was offline when it landed.

## What the room does

- Sequences the `changeset` op in one log slot, whatever its size, carrying `id`, `rev`, the owner's
  name and colour, the summary and the element ops.
- When the element ops exceed `CHANGESET_RELAY_MAX_BYTES`, the op carries no element ops and editors re-fetch the
  tab in place, as a resync does ([Resync without reloading the page](../012-collaboration/resync-without-reload.md)).
- Answers the api's internal `GET /selections?tab=<tabId>`: every element each connected person has selected (the
  whole multi-selection) from everyone who may change the content (a Participant or an Editor, never a Viewer), and
  which of those sessions are the agent owner's own (recognised by the [person tag](agent-presence.md)), whatever
  their role.

## Rooms for personal documents

An editor connects to its document's room for every server-stored document it has open, personal ones included.
A document in Offline Mode or This Browser has no room and no agent can reach it. On a personal document that is
neither shared nor in a team the editor sends only its selection and its tab focus; cursors, laser, viewport and
drag previews stay for documents with an audience.

## Whole-tab saves and tab renames

- A tab `PUT` presented with an API token is refused `405 use_changesets`, its message naming the changeset route.
  The CLI and the MCP server never do whole-tab saves.
- A [workbench session](../013-workspace/workbench-embeds.md) is a person's editor, not a token: its saves are
  whole-tab `PUT`s, it writes no agent changesets, its selection holds as a person's does, and its Undo on a toast
  is a person's revert.
- A tab is renamed with `PUT /api/documents/:id/tabs/:tabId/name { name }`, which advances the tab's `rev` and is
  relayed to the room as the `tab-meta` an editor's own rename sends. (A `document-meta` keeps every open editor's
  tab names, so a peer's stale tab list can never revert a rename.) The CLI's and the MCP's tab renames use it.
- A document renamed with an API token (`PUT /api/documents/:id { name }`) is relayed to the room as the
  `document-meta` an editor's own rename sends, with the tabs in order: open editors show the new name at once, and
  their next tab reorder carries it rather than writing the old name back. An editor's rename is not relayed again;
  the editor sends it to the room itself.

## Conflicts

The api compares the changeset's base with the stored tab:

| Situation                                                                          | Result                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| No base                                                                            | Applied; targets must exist; the result carries the warning `no_base`      |
| `rev` unchanged                                                                    | Applied                                                                    |
| `rev` changed, every targeted fingerprint unchanged, every selector resolves alike | Applied on the current tab; the result says `rebased over <n> writes`      |
| A targeted element changed or vanished, or a selector resolves differently         | `409 changeset_conflict`, nothing applied, each element as read and as now |
| `strict: true` and `rev` changed                                                   | `412 stale_tab`, nothing applied                                           |

Elements an operation only shifts to make room are not fingerprinted: a shift commutes with a person's move. When
`rev` changed, a target the base has no fingerprint for (a base carrying only a revision, or a selector now
matching another element) resolves differently. The api never holds what the agent read, so a conflict names each
element by the fingerprint read and the element now; the CLI prints the as-read side from its own cache.

## Held elements

An element a person has selected in an open editor is **held**: every element of their selection, when they may
change the content (a Participant or an Editor). A Viewer's selection holds nothing: they cannot change what an agent
would, so agents are never blocked by people only looking. An agent changeset whose operations target a held element
is refused with `409 elements_held`, naming each held element and who holds it; nothing is applied. The agent resubmits without those operations, or after the
person lets go. The CLI's `--wait-held <seconds>` retries for it.

- The agent's owner never holds against their own agent: their selection is what the `selected` selector reads.
- People outrank agents, not each other: a changeset without a token (a person's revert) is never held.

The room's answer is the source; when the room cannot be reached, nothing counts as held and the api logs it.

## Strict sources

Specified with [Diagram sources](../027-repositories/diagram-sources.md), not built yet: no changeset is checked for
residue today.

A changeset on a tab bound to a source in strict compatibility
([Diagram sources](../027-repositories/diagram-sources.md#strict)) is compiled, then checked against the bridge's
capabilities before the write; a result holding residue is refused `422 not_expressible`, naming each element and
field, and nothing is applied. A relaxed tab is never refused for residue.

## Boards and Sheets only in Plan

A Plan board or a Sheet goes only on a tab in Plan ([Plan tabs](../026-plan/plan-tabs.md#only-in-plan)). A changeset,
operations or replace, whose result holds a board or Sheet the tab did not hold before, on a tab not in Plan, is
refused `422 invalid_value`, naming each such element, with the hint to add a Board or Sheet tab with `add_tab`
instead; nothing is applied. So is a Plan template replaced over an existing tab not in Plan. Boards and Sheets a tab
already holds are left alone, and a replace that makes a new tab from a Plan template passes, the template making it a
Plan tab.

## Revert

- `POST /api/documents/:id/changesets/:changesetId/revert` applies the changeset's inverse as a new changeset by the
  reverter. An element changed since the changeset (its fingerprint differs from the after-image) is left as it is
  and listed as `kept`; the rest are reverted.
- The editor's toast offers **Undo**, which is this revert. Personal Ctrl+Z never reverts an agent's changeset
  ([Realtime conflict resolution](../012-collaboration/realtime-conflict-resolution.md), locked decision 1).
- A changeset can be reverted while its record exists: `CHANGESET_RETENTION_DAYS` after it landed; the room's own
  daily upkeep deletes older ones.
- Anyone with edit access to the tab may revert.
- Reverting a changeset that created a tab empties the tab and keeps it. Reverting one twice keeps every element
  (each changed since) and writes nothing.
- The history is `GET /api/documents/:id/changesets`, one changeset's `GET`, and the CLI's `changeset ls` and
  `changeset show`; the editor has no history surface.

## In the editor

- The element ops apply as a peer's would and fold into the save baseline, so the next autosave carries them. The
  revision a save sends as `X-Changeset-Seen` is the one its own snapshot holds, never one that arrived after it.
- An editor joining its room reads the document's newest changesets and re-reads, in place, any open tab it is
  behind on: a changeset relayed before it joined (a first join replays no log), or one whose relay never arrived,
  reaches the screen without a reload. What it brings is not outlined or toasted.
- Each element the changeset touched shows an outline in the owner's colour for `CHANGESET_REVEAL_MS`; with reduced
  motion it appears and disappears without animation.
- A toast names the person and the change: "Webber changed 3 elements: add payment service · Show · Undo" (the
  summary of the latest changeset in it, when it has one; adds and removals count as changed). **Show** brings the
  touched elements into view; **Undo** reverts. Changesets from one token within `CHANGESET_TOAST_COALESCE_MS`
  share a toast, and Undo on it reverts each, newest first. After Undo it reads "Undone", or "Undone, 2 kept
  because they changed since".
- The toast stays up for the answer time ([Toasts](../004-interface-design/toasts.md#timing), 10 seconds, paused
  while hovered or focused), or until dismissed; a newer burst from the same token replaces it. It is an information toast, so
  the "Show notifications" preference silences it; the outline still shows.

## The MCP server

`update_document` and `add_tab` submit changesets instead of tab `PUT`s ([MCP server](../015-api/mcp-server.md)).
`update_document` in `ops` mode sends its ops as edit operations with a base, so the read-to-write gap no longer
erases anything:

- It takes an optional `rev`, the revision `read_document` returned; the fingerprints come from the tool's own read
  at call time. A person's change between `read_document` and the call is overwritten only on the fields the ops
  set.
- `remove` is the edit operation `rm`: arrows pinned to the element go with it and are listed.
- Landing event-storming notes on lanes and coercing shapes are the engine's, for every front door.
- `rename_document` with a tab renames through the tab name route.

## Limits

| Constant                      | Value      | Why                                                                      |
| ----------------------------- | ---------- | ------------------------------------------------------------------------ |
| `CHANGESET_MAX_OPERATIONS`    | 500        | A full tab rebuild of a large diagram fits; a runaway loop does not      |
| `CHANGESET_RELAY_MAX_BYTES`   | 192 KiB    | Under the room's 256 KiB frame cap with room for metadata                |
| `CHANGESET_MERGE_WINDOW_MS`   | 10 minutes | Covers a pre-spec bundle until the new-version prompt reloads it         |
| `CHANGESET_RETENTION_DAYS`    | 30         | Matches the Trash: an agent's work can be undone as long as a delete can |
| `CHANGESET_REVEAL_MS`         | 2000       | Long enough to notice, short enough not to clutter                       |
| `CHANGESET_TOAST_COALESCE_MS` | 10000      | One toast per burst of work                                              |

A changeset's element ops, inverse and result lines are stored beside its record, one row each in the room, so only the tab
cap bounds a changeset.

A changeset lives in its document's room with the document's other content. Deleting an account purges the rooms of its own
documents and their changesets with them; the changesets the person wrote on other people's documents stay in those
rooms, credited by the name and colour they had, and go with that room's retention within
`CHANGESET_RETENTION_DAYS`. Signing up does not move a guest's changesets: they keep the guest author id
([API app](../015-api/api.md#owner-keyed-data)).

Changesets count against the token's write rate limit ([Public API and API tokens](../015-api/public-api-and-tokens.md) §3.5).

## Observability and telemetry

- Logs: `[changeset] applied`, `[changeset] conflict`, `[changeset] held`, `[changeset] relay-failed`,
  `[changeset] merged-on-save`, `[changeset] superseded-on-save`, `[changeset] reverted`, each with the document,
  tab, changeset id and counts, never content.
- Telemetry: category `Agent`, actions `Applied`, `Conflicted`, `Held`, `Reverted`, type the front door (`Mcp`,
  `Cli`, `Api`, or `Editor` for the toast's Undo) ([Telemetry](../017-telemetry/telemetry.md)). The toast's Show
  tracks `Agent` / `Opened` / `Toast`.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **CS1** Which migration number: 0067 (0066 went to Pages telemetry), which also adds the ws ticket person tag (the
  held check reads it); share roles moves to 0068 (default).
- **CS2** The revision of a tab that existed before revisions: 0 for every existing row; 1 for a tab inserted afterwards
  (seed, copy, first save, created by a changeset) (default).
- **CS3** How the compare-and-swap is made atomic in D1: Trigger `tabs_rev_advances` aborts any `data` update that does
  not advance `rev` by exactly one, rolling back the batch (default).
- **CS4** How "before writing" holds for a save racing a changeset: The tab PUT writes at the revision it read; a lost
  race re-reads and re-merges once, then `409 tab_busy` (the autosave retries) (default).
- **CS5** The ETag's form and conditional requests: Weak `W/"<rev>"` (representations vary by viewer redaction);
  `If-None-Match` is not honoured (default).
- **CS6** The fingerprint's hash: Canonical JSON (sorted keys, `LIVE_ELEMENT_FIELDS` left out) hashed by two 32-bit
  FNV-1a lanes, 16 lowercase hex characters, sync and shared (default).
- **CS7** The base32 alphabet and minting of changeset ids: Crockford base32 lowercase, 50 bits from
  `crypto.getRandomValues`; one re-mint on a primary-key collision (default).
- **CS8** How the line form and the JSON form reach the route: One JSON body; `operations` is an array (JSON form) or a
  string (line form); `base`, `strict`, `summary` beside it (default).
- **CS9** HTTP statuses for the engine's rejection codes: 400 `parse_error`, `unknown_operation`; 413 `too_large`; 422
  every other engine code (default).
- **CS10** How the summary is cleaned and an over-long one handled: Trimmed, control characters removed, empty means
  none; over 80 characters is refused `invalid_value` naming the cap (default).
- **CS11** A changeset or revert that changes nothing: Nothing written, recorded or relayed; 200 with `changeset: null`
  and the results (default).
- **CS12** Whether a dry run emits telemetry: No telemetry; it logs `[changeset] dry-run` (default).
- **CS13** Which error wins when the engine refuses and the base is behind: The base check over the base's own elements
  runs first; a conflict wins (default).
- **CS14** A base revision newer than the tab: `400 invalid_base` (default).
- **CS15** `strict` without a base: `400 strict_needs_base` (default).
- **CS16** The author's name and colour when no participant row exists: Snapshot on the record; fallback name "Someone"
  and the existing fallback colour `#0ea5e9` (default).
- **CS17** How the merge reads before-images cheaply: A `fingerprints` column `{ before, after }` per touched id on the
  record row, and `beforeOrder` (the order found of the elements kept) when the changeset reorders, which the merge and
  the revert compare a reorder against (default).
- **CS18** How many records a save's merge loads at once: Pages of 20 by revision, each with its `ops` part, processed
  in order (default).
- **CS19** An `X-Changeset-Seen` that does not parse: Treated as absent (the window rule) and logged `[changeset] seen-invalid`
  (default).
- **CS20** Room call timeouts: `/selections` 1,500 ms, the relay 2,000 ms, both awaited (default).
- **CS21** How an editor notices a relay it never received: The op carries `prevRev`, the tab's previous changeset
  revision; ahead of the seen revision triggers an in-place refetch; ops at or below seen are skipped (default).
- **CS22** How the toast coalesces by token without putting the token id on the wire: The op carries `agentKey`, the
  first 12 hex of SHA-256 of the token id (default).
- **CS23** How editors learn of a tab a changeset created: The op carries the tab's non-element fields; editors append
  the tab, then apply the element ops (default).
- **CS24** The `changeset` op's class in the room: A system kind (worker-only), sequenced through `/mutation` (default).
- **CS25** How the api knows the front door: Header `X-Livedoc-Client: mcp \| cli \| editor`; absent means `Api`
  (default).
- **CS26** The list route's paging and audit field: `?tab=`, `limit` 20 by default, at most 100, newest first; `tokenId`
  only to the changeset's author (default).
- **CS27** Owner-keyed `author_id` on account deletion and guest migration: Kept in the document's room: on the deleted
  account's own documents they go with the purged rooms, on other people's with the room's changeset retention within 30
  days; a guest's keep the guest author id after sign-up (default).
- **CS28** How the retention purge runs: The room's daily upkeep over `created_at`; parts follow by cascade (default).
- **CS29** Timeline and new-comment email for a changeset: The same as a tab save, with the author as actor (default).
- **CS30** Comment authors inside a changeset's result: `rewriteCommentAuthors` against the stored tab, as a save does
  (default).
- **CS31** A creating changeset naming a tab id this document lacks, or an over-long id: Creates this document's own tab
  (ids are unique per document); ids over 128 characters `422 invalid_value` (default).
- **CS32** Record fields arriving in a tab PUT body: `rev`, `documentId`, `orderIndex`, `updatedAt` are stripped before
  storing (default).
- **CS33** Whether document reads and tab summaries carry `rev`: No; only a tab read does (default).
- **CS34** What Show does exactly: Switches to the tab, then `fitToBounds` over the union of the touched elements'
  bounds, `maxZoom` 1 (default).
- **CS35** Where the shared constants and wire types live: `packages/api-schema/src/changesets.ts` (default).
- **CS36** How the MCP draws the result PNG after a changeset: It reads the tab once more and renders it (default).
- **CS37** The outline's animation: A fade over the short duration of [Motion](../004-interface-design/motion.md); none under reduced motion
  (default).
- **CS38** Where the room keeps selections and how many ids: DO storage `selection:<presenceId>`, at most 500 ids,
  pruned on close and on read (default).
- **CS39** Which identity marks the agent owner's sessions in the room: The agent presence person tag on the session
  attachment (`personTagFor`); `/selections` takes it as `person` (default).
- **CS40** The code of the 409 after a second lost race: `tab_busy` (default).
- **CS41** How the editor receives a tab's revision: `apiLoadTabRevisioned` returns `{ tab, rev }`; `apiLoadTab` maps it
  for callers that need no revision (default).
- **CS42** The tab rename's revision and relay: `renameTab` advances `rev`; the relay is the `tab-meta { name }` an
  editor's own rename sends, through `/mutation` (a `document-meta` keeps every editor's names, so a stale tab list
  cannot revert a rename) (default).
- **CS43** How the parts are stored and bounded: `agent_changeset_parts` rows `ops`, `inverse`, `results`, each at most
  `MAX_TAB_BYTES`; over is `413 too_large` (default).
- **CS44** Live fields when a changeset's version is taken (merge, revert): Grafted from the save or current element
  through `mergeIncomingElement` (default).
- **CS45** The 405 body for a token's tab PUT: `{ error: 'use_changesets', message }`, the message naming `POST /api/documents/:id/tabs/:tabId/changesets`
  (default).
- **CS46** How an editor learns of a changeset relayed before it joined the room: On its first presence list it reads
  the newest `CHANGESET_LIST_DEFAULT` changesets and re-reads every loaded tab it is behind on, in place, without an
  outline or toast (default).
- **CS47** A `select` whose selection has no primary element: The room records `elementIds` whenever it is non-empty;
  `elementId: null` with no ids clears the entry (default).
- **CS48** Whether a token's revert is held: Yes, on every element the reverted changeset touched, as any agent
  changeset; a person's revert never is (default).
