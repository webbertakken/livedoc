# Agent presence

**Status: built.** The comment endpoints and their listing, comment token ids, agent presence in the api, the room
and the editor, and the CLI's `comment`, `presence`, `wait` and `watch`.

An agent acts as the person whose token it holds. People see its work, its presence and its comments as that
person's, and comments are how people and agents talk on the canvas when nobody is chatting.

## Attribution

- An agent's changesets, comments and presence carry the name and colour of the token's owner. "Webber changed 3
  elements" reads the same whether Webber or his agent made the change.
- The token id is recorded on every changeset and comment for the audit trail (logs, `changeset ls`, revoking a
  token), and never shown as a name.

## Presence

- An agent at work appears in the tab's presence stack (its row in the [tab list](../007-editor/toolbar-layout.md#the-tab-list)) as its owner, with an optional status line ("adding payment
  service"). When the owner also has the tab open, the stack shows them once and the status line beside them.
- The status line shows in the avatar's hover card, its row in the Collaborators modal and its accessible name, never
  as text in the tab list's row. An agent's avatar carries the owner's name and colour, never a profile picture.
- The owner sees their own agent's status on their own avatar when both are on the tab, and as an avatar in their
  name on any other tab.
- Two tokens of one owner on one tab show as one avatar, with the status set last.
- A personal document's stack, otherwise hidden, shows while its owner's agent is present.
- The Collaborators modal lists an agent under its tab with its status line, offers no Follow, and leaves it out of
  the people count.
- The room recognises the owner's own sessions by a per-document tag derived from the owner id, held inside the room
  and never sent to a socket, so no owner id reaches the room.
- **Every changeset** applied or reverted with a token refreshes that token's presence on that tab for
  `AGENT_PRESENCE_TTL_MS`. A dry run or a refused changeset refreshes nothing.
- An agent may set presence explicitly: `PUT /api/documents/:id/tabs/:tabId/presence` with `status` (up to 80
  characters), `focus` (up to 20 element ids, shown with a ring in the owner's colour) and `ttl` (up to
  `AGENT_PRESENCE_MAX_TTL_MS`). `DELETE` on the same path clears it. The agent holds no socket.
- The room keeps agent presence entries beside people's and expires them on their ttl. An agent's presence never
  holds an element, and never counts in a session's head count, the Done check or a roll call.

## Comments

- An agent comments through the comment endpoints; the comment's author is the token's owner.
- The comment endpoints gain **reply**, **resolve** and **reopen** (today only add and delete exist), each relayed to
  the room as an `el-delta` like add. Agents and people use the same endpoints.
- An editor that may comment but not edit resolves and reopens through these endpoints, as it adds; an editor that
  may edit keeps the room and its save.
- `GET /api/documents/:id/comments?status=open|resolved|all` lists threads across tabs with their element's ref and
  label, so an agent can read the conversation without reading the tab. A Sheet cell's thread
  ([Cell comments](../029-sheets/sheet.md#cell-comments)) is listed on its own with its `cell` and, where the
  sheet is stored, its A1 (`cellRef`); add takes a `cell` beside the element, and the thread verbs find a cell's
  thread by its comment as they find an element's. It is not capped: it reads one tab at a
  time.
- Agents cannot be mentioned. An agent that answers comments reads new ones as they arrive ([CLI](../015-api/cli.md)
  `wait --for comment`) or on its next read.

## Token levels

What an agent may do follows its token's [level](../013-workspace/share-roles.md#api-tokens), through the same gates
as a share link: reading needs read access; comments, session answers and presence need the participation gate
(`gateParticipate`); changesets need the edit gate. A participate token comments, takes part and sets presence and
submits no changesets; a view token reads and writes nothing, comments and presence included.

Until [share roles](../013-workspace/share-roles.md) are built, `gateParticipate` names today's rule: read access to
the document or tab, as a view link may already comment, with a read-only token refused every write at the choke
point. It becomes the Participant check when share roles land, and no route changes then.

## Limits

| Constant                    | Value  | Why                                                      |
| --------------------------- | ------ | -------------------------------------------------------- |
| `AGENT_PRESENCE_TTL_MS`     | 30000  | Outlasts the gap between an agent's commands in one task |
| `AGENT_PRESENCE_MAX_TTL_MS` | 120000 | An agent that stops refreshing leaves within two minutes |

## Observability

Logs `[agent-presence] set`, `[agent-presence] cleared`, `[agent-presence] expired` with the document, tab and token
id. Telemetry: category `Agent`, action `Present`, type the front door, counted once when a `PUT` creates an entry.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **PR1** Which migration number: None of its own: the ticket column landed in 0067 with agent changesets, which needed
  the person tag first; 0068 is share roles' (default).
- **PR2** How the room tells an owner's session from others without holding the owner id: `personTagFor` = SHA-256 hex
  of `documentId:ownerId`, set on tickets minted by a verified account only (default).
- **PR3** What identifies one presence entry: The token and the tab: storage key `agent-presence:<tokenId>:<tabId>`
  (default).
- **PR4** Whether a PUT merges or replaces: Replaces: an absent `status` or `focus` clears it (default).
- **PR5** The unit and floor of `ttl`: Integer milliseconds, as the constants; at least 1000 (default).
- **PR6** Whether an over-limit status, focus list or ttl is cut or refused: Refused with a named 400; nothing is cut
  silently (default).
- **PR7** How the 80-character status is counted: Code points after trimming; an empty status means none (default).
- **PR8** What `focus` accepts and stores: A ref, unique prefix or id, resolved at the PUT; stored as full ids,
  de-duplicated, in request order (default).
- **PR9** What a changeset's refresh does to status, focus and expiry: Keeps status and focus; `expiresAt = max(expiresAt, now + AGENT_PRESENCE_TTL_MS)`;
  creates a bare entry if none (default).
- **PR10** What PUT and DELETE answer: PUT 200 `{ presence: { tabId, status, focus, expiresAt } }`; DELETE 204, also
  when nothing was there (default).
- **PR11** What PUT answers when the room is unreachable: 503 `room_unavailable`: the room is the only store, so nothing
  was set (default).
- **PR12** How many entries one room holds: 32 (`AGENT_PRESENCE_ROOM_MAX`); a new one past it is 409
  `agent_presence_full` (default).
- **PR13** How entries sit in Durable Object storage: One key per entry, restored by prefix list on wake (default).
- **PR14** How agent entries travel to editors: A separate `agents` array on the `presence` frame, so no `participants`
  reader ever counts one (default).
- **PR15** What ends an entry besides DELETE and its ttl: A trashed document clears all; a revoked or rescoped share
  code clears its entries; a revoked token waits its ttl (default).
- **PR16** What an entry on a deleted tab does: Expires on its ttl; editors skip entries on tabs they do not know
  (default).
- **PR17** Resolving a resolved thread, reopening an open one: 204, nothing written, nothing relayed (default).
- **PR18** What resolve and reopen answer: 204 with no body; reply answers 201 as add does (default).
- **PR19** The comment list's default status: `open` (default).
- **PR20** The comment list's order: Tab order, then reading order within a tab, comments in stored order (default).
- **PR21** How the list reads a document's tabs: An `instr` query names threaded tabs; each is read alone, one tab in
  memory at a time (default).
- **PR22** What a comment write does on a lost compare-and-swap: Re-reads and repeats once, then 409 `tab_busy`, as a
  changeset does (default).
- **PR23** Where a comment's token id is kept: `Comment.tokenId` in the element JSON, locked, redacted and stripped from
  the wire like `authorId` (default).
- **PR24** Which thread verbs reach the Timeline: Reply as a comment added (`reply: true`); resolve as comment resolved;
  reopen none (default).
- **PR25** Whether a reply emails the owner: Yes, as an add does when the caller is not the owner (default).
- **PR26** Whether a failed comment relay is logged: Yes: `[room-mutation] el-delta did not reach the room`, warn
  (default).
- **PR27** Which level an agent entry shows: The level the gates resolve for its token on the document (default).
- **PR28** Where the comment routes live: `apps/api/src/routes/comment-routes.ts`, with add and delete-own moved out of
  the subresource routes (default).
- **PR29** How entries and the facilitator grace share one alarm: `armAlarm` sets the earliest deadline or deletes the
  alarm; `alarm()` sweeps, judges the baton, re-arms (default).
- **PR30** What covers a late or missed alarm: Every roster build and every wake sweeps expired entries first (default).
- **PR31** How a focus ring is drawn: 2 px owner colour, 4 px outside the bounds, over a 1 px halo; static (default).
- **PR32** Which idle status a standalone agent row shows: Always online: its ttl, not idle time, decides when it leaves
  (default).
- **PR33** Which characters a status may hold: Any but C0 controls and DEL, refused as `invalid_status` (default).
- **PR34** Whether DELETE presence needs the tab to exist: No, so an entry on a deleted tab can still be cleared
  (default).
- **PR35** How two people's focus rings on one element are drawn: Nested: each further person's ring 4 px further out
  (default).
- **PR36** What a refused resolve or reopen from a non-edit session does: The thread goes back and `[comments] thread state not saved`
  warns (default).
- **PR37** Which buttons an agent's Collaborators row carries: None: an agent has no socket to follow and cannot hold
  the baton (default).
