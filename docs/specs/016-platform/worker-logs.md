# Worker logs

The api, mcp and router workers keep their own log lines in Workers Logs, so a failure that already happened can
still be read: which route, which error, which stack.

## Why

- Every decision point and failure in the workers writes a log line with a recognisable fingerprint
  (`[d1] unavailable route=...`, `api error route=...`, `home: read ...`).
- With no log store those lines exist only while someone runs `wrangler tail`. A crash nobody was watching leaves a
  count on the [telemetry dashboard](../017-telemetry/telemetry.md) and nothing to act on: two `500`s on
  `GET /api/home` in November 2026 were counted as `Error·Api·Internal.Get.Home`, and their cause was never found.
- Telemetry cannot stand in for logs. Its rows are anonymous counts by design, and they live in the database whose
  outage they would have to report ([API](../015-api/api.md) "When a request fails").

## What is kept

- **The workers' own lines**: everything written with `console.log`, `console.info`, `console.warn` and
  `console.error`, and the exception of an invocation that threw.
- **Not the requests.** Invocation logs are off (`invocation_logs = false`): one would store every request's URL,
  and a URL carries document ids, share codes and invite codes.
- **Every invocation, unsampled.** A rare failure is the one worth reading; sampling would drop it.

## What a log line may carry

- Route words, counts, durations, outcomes and reasons.
- Internal ids: a document, tab, team, API token or owner id.
- Never a document's content or name, a participant's name, a share code, a password, a token's secret, or a whole
  email address (`redactAddress`). A line that needs one of these to be useful is a bug in the line.

## Where and how long

- In the Cloudflare account the workers run in, and nowhere else: no export, no third party.
- Cloudflare keeps them 3 days on the Workers Free plan and 7 on Workers Paid, then deletes them. Free stores up to
  200,000 lines a day and drops the rest; Paid includes 20 million a month.
- Read them in the dashboard (Workers & Pages, the worker, Observability) or with `wrangler tail` for the live
  stream.

## Configuration

Each of `apps/api/wrangler.toml`, `apps/mcp/wrangler.toml` and `apps/router/wrangler.toml` carries:

```toml
[observability]
enabled = true

[observability.logs]
enabled = true
invocation_logs = false
```

- The frontends (marketing, live, help, telemetry) serve static files and run no code of ours, so they log nothing.
- Pull request previews are generated from these files and keep the block
  ([Pull request previews](preview-deployments.md)).

## Self-hosting

- The block ships on, and writes to the self-hoster's own Cloudflare account. It costs nothing on either plan at
  the volumes above.
- To keep no logs, set `enabled = false` under `[observability]` in the three files before deploying.

## Share roles

Logs are an operator surface: nobody reaches them through a document, whatever their role.
