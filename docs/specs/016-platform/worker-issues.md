# Worker issues

The first time a new kind of error appears in a worker, a card lands on the private Bug Tracker board.
The operator gets one email with it.
When the error comes back after a quiet spell, the operator hears again.

## Why

- [Worker logs](worker-logs.md) keep the evidence of a crash, but nobody is told that a new kind of error appeared.
- Two `500`s on `GET /api/home` in November 2026 were only ever a count on the telemetry dashboard.
- Cloudflare **Workers Issues** already detects and groups failures, and can call a webhook.
- It sees uncaught exceptions, failed invocations, `5xx` answers and `console.error` lines, with source-mapped stacks.
- LiveDoc writes no fingerprinting of its own: it receives the webhook, files the card and sends the email.

## Vocabulary

- **Worker issue**: one kind of error Cloudflare grouped in one worker. Cloudflare groups; LiveDoc never does.
- **Automation**: a Cloudflare rule that sends an issue to a destination when its trigger fires.
- **Trigger**: **first sight** (an occurrence threshold of 1) or **recurrence** (back after a quiet period).
- The quiet period is 24 hours (default): a day without the error, then it counts as back.
- A delivery whose trigger cannot be read is **unknown**, and is handled as first sight.
- **Delivery**: one webhook request from Cloudflare.
- **Receiver**: `POST /api/worker-issues` in the api worker.
- **Delivery key**: what makes two deliveries the same one (see [Once only](#once-only)).
- **Issue card**: the Bug Report card a delivery files, marked as coming from Workers Issues.
- **Operator**: the Bug Tracker document's owner, the person its screenshots are already served to.
- **Ledger**: the Durable Object `WorkerIssuesLedger`, one instance, holding what must outlive a database outage.
- It holds the delivery keys seen, the **held** cards, the operator's address and the emails sent this hour.

## Detection

- `[observability.issues] enabled = true` sits in the api, mcp, router and live `wrangler.toml`, beside the logs block.
- Issues needs Wrangler 4.134 or later, is free during its beta, and does not need Workers Logs.
- Pull request previews keep the block, as they keep logs.
- Their issues never reach the receiver: each automation names one production worker, two automations per worker.
- A `5xx` the api answers reaches the caller through the router, so the router's Issues can hold it as well.
- Its card names the same route as the api's, and is triaged with it.

## The receiver

Cloudflare's generic webhook sends the standard Notifications payload, with the destination's secret in the
`cf-webhook-auth` header.
The api handles a request in this order:

1. **Off unless configured**: without the worker secret `WORKER_ISSUES_WEBHOOK_SECRET`, it answers as an unknown route.
   That is `404 not_found` for every method; nothing is read, filed or sent. It is the self-host default.
2. **Method**: anything but `POST` is `405 method_not_allowed`.
3. **Throttle**: 30 deliveries a minute per network, on the `WORKER_ISSUES_RATE_LIMITER` binding (namespace `7020`).
   Over it is `429 rate_limited` with `Retry-After: 60`. An absent binding or a failed check lets it through, logged.
4. **Secret**: `cf-webhook-auth` is compared with the secret in constant time; missing or wrong is `401 unauthorized`.
5. **Size**: a body over 1 MiB, declared or read, is `413 payload_too_large` (default).
6. **JSON**: a body that is not JSON is `400 invalid_json`.
7. **Shape**: anything but an object carrying `data`, `alert_type` or `text` is `400 unknown_shape`.
8. **Test**: an object with `text` alone (the destination's **Save and Test**) is `200`; nothing is filed or sent.
9. Everything else is a delivery: checked once only, then filed, then emailed.

A refusal answers its code and nothing more; no error text, header or payload is ever echoed.

| Outcome                            | Response                              |
| ---------------------------------- | ------------------------------------- |
| Off (no secret)                    | `404 not_found`                       |
| Filed                              | `201 { outcome: "filed", number }`    |
| Stored in D1                       | `202 { outcome: "stored" }`           |
| Held in the ledger                 | `202 { outcome: "held" }`             |
| Repeat                             | `200 { outcome: "repeat" }`           |
| Test                               | `200 { outcome: "test" }`             |
| Wrong method                       | `405 method_not_allowed`              |
| Throttled                          | `429 rate_limited`, `Retry-After: 60` |
| No secret sent, or the wrong one   | `401 unauthorized`                    |
| Body over 1 MiB                    | `413 payload_too_large`               |
| Not JSON                           | `400 invalid_json`                    |
| Not a Notifications payload        | `400 unknown_shape`                   |
| Not filed, not stored and not held | `503 worker_issues_unavailable`       |

## Reading the payload

- Cloudflare documents the envelope: `name`, `text`, `data`, `ts`, `account_id`, `alert_type`, `alert_event` and more.
- It does not document what `data` holds for an issue, and Issues is in beta.
- So the receiver reads what it can name, carries the rest, and never refuses a delivery because its shape moved.
- What Cloudflare sends is in [What a delivery carries](#what-a-delivery-carries); the rest is read where it may appear.
- Names are matched case and separator apart (`firstObserved` is `first_observed`).
- They are looked for where the Issues API models put them: the issue, its latest occurrence and the automation run.
- It keeps the worker, the issue's id and title, the error's name and message, the stack, and the route.
- It keeps the response status, the occurrence count, first and last seen, the worker version and the trigger.
- It keeps a link to the issue in the dashboard, Cloudflare's own summary (`text`), and the other fields as text.
- It never keeps a request header, a query string, a cookie, an IP address or an email address.
- A field named like one of those is left out of the other fields, and every kept text has its addresses replaced.
- Every kept text is cut to a bound (default): 64 characters for a worker, 6,000 for a stack, 2,000 for the rest.

### What a delivery carries

The first real delivery (24 November 2026, a router `500`) showed what Cloudflare sends today:

- `alert_type` `workers_observability_real_time_issue`, `alert_event` `ALERT_STATE_EVENT_START`, `policy_name`.
- `text`: Cloudflare's summary, naming the worker, the issue type, the occurrences and first and last observed.
- `data.issue`: `id`, `title`, `fingerprint`, `type`, `status`, `services` and first and last observed.
- `data.state_correlation_id`: the automation run's id, the same id as the issue's activity in the Issues API.
- No stack, route, status, version or trigger.

So the receiver reads, besides the names above:

- **The worker** from `issue.services`, a list: its first entry, a name or an object naming one.
- **The run** from `state_correlation_id`, so its delivery key is `run:<id>` and a retry is a repeat.
- **The count** from `count`, `issueCount` or `occurrences` when that is a number.
- **The issue type** from `issue.type`, `ISSUE_TYPE_` and case apart: `exception`, `log`, `security`, or another.
- **The trigger**, when none is named, from the count: an issue seen once is first sight; else it stays unknown.

The receiver asks the Issues API nothing: it holds no Cloudflare token, and a self-hoster needs none.
The card's issue link opens the worker's Issues, where the occurrences, stack and request are.

## Once only

Cloudflare hands an automation run off up to three times, so one delivery can arrive more than once.
Each delivery has a **delivery key**:

- `run:<id>` when the payload names its automation run, the unit Cloudflare retries;
- else `body:<sha256>` of the payload without its `ts`, so a resend of the same notification is the same key.

- The ledger keeps every key for 7 days (default), longer than any hand-off retries.
- A delivery whose key the ledger already holds is a **repeat**: it files nothing and sends nothing.
- When the ledger cannot be reached the delivery goes on unguarded, logged: twice is better than never.
- A delivery that is neither filed, stored nor held gives its key back, so the next hand-off is not a repeat.

## The issue card

An issue card is a **Bug Report card with a marked origin**, not a card type of its own:

- It uses the board, columns and triage bug reports already use (Severity, Fixed, Won't Fix).
- No second type has to be made and added to the board before the first issue can land.
- It rides the same filing, storing and refiling, so it cannot be lost by a path bug reports do not have.
- It is told apart at a glance: its title starts with the worker, and its labels are **Worker Issue** and the worker.
- A **security issue** (Cloudflare's type `security`: a vulnerability scan) also carries the label **Security**.
- It is filed in the board's column named **Security**, case apart; a board without one takes it in its first column.
- Its Reporter reads **Workers Issues**, never an account, a guest or Anonymous.
- The labels show on the card face where the Bug Report type offers Labels; the title always does.

| Card part | From the delivery                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Title     | `<worker>: <issue title>`, else the error, else Cloudflare's summary                                  |
| Labels    | `Worker Issue`, the worker, and `Security` for a security issue                                       |
| Column    | `Security` for a security issue when the board has it; else the first column                          |
| Context   | Worker, Type, Trigger, Error, Route, Status, Count, First seen, Last seen, Version, Issue, Issue link |
| Details   | The stack, Cloudflare's summary and the other fields                                                  |
| Reporter  | `Workers Issues`                                                                                      |
| Release   | The worker version, when known                                                                        |
| Severity  | Unset; triage sets it                                                                                 |

A field the Bug Report type does not have goes into Details under its label, as a bug report's does.

## Filing, storing and holding

A delivery goes through the [bug report pipeline](bug-reports.md#filing):

1. **Filed** on the board, as a bug report is; a filing that throws counts as `room_unavailable`.
2. Else **stored** in D1 `bug_reports` with its reason, and refiled by the scheduled refile as a bug report is.
   Its row has `reporter_kind` `workers-issues` and the issue in its own `issue` column.
3. Else, when D1 is down too, **held** in the ledger, at most 200 cards (default); one beyond them is lost, logged.

Every scheduled refile first takes up to 20 held cards, oldest first, and files or stores each (default).

## The email

One email for each delivery that is not a repeat, a test or a refusal: on first sight and on recurrence.

- **To the operator**: the Bug Tracker document's owner's account address; there is no second setting.
- Without a configured Bug Tracker there is no operator and no email, logged; the card is stored as `unconfigured`.
- The ledger remembers the address each time it is read, so the email still goes while D1 is down.
- At most 10 an hour (default), counted in the ledger: a storm still files every card, and drops the extra emails.
- It goes through the [email client](../014-identity/transactional-email.md) as kind `WorkerIssue`, best-effort.
- It is not an opt-out notification: it stops when the automations or the secret are removed.
- Subject: `New error in <worker>: <error>` on first sight, `Error back in <worker>: <error>` on recurrence.
- Body: the error, worker, route, count and first seen; the card's number or that it waits to be filed.
- It ends with **Open the Bug Tracker** and the link to the issue, and never carries a stack, a header or an address.

## During an outage

A database outage is exactly when errors arrive. While D1 is down:

| What                    | What happens                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| The email               | Sent to the address the ledger remembers; none before its first read, logged    |
| Once only               | Kept by the ledger, which does not live in D1                                   |
| The card                | Held in the ledger; the first refile after D1 returns files or stores it        |
| The board alone down    | The card is stored in D1 with its reason and refiled, as a bug report           |
| The ledger down as well | Filed or stored when D1 is up; else `503`, and the email still goes when it can |

## Security and trust

- The route is on the open internet, and its trust is the secret alone.
- Cloudflare's address ranges prove nothing: anyone on Cloudflare sends from them.
- It is off without a secret, throttled per network, and refused before any body is read without the right secret.
- No log line carries more of a payload than the worker, the issue id, the trigger and the delivery key's kind.
- The card is as private as the Bug Tracker, an unshared document.

## Share roles

An operator surface: no document share role reaches the receiver, the ledger or the email.
The issue card is a card on the Bug Tracker, read by whoever that document is shared with, which is no one.

## Observability

Every decision logs under `[worker-issues]`, kept by [Worker logs](worker-logs.md):

- `delivery.off`, `delivery.refused` (with the problem), `delivery.test`, `delivery.received`, `delivery.repeat`;
- `ledger.unavailable` (with the step), `limiter.failed`;
- `card.filed`, `card.unfiled`, `card.stored`, `card.unstored`, `card.held`, `card.lost`;
- `held.refiled`, `held.unreadable`, `held.refile_failed`;
- `email.sent`, `email.failed`, `email.capped`, `email.no_operator`, `email.off`, `operator.remembered`.

## Telemetry

Each email counts as `Email·Sent·WorkerIssue` ([Telemetry](../017-telemetry/telemetry.md)), written by the email client.

## Setting it up

- docs.nu's steps (the destination, the automations and the secret) are in [docs.nu](../../operations/docs-nu.md).
- A self-hoster follows the same steps in their own account ([Self-hosting](../../operations/self-hosting.md)).

## Decisions

- **Cloudflare Issues and a webhook receiver in the api** (Webber, 2026-11-22), not a Tail Worker.
  Issues is free in its beta and already groups errors; Tail Workers need Workers Paid.
- **A Bug Report card with a marked origin**, not a type of its own: see [The issue card](#the-issue-card).
- **The operator is the Bug Tracker's owner**: the person the screenshots already trust, and no second setting.
- **The ledger is a Durable Object**: what it holds must outlive a D1 outage, which is when it matters.
- **Off without a secret**, answering as an unknown route: self-hosting never breaks, and the route stays unseen.
