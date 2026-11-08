# Deployment

All deployments run **via GitHub Actions** to **Cloudflare Workers**. **Every merge to `main` deploys production**: when CI passes on the merge commit, that commit ships to docs.nu, with no one pressing a button. A red CI run ships nothing.

Every pull request also gets a preview, which does deploy on its own: a complete copy with its own workers, D1 and R2 on workers.dev, deleted when the pull request closes. This spec covers production; [Preview deployments](preview-deployments.md) covers previews.

## Apps and their Cloudflare Workers

| App              | Cloudflare Worker   | Type                                                                                                               |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/marketing` | `docs-nu-marketing` | Static assets only (Next.js `output: 'export'`).                                                                   |
| `apps/live`      | `docs-nu-live`      | Static assets + a tiny path-rewrite worker.                                                                        |
| `apps/telemetry` | `docs-nu-telemetry` | Static assets only (public dashboard, [Telemetry + public transparency dashboard](../017-telemetry/telemetry.md)). |
| `apps/help`      | `docs-nu-help`      | Static assets only (help centre, [Help app](../018-help/help-app.md)).                                             |
| `apps/api`       | `docs-nu-api`       | Worker (D1 binding + Durable Object).                                                                              |
| `apps/mcp`       | `docs-nu-mcp`       | Worker (OAuth + MCP tools; own host, [MCP server](../015-api/mcp-server.md)).                                      |
| `apps/router`    | `docs-nu-router`    | Worker (service bindings to the other five).                                                                       |

The marketing worker serves files from `apps/marketing/out/` (`output: 'export'`). The live worker serves files from `apps/live/out/` plus a small worker (`apps/live/src/worker.ts`) that rewrites every `/document/<id>` request to the single statically-built `/document/placeholder/` page — see [New document route](../007-editor/new-document-route.md). The telemetry worker is static-assets-only like marketing, served under `/telemetry` ([22-telemetry](../017-telemetry/telemetry.md)). The help worker is static-assets-only too, served under `/help` ([55-help-app](../018-help/help-app.md)). The api worker holds the REST + WebSocket layer (see [11-api.md](../015-api/api.md)). The mcp worker exposes the AI tools over its own host `mcp.docs.nu` (it binds to the api worker, not the router; see [62-mcp-server.md](../015-api/mcp-server.md)). The router holds **no application logic** — only `MARKETING`, `LIVE`, `TELEMETRY`, `HELP` and `API` service bindings that forward requests to the right downstream worker.

`wrangler.toml` for each app sits at the app root and is the source of truth for the worker's name, compatibility date, `[assets]`, `[[services]]`, `[[d1_databases]]`, and Durable Object bindings. Account-level identifiers (account id, custom domain, secrets) **never** go in `wrangler.toml` — they live in environment variables or the Cloudflare dashboard. See [06-secrets-policy.md](../002-project-scope/secrets-policy.md).

## Toolchain

- **Node:** `>=22` (Wrangler 4 requires it). The workflows run Node 26.
- **pnpm:** the root `package.json` `packageManager` pins it; `pnpm/action-setup` reads it from there, never its own `version`.
- **Wrangler:** `^4.40.0` across all workspaces.
- **Asset size:** Workers Static Assets refuses any file over 25 MiB, and only at deploy. The editor's `build` ends with `scripts/asset-size-gate.mjs`, which fails the build on any file in `out/` over the limit, so CI catches it first. `@huggingface/transformers` stays on 3.x for this reason: 4.3.0 ships a 25.6 MiB onnxruntime wasm, and Dependabot ignores its majors.

## CI

`.github/workflows/ci.yml` runs on **every PR** and **every push to `main`**.

Three jobs run in parallel, each after its own `pnpm install --frozen-lockfile`, so a PR waits for the slowest rather than their sum:

- **Checks**: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`.
- **Tests**: `pnpm turbo run test --concurrency=2` for every workspace without `test:coverage`, then `pnpm turbo run test:coverage --concurrency=2 --filter=!@livedoc/live` for those with it (enforcing the per-file coverage thresholds), and uploads their coverage to Codecov.
- **Editor unit tests i/3**: the editor's suite (`apps/live`) under coverage, a third of its files per job (`vitest run --shard=i/3`), each uploading its coverage to Codecov ([Coverage report](../003-system-architecture/testing.md#coverage-report)). Each suite runs exactly once; `scripts/ci-test-filters.mjs` derives the exclusions from the manifests, so adding or removing a coverage script needs no CI edit.
- **Build**: `pnpm build`, then `pnpm deploy:check`.

No job needs another's output: only the nine apps have a `build` script, and no workspace depends on an app, so checks and tests build nothing. The `main` ruleset requires all three checks by name.

The two test steps run two packages at a time. Each package's Vitest already fills the runner's cores, and turbo's default fan-out on the 4-vCPU runner slowed the CPU-heavy `sticky-vision` suite about 70x, into timeouts. `pnpm test` cannot carry the flag: it is pnpm's built-in test command, so CI calls turbo directly.

CI is production's gate: a push to `main` whose CI passes triggers the production deploy (see below), and one whose CI fails deploys nothing.

`pnpm deploy:check` runs `wrangler deploy --dry-run` for the three workers that carry bindings (api, mcp, router), so a broken binding, database or service name fails in CI rather than in a deploy.

`.github/workflows/codeql.yml` runs CodeQL (advanced setup) on every PR, every push to `main`, and weekly. A single `Analyze` job scans both `actions` and `javascript-typescript`, so it shows as one check. The repository's CodeQL default setup stays disabled: GitHub rejects advanced-setup uploads while it is on. GitHub Code Quality remains a separate, GitHub-managed check.

`.github/workflows/canvas-perf.yml` runs the canvas performance probe nightly against `main` ([Canvas performance](../008-canvas/canvas-performance.md)), skipping a night `main` has not moved. It never blocks anything: the budget table goes to the job summary, traces and screenshots to a 14-day artefact, and a miss opens or comments on one issue, **Canvas performance budget**, which the first all-pass run closes. It needs no secrets, only `issues: write`.

`.github/workflows/mcp-registry.yml` publishes the root `server.json` to the official MCP Registry when that file changes on `main`, or on manual dispatch. It authenticates with GitHub OIDC, so it needs no secret. See [MCP server §4.16](../015-api/mcp-server.md#416-registry-listing).

**Testing** runs via [Vitest](https://vitest.dev). Workspaces opt in by adding `"test": "vitest run"` to their `package.json` scripts and `vitest` to their `devDependencies`; turbo then picks the task up automatically. Tests live next to the source they cover as `*.test.ts` files. Most workspaces are opted in (`pnpm turbo run test --dry` lists them); a workspace mirrors the pattern when it adds its first test.

### Runs on main are never cancelled

`ci.yml`, `e2e.yml` and `codeql.yml` cancel a run only on a pull request, where a newer push makes the older run moot. On `main` every commit runs to the end, each in a concurrency group of its own (keyed by the commit), because a shared group keeps only one pending run and a burst of merges would still drop the middle ones. Cancelling there left most merges without a result (37 of 42 CI runs on `main` cancelled in the 11 hours to 2026-10-15), so a failure could not be pinned on its commit, and a pull request whose base had no finished run had no Codecov base to compare against, failing its [Coverage report](../003-system-architecture/testing.md#coverage-report) with a 404.

The cost is runner time: a merge on `main` is about a dozen jobs (CI's six, E2E's shards, CodeQL), so a burst of merges queues for runners alongside open pull requests' runs.

### A red main

Any failure on `main` is an issue, never only a red mark in the Actions tab. `.github/workflows/main-red.yml` follows
every run on `main` of CI, E2E Smoke, CodeQL, Deploy Production, CLI publish, Publish MCP server to registry and
Lucide re-vendor (`workflow_run`), whatever started it: a push, a schedule, a dispatch or the deploy's own trigger.
Canvas Performance is left out; it reports through its own issue.

- **One issue per workflow**, titled `<workflow> on main is red` and labelled `main-red` (made on first use).
- **A failure, a timeout or a startup failure** opens that issue, or comments on the one already open, naming the
  commit, its title, the failed jobs (each linked) and the run.
- **A green run closes it**, with a comment naming the commit and run, but only when the green commit is still the tip
  of `main`: an older commit's run finishing late never closes an issue a newer failure opened.
- **A cancelled or skipped run** reports nothing.
- Runs report one at a time per workflow, in the order they finish, so two reports never race on one issue. Each
  report logs one `main-red:` line saying what it did.
- A pull request's runs never report: its checks already show its author what is red.

## Deploy

The deploy is split in two: `.github/workflows/deploy-reusable.yml` holds every job below as a **reusable workflow** (`workflow_call`), and `deploy.yml` triggers it for production. Its inputs (`wrangler_env`, the MCP origin, `deploy_mcp`) and the secrets the caller passes are all that would differ for another environment. Previews deploy through `preview.yml` and `scripts/preview.mjs` instead, from configs generated off the same production files ([Preview deployments](preview-deployments.md)).

`.github/workflows/deploy.yml` runs on **every completed CI run** (`workflow_run`) and deploys when that run **passed on a push to `main`** in `webbertakken/livedoc`. It checks out and builds **exactly the commit CI passed** (`workflow_run.head_sha`, through the reusable workflow's `ref`), never whatever `main` has moved to since.

- **The newest green commit deploys, and production never goes back.** CI on `main` runs once per commit and never cancels an older run, so with several sessions merging, a commit's CI often finishes after the next merge. Waiting for the tip starved production for hours, so the `Latest on main` job (`scripts/deploy-gate.mjs`) compares the passed commit with the one production runs, read from the api's `X-Livedoc-Build` header: a commit **newer** than production deploys, even if `main` has moved on since; the **same or an older** one stands down (`deploy: <sha> stands down: production runs <build>, the same or newer`), so a late run never rolls production back. When production's build is unknown, or not on `main`'s history (a by-hand deploy of a branch), the passed commit deploys. A commit whose CI fails never deploys; production stays on the newest green commit before it.
- **Deploys queue, never cancel** (`concurrency: deploy-main`, `cancel-in-progress: false`): half a deploy would leave some workers on new code and some on old.
- **A pull request's CI never deploys production**; pull requests deploy previews ([Preview deployments](preview-deployments.md)).
- **A redeploy by hand** stays possible from the Actions tab, where the workflow appears as **Deploy Production** (or `gh workflow run deploy.yml --ref main`: the file name rather than the display name, so a rename can't stale this out). It builds the current `main`.
- **Forks deploy by hand.** The automatic trigger is guarded to `webbertakken/livedoc`, which holds docs.nu's secrets; a self-hosted fork dispatches the workflow, or widens the guard once its own secrets are set.

Every `wrangler` invocation in the reusable workflow ends in `${WRANGLER_ENV:+--env "$WRANGLER_ENV"}`, which expands to nothing for production, docs.nu's only environment, and to `--env <name>` for another environment a self-hosted deployment declares. Shell expansion rather than a GitHub expression, so it reads the same locally as in the log.

Jobs:

1. **build** — installs deps, runs `pnpm build`, uploads `apps/marketing/out`, `apps/live/out`, `apps/telemetry/out` and `apps/help/out` as workflow artifacts.
2. **deploy-marketing** — downloads `marketing-out`, runs `pnpm exec wrangler deploy` from `apps/marketing/`.
3. **deploy-live** — downloads `live-out`, runs `pnpm exec wrangler deploy` from `apps/live/`.
4. **deploy-api** — runs:
   - `pnpm exec wrangler whoami` (diagnostic — prints which Cloudflare account the token authenticates against so a `7403 account not authorized` error is debuggable from the log).
   - `pnpm exec wrangler d1 migrations apply DB --remote` applies any pending migrations BEFORE the worker deploy (after the secret syncs, straight before it) so the new code never briefly runs against an older schema; see Renaming migrations below for the non-additive case. If this step fails the job halts and surfaces a precise error pointing at the missing token scopes. (Wrangler 4 dropped the `--yes` flag; the command is non-interactive by default in CI.)
   - `pnpm exec wrangler deploy` from `apps/api/`, plus the hosted profile's `--var` flags on docs.nu's own repository (see "Hosted profile" below), then `node scripts/hosted-vars.mjs verify` against the live version.
5. **deploy-telemetry** — downloads `telemetry-out`, runs `pnpm exec wrangler deploy` from `apps/telemetry/` (in parallel with marketing/live/api).
6. **deploy-help** — downloads `help-out`, runs `pnpm exec wrangler deploy` from `apps/help/` (in parallel with the others).
7. **deploy-mcp** — depends on **deploy-api** (the MCP worker has a service binding to the api worker, [MCP server](../015-api/mcp-server.md), so api must exist first). Runs `pnpm exec wrangler deploy` from `apps/mcp/` — no static artifact to download, the worker bundles from source. NOT a `deploy-router` dependency: `mcp.docs.nu` is its own host, not a path under the main hostname.
8. **deploy-router** — depends on **deploy-marketing**, **deploy-live**, **deploy-api**, **deploy-telemetry** and **deploy-help**. Runs `pnpm exec wrangler deploy` from `apps/router/`. The router's service bindings target the five workers above, so it must deploy after they exist. This is the one job carrying a GitHub `environment`, so a run files a single deployment record with the public URL rather than seven.

`deploy-marketing`, `deploy-api`, `deploy-telemetry` and `deploy-help` run in parallel off `build`, and `deploy-live` follows `deploy-api`; `deploy-mcp` runs once `deploy-api` is up (parallel to the rest); `deploy-router` waits for the five it binds (not mcp, which is a separate host).

All seven deploy jobs use raw `pnpm exec wrangler` rather than `cloudflare/wrangler-action` — wrangler 4 ships sensible defaults and the explicit invocation makes the workflow log read 1:1 against a local run.

### Renaming migrations

Most migrations only add, so the new worker running briefly on the newer schema is harmless. A
migration that **renames** (`0055_documents.sql`, [Document](../006-document/document.md#renaming-from-diagram))
is different: from the moment it applies until the new api worker is live, the old worker's queries
name tables that no longer exist, and the other apps' workers deploy separately, so old and new
versions briefly serve side by side. The deploy keeps that window short and recoverable:

- **deploy-api** syncs its secrets first and applies the migration straight before `wrangler deploy`,
  so the window is the deploy itself.
- **deploy-live** waits for **deploy-api**, so a new editor never calls an api that lacks its routes;
  **deploy-router** still waits for the five it binds.
- The editor serves its old address during the overlap ([Router app](router-app.md#legacy-editor-route)),
  and a save that fails in the window is retried on its own
  ([Per-tab storage](../006-document/per-tab-storage.md#retrying-a-failed-save)).
- A renaming migration runs first on its pull request's preview, against a real remote database
  ([Preview deployments](preview-deployments.md)). Merge it at a quiet hour, since merging deploys it to
  production: for a minute or so, api calls from open editors can fail and are retried.

There is no down migration; a problem after a renaming migration is fixed forward.

## Hosted profile

Some configuration is what **docs.nu** runs with, not what the software defaults to. Committed `[vars]` would make it every fork's default; a value set only in the Cloudflare dashboard would be wiped by the next `wrangler deploy`, which replaces a worker's plain vars with exactly the ones it declares ([Preview deployments](preview-deployments.md) "Configuration lives in the file"). So it has a seam of its own: the **hosted profile**.

- **What it holds.** `apps/api/hosted-vars.json`: `TELEMETRY_ENABLED = "true"` ([Telemetry + public transparency dashboard](../017-telemetry/telemetry.md)) and the per-owner image gallery caps `IMAGE_MAX_PER_OWNER = "100"` and `IMAGE_MAX_BYTES_PER_OWNER = "104857600"` ([Image element + per-owner gallery](../009-elements/images.md)). Its frontend mirror, `NEXT_PUBLIC_TELEMETRY_ENABLED`, is derived from it rather than stated twice. A few vars are **per environment**, under `environments.production` (and any other environment a deployment declares): the Google Drive mirror's `GOOGLE_CLIENT_ID`, because each environment is its own Google Cloud projects ([Google Drive mirror](../022-drive-mirror/drive-mirror.md), "Hosted deployment"), mirrored into the live build as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Also per environment, `OAUTH_ISSUER`: the MCP worker's origin, where the CLI signs in ([CLI](../015-api/cli.md); `https://mcp.docs.nu` in production; a fork without an MCP worker leaves it unset, so its CLI signs in with a token). And `APP_BASE_URL`: the canonical public origin that email, workbench and pairing links are built from (`https://www.docs.nu` in production, never the apex that redirects to it; [Workbench embeds](../013-workspace/workbench-embeds.md)). An empty per-environment value is unset there.
- **Who gets it.** The reusable workflow resolves `HOSTED` from the repository ID of `webbertakken/livedoc`, so docs.nu's deploys apply it, a rename or transfer keeps it, and no fork matches. A fork's deploy applies nothing, so a fork is **telemetry-off and uncapped** until it opts in by declaring the vars in its own `[vars]`.
- **How it is applied.** On every hosted deploy, not once: the build step appends the frontend mirror to `$GITHUB_ENV`, and the api deploy passes each var as `wrangler deploy --var NAME:VALUE` (`node scripts/hosted-vars.mjs flags`). Every command takes the environment as `--env <name>` (none is production), so a deploy only ever applies its own environment's entries.
- **How it is checked.** After the api deploy, `node scripts/hosted-vars.mjs verify` reads the plain vars off every version serving traffic (`wrangler deployments status` + `wrangler versions view`) and fails the run on any hosted var that is missing or different, or that its environment leaves unset but the worker still holds. Before any deploy, `verify-build ../live/out` fails the build when the live app lacks its environment's Google client id or holds another environment's, so the worker and the live build of one environment always agree. In CI, `apps/api/src/hosted-vars.test.ts` fails when the profile stops turning telemetry on, stops capping galleries (by the worker's own cap parser), names a var the worker does not read, or when `wrangler.toml` commits a hosted-only var as a default.

`AI_ALLOWED_ORIGINS` is deliberately **not** in the profile. It names docs.nu's origins but fails closed, so a fork that forgets to change it gets an AI endpoint that refuses its own origin rather than one open to every page.

## Required GitHub Action secrets

Set in the repo under **Settings → Secrets and variables → Actions**:

| Secret          | What it is                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| `CF_API_TOKEN`  | A Cloudflare API token with permissions to deploy Workers and apply migrations. |
| `CF_ACCOUNT_ID` | The Cloudflare account ID the workers belong to.                                |

**Optional**, each synced into `wrangler secret put` by the deploy workflow and skipped when unset, so a fork that sets none still deploys:

| Secret                      | Synced to       | See                                                                                                        |
| --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`        | api             | [04](../014-identity/auth-and-guest-access.md): turns sign-in on, and derives the guest-id signing key     |
| `GOOGLE_AUTH_CLIENT_SECRET` | api             | [04](../014-identity/auth-and-guest-access.md): Google sign-in, beside `GOOGLE_AUTH_CLIENT_ID` in `[vars]` |
| `INTERNAL_EVENTS_KEY`       | api **and** mcp | [22](../017-telemetry/telemetry.md) — one GitHub secret drives both, so they can't drift                   |

Syncing on every deploy means these rotate by editing the GitHub secret rather than by running `wrangler` against production. [Secrets policy](../002-project-scope/secrets-policy.md) holds the full worker-secret table.

Previews use `CF_API_TOKEN` and `CF_ACCOUNT_ID` too: they live in the same Cloudflare account ([Preview deployments](preview-deployments.md)).

### Creating the API token

Cloudflare dashboard → **My Profile → API Tokens → Create Token → Custom Token**.

Permissions (all on the account that owns the workers):

- **Workers Scripts → Edit** — deploy & update workers.
- **D1 → Edit** — apply migrations during deploy.
- **Workers Routes → Edit** — wire / update custom domain routes.
- **Account Settings → Read** — required by wrangler.
- **User → User Details → Read** — `wrangler whoami` introspection.

Scope to **the specific account** that owns the workers. Do **not** issue an "all-account" token. If the deploy-api step emits `7403 The given account is not valid or is not authorized to access this service`, the token is missing D1 Edit (or was minted for a different account than `CF_ACCOUNT_ID`).

### Getting the account ID

Cloudflare dashboard → any zone → right sidebar → **Account ID** (copy).

## First deploy

On the first run, none of the workers exist yet. The job ordering handles this: `deploy-marketing`, `deploy-live`, `deploy-api`, `deploy-telemetry` and `deploy-help` run first and create those workers, then `deploy-router` runs, by which point its five service-binding targets already exist, so wrangler accepts the bindings.

Subsequent deploys are idempotent updates.

## Custom domain

Production lives at **`https://docs.nu`**. The apex routes to the router worker (configured in the Cloudflare dashboard, not in `wrangler.toml`). From there:

- `https://docs.nu/api/*` → api worker (REST + WebSocket).
- `https://docs.nu/live` and `https://docs.nu/live/<anything>` → live editor (the router strips the `/live` prefix before forwarding).
- `https://docs.nu/telemetry` → telemetry dashboard; `https://docs.nu/help` → help centre (both prefix-stripped).
- Everything else → marketing.

The workers themselves remain reachable at their default `*.workers.dev` URLs for direct testing.

## What this spec does **not** yet cover

- Rollback procedure (currently: `wrangler rollback` via dashboard or CLI).
- Per-worker secrets that are **not** in the optional sync table above (e.g. the model key (`GOOGLE_AI_STUDIO_API_KEY` / `OPENAI_API_KEY` / `AI_API_KEY`), `RESEND_API_KEY`) — those are set by hand with `wrangler secret put` and persist across deploys.
