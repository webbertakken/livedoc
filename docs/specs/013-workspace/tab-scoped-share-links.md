# Tab-scoped share links

A share link ([Auth + guest access](../014-identity/auth-and-guest-access.md), [API app](../015-api/api.md)) has a **scope**: either **All tabs** (the whole document) or **one tab**. A tab-scoped link opens only its tab. The other tabs stay visible in the visitor's [tab list](../007-editor/toolbar-layout.md#the-tab-list) as nameless "Not shared" rows, and the server never sends their content. The tab stack counts only the tabs in scope. That covers REST and the realtime room.

## Why

Owners sometimes want to show one tab of a document, not the whole thing: the roadmap tab to a client, but not the pricing tab beside it. Until now the answer was to duplicate the tab into a new document, which forks it. A scoped link shares the living tab. See issue #29.

## Scope

- Every link has a role (`view` / `edit`, unchanged) and a scope. Role and scope are independent: a tab-scoped link can be view or edit.
- **All tabs is the default.** A link created without a tab is exactly the link that existed before this spec.
- A document holds any number of links, of any mix of scopes: different tabs to different people, several links to the same tab, all-tab links alongside.
- The owner can **change a link's scope** after creation, both ways (All tabs ↔ a tab, one tab ↔ another tab). The code stays the same, and the change takes effect immediately for everyone holding it (see [Rescoping](#rescoping)).
- Only the owner manages links, as for every share-link operation.

## Data model

Migration `0048_tab_scoped_share_links.sql`:

- `share_links.tab_id TEXT NULL`: the tab the link is scoped to; NULL = All tabs. Existing rows are NULL, so every existing link keeps its meaning.
- `shared_with.tab_id TEXT NULL`: the scope the visitor was last granted, written alongside `role` on every share resolve (last visit wins, the rule `role` already follows).
- `ws_tickets.tab_scope TEXT NULL` and `ws_tickets.share_code TEXT NULL`: a room ticket carries the scope and the admitting code from the mint to the upgrade (see [Realtime](#realtime)).

The `ShareLink` DTO gains `tabId: string | null`, and `SharedWithItem` gains `tabId: string | null`.

## Access

A scoped link grants its role **on its tab only**. The worker enforces this in one place, the document access resolution: it answers not just "may this caller read/edit" but "with what tab scope". Every route applies the scope:

| Door                                                          | Scoped visitor gets                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/share/:code`                                        | `{ document, role, tabId }`, with the document redacted (see [Redaction](#redaction)).                                                                                                                                                                                             |
| `GET /api/documents/:id`                                      | The same redacted document.                                                                                                                                                                                                                                                        |
| `PUT /api/documents/:id` (rename, reorder, tab folders, deck) | 403. The document's structure isn't theirs to change.                                                                                                                                                                                                                              |
| `GET/PUT/DELETE /api/documents/:id/tabs/:tabId`               | Their tab only, with the role's usual rules. Another tab id is a 404 (no existence leak). DELETE of their own tab is 403: a scoped link can't delete the tab it's scoped to. A PUT that adds the tab's first board or plan view is 403 `tab_scope_widen`: either shows every card. |
| Comment `POST`/`DELETE`                                       | Their tab only; otherwise 404.                                                                                                                                                                                                                                                     |
| `GET /api/documents/:id/comments`                             | Their tab's threads only; an empty list while their tab has none. A caller with no grant is refused.                                                                                                                                                                               |
| `POST /api/documents/:id/copy`                                | A copy holding **only their tab**.                                                                                                                                                                                                                                                 |
| `GET /api/documents/:id/thumbnail`                            | Their tab's image, not the first-tab snapshot.                                                                                                                                                                                                                                     |
| `GET /api/images/:id?d=`                                      | Only images referenced by their tab.                                                                                                                                                                                                                                               |
| Q&A board `POST .../tabs/:tabId/qa`                           | Their tab only.                                                                                                                                                                                                                                                                    |
| Document timeline feed                                        | Refused: it spans every tab.                                                                                                                                                                                                                                                       |
| `GET /api/share/:code/image.svg`                              | Always their tab. A `?tab=` naming another tab is a 404.                                                                                                                                                                                                                           |
| Room ticket / WS upgrade                                      | Admitted with the role and the scope (see [Realtime](#realtime)).                                                                                                                                                                                                                  |

Holding several links is never merged: each request is judged on the code it carries.

### Structure

A link to one tab changes that tab's **content**, never its **structure**: what it is called and what it reaches.
Structure is three things (`apps/api/src/tab-structure.ts`):

- **The tab's name.** A rename is structure, like the document's name.
- **What pulls cards onto the tab.** Adding or removing a Plan board, a plan view or a Plan card, pointing a Plan card
  at another card, or turning an element into one of them changes which cards the tab shows ([Items](../026-plan/items.md)
  "Who may do what"), and so which cards the link may change and delete. Moving, resizing or restyling one is content.
  Each element's reach is `elementReach` (`@livedoc/items`): `board`, `view`, `card:<item id>` or none.
- **Where its form sends responses.** On a scoped Form tab, the form's responses may go only to a board or Sheet on that
  tab. A destination someone with wider access set elsewhere stays as it is while the form's questions change.

The doors:

| Door                                                | Scoped Editor                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /api/documents/:id/tabs/:tabId/name`           | `403 { error: 'tab_structure' }`, the name untouched, nothing relayed.                                                                                                                                                                                                                 |
| `PUT /api/documents/:id/tabs/:tabId` (the autosave) | The save lands with its structure put back as stored (`keepStoredStructure`): the stored name, every stored Plan element, none it added, the form's targets as stored. Logged `[tabs] tab.structure.kept`.                                                                             |
| `POST .../changesets`, a revert                     | `403 tab_structure` when the result changes the structure, nothing written.                                                                                                                                                                                                            |
| `POST .../tabs/:tabId/form` (an agent's form write) | `403 tab_structure` when the form points its responses off the tab; the tab keeps its name instead of taking the form's heading.                                                                                                                                                       |
| The room (live ops)                                 | A rename dropped; a whole-`tab` op relayed under the stored name; an op changing the reach or pointing the form off the tab dropped ([Realtime](#realtime)).                                                                                                                           |
| `POST /api/documents/:id/items`                     | Only from a tab that shows every card (a Plan board or plan view on it, `tabShowsEveryCard`), where the new card stays in scope; anywhere else `403`, before any named id is looked at, so a taken id elsewhere answers as a free one. The bulk route refuses scoped callers outright. |

Each refusal logs `[tabs] tab.structure.refused` with what changed (`name`, `reach` or `form`). The scope comes from the
request's grant (`tabScopeOf`), read only when the request carries a share code, so the owner's autosave pays nothing.

### The tab must still belong to the document

A scoped link is only valid while its tab is still in the document. Deleting that tab **deletes every link scoped to it** in the same request, and broadcasts `share-revoked` for each, so the visitors holding them leave the editor exactly as on a manual revoke. The access resolution also treats a scoped link whose tab is gone as no link at all, so a race can't open anything.

### Drawing tabs

A text document tab's drawings are tabs of their own that belong to it ([Drawings](../034-text-documents/objects.md#drawings)).
A link to that tab reaches them as it reaches the tab: every door above, and the room, admit a tab whose `drawing_of` is
the link's tab, judged as each request or op arrives, so a drawing made after the visitor joined is in reach once the
room has stored it.
A drawing tab is never a link's own tab: the Share dialog lists listed tabs only.

- What reaches is content alone: a link to one tab still adds and removes no tabs, drawing tabs included.
- `isTabInScope(env, documentId, tabScope, tabId)` (`apps/api/src/tab-scope.ts`) answers for the REST doors, inside
  the document's room; the room answers from its own SQLite as each frame arrives (`room-scope.ts`), reading each tab
  once per frame, and a failed read admits nothing.
- The ops, the catch-up, a scoped session's own ops (judged against the drawing tab's stored structure) and freeing a
  selection hold all admit the scope's drawing tabs.
- Redaction keeps a drawing tab of the link's tab whole: its name and `drawingOf`. Any other drawing tab keeps its
  `drawingOf` beside its out-of-scope mark, so no visitor's tab bar shows it; `document-meta` carries `drawingOf` too.
- The editor opens the link's drawing tabs and loads them like its own tab; any other tab still meets "That tab isn't
  shared with you".

### Redaction

A scoped visitor's copy of the document:

- `tabs`: every tab keeps its `id` and `orderIndex`, so the bar can draw it in place. The other tabs carry `name: ''`, no `folder`, `updatedAt: 0` and `outOfScope: true`. (Not `locked`: `Tab.locked` is the existing user-toggled read-only lock, a different thing.) Their tab is unchanged.
- `presentation`: `null`. A slide deck spans tabs.
- The document's name, owner name and colour stay: the visitor sees those when resolving any link.

### Shared with you and the Inbox

- `GET /api/shared` returns, for each row, the link the visitor came in through while it is live and still matches their recorded role **and scope** (`share_links.tab_id IS shared_with.tab_id`), never one broader than what they were given ([Share roles](share-roles.md#share-links): a revoked link ends the visits it granted). It returns `tabId` too.
- The [Inbox](inbox.md) picks share codes the same way, and lists a scoped visitor's actions and threads on their tab only.
- Copy's `shared_with` leg honours the recorded scope, as the share-code leg does.

## Realtime

The upgrade forwards the resolved scope to the room with the role (`X-Verified-Tab-Scope`, beside `X-Verified-Role`), plus the code the session joined with (`X-Verified-Share-Code`). The room stores both on the session, and they survive hibernation like the role does.

For a scoped session:

- **Outbound**: the room doesn't send it any op carrying a different `tabId`: element, tab, cursor, selection, avatar, reaction, viewport, focus and Q&A ops. A `select` without a `tabId` is dropped, as is a `log` op whose entry is on another tab. `document-meta` is redacted the same way the REST document is. Catch-up replay applies the same filter. Its `seq` can lag because of filtered ops, which is harmless: every op on its own tab still reaches it, and the ledger merge is per tab.
- **Inbound**: the room drops any op from it that carries a different `tabId` (presence included, so a `tab-focus` elsewhere too), a `select` with no `tabId`, and `document-meta` outright (and the retired `log` / `log-remove` ops of the removed Activity panel). Of the tab-less ops it may still send the poll ops. Anything else fails closed. An op carrying a board or plan view (a `plan-board` or `plan-view` element anywhere in it) is dropped too, unless the tab already held one when the session joined (read once per scoped connection): either shows every card, which the link does not reach. A board already on the tab stays editable.
- **Structure** ([Structure](#structure)): the room drops a scoped session's `tab-meta` patch that sets or clears `name`, and sends its whole-`tab` op out under the tab's stored name, since every receiver merges that op name and all. It drops a scoped session's op that would change what pulls cards onto the tab (an element added, updated or removed whose reach changes, or an element patch touching `shape`, `planBoard` or `planCard`) or point the form off the tab, and an `el` op of no kind it knows (`room-structure-gate.ts`). Adding a Plan element is refused from the op alone; the rest is judged against the tab in the room's own SQLite as the frame arrives, so no op waits and order is kept (`room-scoped-structure.ts`). That stored tab trails the live one by the autosave. Where the room stores no such tab yet, the op passes as sent, name included, logged `[room] scoped structure unjudged`: the save that writes the tab keeps its structure (`keepStoredStructure`). A store that cannot be read refuses the op (`[room] scoped check failed`); a drop logs `[room] scoped structure dropped` with `why`, a name put back `[room] scoped tab op renamed back`. Sessions without a scope never read the store.
- **Payload keeps to its tab** (from anyone, scoped or not): a whole-`tab` op whose payload names another tab id than its envelope's `tabId`, and a `tab-meta` patch that carries `id`, `elements` or `articles`, are dropped. Receivers merge a `tab` payload over their tab and spread a `tab-meta` patch over it, so a payload naming another id would renumber the tab on every peer, and their next save would write it over that other tab, past the sender's scope. The editor also keeps its own tab's id whatever a `tab` or `tab-meta` op carries.
- **Freeing a held selection** (the facilitator's unlock): a scoped session may free only a selection held by someone working on its own tab.
- Presence entries still carry each peer's tab id, so avatars can stack on "Not shared" rows. An id is not content.

### Revoke closes the socket

`share-revoked` and `share-rescoped` (below) now also **close** every room socket that joined with that code, after delivering the op. Before, a client had to honour the redirect itself; a modified client could ignore it and keep receiving ops.

### Rescoping

Changing a link's scope broadcasts a system op `share-rescoped { code }`. Sessions that joined with that code reload the page (the resolve then hands them the new scope) and the room closes their sockets. Sessions on other codes ignore it.

### A change while joining

A session's scope and code come from its room ticket, minted a moment before the upgrade. A revoke or rescope that lands between that mint and the room accepting the socket broadcasts to a room the session is not in yet. So once the room has accepted a share session's socket it reads that link once more (`room-link-recheck.ts`, one indexed read, share sessions only):

- The link is gone, expired, or its tab deleted: the room sends that session `share-revoked { code }` and closes it, as the broadcast would have.
- The link now opens another scope: the room sends it `share-rescoped { code }` and closes it, and the editor reloads into the new scope.
- Otherwise nothing happens. A change this read did not see has not been written yet, and its broadcast reaches the socket, which is already in the room.
- A failed read leaves the session as its ticket admitted it and logs `[room-link] join recheck failed`; a session told of a change logs `[room-link] joined on a changed link` with the op's kind.

## Visitor experience

- A scoped visitor lands **on their tab**, whatever tab the document last had open.
- Other tabs render as **"Not shared" rows** in the tab list: greyed, an eye-off glyph, the label "Not shared", not switchable, not draggable, no tab menu. The hover card reads "This tab isn't shared with you". They never sit inside a tab folder (the folder name is withheld too).
- Everything that works across tabs, or on the tab list itself, is off for a scoped visitor: the add-tab button, the mode menu's New Tab offer (a mode that would open a new tab is shown but inert), the tab menu (so rename, duplicate, delete, lock and the tab's session tools too), drag-reordering, tab folders, document rename, and the slide deck (picking it says "The slide deck isn't shared with you").
- An element link, search result or keyboard switch pointing at a tab outside the scope does nothing but show the toast "That tab isn't shared with you".
- Make a copy takes their tab only.

## Owner experience (Share dialog)

- The composer's fine print gains an **Opens** row, a select above **Valid** ("Tabs this link opens"): "All tabs" (default), then each tab by name, in bar order. It only shows when the document has more than one tab.
- Each active pass shows its scope beside **Opens** as a select ("All tabs" / a tab name); a single-tab document leaves the term off, since every pass opens every tab. Changing it rescopes the link at once. A single-tab document shows no scope control; its links are All tabs.
- A scoped link's **Live image** has no tab picker: it always renders the link's tab.
- A scoped link's Embed shows its tab, because the embed resolves through the same code.

## API

- `POST /api/documents/:id/share` body gains optional `tabId: string | null`. An unknown tab, or one not in this document, is `400 invalid tab`.
- `PUT /api/documents/:id/share/:code` (owner, or a joined team member on a team document), body `{ tabId: string | null }`: rescope. `400 invalid tab` as above, `404` for an unknown code. Returns `{ link }` and broadcasts `share-rescoped`.
- `GET /api/share/:code` returns `tabId` alongside `role`.

## Testing

`apps/live/e2e/tab-scoped-share.spec.ts` drives the whole path: the owner scopes a link in the Share dialog, a visitor opens it in a second browser, no response or realtime frame carries the other tabs, and rescoping to All tabs reloads the visitor into every tab. The e2e stack proxies the realtime room's WebSocket for this.

## Telemetry

Following the [Telemetry + public transparency dashboard](../017-telemetry/telemetry.md) vocabulary, creating a scoped link also emits `Document/Shared/TabScoped`. A rescope emits `Document/Shared/Rescoped`.

## Out of scope

- A link scoped to several tabs (a subset). One tab or all of them.
- Hiding that other tabs exist. The rows are deliberately visible, so the visitor knows there's more.
- Assigned actions: assigning an action on another tab to a scoped visitor doesn't widen their scope. The email names the action, which the owner wrote deliberately, and the deep link 404s for them.
