# Auth + guest access

**Status: built; docs.nu runs guest-only until its sign-in secret is set.** Sign-in is **better-auth**, run inside
LiveDoc's own api worker with its identity data in LiveDoc's own D1. It replaced Clerk, which no account moves from:
docs.nu never had Clerk accounts. Not built yet: Settings > Account's editable name, sign-in
methods and sessions lists.

## Principle

**The canvas always works without signing in.** A first-time visitor can land on `/new`, create a document, build
something real, and only later be asked to sign up. Friction-free engagement is the acquisition strategy.

We don't put auth in front of the core experience. We add auth where it _enables_ something the user wants (sharing
across devices, teams, tokens, collaborating under one name).

## Who is who

| Term                  | What it is                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **guest**             | A visitor without an account. Works fully, keyed to one browser.                                                                                  |
| **guest id**          | The guest's owner id: a UUID the server mints, with an HMAC **guest signature** only the browser it was minted for holds.                         |
| **account**           | A person who signed in. One row in LiveDoc's own identity tables, however many sign-in methods it has.                                            |
| **account id**        | The account's owner id: `acct_` and 24 base62 characters, never a UUID, so the two shapes never meet.                                             |
| **sign-in method**    | A way to prove who you are: Google, an email code (and later others). Several can belong to one account.                                          |
| **session**           | A signed-in browser. A cookie on `/api/auth/*`, and the short-lived **session token** the browser sends to the rest of the api.                   |
| **API token**         | A `livedoc_` secret for scripts, the CLI and MCP clients, owned by an account ([Public API and API tokens](../015-api/public-api-and-tokens.md)). |
| **workbench session** | An `lvw_` credential for one framed editor, minted from a token ([Workbench embeds](../013-workspace/workbench-embeds.md)).                       |
| **owner id**          | Whichever of guest id or account id owns a row. Every owner-keyed column holds one ([Owner-keyed data](../015-api/api.md#owner-keyed-data)).      |

## Deployment modes

| Mode       | Configuration                                                                | Frontend                                                                                                 | API worker                                                                        |
| ---------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sign-in on | `BETTER_AUTH_SECRET` set, and at least one sign-in method configured         | Sign-in pages, account menu, settings. Guests and accounts coexist.                                      | Serves `/api/auth/*`; verifies session tokens, falls through to the guest header. |
| Guest-only | No `BETTER_AUTH_SECRET` (a self-host with no keys at all, and docs.nu today) | No sign-in anywhere; the auth pages say sign-in is off here, with "Continue as guest". Editor unchanged. | `/api/auth/*` answers `404`; every request is a guest.                            |

- **No keys at all is a supported host.** A self-host that sets nothing runs guest-only, exactly as it does today
  ([Open source + distribution](../002-project-scope/open-source-and-business-model.md)).
- **The secret alone is not sign-in.** A secret with no method configured stays guest-only and logs
  `[auth] secret_without_methods` once per isolate, rather than offering a sign-in page nobody can finish.
- **A method lights up when its keys are present:** Google with `GOOGLE_AUTH_CLIENT_ID` and `GOOGLE_AUTH_CLIENT_SECRET`;
  email codes with a working email sender ([Email for sign-in](#email-for-sign-in)).
- **The frontends ask; nothing is baked in.** The api's `GET /api/capabilities` reports `authEnabled` and the
  `signInMethods` it offers (with the public Google client id when Google is on). There is no publishable key in a
  build, so one static build serves a guest-only host and a signed-in one alike. A misconfigured "frontend has a key,
  api has none" mode can no longer exist.

## Sign-in methods

Two methods ship first:

- **Google.** "Continue with Google" on both auth pages. The account takes Google's verified email, name and picture.
  On an address that already has an account it joins that account only when Google verified the address.
  It is proven end to end against a fake Google on the signed-in e2e stack
  ([Signed-in specs](../003-system-architecture/e2e-smoke.md#signed-in-specs)).
- **Email code.** Type an email, receive a 6-digit code valid for 5 minutes, type it. Three wrong tries spend the
  code. A code is checked only by signing in with it: no other route reads one, so guesses sent at once can't race the
  count of tries. The first sign-in with a new address creates the account with that address verified.
- **Not in the first release:** passwords (they need hashing budget on the worker and a reset flow), magic links (a
  second email method for the same job), Google One Tap, passkeys and two-factor. Each is a later addition to this list.

### Email for sign-in

An email code is only as good as its delivery, so sign-in email is not best-effort the way the lifecycle series is
([Transactional & lifecycle email](transactional-email.md)):

- A code that could not be handed to the provider fails the request (`502 EMAIL_SEND_FAILED`), and the page says
  "We couldn't send the code. Try again in a minute." rather than waiting for a code that will never come.
- Sending goes through one email sender with two possible providers, Cloudflare Email Service (the
  `EMAIL` Workers binding) when bound, else Resend (`RESEND_API_KEY`). With neither configured, email codes are off and
  only the other methods show.
- Codes are stored hashed, never in plain text.

## Sessions

- **Where a session lives.** better-auth's session cookie (`__Secure-livedoc.session_token`: `HttpOnly`, `Secure`,
  `SameSite=Lax`, host-only, `Path=/`) is set and read only by `/api/auth/*`. Host-only means `docs.nu`'s cookie never
  reaches a preview host, and a preview's never reaches `docs.nu`.
- **How the rest of the api knows the caller**. The browser
  asks `/api/auth/token` for a **session token**, a 15-minute EdDSA JWT whose `sub` is the account id and which
  carries the account's email and whether it is verified, and sends it as `Authorization: Bearer`. The api verifies it against its own keys, in-process, with no network call. A request that
  carries no cookie cannot be forged from another site, so the api's own routes need no CSRF defence of their own.
- **Lifetime.** A session lasts 30 days and slides forward at most once a day while used. Signing out ends it at once
  everywhere the api reads it; an issued session token keeps working until its own 15 minutes run out.
- **Seeing and ending sessions.** Settings > Account lists this account's signed-in browsers (browser and system,
  from the user agent; last active), marks this one, and offers **Sign out** on each and **Sign out everywhere else**.
  A session signed out there leaves the list at once (every other one, for Sign out everywhere else), while the list
  is read again; its button is busy while the request is on its way, so it is never pressed twice.
- **Fresh enough for the dangerous things.** Deleting the account and removing a sign-in method need a session
  verified within the last 10 minutes. An older one asks the person to verify again (an email code, or Google) first.

## How the api knows who is calling

One resolution at the top of every api request, in this order; the first credential present decides, and a
credential that is present but wrong is refused, never read as a guest:

1. **API token** (`Bearer livedoc_…`): its owner account. Refused `401 invalid_token` when unknown, revoked or expired.
2. **Workbench session** (`Bearer lvw_…`): its owner, confined to its document or workspace.
3. **Session token** (any other `Bearer`): the account, when it verifies. A token that fails verification (expired,
   wrong key, wrong issuer) falls through to the guest header, as a failed token always has, because the guest path must
   always serve; it is logged as `[auth] session_token_rejected reason=<code>`, never the token.
4. **Guest header** (`X-Owner-Id`, with `X-Owner-Sig`): the guest id.

- **Only a session administers.** Account and team administration (team changes, minting and revoking tokens,
  approving an MCP client or a CLI, deleting the account, the guest migration) needs credential 3. A token reaches the
  same documents its owner does, but never mints another credential or changes a membership.
- **An account id is never a guest credential.** An `acct_…` id in `X-Owner-Id` is refused
  `401 account_id_not_a_guest_credential`. The editor holds the same rule from its side: a signed-in client that
  cannot get a session token throws `SessionTokenUnavailableError` instead of sending its account id as the guest
  header ([Per-tab storage](../006-document/per-tab-storage.md)).

The two paths coexist forever. A signed-in person can hand a share link to a guest who edits without an account.

## Capability matrix

| Capability                  | Guest                         | Account                               |
| --------------------------- | ----------------------------- | ------------------------------------- |
| Editing the canvas          | ✓                             | ✓                                     |
| Persistence                 | ✓ (per-browser, not per-user) | ✓ (per-account, syncs across devices) |
| Open a share link as viewer | ✓                             | ✓                                     |
| Open a share link as editor | ✓                             | ✓                                     |
| Mint a new share link       | ✓                             | ✓                                     |
| Real-time presence          | ✓ on shared sessions          | ✓                                     |
| Teams                       | ✗                             | ✓                                     |
| API tokens, CLI, MCP        | ✗                             | ✓                                     |
| Google Drive mirror         | ✗                             | ✓                                     |

## Auth surface

Routes inside `apps/live/`:

- **`/sign-in/`**: the methods `signInMethods` names, Google first. An email that has no account yet is not turned
  away: the code creates the account, then asks for a name. On success (and for a visitor already signed in) it lands
  on the **Explorer** at its own landing, Explorer Home (`POST_AUTH_SIGNIN_DEFAULT`, `/explorer`), unless a safe
  `?redirect_url` says otherwise. Home rather than Recent: Home is where the Explorer lands everyone
  ([Explorer Home](../013-workspace/explorer-home.md)), and it shows the recent documents and what happened since, which
  is what a returning person wants first.
- **`/get-started/`**: sign-up, the same methods with a name field first (one **name**, not first and last). Its
  default destination is the welcome flow (`POST_AUTH_DEFAULT`, `/new`).
- **Leaving is in place.** A code sign-in or sign-up goes to its destination in place of the auth page
  (`location.replace`), as a visitor already signed in does, so Back from the destination never lands on an auth page
  that would only send the person on again.
- **Google's round trip** ends at better-auth's own callback (`/api/auth/callback/google`), which redirects to the
  destination the page asked for. There is no separate callback page: the destination is passed as better-auth's
  `callbackURL` (and `newUserCallbackURL` for a first sign-in), and a failed round trip comes back to the page it
  started on with `?error=<code>`, shown as a sentence above the form.
- **`?redirect_url=...`**: any **same-origin path** that is not itself an auth page. Every in-app trigger builds it
  (`authHrefWithReturn` and `useAuthReturnPath` in `components/chrome/auth-shared.tsx`, through one
  `isSafeInternalPath` guard), both auth pages forward it across their cross-links, and both methods honour it.
  better-auth checks the same destination against its trusted origins, so an open redirect needs both guards to fail.
- **`/explorer/`**: open to guests and accounts alike; the owner id resolves as everywhere else.

The shared card chrome and inputs live in `apps/live/components/chrome/auth-shared.tsx` so the two pages don't drift.

### The look: Night Band

Every account and connect page (`/sign-in`, `/get-started`, the OAuth consent and device pages and
the workbench pairing page) stands on one frame, `AuthStage` (`apps/live/components/chrome/AuthStage.tsx`), modelled on
the marketing site's "No Catch" night section:

- **Header.** The brand at the top left. On `/sign-in` and `/get-started` a **"Not now, keep going as a guest"** link
  sits at the top right, because the canvas never needs an account. It goes back to the page's `?redirect_url` when
  that is safe and is not itself a signed-in-only page (`/oauth/*`, `/workbench/*`), and to `/new` otherwise
  (`guestReturnHref`). The connect pages have no guest link: they only work signed in.
- **The card.** A near-opaque card (no backdrop blur, so the lines moving behind it never make it repaint) holding the page's title (the `h1`: "Welcome back", "Create your account", "Check your
  email" on the code step), an optional line under it, the error or notice, the form and the cross-link footer.
- **The pitch.** Beside the card, an eyebrow, a heading and its promise rows (four on the account pages, three on the connect pages), each a tinted icon, a coloured lead
  and a line. The account pages say what an account adds ("No catch": every device, teams to create and join, AI tools, 0 paywalls); the connect
  pages say what connecting means ("Connect": live, your call, revoke any time). The pitch holds no controls.
- **Decorative lines keep drawing** behind the content on wide screens, in any direction: four slots each take a
  random route that enters through one edge and leaves through another, bending across the stage on the way
  (`randomTrace`, `components/chrome/auth-lines.ts`). A route draws in, holds, then trails off the far edge over 14
  seconds, and its slot takes a fresh route the moment it ends; the first round starts the slots a quarter cycle apart,
  so a new line is always on its way. Routes are chosen in the browser after mount. They are hidden from assistive
  technology and absent below the `lg` breakpoint. Under reduced motion (the OS setting or the person's own preference)
  two fixed routes through the margins stand still, fully drawn, and nothing moves.
- **The entrance** draws the page in a beat at a time, at the marketing hero's pace
  ([Motion](../004-interface-design/motion.md#content-pacing)): the header, eyebrow and heading rise in, the card lands
  with a slight tilt and overshoot like a shape dropped on the canvas, the promise rows slide in like stickies being
  placed and each row's icon pops once its row has landed. Everything has settled by about 660ms; under reduced motion
  the page simply appears.
- **Large screens.** From `2xl` the frame widens to 88rem, the pitch heading grows, the promise rows sit in a
  two-by-two grid and the card gains room; from 1920px the whole frame (not the lines) is zoomed 1.2 times, and 1.35
  times from 2400px, so a big monitor is filled at a readable size rather than left with a small island.
- **Both themes.** Dark mode wears the Midnight palette (the root carries `data-palette="midnight"` while the frame is
  mounted; [Colour scheme](../004-interface-design/color-scheme.md#midnight-the-account-and-connect-pages)), so the
  page is the night section itself. Light mode is the same layout on a pale dotted ground (`slate-100`) with a white
  card and the darker accent inks (`emerald-700`, `brand-700`, `amber-700`), all at WCAG 2.2 AA. Small text that
  sits on the bare ground (the eyebrow, the guest link) is `brand-800`, so it holds 4.5:1 even over a grid dot.
- **Phone first.** Below `lg` the card comes first and the pitch follows it, stacked, compact and full width with a
  16px gutter; at `lg` and up the pitch takes the left column and the card the right. The card is first in the DOM at
  every width, so the form is what a screen reader and the Tab key reach first.
- **Interstitials** (the redirecting card) use the same frame with no pitch, the card centred, so a
  hand-off between pages never flashes a different ground.

Signed-in status surfaces at the end of the editor's actions group via `<AuthControls>` (initial bubble + Sign out menu). Signed-out users see a "Sign in" link in the same slot. Neither blocks the editor: they're purely informational.

## Identity display name

An account's participant `name` follows the account's **name** (Google's name, or the one typed at sign-up). On every
editor mount the participant record is seeded with it, and re-`PUT` whenever it has drifted from the persisted value,
so renaming yourself in Settings > Account reaches everything that reads the participant row on the next load.

Two welcome-modal rules follow from that:

- **Owner on their own document**: the identity-only welcome screen never opens. The name is already settled by the
  account; asking for one on a document they own would be noise.
- **Visitor on someone else's document (signed in)**: the welcome screen still opens (it carries the "you're joining
  X's document" context), but the "Your name" input is `readOnly` and the shuffle button hides. A signed-in visitor
  can't masquerade under a different display name on a host's document.

Guests keep the first-load identity prompt, a fully editable name and the shuffle button.

The join prompt is **independent of share role**: both **edit-role and view-role** visitors get it. A viewer's display
name is broadcast to everyone else (cursor label, the tab presence stack, comments), so they need a chance to set it
before joining rather than appearing under a random default. The identity card only writes the visitor's **own**
participant row (`PUT /api/participants/:id`, authorised on `owner === id`, not on document-edit rights), so confirming
a name never hits a `403` even for a read-only viewer.

## Guest → account upgrade

When a guest signs in, the documents they built as a guest **move into their account** rather than being lost.

Guests keep today's signed guest ids and their migration rather than becoming better-auth anonymous accounts, which
would still leave the moving of data to us, mint a new account id on sign-in, delete the guest's row afterwards even
when our move failed, write an account row for every visitor, and need a secret that a no-keys self-host does not
have.

1. Every page that talks to the api mounts the account bootstrap (`useAccountApiBootstrap`), which watches the
   session.
2. The first time a session is settled AND a guest id is still in `localStorage`, the page calls
   `POST /api/migrate { guestOwnerId, guestSignature }` with the session token.
3. The worker (session only, no guest-header fallback) **verifies the guest signature** and then moves every
   guest-holdable row from the guest id to the account id. [Owner-keyed data](../015-api/api.md#owner-keyed-data) is
   the one list of those tables and how each handles a row the account already has: where both hold the same row, the
   account's copy wins.
4. On success the page forgets the guest id. A retry with the same guest id moves zero rows.
5. **Owner data waits for the migration.** Until it settles, `authLoaded` stays false, so no page reads or writes as
   the account while the guest's rows still belong to the guest id. A failed migration settles too (the guest id
   stays, so the next load retries), and one still pending after `GUEST_MIGRATION_WAIT_MS` (10 s) stops holding the
   page.

The participant row moves too, so a guest who picked a name and colour keeps them until the account's name takes over
on the next load; an account that already had a participant row keeps its own.

### Signed guest ids

A guest id is a bearer value that **leaks**: it rides in document DTOs and realtime presence frames. So:

- **Server-minted.** `POST /api/guest-id` generates the id and returns it with its HMAC signature. Because the server
  chooses the id, a caller only ever holds a signature for an id it was handed. The signature is kept in
  `localStorage` and never appears in a DTO or a presence frame.
- **One secret.** The signing key is derived from the sign-in secret (HKDF, purpose `livedoc-guest-id`), so turning
  sign-in on is one secret, not two. It derives from the oldest usable secret (`BETTER_AUTH_SECRET`, else the oldest
  version in `BETTER_AUTH_SECRETS`), so rotating the sign-in secret never locks a guest out of their documents.
- **Always enforced where there is a key.** Owner-scoped routes refuse a guest header without a valid signature, and
  `/api/migrate` refuses a guest id without one. There is no grace window: docs.nu has no accounts to protect from a
  cut-over, and the guests it has were never meant to be claimable. A browser holding an unsigned guest id from before
  is handed a fresh signed one: it can never move into an account, and the server documents of the old id stay out of
  reach. A host with the secret but no sign-in method is guest-only, yet it signs and enforces all the same.
- **Guest-only hosts sign nothing.** With no secret there is no account to migrate into, so an unsigned guest id is
  all a guest needs, as today.
- **Defence in depth.** The owner's id is not returned to non-owner readers (`redactDocumentForReader`), on both doors
  that hand out a document DTO.

## Account linking

- **Same email, different method: one account.** Google onto an email-code account (or the reverse) joins the
  existing account when both sides have verified the address. Google verifies its addresses and an email code is
  itself a verification, so in practice the second method simply appears in the account.
- **Different email.** Settings > Account > Sign-in methods > **Connect Google** links a Google account whose address
  differs. Signing in with that Google account afterwards opens this account.
- **Removing a method.** Allowed while another remains, after a fresh verification ([Sessions](#sessions)); the last
  one cannot be removed (delete the account instead).
- **The account's email** is the address it was created with. Changing it sends a code to the new address and
  switches only once that code is entered. Not in the first release: the email is shown read-only until then.

## Account settings

Settings > Account opens on the **profile card** ([Account settings & email notifications](profile-and-email-notifications.md)
"Identity"): who this is, drawn as others see them. Signed in, then:

- **Name**: editable inline. A refusal says so until the name is edited again, never after the field holds the
  stored name once more.
- **Colour**: the colour collaborators see on this person's cursor, avatar and name tag, chosen in place from the
  ten presence colours (the participant palette, every one holding white initials at AA, [Identity
  fill](../004-interface-design/color-scheme.md)). It is the participant record's colour, so it follows the
  account to every document and device; the open editor takes it at once. Shown at once, put back if refused:
  to what the server last took, newest wins, so two refusals in a row never leave a colour it never stored.
  Until the first document gives one, the colour is **Automatic**.
- **Email**: shown; changed as in [Account linking](#account-linking).
- **Profile picture**: [Profile picture](profile-picture.md).
- **Sign-in methods**: Google (**Connect Google**, or connected with **Remove**, offered only where email codes are, so
  the address stays a way in), Email code (the account's address, where the host sends codes).
- **Where You're Signed In**: [Sessions](#sessions).
- **Sign Out**: ends this browser's session, as the account menu's Sign Out does.
- **Delete Account**: below.

## Deleting an account

Settings > Account > Delete Account removes everything, in this order:

1. **Confirm identity.** Type the account's email, then a fresh verification when the session is older than 10
   minutes. Cancelled or failed, the dialog says nothing was deleted and stops there.
2. **Delete the server data** (`DELETE /api/account`): every owner-keyed row, with the team hand-over and the Drive
   grant revoked at Google ([Owner-keyed data](../015-api/api.md#owner-keyed-data)).
3. **Delete the identity**: the account, its sign-in methods and every session, in the same request, after the data.
   The browser is signed out.

The data goes before the identity so that no row outlives the only account able to reach it. Both now live in
LiveDoc's own D1, so one request does both; a failure between the two leaves an account with no data that can simply
be deleted again. The goodbye email goes to the address the account had.

## Teams, tokens, the CLI and the MCP server

- **Teams** stay LiveDoc's own ([Teams](../013-workspace/teams.md)), not better-auth's organisations. A pending email invite becomes a membership when its address equals the
  account's email **and** that email is verified; the address is read from the verified session token, never a
  header.
- **API tokens** are unchanged: `livedoc_` secrets, hashed, six months, per-account cap, owned by an account id, minted
  only from a session ([Public API and API tokens](../015-api/public-api-and-tokens.md)).
- **The MCP server** keeps its own OAuth 2.1 server and its `livedoc_` tokens ([MCP server](../015-api/mcp-server.md)
  §3); its consent page in `apps/live` trusts the LiveDoc session.
- **The CLI** keeps `livedoc auth login` on the MCP worker's OAuth server, which already offers loopback PKCE and the
  device grant (`--device`); better-auth's device plugin would add a second OAuth server for the same job. Its device page in `apps/live`
  likewise trusts the LiveDoc session ([CLI](../015-api/cli.md)).
- **Workbench embeds** are unchanged: minted from a token, never from a session.
- **The Google Drive mirror** stays its own Google grant, asked for when the mirror is turned on, separate from
  signing in with Google: the Drive account may differ from the sign-in account, and signing in never asks for Drive
  access ([Google Drive mirror](../022-drive-mirror/drive-mirror.md)).

## Privacy

- **What an account stores:** the name, the email and whether it is verified, the picture URL, the Google account's
  subject id (for a Google sign-in), and per session its expiry and the user agent. Not the IP address: rate limits
  read it from the request (`CF-Connecting-IP`) and count it in Cloudflare's rate limiter, which writes nothing to D1.
- **No provider tokens kept.** Signing in with Google keeps no Google access or refresh token: sign-in needs only who
  the person is. (The Drive mirror's grant is its own, stored encrypted as today.)
- **No tracking by the auth library.** better-auth's own telemetry is off unless switched on, and LiveDoc switches it
  off explicitly as well (`telemetry: { enabled: false }`). Sign-in and sign-up are counted by LiveDoc's own anonymous
  events (`Session·SignedUp`, `Session·SignedIn`, [Telemetry](../017-telemetry/telemetry.md)), from the server's own
  account and session creation, so every method counts once.
- **Deleting the account deletes all of it**, sessions and sign-in methods included ([Deleting an account](#deleting-an-account)).
- The [privacy policy](../../../apps/help/app/policies/privacy-policy/page.mdx) names LiveDoc itself as
  where account data is held, and the email provider as the processor that delivers codes.

## Self-hosting

| What the host sets                                 | What it gets               |
| -------------------------------------------------- | -------------------------- |
| Nothing                                            | Guest-only, as today       |
| `BETTER_AUTH_SECRET` + Google client id and secret | Sign-in with Google        |
| `BETTER_AUTH_SECRET` + an email sender             | Sign-in with an email code |
| All of it                                          | Both                       |

- No call to any SaaS is ever required: better-auth is a library inside the host's own worker, with the host's own
  D1. Google and the email provider are reached only when the host configured them.
- The secret is at least 32 random bytes (`openssl rand -base64 32`). It is rotated by adding a new version beside the
  old (`BETTER_AUTH_SECRETS`), never by replacing it, which would sign everyone out and lose the session-token keys.

## Previews

A preview (`<branch>.preview.docs.nu`, [Preview deployments](../016-platform/preview-deployments.md)) runs as a fork
would, with its own D1. It gets email codes, but sends no
email: a code goes to the preview's **outbox** (`EMAIL_OUTBOX`), which the sign-in page links to, so anyone can try
sign-in on a preview without a mailbox. That is safe only because a preview's D1 holds nothing but test data. Whatever it
gets, a preview never shares a session, a cookie or a key with docs.nu: its secret is its own, its cookies are
host-only, and docs.nu trusts no preview host as an origin.

- Sign-in works on a deployment's canonical host only (`APP_BASE_URL`). The preview's workers.dev address still
  serves guests, and its auth pages link to the canonical host.
- Google cannot sign in on a preview without help: Google takes no wildcard redirect addresses or JavaScript
  origins, so every `<branch>.preview.docs.nu` would need registering by hand.

## Guest documents start local

A guest's new document is **This Browser** by default ([Offline Mode](../006-document/offline-mode.md), [Save Locations](../006-document/save-locations.md#the-default-depends-on-who-is-creating)): saved in this browser, never sent to the server until the guest asks for it.

**Why.** A guest cloud document is keyed to the browser's guest id in `localStorage`. Clearing site data loses that id, and with it every document under it: the server keeps the rows for good, but nobody can reach them again. Many first visits are someone trying the product out, so most of those rows are orphans the moment they are written. A document in This Browser is exactly as durable for a guest (the same clear wipes IndexedDB), costs the server nothing, and opens without a round trip ([Offline Mode → Instant open](../006-document/offline-mode.md#instant-open)).

- **Only with sign-in enabled.** Local first applies in the hybrid mode, where a guest has an account to move to. A guest-only deployment ([Three deployment modes](#deployment-modes)) keeps LiveDoc as the default: there is no account to come to, so the server is the only place a document is kept beyond the browser, and the operator chose to run one.
- **Signed-in people are unchanged.** Their default stays LiveDoc.
- **Moving to the server is always the guest's own act**: Sync Document (from the Share dialog, which explains why first, [Offline Mode → Sharing a document in This Browser](../006-document/offline-mode.md#sharing-a-document-in-this-browser), or the Explorer), or the prompt after signing in (below). No guest document is uploaded silently.
- **Nothing is purged.** Guest cloud documents already on the server stay where they are; this changes where new ones start, not what happens to old ones.

### Who is a guest, before the session answers

The session is read with a request, so `/new` cannot wait for it without making every create slower. It reads a hint
instead (`apps/live/lib/signed-in-hint.ts`): a `localStorage` flag the auth bridge writes `1` whenever a session
settles signed in and `0` whenever it settles signed out or the person signs out.

- **No flag, or `0`**: a guest. The create goes ahead at once, This Browser.
- **`1`**: probably signed in. The create waits for the session (as it always has) and then uses the settled answer.
- **Whether the host offers sign-in at all** is the same kind of hint: the last answer this browser saw
  (`livedoc:v2:sign-in-offered`). A host without sign-in keeps everyone on LiveDoc at once; only a browser
  that has never asked waits for the session read before its first create.
- Starting a Google sign-in writes `1` before leaving for Google, so the page the round trip lands on never hands the
  new account a document in This Browser; a round trip that fails is the safe direction.
- The hint only decides a default. Every request still authenticates the real way; a stale `1` (a session that
  expired elsewhere) costs one wait, and a guest whose hint misleads gets a document in This Browser, the safe
  direction.

### Moving documents in This Browser after signing in

Signing in never moves a document in This Browser by itself ([Offline Mode → Auth / guest interaction](../006-document/offline-mode.md#auth--guest-interaction)). Instead, once auth has settled signed in (and the guest migrate above has settled), a page that shows the Explorer or the editor checks this browser's documents in This Browser. If there are any, it offers to move them:

- **Move Documents in This Browser to Your Account?** A dialog lists each document in This Browser (name, last edited), every one ticked, with **Move** and **Not Now**.
- **Move** runs Sync Document ([Offline Mode → Save to server](../006-document/offline-mode.md#save-to-server-offline--cloud)) on each ticked document in turn, showing progress. A document that fails stays This Browser and is named in the result; the rest move.
- **Not Now** is remembered for this account in this browser (`livedoc:v2:local-move-dismissed:<userId>`), with the count of documents in This Browser at the time. The dialog comes back only when that count grows, so a person who keeps a deliberate document in This Browser is not asked again about it.
- The same move is always reachable by hand: **Sync Document** on any document in This Browser.

## Implications for how we build

- UI must never block the canvas behind a sign-in wall.
- Features that genuinely need an account are surfaced as opt-in prompts ("Sign in to keep your documents"), never
  modal walls.
- The single persistence boundary (`apps/live/lib/api-client.ts` against the api worker, [API](../015-api/api.md)) is
  the same for guests and accounts. Only the request headers differ: the guest id and signature for a guest, a
  session token for an account. The api-client's `setTokenProvider` is the single switch.
- Nothing about sign-in is secret in a frontend: the browser holds no key, only its own session cookie and session
  tokens ([Secrets policy](../002-project-scope/secrets-policy.md)).
- The app and the api share an origin (the router stitches `/api/*` under the app's host), which is what lets the
  session cookie stay host-only and `SameSite=Lax`. A host that splits them across sites is not supported for
  sign-in; local development signs in through the router on port 4000.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D10** The account id's shape: `acct_` and 24 base62 characters: never a UUID (the guest shape) and never Clerk's
  `user_`, so one prefix test tells them apart (default).
- **D11** When better-auth's schema is checked: In CI (`identity-schema.test.ts`), not per request: the runtime check
  costs 15 ms a request and is what hangs a cached instance (default).
- **D12** How sign-in is rate limited: Two Cloudflare limiters in front of `/api/auth/*`, like every other limit in the
  api; better-auth's own limiter off (it would store IPs in D1) (default).
- **D13** When cookies are `Secure`: Always, except an `http://localhost` base URL for local development (default).
- **D14** Whether a session keeps the IP address: Never: blanked before the row is written; the user agent is kept to
  name the session in Settings (default).
- **D15** How long a session lasts: 30 days, sliding once a day: a guest-first product should not sign people out weekly
  (default).
- **D16** When the browser fetches a new session token: 60 s before the current one expires (default).
- **D17** How long the api caches the public keys: 5 minutes per isolate, re-read at once on an unknown key id
  (default).
- **D18** How often the session-token key rotates: Every 90 days, the old key verifying for 30 more (default).
- **D19** How soon "Send a new code" is allowed: 30 s after the last send (default).
- **D20** Which session counts as the sign-up's own: One created within 60 s of its account (default).
- **D21** How better-auth's version is held: Pinned exactly; upgrades are their own pull request, since minors remove
  APIs (default).
- **D22** Which database holds the identity tables: The api's existing `DB`, prefixed `identity_`: deletion and the
  invite claim stay in one database (default).
- **D24** How another tab learns of a sign-in: The `localStorage` hint plus a `BroadcastChannel` nudge; the tab re-reads
  the session, trusting neither (default).
- **D25** Whether a guest's page asks for a session: Always, once on load: a cleared hint must not hide a live session
  (default).
- **D26** What `/new` assumes before the session answers: The host's last answer here (`livedoc:v2:sign-in-offered`); a
  browser that never asked waits for the read (default).
- **D27** What the auth pages show before the methods are known: The email form, with Google's place held, so a late
  answer never moves the form (default).
- **D28** How an older session verifies again before deleting: A code to the account's email, which signs this browser
  in afresh; it works for Google-only accounts too (default).
- **D29** Which secret the guest key derives from: The oldest usable one, so a rotation of the sign-in secret never
  re-keys guests (default).
- **D30** What a browser does with an unsigned guest id on a host that signs: Takes a fresh signed id; the unsigned id's
  server rows stay unreachable (no upgrade path) (default).
