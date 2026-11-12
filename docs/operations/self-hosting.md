# Self-hosting

LiveDoc is designed to be self-hostable end-to-end. The whole stack runs on Cloudflare Workers, so a self-hoster needs a Cloudflare account and not much else.

This guide is the practical path: provision Cloudflare resources, configure secrets, deploy. For the why-behind-the-shape, read [Deployment](../specs/016-platform/deployment.md) (deployment) and [Secrets policy](../specs/002-project-scope/secrets-policy.md) (secrets).

## What you'll provision on Cloudflare

| Resource                             | Used by           | Why                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Workers paid plan**                | All seven workers | Durable Objects (per-document realtime room) need the paid plan.                                                                                                                                                                                                                                                                           |
| **D1 database**                      | `apps/api`        | The document listing (names, owners, folders, share links, the content summary), accounts, image metadata, user preferences, teams + membership + team library, custom themes, telemetry rows, and the indexes read across documents (Inbox, placed images, content search).                                                               |
| **Durable Object namespace**         | `apps/api`        | One room per document: realtime presence and ops, and the document's content (tabs, cards, sheets, agent changesets) in the room's own SQLite ([Document storage](../specs/006-document/document-storage.md)).                                                                                                                             |
| **R2 bucket** (optional)             | `apps/api`        | Image uploads ([Image element + per-owner gallery](../specs/009-elements/images.md)) + document SVG snapshots ([Document SVG snapshots](../specs/006-document/document-snapshots.md): Explorer thumbnails + the live image share). Without it, image endpoints `503` and snapshot endpoints `404` (the Explorer row shows a generic icon). |
| **Rate Limiter bindings** (optional) | `apps/api`        | Abuse throttles: per-owner writes, plus telemetry ingest, share-code lookups, link unfurls, AI calls and API-token reads. Any binding you don't provision falls through to "allow", so none are required.                                                                                                                                  |
| **Custom domain**                    | `apps/router`     | The router worker serves your hostname; downstream workers don't need their own domain.                                                                                                                                                                                                                                                    |

What you do NOT need:

- An identity provider: sign-in is optional and runs inside the api worker, against your own D1. Without it, every user is a guest (a per-browser id stored in `localStorage`, carried as `X-Owner-Id`). With it on, session tokens are verified in-process; Google and the email provider are reached only when you configure them.
- No _required_ SaaS: no Stripe (no paid tier) and no analytics vendor. The other integrations are all optional and stay off until you add a key: Resend for transactional email ([Transactional & lifecycle email (Resend)](../specs/014-identity/transactional-email.md)), a model key for the AI features ([AI Assistance](../specs/007-editor/ai-assistance.md)), and a Google OAuth client for the Google Drive mirror ([Google Drive mirror](../specs/022-drive-mirror/drive-mirror.md)), each covered in its own section below. The telemetry endpoint is first-party only and off by default.
- A separate database host: D1 and the rooms' own SQLite cover everything.

## One-time Cloudflare setup

1. **Create a Cloudflare account** and sign up for the Workers paid plan ($5/mo at the time of writing).
2. **Create a D1 database**:

   ```sh
   pnpm exec wrangler d1 create livedoc
   ```

   Copy the `database_id` from the output into `apps/api/wrangler.toml` under the `[[d1_databases]]` block (it already has the binding name `DB`; you only need to update the id).

3. **Apply migrations to the new D1**:

   ```sh
   pnpm --filter @livedoc/api db:migrate:remote
   ```

   (this runs `wrangler d1 migrations apply DB --remote`: it takes the binding name `DB`, so it follows whichever database `database_name` and `database_id` name).

   This creates every table the worker expects. The same command runs in the deploy workflow on every release, so you only need it once for the first deploy.

4. **Create an R2 bucket** (optional, for images):

   ```sh
   pnpm exec wrangler r2 bucket create docs-nu-images
   ```

   The bucket name is bound to `IMAGES` in `apps/api/wrangler.toml`.

5. **Get an API token + account id**:
   - Account id is at the bottom-right of any Cloudflare dashboard page.
   - API token: create one with **Workers Scripts: Edit**, **D1: Edit**, **R2: Edit** (only if using images), **Workers KV: Edit** (for Durable Objects), and **Account → Account Settings: Read** on your account. Save it.

## Required GitHub Actions secrets

If you're deploying via GitHub Actions (the default workflow), set two repo secrets:

- `CF_API_TOKEN`: the token from the step above.
- `CF_ACCOUNT_ID`: your Cloudflare account id.

Those two are the only **required** ones — the deploy workflow uses raw `pnpm exec wrangler deploy` against them. Optionally, it also syncs four worker secrets from repo secrets of the same name, each skipped when unset: `BETTER_AUTH_SECRET`, `GOOGLE_AUTH_CLIENT_SECRET`, `INTERNAL_EVENTS_KEY`, and `GOOGLE_AI_STUDIO_API_KEY` (the AI features' model key). Setting them here rather than by hand means they rotate by editing the GitHub secret — and, for `INTERNAL_EVENTS_KEY`, that the api and mcp workers can't drift apart. See [Secrets policy](../specs/002-project-scope/secrets-policy.md) for the full table.

## Optional sign-in

Sign-in runs inside the api worker (better-auth, with its tables in your own D1), so it needs no SaaS account and no
build-time key: the live app asks `GET /api/capabilities` whether sign-in is on and which methods it offers
([Auth + guest access](../specs/014-identity/auth-and-guest-access.md)). What you set decides what you get:

| What you set                                                                 | What you get               |
| ---------------------------------------------------------------------------- | -------------------------- |
| Nothing                                                                      | Guest-only                 |
| `BETTER_AUTH_SECRET` + `GOOGLE_AUTH_CLIENT_ID` + `GOOGLE_AUTH_CLIENT_SECRET` | Sign-in with Google        |
| `BETTER_AUTH_SECRET` + an email sender (`EMAIL` binding or `RESEND_API_KEY`) | Sign-in with an email code |
| All of it                                                                    | Both                       |

Every combination also needs `APP_BASE_URL` (api `[vars]`): the public origin the browser uses, which is sign-in's
base URL and the session token's issuer. With the secret set but no method, or no `APP_BASE_URL`, sign-in stays off
and the worker logs why once (`[auth] secret_without_methods`, `[auth] base_url_missing`).

1. **The secret** (worker secret, at least 32 random bytes):

   ```sh
   openssl rand -base64 32 | pnpm --filter @livedoc/api exec wrangler secret put BETTER_AUTH_SECRET
   ```

   Rotate it by adding a new version beside the old, never by replacing it (replacing signs everyone out and loses
   the session-token keys): `BETTER_AUTH_SECRETS="2:<new>,1:<old>"`, and leave `BETTER_AUTH_SECRET` in place.

2. **Email codes.** Bind Cloudflare Email Service as `EMAIL`, or set `RESEND_API_KEY`; set `EMAIL_FROM` to an
   address on your sending domain ([Email](#email-optional-cloudflare-email-service-or-resend)). Without a sender, email codes are off and only Google
   shows.

3. **Google.** Create an OAuth client in your Google Cloud project with the redirect URI
   `https://<your-host>/api/auth/callback/google` and the JavaScript origin `https://<your-host>`. Set
   `GOOGLE_AUTH_CLIENT_ID` as an api `[vars]` entry and the secret as a worker secret:

   ```sh
   pnpm --filter @livedoc/api exec wrangler secret put GOOGLE_AUTH_CLIENT_SECRET
   ```

   One half without the other leaves Google off (`[auth] google_half_configured`).

4. **Guest ids are signed with it.** The same secret derives the key that signs guest ids, so with sign-in on every
   guest request to an owner-scoped route must carry its `X-Owner-Sig`, and `POST /api/migrate` moves only a signed
   guest's data into an account ([Public API and API tokens](../specs/015-api/public-api-and-tokens.md) §4). There is
   no separate secret and no switch. A guest id minted before you set the secret is unsigned: it is refused on
   owner-scoped routes, and that browser starts afresh as a new guest (its old rows stay in D1, never deleted).

5. **Teams, API tokens, the MCP server and workbenches come with sign-in.** They're signed-in-only features, so a
   self-host with sign-in on gets them, and a guest-only self-host has no accounts and therefore none of them
   (nothing to configure). Team invites match the session token's verified email; there is nothing to customise.

6. **Previews and local testing.** `EMAIL_OUTBOX=1` keeps codes in D1 instead of sending them, readable at
   `GET /api/preview/outbox?to=<address>`. Never set it on a real deployment.

Without `BETTER_AUTH_SECRET`, the api worker answers `/api/auth/*` with `404` and treats every request as a guest
(owner from `X-Owner-Id`), and the live app shows no sign-in anywhere. Self-hosting without sign-in is a
fully-supported path; the canvas works identically.

See [Auth + guest access](../specs/014-identity/auth-and-guest-access.md) for the hybrid auth model.

## Deploy

After the one-time Cloudflare setup:

```sh
git clone https://github.com/webbertakken/livedoc livedoc
cd livedoc
pnpm install
pnpm build           # static export for marketing + live + telemetry + help,
                     # plus the generated /licences page (no network needed)
# Then deploy each worker (run from the repo root):
pnpm --filter @livedoc/marketing exec wrangler deploy
pnpm --filter @livedoc/live exec wrangler deploy
pnpm --filter @livedoc/telemetry exec wrangler deploy
pnpm --filter @livedoc/help exec wrangler deploy
pnpm --filter @livedoc/api exec wrangler deploy
pnpm --filter @livedoc/router exec wrangler deploy   # last, depends on the five above
```

Deploying by hand, give the editor build and the api the same build id so an open tab knows when a newer build is live ([Stale builds](../specs/016-platform/stale-builds.md)): `NEXT_PUBLIC_BUILD_ID=$(git rev-parse HEAD) pnpm build`, then `--var "BUILD_ID:$(git rev-parse HEAD)"` on the api's `wrangler deploy`. The workflow does this for you; leaving both unset only turns that detection off.

Deploy order matters: the router's service bindings reference five other workers, so it can't deploy until they exist; `live` and the optional `mcp` worker deploy after `api` (each binds to it; `live` only for link previews and works without it). The GitHub Actions deploy workflow encodes this as job dependencies.

Or just push to `main` and use the bundled GitHub Actions workflows:

- `.github/workflows/ci.yml` runs lint / format / typecheck / test / build on every PR and every push to `main`.
- `.github/workflows/codeql.yml` runs CodeQL security scanning in one job; a fork needs CodeQL default setup off.
- `.github/workflows/canvas-perf.yml` runs the canvas performance probe nightly and reports through one issue; optional, disable it in a fork that does not want it.
- `.github/workflows/deploy-reusable.yml` holds the deploy itself — build, then all seven workers (marketing, live, telemetry, help, api, mcp, router) in the right order. The `deploy-mcp` job runs when the caller sets `deploy_mcp` (docs.nu's production does), so a fork that turns it on provisions its KV namespace first. It is a reusable workflow, not directly triggerable.
- `.github/workflows/deploy.yml` calls it for **production**. In `webbertakken/livedoc` every merge to `main` deploys once its CI passes; in a fork the automatic trigger stands down, so dispatch it from the Actions tab, or widen its repository guard once your secrets are set.
- `.github/workflows/preview.yml` deploys a preview of every pull request and deletes it when the pull request closes.
- `.github/workflows/main-red.yml` turns any red run on `main` into an issue per workflow (`main-red`), closed by the next green run; it needs only the default token ([Deployment](../specs/016-platform/deployment.md#a-red-main)).

Self-hosting needs only the production pair. `preview.yml` uses the same two secrets; a fork that does not want a preview per pull request deletes it ([Preview deployments](../specs/016-platform/preview-deployments.md))

See [Deployment](../specs/016-platform/deployment.md) for the deeper deploy mechanics, including how D1 migrations run BEFORE the worker deploy so the new code never briefly runs against the old schema.

Serve the editor over HTTPS (Cloudflare does by default, on `workers.dev` and on a custom domain). It also works over plain http, on a LAN address for instance: ids and hashes fall back to plain code there, and only the clipboard buttons need HTTPS ([Secure context](../specs/016-platform/secure-context.md)).

## Upgrading to rooms (content moves out of D1)

Older releases kept every document's content in D1; current ones keep it in the document's room ([Document storage](../specs/006-document/document-storage.md)). The change ships as releases you take **in order**, never skipping one ([Moving content into rooms](../specs/006-document/document-storage-move.md)):

1. **The class change**: the room becomes a SQLite-backed Durable Object, keeping its state. It applies Durable Object migrations, so it cannot be rolled back.
2. **The move**: D1 migrations `0105` to `0111` run with the deploy, then the api moves every document's content into its room: an every-minute sweep (the `* * * * *` cron in `apps/api/wrangler.toml`; keep it) moves 25 at a time, and a document opened before its turn moves on that request. Moving reads D1 and never changes its content tables. Wait until every document has moved: from `apps/api`, `node --import ../../scripts/ts-source-hooks.mjs scripts/content-move.ts verify --remote --plan plan.json` passes, given a plan taken before the deploy with `... scripts/content-move.ts plan --remote --out plan.json` (both only read, through wrangler).
3. **The drop**: D1's content tables, the move records and the legacy room class go. Its migration refuses to run while any document has not moved, so taking it early fails the deploy and changes nothing.

## MCP server (optional, needs sign-in)

The `apps/mcp` worker ([MCP server](../specs/015-api/mcp-server.md)) lets people connect an AI tool (Claude, any MCP
client) to drive their documents. It's **optional** — don't deploy it and nothing
else references it — and **needs sign-in**, exactly like API tokens and teams: the
OAuth consent page authenticates the user through sign-in and the api's
`/api/oauth/exchange` requires a verified session, so a guest-only self-host can mint
nothing. To run it:

1. **Create a KV namespace** for OAuth state and put the id in `apps/mcp/wrangler.toml`:

   ```sh
   pnpm --filter @livedoc/mcp exec wrangler kv namespace create OAUTH_KV
   ```

2. **Point it at your hosts.** Attach your MCP hostname to the worker in the
   Cloudflare dashboard (Workers → `docs-nu-mcp` → Domains & Routes → add a
   custom domain) — the same way every other worker here gets its hostname, since
   the deploy token only uploads scripts, not zone routes. Then set
   `CONSENT_BASE_URL` (in `apps/mcp/wrangler.toml`) to your live app's origin and
   `NEXT_PUBLIC_MCP_ORIGIN` (live and marketing build env) to the MCP origin, so the
   consent page posts the minted token only to your trusted host and the Build
   with AI page (`/about/ai`) gives AI tools your address, not the hosted one.
   Set the api worker's `OAUTH_ISSUER` to the MCP origin too, so `/api/capabilities` names it and
   `livedoc auth login` signs in through it; unset, the CLI signs in with a token only.

3. **Deploy after the api worker** (it reaches api over a service binding). The
   deploy workflow already orders `mcp` after `api`. Tokens minted via the MCP
   are ordinary `livedoc_` API tokens — they appear in the API Tokens category of
   Settings and are revocable there.

4. **Only if you've turned telemetry on:** set the same `INTERNAL_EVENTS_KEY` on
   both workers — see [Telemetry](#telemetry-off-by-default-for-self-hosters)
   below. Skip it otherwise; it affects nothing else.

The MCP carries no model of its own and makes no LLM calls; the connected AI
tool does the thinking. See [MCP server](../specs/015-api/mcp-server.md).

## Telemetry: off by default for self-hosters

The api worker's telemetry ingest (`/api/events`) is off unless you set `TELEMETRY_ENABLED = "true"` under `[vars]` in `apps/api/wrangler.toml`. OSS forks ingest nothing by default: the committed config leaves it unset, and the deploy workflow only adds it (with the rest of the hosted profile in `apps/api/hosted-vars.json`) when it runs in docs.nu's own repository ([Deployment](../specs/016-platform/deployment.md) "Hosted profile"). If you DO turn it on, the public `/telemetry` dashboard renders aggregate counts from your own D1; there's no third-party analytics involved. See [Telemetry + public transparency dashboard](../specs/017-telemetry/telemetry.md).

Turning telemetry on end-to-end takes BOTH the server gate above AND a build-time gate on the frontends. The api flag is the authoritative gate (ingest + summary refuse to serve without it), but every emitting frontend (the editor, the help centre, and the page-view counters on marketing and the dashboard, [Page view telemetry](../specs/017-telemetry/page-view-telemetry.md)) also reads `NEXT_PUBLIC_TELEMETRY_ENABLED` at build time and skips emission entirely when it isn't `"true"`. So a fork that only flips the api flag will see "ingest on" but no events flow. To turn it fully on, set `NEXT_PUBLIC_TELEMETRY_ENABLED=true` in your CI build env (or each frontend's `.env.production`) alongside the api flag. The `/telemetry` dashboard's data has no client-side gate of its own: it just reads `/api/telemetry/summary`, and the api worker returns an empty `enabled: false` payload until you flip `TELEMETRY_ENABLED` (the build flag only governs its own page-view count). Per-user opt-out via the Settings dialog ([User preferences](../specs/007-editor/user-preferences.md)) still overrides every app's emission when off, since they share one origin and one preferences key.

If you also deploy the MCP worker, set the **same** `INTERNAL_EVENTS_KEY` secret on both `apps/api` and `apps/mcp` (`wrangler secret put INTERNAL_EVENTS_KEY` in each). The MCP worker reaches the api over a service binding, which carries no `CF-Connecting-IP`, so without a matching key its telemetry lands in the anonymous per-IP rate-limit bucket and throttles itself. Leaving it unset is safe and needs no configuration — you just get the shared-bucket behaviour.

## AI assistance: off by default, needs a model key

The in-editor AI panel ([AI Assistance](../specs/007-editor/ai-assistance.md)) is hidden entirely unless the api worker has a model key. Forks that don't want it provision nothing and get zero AI surface: `GET /api/capabilities` reports `{ aiEnabled: false }`, `POST /api/ai` returns 503, and the editor never renders the toggle or panel.

To turn it on, set the key as a worker secret:

```bash
# One key serves every AI feature:
pnpm --filter @livedoc/api exec wrangler secret put GOOGLE_AI_STUDIO_API_KEY
# or OPENAI_API_KEY, or AI_API_KEY (with AI_BASE_URL + AI_MODEL as [vars]).
# Set both named keys to split them: the assistant on OpenAI, the reader on Google.
```

Optional knobs (all plain `[vars]` in `apps/api/wrangler.toml`, the dashboard, or `.dev.vars`):

The provider is inferred from WHICH key you set ([AI Assistance](../specs/007-editor/ai-assistance.md)): a Google AI Studio
key means Google, an OpenAI key means OpenAI, and `AI_API_KEY` means "anything
else that speaks the OpenAI wire" — which needs `AI_BASE_URL` too (a local
llama.cpp is `http://127.0.0.1:8080/v1`). Each AI feature picks its own
provider from the keys you set: the assistant prefers OpenAI, the sticky-note
reader prefers Google, each falling back to whichever key exists, and
`AI_API_KEY` is used only when neither named key is set.

- `AI_MODEL`: the assistant's model, overriding its preset default
  (`gemini-3.6-flash` for Google, `gpt-4o` for OpenAI). The reader uses it
  too when both features run on the same provider. Required when using
  `AI_API_KEY`.
- `AI_VISION_MODEL`: model id for reading sticky-note crops
  (`POST /api/ai/read-notes`, [Event storming](../specs/021-event-storming/event-storming.md)). On Google this defaults to
  `gemini-3.5-flash-lite` rather than the assistant's model — it reads
  handwriting better AND costs less (docs/research/vision/handwriting-readers.md). On a
  single provider, setting `AI_MODEL` moves the reader too unless you set this.
- `AI_ALLOWED_ORIGINS`: comma-separated `Origin` allow-list for `POST /api/ai` (e.g. `https://your-host,http://localhost:4002`). Unset = no origin check. Matched verbatim, case-sensitive. `apps/api/wrangler.toml` commits docs.nu's origins here, so a fork sets its own or deletes the line, or every AI request answers 403.
- `AI_REQUIRE_ACCOUNT`: set to `"true"` to reject the guest (`X-Owner-Id`) path on `/api/ai` only, requiring a signed-in session. Unset = guests can use AI (so a fork without sign-in still works).

The last two are the spend-DoS defence: on a public deployment they stop a third-party site from minting fresh owner ids to drain your model budget. The hosted docs.nu sets `AI_ALLOWED_ORIGINS` and deliberately leaves `AI_REQUIRE_ACCOUNT` unset so guests keep AI; a private fork or one without sign-in can leave both unset. Two further defences live alongside them: the `AI_RATE_LIMITER` binding (declared in `apps/api/wrangler.toml` as a Cloudflare rate-limit binding, 20 requests / 60 s per IP) caps how fast one client can drive the endpoint; absent binding falls through to "allow" so a self-host without the paid Cloudflare feature still works. AI is also per-user opt-in via the Settings dialog even once the key is present.

## Email (optional: Cloudflare Email Service or Resend)

The api worker can send a small set of account emails ([Transactional & lifecycle email](../specs/014-identity/transactional-email.md)): sign-in codes; a welcome on sign-up; week-1 (Explorer) and week-2 (Teams) onboarding tips, an activation nudge and a win-back note off the daily cron; a warning before an API token expires; notifications (someone opened, commented on or mentioned you in a document, assigned you an action, or answered your team invite) plus first-share and document-count milestone notes; and transactional team-invite (with a Decline link that needs no account), team-invite reminder (1, 7 and 21 days after an unanswered invite) and account-deleted messages. The whole feature is **off until a transport is configured**: no sends, and the `email_lifecycle` table is never touched. Guests never receive email.

The worker picks the first transport it has (`apps/api/src/email/transport.ts`):

1. **Cloudflare Email Service**, through the `[[send_email]]` binding `EMAIL` that `apps/api/wrangler.toml` declares. Onboard your sending domain under **Compute > Email Service > Email Sending** in the Cloudflare dashboard first. Sending to any address needs the Workers Paid plan, and Cloudflare takes transactional mail only.
2. **Resend**, when the binding is absent: remove the `[[send_email]]` block, verify a domain in Resend, then `pnpm --filter @livedoc/api exec wrangler secret put RESEND_API_KEY`.

Optional knobs (plain `[vars]`):

- `EMAIL_FROM`: the From identity, `LiveDoc <hello@docs.nu>` by default. Must be on your sending domain.
- `APP_BASE_URL`: public origin for links in emails (and sign-in's base URL), `https://docs.nu` by default.

The welcome and the onboarding series start when an account is created (`apps/api/src/auth/identity-hooks.ts`), so turning email on later welcomes nobody retroactively: accounts made while email was off get no lifecycle mail.

## Team invite reminders and expiry

Teams need sign-in. With it on, the daily cron expires team invites nobody answered within 28 days (whether or not
email is configured) and, with `RESEND_API_KEY` set, sends the three reminders first
([Teams](../specs/013-workspace/teams.md#reminders-and-expiry)). Migration `0095_team_invite_decline_and_reminders.sql`
adds the columns; nothing else to configure.

- `TEAM_INVITE_RATE_LIMITER` (optional binding, declared in `apps/api/wrangler.toml`): 20 requests a minute per
  network on the invite email's open Decline doors (`/api/teams/invite-decline/...`). Without the binding every
  request is allowed; the token is 256 random bits either way.

## Forms

Form tabs ([Forms](../specs/030-forms/forms.md)) need nothing extra: migration `0092_forms.sql` creates their tables
with the others, and a form link is served by the live worker (`/form/<code>`) and the api (`/api/forms/...`).

- `FORM_RATE_LIMITER` (optional binding, declared in `apps/api/wrangler.toml`): 60 reads and 60 responses a minute
  per network. Without the binding every request is allowed; the per-form cap of 500 responses an hour still holds.
- The new-response and suspension emails go only where email is configured (`RESEND_API_KEY`).

## Workbenches (optional, needs sign-in)

A workbench is a developer tool that frames the editor signed in, beside an agent ([Workbench embeds](../specs/013-workspace/workbench-embeds.md)). It needs API tokens, so it exists only where sign-in is on; without sign-in the routes answer as for any caller without a token and nothing breaks.

- `APP_BASE_URL` (api `[vars]`): set it to your deployment's public origin. Besides the links in emails, it builds the workbench frame URLs (`/embed/workbench`, and `/embed/workbench/explorer` for the whole workspace) and the pairing URL (`/workbench/pair`) the CLI prints. Use the origin that serves the app without redirecting (for example `https://www.example.com` when the apex redirects to `www`): a workbench checks the frame's messages against the origin of that URL, and a redirect changes it. Left at its default, those links point at docs.nu.
- `WORKBENCH_TICKET_RATE_LIMITER` (optional binding, declared in `apps/api/wrangler.toml`): caps ticket mints and pairing requests per token. Without the binding every request is allowed.
- Migration `0077_workbench.sql` creates the four workbench tables; it runs with the others.

## Sheets

Plan-mode Sheets ([Sheet store](../specs/029-sheets/sheet-store.md)) need no setup: a sheet's cells live in its document's room, and each room's own upkeep removes sheets that no Sheet element has shown for 30 days.

## Google Drive mirror (optional, needs sign-in)

Signed-in users can mirror My Documents to their own Google Drive ([Google Drive mirror](../specs/022-drive-mirror/drive-mirror.md)). It is **off until you set a Google OAuth client id**; with none, Settings has no Cloud Sync section and every `/api/drive` route answers `503 drive_not_configured`. The Drive traffic goes from each user's browser straight to Google; your worker only brokers tokens and stores a few small rows in D1.

1. In Google Cloud, create a project, enable the **Google Drive API**, and create an OAuth client of type **Web application**. Add `https://<your-host>/drive/connected` as an authorised redirect URI and `https://<your-host>` as a JavaScript origin. The consent screen needs only the non-sensitive scopes `drive.file` and `drive.install`, so no verification or security assessment is required.
2. For **Open with**, configure the Drive API's **Drive UI integration**: Open URL `https://<your-host>/drive/open`, default MIME type `application/vnd.livedoc+json`, default extension `livedoc`.
3. Set the client id on the api worker as a `[vars]` entry `GOOGLE_CLIENT_ID`, and build the live app with the same value as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
4. For syncing without a click every hour, also set two worker secrets (without them the browser holds hour-long tokens and asks the user to **Resume sync**):

```sh
pnpm --filter @livedoc/api exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm --filter @livedoc/api exec wrangler secret put DRIVE_TOKEN_KEY   # openssl rand -base64 32
```

5. Optional: `NEXT_PUBLIC_GOOGLE_API_KEY`, a browser API key (restricted by HTTP referrer) for the Google Picker, which lets users show LiveDoc a folder they made in Drive. Without it the mirror works and that one step is not offered.

**More than one environment** (a staging beside production): give each its **own Google Cloud project**. A project has one Drive UI integration Open URL, so a shared project could only ever open files on one host; `drive.file` access is per project, so files stay apart; and consent screens and test users stay apart. Each environment then has its own client id (worker var and live build, the same value within an environment), client secret, `DRIVE_TOKEN_KEY` and Picker key. docs.nu does exactly this: its client ids sit per environment in `apps/api/hosted-vars.json` (`environments.production` / `environments.staging`, empty until set, which keeps the mirror off there), its Picker keys are the `NEXT_PUBLIC_GOOGLE_API_KEY` and `NEXT_PUBLIC_GOOGLE_API_KEY_STAGING` GitHub secrets, and every deploy checks that the worker and the live build carry the same client id.

If your site redirects one host to another (docs.nu sends `www` to the apex), register both as JavaScript origins with `/drive/connected` redirect URIs: the consent flow uses whichever host the app actually runs on.

The mirror's root folder in each user's Drive is named **`LiveDoc (self-hosted)`** on your deployment (docs.nu's own is `LiveDoc`, local development's `LiveDoc (development)`), so a user of both never gets two folders of the same name. There is no setting: the name comes from the host, is given only when the folder is created, and users may rename or move it freely.

`DRIVE_TOKEN_KEY` seals the stored refresh tokens; changing it turns every connection into **Needs reconnecting**. Files a different deployment's Google project created are foreign to yours and import as copies. Your privacy policy must describe the Google user data you handle; docs.nu's is in the help centre under Policies.

## Per-owner image gallery caps

The api worker honours two optional `[vars]` that cap how much one owner can keep in the image gallery ([Image element + per-owner gallery](../specs/009-elements/images.md)), surfaced as a 403 `{ error: "gallery_full", reason, limit, current }` on `POST /api/images`:

- `IMAGE_MAX_PER_OWNER`: maximum image rows per owner (decimal string).
- `IMAGE_MAX_BYTES_PER_OWNER`: maximum summed `byte_size` per owner (decimal byte count).

Both default to "no limit" when unset, blank, `0`, or non-numeric, which is the OSS self-host default where the operator runs their own R2 budget. To cap, declare them under `[vars]` in `apps/api/wrangler.toml`, not in the Cloudflare dashboard: every `wrangler deploy` replaces the worker's plain vars with the ones it declares, so a dashboard-only cap is silently gone after the next deploy. The hosted docs.nu sets them to `100` and `104857600` (100 MB) through its hosted profile, which a fork's deploy does not apply. The worker also honours an early `X-Image-Sha256` dedupe check sent by the live editor: if the header matches an existing row at `(owner, sha256)` the upload short-circuits before the body parse, the cap check, or the R2 write, so re-uploading bytes the user already has costs almost nothing.

## Custom domain

Add a custom-domain route to the router worker (`apps/router/wrangler.toml`) and point your DNS at Cloudflare. The router stitches all paths under one hostname:

- `/` → live editor, which lands it on Explorer Home
- `/about`, `/about/*` → marketing (its old root addresses, `/faq` and the rest, redirect there)
- `/document/*`, `/explorer/*`, `/new`, `/join`, `/sign-in`, `/get-started`, `/embed` → live editor (clean routes; `/live/*` carries only its `_next` assets)
- `/telemetry` → telemetry dashboard
- `/help` → help centre
- `/api/*` → api worker

The five downstream workers don't need their own domain; the router fans out via service bindings.

## What can break, and how to debug

- **`account not authorized` from wrangler**: the API token is missing a scope. See the token list above; most often it's missing **Account → Account Settings: Read**, which wrangler uses to look up your account.
- **A document answers 503 `content_moving`**: its content has not moved into its room yet and the last try failed. `wrangler tail` shows `[content-move] failed id=<id> stage=<read|write|record|gate|sweep> error=<name>` or `[content-move] mismatch`; its `content_moves` row in D1 holds the attempt count. The sweep tries it again an hour later and every request tries at once; nothing in D1 changes meanwhile.
- **`Durable Object class is not exported`**: the api worker's `wrangler.toml` references `DocumentRoom` as the DO class. It IS exported from `apps/api/src/index.ts`; if you've forked + renamed, keep the export name in step with the binding.
- **Editor loads but every request 403s**: the resolved owner doesn't match the document's stored owner. If you turned sign-in on after running guest-only, the old guest documents still belong to the old guest id, and that id is unsigned, so owner-scoped routes refuse it (`401 signature_required`). `/api/migrate` moves rows from a signed guest id to an account after sign-in, never from an unsigned one; see [Auth + guest access](../specs/014-identity/auth-and-guest-access.md).
