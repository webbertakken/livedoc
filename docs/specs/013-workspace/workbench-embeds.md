# Workbench embeds (`/embed/workbench`)

**Status: built** for both scopes: the api, the pages, the pairing page and the CLI commands.

A **workbench** is a developer tool that shows a document live beside an agent: an agent workbench first, then VS Code
and other editors. A **workbench embed** is the editor inside that tool's frame, signed in as the person, so they draw
there, everything they draw reaches LiveDoc at once, and their agent, working through the
[CLI](../015-api/cli.md), sees the drawing and their selection. It is the signed-in sibling of the share-code
[embed](embeds.md).

## Two scopes

A workbench embed has a **scope**, chosen when it is minted and fixed for the life of its session:

| Scope       | Frame                                     | Starts on                          | Reaches                                            |
| ----------- | ----------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `document`  | `/embed/workbench?d=<id>`                 | that document (or its asked tab)   | one document                                       |
| `workspace` | `/embed/workbench/explorer[/folder/<id>]` | Explorer Home, or the asked folder | the person's whole workspace, as the Explorer does |

The **workspace** scope is the Explorer itself inside the workbench: a workbench keeps the person's diagrams one
click away, and a project's folder (a [repository link](../027-repositories/repository-link.md)'s) beside its code.
It never starts on `/new` or the landing page: a frame with no folder starts on Explorer Home
([Explorer Home](explorer-home.md)). Where this page says "the document" without a scope, it means the document
scope's document, or the document open in a workspace frame.

## Why a ticket, and not the person's session

A frame needs no CORS: CORS governs `fetch`, not framing. What stops a signed-in editor in another tool's frame is:

- **Framing.** The editor sends `X-Frame-Options: DENY`; only `/embed` may be framed ([Embeds](embeds.md#frame-headers)).
- **Third-party storage.** Inside a frame on another site, browsers partition or block LiveDoc's cookies and
  storage (Safari, Firefox, and Chrome with third-party cookies off), so the person's session is not there, and
  Google's sign-in refuses to run in a frame.

So the frame never carries the person's session. The workbench already runs the CLI, which holds the person's
token; the CLI exchanges it for a **workbench ticket**, and the frame redeems the ticket for a **workbench session**
that acts as the person on one document only.

## The handoff

1. **Mint.** The workbench runs `livedoc workbench open <doc> [--tab <t>] --origin <origin> --json`. The CLI
   calls `POST /api/workbench/tickets { documentId, tabId?, origin }` with its token and prints
   `{ url, documentId, tabId, expiresAt }`. The ticket is 128 random bits, single use, valid for
   `WORKBENCH_TICKET_TTL_MS`, stored with the token's owner, the document, the origin and the token's access level.
   - **A workspace ticket.** `livedoc workbench open --workspace [--folder <f>] --origin <origin> --json` calls
     `POST /api/workbench/tickets { scope: 'workspace', folderId?, origin }` and prints
     `{ url, scope, folderId, expiresAt }`. `scope` is `document` when absent, so today's callers are unchanged. A
     `folderId` the token's owner cannot reach answers `404` (CLI exit 3); a document scope without a `documentId`,
     or a workspace scope with one, is refused `400 invalid_value`. The ticket stores the scope and the folder.
   - **The origin** is exactly `scheme://host[:port]`, nothing more: `https` anywhere, `http` only on a loopback
     host (`localhost`, `127.0.0.1`, `[::1]`). `*`, `null`, a path, a query or any other scheme is refused
     `400 invalid_origin`; another workbench's scheme (a VS Code webview's) joins the list in this spec first.
2. **Frame.** The workbench frames `url`, whose origin is the live app's canonical origin, never one that redirects (the workbench checks every message against it): `<live origin>/embed/workbench?d=<documentId>#ticket=<ticket>`. The
   document id is no secret; the ticket travels in the fragment, which no server, log or `Referer` sees, and the page
   removes it from its address on load. A workspace ticket's url is
   `<live origin>/embed/workbench/explorer[/folder/<folderId>]#ticket=<ticket>`.
3. **Redeem.** The page sends `POST /api/workbench/sessions { ticket }`. The api consumes the ticket and answers
   `{ session, scope, documentId, folderId, tabId, origin, role, expiresAt, person }` (`person`: the owner's display
   identity; `documentId` null in the workspace scope, `folderId` null unless one was asked). A `documentId` other
   than the address's `d`, or a scope other than the address's page, is refused and the session revoked. The session is an opaque `lvw_`
   credential valid for `WORKBENCH_SESSION_TTL_MS`, held in the page's memory only, never in storage.
4. **Bind to the workbench.** The page posts `livedoc:hello` to its parent with `targetOrigin` set to the
   ticket's origin, so a parent of any other origin never receives it, and mounts the editor only after the parent
   answers `livedoc:hello-ack` from that origin within `WORKBENCH_HANDSHAKE_MS`. A page that is not framed, or
   framed by another origin, mounts nothing, revokes the session, and says "This view opens only inside <origin>."
5. **Renew.** Before the session expires the page posts `livedoc:renew`; the workbench mints a fresh ticket and
   posts `livedoc:ticket`. Unrenewed, the session ends and the frame turns read-only with the line "Reconnect in
   <workbench> to keep editing."

## Pairing

A token mints tickets only for a workbench it is **paired** with: a pairing is one token and one origin, approved once
by the token's owner in their own signed-in browser. A token that leaks (into CI, a log, another machine) therefore
opens no session anywhere its owner has not approved.

A pairing also records its **scope**: `document`, or `workspace`, which also covers the document scope. Every
pairing approved before scopes existed is a `document` pairing. A workspace mint on a document pairing is unpaired
for that scope: it answers `428 pairing_required` with a new request, so reaching the whole workspace is always a
second, explicit approval, never an existing pairing widened in silence.

1. **Unpaired.** `POST /api/workbench/tickets` for an origin the token is not paired with answers
   `428 pairing_required { pairingUrl, expiresAt }`. The pairing request behind it is single use and valid for
   `WORKBENCH_PAIRING_TTL_MS`; a second unpaired mint for the same token and origin returns the same request while
   it lives.
2. **Ask.** `livedoc workbench pair --origin <origin> [--name <workbench>]` opens `pairingUrl` in the browser
   (or prints it when it cannot) and waits for the answer, as `auth login --device` waits. `workbench open` refused
   for pairing prints that command and exits 4. A workbench shows the URL as one button, "Approve in LiveDoc".
3. **Approve.** `<live origin>/workbench/pair?code=<code>` is an ordinary editor page (never framed), for a signed-in
   person only, and only the token's owner may answer. It reads: "Allow **Acme Editor** at `https://127.0.0.1:5175` to
   open your documents with the token **LiveDoc CLI**?", with **Allow** and **Don't allow**. The workbench name
   is the one the CLI sent, shown beside the origin, which is what is enforced. A workspace request reads: "Allow
   **Acme Editor** at `https://127.0.0.1:5175` to open **your whole workspace**, and to create, move, share and
   trash documents and folders in it, with the token **LiveDoc CLI**?". `workbench pair` takes `--workspace`.
4. **Paired.** Allow records the pairing; the waiting command exits 0 and the workbench mints again. Don't allow, or
   an expired request, ends the wait with exit 4 and records nothing.

- A pairing lives as long as its token: revoking the token removes its pairings.
- **Settings > API tokens** lists each token's paired workbenches (name, origin, scope, when paired), each with
  **Unpair**, which ends that pairing's open sessions as revoking does.
- Pairing is per origin, so one workbench on a laptop and on a LAN address pairs separately.

## What a workbench session may do

- **Act as the person, on one document.** Every request with `Authorization: Bearer lvw_...` resolves to the
  ticket's owner, for that document only; any other document answers `404` as if absent. It loads the document and
  saves tabs as the editor does (the whole-tab `PUT` and `X-Changeset-Seen`), joins the room through a room ticket
  carrying the owner's [person tag](../024-agents/agent-presence.md), so the person's selection there is what their
  agent's `selected` reads and never holds against their own agent.
- **Never more than the token.** The session's level is the minting token's level on the document, capped by the
  owner's own access now: a view token gives a read-only frame.
- **Only what the editor of one document needs.** The document, its tabs, comments, changesets, items and room;
  uploading images into it (always with the bytes: the hash-only dedupe shortcut is not theirs, so the session
  cannot probe the owner's gallery, [Images](../009-elements/images.md) "Size cap") and reading its images; reading the person's display identity, preferences, custom
  themes and shape libraries; the catalogues; sending a [bug report](../016-platform/bug-reports.md#entries) as the
  person, which a view session may do too. Everything else is refused `403 workbench_confined`: ownership powers
  (share links, password, move, delete, publish, copy), other documents, the person's library and folders,
  writing preferences or the profile, the guest migration, tokens, teams, the account and the AI assistant. The
  editor offers none of them in a workbench embed: the person's agent sits beside it.
- **Revocable.** Revoking the minting token ends its sessions; the page learns it on its next request or the room's
  close and turns read-only.

The bullets above are the document scope. A **workspace** session is confined differently:

- **Act as the person, in their workspace.** It reaches what the person reaches in the Explorer: their library and
  folders, the documents shared with them, their teams' shared documents as a member, the Inbox, the Timeline,
  Favourites, Recent, Search, the Trash, their image gallery, themes and shape libraries; and every document in
  them, opened in the frame as the document scope opens one.
- **Everything the Explorer does.** Create, rename, move, copy, favourite, share (links, roles, password, expiry),
  trash, restore, and create, rename, move and delete folders, at the person's own access to each.
- **Bug reports.** Sending a [bug report](../016-platform/bug-reports.md#entries) as the person, as in the document
  scope.
- **Never the account.** Refused `403 workbench_confined`, as in the document scope: the profile, preferences'
  writes, the guest migration, API tokens and pairings, team administration (invites, members, roles, plans,
  billing), the account itself, and the AI assistant (the person's agent sits beside the frame).
- **Never more than the token.** Each request is capped by the minting token's level and by the person's own access
  now, as in the document scope: a view token gives a frame that browses and reads.

## What renders

The editor of the document, minus the app's surroundings: no Explorer or account menu, so the brand group has no
menu button and the actions group no account control. The canvas, the two lines' groups
([Toolbar layout](../007-editor/toolbar-layout.md#the-two-lines)), the palette and the panels stay, since a
workbench embed is for drawing. An **Open in LiveDoc** button, in the actions group, opens the document in a full
tab. The colour scheme follows the workbench (`livedoc:theme`),
else the system. Presence shows the person as themselves; their agent shows as their status line
([Agent presence](../024-agents/agent-presence.md)).

A **workspace** frame renders the Explorer as it is at `/explorer`: its sidebar, its views and its empty states,
without the app header, the account menu, Settings, or the Teams administration rows. Opening a document opens the
editor in the same frame (`/embed/workbench/document/<id>`), with a **Back** control to where it was opened from;
the browser's own back and forward walk the frame's history. Back moves forward to where it returns: it never steps
back through the history, which the frame shares with its host, so a host's own entry is never undone in its place.
**Back** is the brand group's Back
([Toolbar layout](../007-editor/toolbar-layout.md#the-top-line)): the first thing at the top left of the frame,
where back controls live, and the first of the editor's controls for the keyboard. There is no separate Back
button. A document's status screens (deleted, load error, not found) carry Back at their top left too. The document
scope has nowhere to go back to: its brand group shows the mark without the caret, and the mark is not a link. **New document** creates the document in place and opens
it in the frame, never `/new`. **Open in LiveDoc** opens the current view or document in a full tab. A frame
started on a folder shows that folder; its empty state is the Explorer's own, with New document and the templates.

## Workbench messages

`window.postMessage` between the page and its workbench, each `{ type, v: 1, ... }`, sent only to the bound origin
and accepted only from it. Unknown types are ignored, and logged once each.

| Type                | From      | Carries                                                              |
| ------------------- | --------- | -------------------------------------------------------------------- |
| `livedoc:hello`     | page      | Nothing; asks the workbench to answer                                |
| `livedoc:hello-ack` | workbench | The workbench's name, shown in copy ("Reconnect in Acme Editor")     |
| `livedoc:ready`     | page      | `documentId`, `documentName`, `tabId`, `tabName`, `role`             |
| `livedoc:tab`       | page      | The tab now shown: `tabId`, `tabName`                                |
| `livedoc:selection` | page      | The [selection reference](#the-selection-reference); empty when none |
| `livedoc:renew`     | page      | Nothing; asks for a ticket                                           |
| `livedoc:ticket`    | workbench | `ticket`                                                             |
| `livedoc:reveal`    | workbench | `refs`: brings those elements into view and outlines them            |
| `livedoc:theme`     | workbench | `colourScheme`: `light` or `dark`                                    |
| `livedoc:ended`     | page      | `reason`: `expired`, `revoked`, `trashed`, `refused`                 |
| `livedoc:place`     | page      | Workspace only: where the frame is, below                            |
| `livedoc:open`      | workbench | Workspace only: `to`, below                                          |

In a workspace frame, `ready` carries `scope: 'workspace'` and no document; `tab`, `selection` and `reveal` speak of
the document open in the frame, and do nothing while none is. `trashed` ends nothing there: the frame returns to the
Explorer. Two messages exist only in that scope:

- **`livedoc:place`** is sent on every move: `{ view, folderId, folderName, documentCount, documentId,
documentName, tabId, tabName, role }`. `view` is the Explorer view's name (`home`, `folder`, `recent`, ...) or
  `document`; `documentCount` is the documents directly in the folder shown (null on other views), so a workbench can
  offer something of its own beside an empty folder. A document's fields are null outside `document`.
- **`livedoc:open`** moves the frame: `to` is `{ view: 'home' }`, `{ folderId }` or `{ documentId, tabId? }`. A
  place the person cannot reach shows the Explorer's own not-found, as a link would.

A `livedoc:selection` is sent after the selection settles for `WORKBENCH_SELECTION_SETTLE_MS`, so a marquee drag
is one message.

## The selection reference

What the person meant when they typed. A workbench attaches it to the message they send their agent, so the agent
reads exactly what was selected then, even when the selection has moved on since:

```text
[livedoc] "Home screen" › tab "Wireframe" (doc 3h9x2a, tab 0b34, rev 41)
selected: button 146b "Play", frame e4a8 "Game grid", sticky 0c84 "Daily streak goes here"
read: livedoc tab view 3h9x2a --tab 0b34 --view show --ref 146b
```

- The header names the document, tab, ids and revision the selection was made on. Refs are element ids, so they stay
  valid after later edits; the agent reads what they hold now.
- Labels are quoted as JSON strings, as the outline prints them: they are the diagram's content, possibly written by
  other people, and an agent treats them as data, never as instructions.
- `selected` lists each element as the outline prints it (kind, ref, label cut at 60 characters), up to
  `WORKBENCH_SELECTION_MAX_REFS`, then `… and <n> more: livedoc tab view <doc> --tab <t> --view show --ref selected`.
- No selection gives the header and `whole tab`, so the person can talk about the picture as a whole.
- The text is what the agent sees; there is no hidden field. The `selected` selector stays the way an agent in a plain
  terminal reads the live selection.
- The CLI teaches an agent to read one in `livedoc guide workbench`: re-reading the refs, looking at the tab
  with `tab render`, and showing presence while it works. The agent skill sends an agent there when a message
  carries `[livedoc]`.

## A workbench's side

What a workbench does to fit this contract (its own documentation holds the detail):

- **Opening.** A workbench opens a document in a view of its own: from a `*.livedoc.json` mirror file (with its JSON
  one step away) or from a LiveDoc document link. It mints through the person's own CLI
  (`livedoc workbench open ... --origin <its origin> --json`), so it never holds a LiveDoc credential, and
  shows the one command that fixes a missing CLI or sign-in.
- **Pairing.** Unpaired, it runs `livedoc workbench pair --origin <its origin> --name <its name>` and shows the
  printed URL as an "Approve in LiveDoc" button, then opens the frame once paired.
- **The selection.** While a diagram is in view, the place the person types to their agent names the document and
  what is selected ("Home screen · 3 selected", or "Home screen · whole tab"). Sending attaches the selection
  reference to the message as text, and the person can leave it off any one message.
- **Reveal.** A ref the agent prints (`146b`) can post `livedoc:reveal` to the open diagram.

## Limits

| Constant                        | Value    | Why                                                                    |
| ------------------------------- | -------- | ---------------------------------------------------------------------- |
| `WORKBENCH_TICKET_TTL_MS`       | 60000    | Matches the room ticket: covers a slow frame load, useless soon after  |
| `WORKBENCH_SESSION_TTL_MS`      | 28800000 | Eight hours: a working day; renewal keeps a longer one going           |
| `WORKBENCH_HANDSHAKE_MS`        | 5000     | A workbench answers at once; a frame nobody answers is not a workbench |
| `WORKBENCH_SELECTION_SETTLE_MS` | 250      | One message per gesture, quicker than a person moves to the composer   |
| `WORKBENCH_SELECTION_MAX_REFS`  | 20       | Matches agent presence's focus cap; more is a selector, not a list     |
| `WORKBENCH_PAIRING_TTL_MS`      | 600000   | Ten minutes: time to switch to the browser and read the question       |
| `WORKBENCH_TICKETS_PER_MINUTE`  | 30       | Per token; a workbench opens a few documents, never a stream of them   |

## Security

- **Minting needs a paired token**: a token alone opens nothing until its owner approves the workbench
  ([Pairing](#pairing)), and no page can obtain a ticket for someone else; this is what makes a frameable,
  signed-in page safe from clickjacking, as the share code is for [embeds](embeds.md#frame-headers).
- **A ticket is a bearer credential.** Redemption cannot tell a browser from a script, so what protects a ticket is
  that it is single use, lives `WORKBENCH_TICKET_TTL_MS` and travels only in a fragment. The origin binding is the
  page's guard against being framed by a site other than the minter's, not a guard on redemption.
- **The trust boundary is the token, and the person's machine.** A session gives nothing an edit-level token's
  holder lacks, except writing as the person's own editor (whole-tab saves, no agent attribution, a person's
  selection). An agent holding the token could open one itself; on the person's machine it already runs as the
  person, with the person's browser profile in reach.
- **One document, one level, renewable up to the token.** A session reaches one document at its level for
  `WORKBENCH_SESSION_TTL_MS`; renewal mints a new ticket with the token, so the ceiling is the token's own life, and
  revoking the token ends every session it opened.
- **A workspace session is the Explorer's powers, intersected with the token's.** A route the minting token could
  not call, the session cannot call either; the account routes stay closed to both. So the workspace scope widens
  what one frame reaches, never what the token reaches, and it is only ever reached through its own approval
  ([Pairing](#pairing)).
- Sessions are stored hashed; the api logs their id prefix, never the secret.

## Observability and telemetry

- Every api log below carries the scope.
- Api logs: `[workbench] pairing-requested`, `[workbench] paired`, `[workbench] pairing-declined`,
  `[workbench] unpaired`, `[workbench] ticket-minted`, `[workbench] session-opened`, `[workbench] session-refused` (with the
  reason: `expired`, `used`, `unknown`), `[workbench] session-ended`, each with the document id and the token id.
- Page logs: `[workbench] handshake-ok`, `[workbench] handshake-failed`, `[workbench] renewed`,
  `[workbench] message-ignored` (the type), `[workbench] place` (the view, never a name) and `[workbench] open`
  (the target's kind).
- Telemetry: `Session·Opened·Workbench` when a page mounts the editor, `Session·Opened·WorkbenchWorkspace` when a
  workspace frame mounts the Explorer; `Cli·Used·WorkbenchOpen` and
  `Cli·Used·WorkbenchPair` for the commands; `Token·Linked·Workbench` when a pairing is approved.

## Invariants and edge cases

The invariants and edge cases the code and its tests cite by id.

- **E1** Origin with a path, query, fragment, credentials, `*`, `null`, `http` on a non-loopback host, or a default port
  written out (`https://x:443`): `400 invalid_origin` at the api, exit 1 at the CLI.
- **E34** The pair page opened in a frame: the live worker sends `X-Frame-Options: DENY`; nothing renders.
- **I8** The workbench page mounts no editor and sends no `livedoc:*` message other than `hello` (and `ended` `refused`,
  to the session's origin) before a valid `hello-ack`.
- **I9** The editor in a workbench never runs the guest migration, never writes the participant record, and never writes
  preferences to the api.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **WB1** How a level is stored before share roles are built: `role` `view` or `edit` from `read_only`, under share
  roles' three-value `CHECK`: participate needs no migration (default).
- **WB2** How long a workbench name may be; whether a later ask renames: 1 to 40 characters, trimmed; a pending request
  takes the latest name given; a pairing keeps its request's (default).
- **WB3** What "the owner's own access" counts: Ownership and team membership; never a share code; a share-link URL in
  `workbench open` exits 2 (default).
- **WB4** Where the frame URL's origin comes from; whether it names a tab: `appBaseUrl(env)` (`APP_BASE_URL`); no tab
  parameter: the tab rides the redemption's answer (default).
- **WB5** What redemption does with an `Authorization` header: Ignores any but `lvw_`, which the choke point confines
  (default).
- **WB6** When a session expires against its token: The earlier of eight hours and the token's own expiry (default).
- **WB7** What `person` holds when the owner has no display identity row: `name` and `color` null; the editor shows a
  random name and colour locally and writes nothing (default).
- **WB8** What another credential header beside `lvw_` gets: `403 workbench_confined`: a session never borrows a share
  code's or a guest's access (default).
- **WB9** How a view session's writes are refused, and which pass: `403 workbench_read_only` at the choke point; the
  room-ticket mint, the session's own end and a bug report pass (default).
- **WB10** Which write budget a session spends: `WRITE_RATE_LIMITER` keyed `workbench:<sessionId>`, apart from its
  token's agent writes (default).
- **WB11** What a room matches when access ends; what the page's own end closes: The pairing id, carried by the room
  ticket, so a socket outlives renewal; the page's own end closes nothing (default).
- **WB12** Whether an ended page can be revived by a later ticket: No: `ended` is terminal; the workbench frames a fresh
  URL to reconnect (default).
- **WB13** What a `hello-ack` with a missing or overlong name gets: Invalid, ignored and logged; the wait runs on to the
  deadline (default).
- **WB14** Whether a ticket outside the renew window is redeemed: Yes, as a renewal: a workbench may renew early
  (default).
- **WB15** Which scheme shows before the first `livedoc:theme`: The system's; the frame's stored Appearance setting is
  ignored in a workbench (default).
- **WB16** How the editor treats a request the allow-list refuses: Refused locally (`WorkbenchConfinedError`), nothing
  sent, logged once per route, not a network error (default).
- **WB17** Whether an unchanged selection is sent again: No: a settled selection is sent only when its text differs from
  the last sent (default).
- **WB18** How `reveal` brings elements into view and outlines them: The changeset toast's Show and outline, in the
  person's colour, for `CHANGESET_REVEAL_MS`, on the active tab (default).
- **WB19** How the header names the document: By its full id: the frame cannot see the library a shorter ref is unique
  in, and `<doc>` always resolves it (default).
- **WB20** In which order selected elements are listed: The tab's element order, so the text does not depend on the
  order of clicks (default).
- **WB21** Whether a reference with no selection carries a `read:` line: No: the header and `whole tab`, as the spec
  lists (default).
- **WB22** Where the `… and n more` tail goes: On the `selected:` line, after the last item (default).
- **WB23** Which exit `workbench open` gives a 428: 4, mapped by the verb; `exitCodeForStatus` is unchanged (it reads
  428 as 1) (default).
- **WB24** How a workbench reads the pairing URL before the wait ends: stdout's first line, flushed before waiting: the
  URL, or `{ status, pairingUrl, expiresAt }` with `--json` (default).
- **WB25** When `workbench pair` opens a browser: Only when stdout is a terminal; piped, as a workbench runs it, it
  prints and waits (default).
- **WB26** Where the new error tokens live: `WORKBENCH_ERROR_CODES` in `packages/api-schema/src/workbench.ts`, as
  `CHANGESET_ERROR_CODES` (default).
- **WB27** How "exactly `scheme://host[:port]`" is checked: The input must equal `new URL(input).origin`: no trailing
  slash, default port, upper case or credentials (default).
- **WB28** What "empty when none" means for a selection message: `count` 0; `reference` still carries the header and
  `whole tab`, which the chip and the agent need (default).
- **WB29** How the pairing code is made and kept: 16 random bytes, base64url, in the clear: it grants nothing without
  the owner's session and is served again (default).
- **WB30** How long an expired session row is kept: One day, so a late request logs `expired` rather than `unknown`;
  then the daily sweep deletes it (default).
- **WB31** What the page makes of a room close 4005 (access changed): `ended(revoked)`: the owner lost access, and a
  workbench cannot reload into another path (default).
- **WB32** Whether a session's requests stamp the token's `last_used_at`: No: the frame's autosave would make every
  token look in constant use (default).
- **WB33** The page's loading and refusal copy: "Opening your diagram…"; "Open this diagram from your workbench" with
  "This link works once, for a minute." (default).
- **WB34** Where Open in LiveDoc sits: The actions group, top right, after Search and Settings: a corner of the canvas
  is where docked panels sit (default).
- **WB35** What a token card with no pairings shows: Nothing extra: no empty heading (default).
- **WB36** Whether Unpair asks first, and its words: Yes, Revoke's popover: "Unpair <name>?
  Its open diagrams stop editing until you allow it again." (default).
- **WB37** How logs name an origin: Its host only (default).
- **WB38** When "before the session expires" is; how often to ask again: Ten minutes before, then every minute until a
  ticket lands or the session expires (default).
- **WB39** How long a session secret is: 32 random bytes after `lvw_`, as an API token's (default).
- **WB40** Which migration number: 0077, the next after 0076; one migration holds the four tables and the `ws_tickets`
  column (default).
- **WB41** How `WORKBENCH_TICKETS_PER_MINUTE` is enforced: Its own rate-limit binding, namespace `7010`, 30 per 60 s
  (previews `7110`) (default).
- **WB42** Whether creating a pairing request is limited: Yes, in the same per-token bucket as the mint (default).
- **WB43** The statuses of the rejections the spec does not name: 403 `token_required`, 401 `invalid_ticket`, 401
  `invalid_session`, 403 `workbench_read_only`, 403 `not_a_workbench_session`, 409 `pairing_answered`, 410
  `pairing_expired` (default).
- **WB44** What `tabId` is when `workbench open` names none: `null`; the editor opens the document's first tab
  (default).
- **WB45** What the waiting CLI polls: `GET /api/workbench/pairing-requests/:code/status`, the requesting token only
  (default).
- **WB46** How Settings reads a token's pairings: `GET /api/workbench/pairings` once, grouped by token in the client;
  `GET /api/tokens` is unchanged (default).
- **WB47** Which logs beyond the spec's list: `bearer-refused`, `confined`, `read-only-refused`, `mint-refused`,
  `renew-failed`, `message-invalid`, `ended`, `redeem-failed`, `request-confined`, `reveal-missed` (default).
- **WB48** Which error codes the ways a `workbench pair` wait ends carry: `pairing_declined`, `pairing_expired`,
  `pairing_gone`, so a workbench reading `--json` stderr tells them apart (default).
- **WB49** How the mint names the spec's refusals: `400 invalid_value`: `invalid scope`, `a workspace ticket names no document`,
  a missing `documentId`, `invalid folderId`; a malformed `tabId` stays `bad_request` (default).
- **WB50** What approving a workspace request does to a document pairing: Widens it in place (same id, sessions keep
  their scope); a document approval never narrows a workspace pairing (default).
- **WB51** Whether a workspace session runs teams or uses Drive: No, `403 workbench_confined`: each needs a session
  token, so the token cannot; the frame offers none of them (default).
- **WB52** Which folders a workspace ticket may start on: The owner's personal folders, and folders of teams they are a
  joined member of; else `404` (default).
- **WB53** Which credential headers pass beside a workspace session: `X-Share-Code` and `X-Share-Password`, so a shared
  document opens by its link; `X-Owner-Id` stays refused (default).
- **WB54** Whether a view session lists share links: No, `403 workbench_read_only` in both scopes, as for a read-only
  token: the list carries every code (default).
- **WB55** How ending access finds a workspace session's rooms: `workbench_session_rooms`: each room ticket it mints
  records the document; `endWorkbenchAccess` closes each (default).
- **WB56** The frame paths of the views the spec does not name: `/embed/workbench` + the view's `/explorer/...` path; a
  document `/embed/workbench/document/<id>[?s=][&tab=]` (default).
- **WB57** Where a link the frame cannot hold goes: A new tab with `noopener`: help, sign-in and every page outside the
  Explorer (default).
- **WB58** What New document makes in the frame, and where: The asked template, else a blank, named as `/new` names it;
  in the asked folder or team, else the place's (default).
- **WB59** Where Back sits; what it does with no frame entry before: The brand group's Back, top left (caret and mark,
  named "Back"); moves to the Explorer place the document was opened from, else Home, never by `history.back()`,
  which in a frame can step back the host instead (default).
- **WB60** What a trashed document says in the workspace frame: The toast "That document is in the Trash." over the
  Explorer it returns to (default).
- **WB61** Where the lens field sits without the app header: A slim bar at the top of the frame holding the field alone,
  in the header's colours (default).
- **WB62** Which rows are Teams administration: New team, Invites, a team library's settings, members and invite
  controls, the timeline's token Revoke (default).
- **WB63** When `place` is sent again for the same place: Whenever any of its fields changes (a rename, a count, a tab);
  never twice with the same fields (default).
- **WB64** Which migration, and how the document becomes optional: 0099; tickets and sessions rebuilt with `scope`,
  `folder_id` and a scope `CHECK`; live requests per scope (default).
- **WB65** The workspace frame's opening and refused copy: "Opening your workspace…"; "Open your workspace from your
  workbench", "This link works once, for a minute. …" (default).
- **WB66** The line under a workspace pairing question: "It works in your Explorer and your documents, as you, inside
  that tool.
  You can unpair it any time …" (default).
- **WB67** How Settings names a pairing's scope: "One document at a time" or "Whole workspace" (default).
