# Information assets

Every asset the [ISMS](isms.md) protects, its classification and its owner.
The owner of every asset is Webber; a column for it would say nothing.

## Classification

| Class            | Meaning                                                                | Handling                                                      |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Public**       | Meant for anyone: the source, the specs, the marketing and help sites. | No restriction; integrity still matters.                      |
| **Internal**     | Operational detail that helps an attacker: logs, configs, records.     | Kept out of the public repository; shared on need.            |
| **Confidential** | What people put in LiveDoc and who they are.                           | Reached only through the api's access checks; never logged.   |
| **Secret**       | Keys that grant access.                                                | Only in a secret store; never displayed, logged or committed. |

A document's content is Confidential even when it sits behind a share link: the link is a key, not a publication.
Labels are not stamped on data; the class follows from the store it lives in, as listed below.

## Data stores

| Asset                                         | Holds                                                                                                                           | Class        | Recovery                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------- |
| D1 `docs-nu` (western Europe)                 | Accounts, sessions, document index, folders, shares, tokens, events, bug reports not yet filed                                  | Confidential | D1 Time Travel, 30 days                |
| Durable Objects `DocumentRoom`                | Each document's content, comments, votes and live sessions                                                                      | Confidential | SQLite point-in-time recovery, 30 days |
| R2 `docs-nu-images` (western Europe)          | Uploaded images                                                                                                                 | Confidential | None; see risk `R-07`                  |
| R2 `docs-nu-bug-screenshots` (western Europe) | Screenshots attached to bug reports, expired after 90 days                                                                      | Confidential | None needed; they expire               |
| KV `docs-nu-mcp-oauth`                        | MCP client registrations and short-lived OAuth state                                                                            | Confidential | None needed; re-registration           |
| Cloudflare request logs                       | Request metadata kept by the host                                                                                               | Internal     | Not restored                           |
| Workers Logs (api, mcp, router, live)         | The workers' own log lines, each with its request's path, no query; 3 to 7 days ([Worker logs](../016-platform/worker-logs.md)) | Internal     | Not restored; they expire              |
| Workers Issues (api, mcp, router, live)       | A failing request's error, URL, status, some headers; 7 days ([Worker issues](../016-platform/worker-issues.md))                | Internal     | Not restored; they expire              |
| Durable Object `WorkerIssuesLedger`           | Worker issue deliveries already handled (7 days), cards waiting to be filed ([Worker issues](../016-platform/worker-issues.md)) | Internal     | None needed; Cloudflare redelivers     |

## Secrets

The full list and rotation rules live in the [Secrets policy](../002-project-scope/secrets-policy.md).

| Asset                                              | Where it lives                                    | Class  |
| -------------------------------------------------- | ------------------------------------------------- | ------ |
| Worker secrets (`BETTER_AUTH_SECRET` and the rest) | Cloudflare worker secrets, GitHub Actions secrets | Secret |
| `CF_API_TOKEN` (deploy)                            | GitHub Actions secrets                            | Secret |
| Operator API tokens                                | The operator's device, mode 600                   | Secret |

## Operator accounts

Each can change production, its code or its name, so each is a way in.

| Account                        | Grants                                                    |
| ------------------------------ | --------------------------------------------------------- |
| Cloudflare                     | Workers, D1, R2, KV, DNS and zone settings for docs.nu    |
| GitHub `webbertakken`          | The repository, its rulesets, Actions secrets, advisories |
| npm `@livedoc` organisation    | Publishing `@livedoc/cli`                                 |
| Google Cloud                   | The OAuth clients for sign-in and the Drive mirror        |
| Resend                         | Sending mail as `hello@docs.nu`                           |
| OpenAI and Google AI Studio    | The AI provider keys                                      |
| Domain registrar for `docs.nu` | The domain itself                                         |

## Code and pipeline

| Asset                             | Class  | Note                                                                |
| --------------------------------- | ------ | ------------------------------------------------------------------- |
| Repository `webbertakken/livedoc` | Public | Integrity guarded by the `main` ruleset and required checks         |
| GitHub Actions workflows          | Public | Hold no secret values; read them from Actions secrets               |
| `@livedoc/cli` on npm             | Public | Published with OIDC trusted publishing and provenance; no npm token |

## Endpoints

| Asset                        | Note                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Webber's development devices | Hold operator tokens and signed-in sessions; full-disk encryption and screen lock |

## Suppliers

The processors the [Privacy Policy](../../../apps/help/app/policies/privacy-policy/page.mdx) names, plus the tooling suppliers.
[Review suppliers](../../instructions/review-suppliers.md) keeps their evidence.

| Supplier   | Processes                                       | Personal data  |
| ---------- | ----------------------------------------------- | -------------- |
| Cloudflare | Hosting, D1, Durable Objects, R2, KV, DNS       | Yes            |
| Resend     | Transactional and lifecycle email               | Yes            |
| Google     | Sign-in, the Drive mirror, Gemini, Google Fonts | Yes            |
| OpenAI     | The AI assistant, when on                       | Yes            |
| GitHub     | Source, CI, advisories                          | No (code only) |
| npm        | Publishing the CLI                              | No             |
| Codecov    | Coverage reports from CI                        | No             |
