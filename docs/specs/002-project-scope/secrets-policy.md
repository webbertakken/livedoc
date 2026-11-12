# Secrets policy

**This repository is public.** Source code is visible to the world. Therefore:

> **No secret may ever live in source code.** No API keys, no tokens, no passwords, no OAuth client secrets, no signing keys, no service-account JSON.

This is non-negotiable. The same rule applies to README examples, test fixtures, comments, and commit history.

## Where secrets go

| Environment            | Mechanism                                                         |
| ---------------------- | ----------------------------------------------------------------- |
| Local development      | `.env.local` (gitignored) per app/worker                          |
| Cloudflare Workers     | `wrangler secret put` — never in `wrangler.toml`                  |
| Cloudflare Pages       | Project env vars in the Cloudflare dashboard                      |
| CI / Deploy            | GitHub repo secrets — see below                                   |
| Client-side JS bundles | **Only** values prefixed `NEXT_PUBLIC_*` that are safe to publish |

### GitHub Actions secrets

Required by the CI/CD pipeline (see [10-deployment.md](../016-platform/deployment.md)):

| Secret          | Purpose                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CF_API_TOKEN`  | Cloudflare API token scoped to the account that owns the workers. Required permissions: Workers Scripts:Edit, D1:Edit, Workers Routes:Edit, Account Settings:Read, User Details:Read. Full list in [10-deployment.md](../016-platform/deployment.md). |
| `CF_ACCOUNT_ID` | Cloudflare account ID (not a secret per se, but kept in the same store).                                                                                                                                                                              |

The deploy workflow also **syncs** four of the worker secrets below from GitHub repo secrets into `wrangler secret put` on every deploy, so they rotate by editing the GitHub secret: `BETTER_AUTH_SECRET`, `GOOGLE_AUTH_CLIENT_SECRET`, `INTERNAL_EVENTS_KEY` and `GOOGLE_AI_STUDIO_API_KEY`. Each sync step is guarded on the GitHub secret being non-empty, so a fork that sets none still deploys.

## Worker secrets in use today

Provisioned with `wrangler secret put` (production) or `.dev.vars` (local dev, gitignored) — **never** `[vars]`, which is plain text in a public repo. Every one is optional: absent, its feature degrades rather than breaking, which is what keeps self-hosting viable (see [03](open-source-and-business-model.md)).

| Secret                                                       | Worker          | Absent means                                                                                             |
| ------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                         | api             | Guest-only: no sign-in, and guest ids go unsigned ([04](../014-identity/auth-and-guest-access.md))       |
| `GOOGLE_AUTH_CLIENT_SECRET`                                  | api             | No Google sign-in; email codes still work ([04](../014-identity/auth-and-guest-access.md))               |
| `GOOGLE_AI_STUDIO_API_KEY` / `OPENAI_API_KEY` / `AI_API_KEY` | api             | The AI surface hides entirely ([25](../007-editor/ai-assistance.md))                                     |
| `RESEND_API_KEY`                                             | api             | All transactional + lifecycle email is inert ([64](../014-identity/transactional-email.md))              |
| `INTERNAL_EVENTS_KEY`                                        | api **and** mcp | MCP telemetry falls back to the shared anonymous rate-limit bucket ([22](../017-telemetry/telemetry.md)) |

`INTERNAL_EVENTS_KEY` is the only one that must hold the **same value on two workers**. A mismatch is silent — the caller simply lands back in the throttled bucket — so verify with `wrangler secret list` on both rather than assuming. Generate it with `openssl rand -hex 32`, and `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. The guest-id signing key is derived from `BETTER_AUTH_SECRET`, so it has no secret of its own; rotating the sign-in secret adds a new version beside the old (`BETTER_AUTH_SECRETS`) and keeps `BETTER_AUTH_SECRET` in place.

Non-secret configuration (`TELEMETRY_ENABLED`, `AI_BASE_URL`, `AI_MODEL`, `AI_*`, `IMAGE_MAX_*`, `RESEND_FROM`, `APP_BASE_URL`, `CONSENT_BASE_URL`) lives in `[vars]` in the relevant `wrangler.toml`, in the open, documented alongside each entry there and in the per-app `.env.example`. What only docs.nu runs with (`TELEMETRY_ENABLED`, the `IMAGE_MAX_*` caps) is equally public but lives in the hosted profile, `apps/api/hosted-vars.json`, so it is not every fork's default ([Deployment](../016-platform/deployment.md) "Hosted profile").

Sign-in calls no identity SaaS: better-auth runs inside the api worker, keeps its identity data in the api's own D1, and verifies session tokens against its own keys in-process. `GOOGLE_AUTH_CLIENT_ID` is not a secret and lives in `[vars]` (or the hosted profile).

## What is "safe to publish" client-side

Some keys are designed to be public; they go in `NEXT_PUBLIC_*` vars and end up in the bundle:

- Public URLs (`NEXT_PUBLIC_API_BASE`, etc.).
- The Google sign-in client id, which the browser reads from `GET /api/capabilities` at runtime; no build carries a
  sign-in key.

If a value's documentation calls it "public", "publishable", or "client", it's fine for client bundles.

## What must stay server-side

Never imported in client code, never bundled into the static export:

- Every secret in the table above.
- D1 database access (always via a Worker; the browser never holds DB credentials).
- Any signing / encryption key.

Workers and server-only code read these from `env` bindings — not from `process.env`-style imports in shared code.

## `.env.example`

Each app or worker that needs env vars ships a `.env.example` documenting **which variables are required** with placeholder values:

```
# Where the live app calls the API; unset is correct behind the router
NEXT_PUBLIC_API_BASE=
# (no secret keys here — those go in the Cloudflare dashboard)
```

`.env.local` is gitignored. `.env.example` is committed.

## If a secret leaks

1. **Rotate immediately** in the relevant provider (Cloudflare, Google, Resend, etc.).
2. Update the secret in the env-var store (`wrangler secret put`, Pages dashboard).
3. Force-push and `git filter-repo` are **not** sufficient — rotation comes first because Git history is forever public.
4. Handle the rest as an incident: [Respond to a security incident](../../instructions/respond-to-a-security-incident.md).

## Secret scanning

- `gitleaks git .` scans the history and `gitleaks dir .` the working tree; both report no leaks.
- [`.gitleaks.toml`](../../../.gitleaks.toml) keeps gitleaks' default rules and allows only known fake values.
- It allows exact values, never test paths, so a real key pasted into a test or a doc is still caught.
- A new fixture that trips a rule gets its exact value added there, after confirming it is fake.
- Gitignored build output (`node_modules/`, `dist/`, `.next/`, ...) is skipped, mirroring `.gitignore`.
- CI's **Secrets** job scans the whole history on every pull request and every push to `main`.
- It installs a pinned gitleaks release and checks its SHA-256 before running it.
- The pre-push hook scans the commits a push sends first ([Before a push](../003-system-architecture/testing.md#before-a-push)).
- Without gitleaks installed, the hook says so and skips; CI stays the gate.

## Tooling (to be added)

- CI check that no `NEXT_PUBLIC_*`-bundled value matches a known secret-key prefix (e.g. `sk_`, Resend's `re_`).

## Photo bytes never leave the browser

The event-storming photo import ([Event storming](../021-event-storming/event-storming.md) Phase 8) finds the stickies in a
photograph of a physical wall **in the browser**, with classical computer
vision. The photograph itself is never uploaded: only the CROPS — one sticky
each — go to `POST /api/ai/read-notes` so the model can read the handwriting,
and the route forwards them to the provider and discards them. Nothing is
persisted anywhere: not R2, not D1, not IndexedDB, not a log
line. The browser also re-encodes every crop, which drops EXIF (including the
GPS tag) after honouring the orientation flag.

A workshop wall is somebody's unreleased strategy, and the room around it is
somebody's face. The safest place for a picture of either is the machine it was
taken on.
