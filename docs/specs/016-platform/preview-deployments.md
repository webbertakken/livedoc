# Preview deployments

Every pull request gets its own complete, isolated copy of the platform, at `https://<branch>.preview.docs.nu`, for as long as it is open. A change is _running_ somewhere before anyone decides to merge it, and a D1 migration runs against a real remote database before it reaches the one holding people's documents.

Production deploys every merge to `main` once its CI passes ([Deployment](deployment.md)). There is no staging environment; a preview per pull request takes its place, so a change runs somewhere real before the merge that ships it.

## A preview

|               | Production       | Preview of pull request `n`                                       |
| ------------- | ---------------- | ----------------------------------------------------------------- |
| Address       | `docs.nu`        | `https://<branch>.preview.docs.nu`, and its router on workers.dev |
| Trigger       | Every merge      | Every push to the pull request                                    |
| Workflow      | `deploy.yml`     | `preview.yml`                                                     |
| Worker names  | `docs-nu-<app>`  | `docs-nu-pr-<n>-<app>`                                            |
| D1            | `docs-nu`        | `docs-nu-pr-<n>`, migrated on every deploy                        |
| R2            | `docs-nu-images` | `docs-nu-pr-<n>-images`                                           |
| Rate limiters | `7001`-`7012`    | `7101`-`7112`, shared by every preview                            |
| Indexable     | Yes              | **No**: `X-Robots-Tag: noindex, nofollow`                         |
| Lifetime      | Permanent        | Deleted when the pull request closes                              |

The six path-routed workers deploy (api, marketing, telemetry, help, live, router); the MCP worker does not. Only the router is on workers.dev; the other five are reached through its service bindings, as in production.

## The address

A preview lives at `https://<label>.preview.docs.nu`, where the label is the pull request's head branch as one DNS label: lowercased, every run of other characters one hyphen, none at either end. A branch too long for a label keeps its first 56 characters and gains six hex characters of a hash of the whole name. The router's workers.dev address keeps working beside it.

- **Its own certificate.** Universal SSL covers `*.docs.nu` one level deep, not `*.preview.docs.nu`; each preview host is a Workers custom domain, which brings a certificate for that exact host, in about four minutes when measured. The workers.dev address is linked first, so nobody waits for it.
- **Asked of Cloudflare first.** A resolver asked before the host's DNS record exists caches "no such host" for the zone's negative TTL, 30 minutes on docs.nu. The wait asks Cloudflare's DNS over HTTPS until the record exists, and only then fetches the host.
- **Named by branch, owned by number.** Every resource is named after the pull request number; only the address follows the branch. Renaming the branch moves the address and detaches the old one.
- **One host, one pull request.** Two branches can share a label (`feat/x` and `feat-x`). A deploy whose host already serves another preview fails, and asks for the branch to be renamed.

## In the pull request

The preview is named in the pull request's **description**, never a comment: a comment emails every watcher, a description edit notifies no one. The description ends in **slots** that CI fills and empties (`scripts/pr-description.mjs`), always in one order below everything the author wrote: the coverage report ([Testing](../003-system-architecture/testing.md#coverage-report)), then the preview, last. Each slot sits between two hidden markers, `<!-- livedoc:<slot>:start -->` and `<!-- livedoc:<slot>:end -->`. Every write reads the description just before it, so text the author added meanwhile is kept; text written below the slots ends up above them on the next write.

## Derived, never restated

A preview's configuration is generated from the production `wrangler.toml` of each app by `scripts/preview.mjs`, into a gitignored `wrangler.preview.json` beside it. Nothing about previews is written into the wrangler configs, so a binding added to production is in the next preview without anyone restating it.

The generator renames and repoints, and refuses what it cannot repoint safely:

- Worker names and service bindings move from `docs-nu-<app>` to `docs-nu-pr-<n>-<app>`. A service binding that is not a `docs-nu-` worker is refused: it would reach outside the preview.
- The D1 and R2 bindings point at the preview's own database and bucket. Every R2 binding (images, files, bug report screenshots) shares that one bucket: each names its objects its own way, and none lists the bucket to decide what to delete.
- Rate limiters move from `70xx` to `71xx`. Their namespace ids are account-wide, so a preview never spends production's counters. An id outside `70xx` is refused.
- A KV binding is refused: only the MCP worker has one, and previews do not run it.
- Production's routes and every named environment are dropped. The router alone gets a route, its preview host as a custom domain, and `workers_dev`.
- The api's `AI_ALLOWED_ORIGINS` and `APP_BASE_URL` become the preview's address; the router's `DEPLOY_ENV` becomes `preview`.

The hosted profile ([Deployment](deployment.md) "Hosted profile") is not applied: a preview runs as a fork would, telemetry off and uncapped.

## Lifecycle

- **Open, push or reopen**: refuse a host that already serves another pull request, build every app, create the D1 and R2 when missing, apply migrations, deploy the api first and the router last, detach any host the router kept from a renamed branch, then wait, up to 15 minutes, until the host answers over HTTPS. Only then is the preview named in the pull request's description, in its preview slot: ``Live preview (`<sha>`): https://<branch>.preview.docs.nu``, with the short commit it was built from.
- **Close or merge**: detach every custom domain, then delete the six workers (router first, so nothing still binds a worker when it goes), the D1, and the R2 bucket after emptying it, and empty the preview slot, so a description never names a preview that is gone.
- One run per pull request at a time; a newer push or the close cancels an unfinished one.
- A brand-new worker is briefly invisible to wrangler's workers.dev step, which then fails with `10007` although the upload succeeded. Every first preview deploy creates seven, so the generator retries that one answer, and only that one, up to six times, 30 seconds apart.

## noindex, at the edge

A preview is public on purpose: no auth wall, so a change can be shared before it ships. The router stamps `X-Robots-Tag: noindex, nofollow` on every response when `DEPLOY_ENV` is `preview`, once, rather than as a build flag threaded through five static apps. A `101` WebSocket upgrade passes through untouched: a response carrying a socket cannot be rebuilt, and wrapping it would break realtime on previews alone.

## Pull requests from forks

Get no preview. Their runs have none of this repository's secrets, and a preview would deploy their code with its Cloudflare token.

## Secrets

`CF_API_TOKEN` and `CF_ACCOUNT_ID`, the same two production's deploy uses. The token needs, on the account: Workers Scripts, D1, Workers R2 Storage and Workers KV Storage edit, plus Account Settings read. On the `docs.nu` zone: DNS and Workers Routes edit, to attach and detach the preview hosts.

## Configuration lives in the file

A plain var set only in the Cloudflare dashboard is invisible to code review, and the next `wrangler deploy` wipes it: deploy replaces a worker's plain vars with exactly the ones it declares. Every var is stated in `wrangler.toml`, or in the hosted profile for what only docs.nu runs with.
