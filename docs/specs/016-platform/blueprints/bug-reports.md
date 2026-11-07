# Bug reports blueprint

Derived from [Bug reports](../bug-reports.md) and [Report a Bug entries](../../004-interface-design/report-a-bug-entries.md).

## Domain and naming

| Term                 | Identifier                                         | Meaning                                                              |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Bug report           | `BugReportSubmission`                              | `{ title, details?, context?, screenshot? }`, what the browser sends |
| Context              | `BugReportContext`                                 | What the browser attaches on its own                                 |
| Recent error         | `BugReportRecentError`                             | `{ at, source, message }`, redacted                                  |
| Screenshot           | `BugReportScreenshot`                              | `{ contentType, data }`, base64                                      |
| Reporter             | `BugReporter`                                      | `{ kind: 'account' \| 'guest' \| 'anonymous'; id: string \| null }`  |
| Filing               | `BugReportFiling`                                  | What a card is made from: the report, reporter, screenshot link      |
| Filed                | `BugReportFiledResponse` `{ number }`              | The card's `#key`                                                    |
| Stored               | `BugReportStoredResponse` `{ stored: true }`       | A D1 `bug_reports` row                                               |
| Refusal              | `BugReportStoreReason`                             | Why the board did not take it (spec's reason table)                  |
| Bug Tracker          | `BUG_REPORT_DOCUMENT_ID`, `BUG_REPORT_TAB_ID`      | The configured document and board tab                                |
| Bug Report card type | `BUG_REPORT_TYPE_LABEL` `'Bug Report'`             | Found by label, case apart                                           |
| Reporter tag         | `reporterTag(reporter)`                            | 32 hex of SHA-256 of the id, or `anonymous`                          |
| Place                | `BugReportPlace` `{ mode?, tabKind?, shareRole? }` | What the editor publishes while mounted                              |
| Draft                | `BugReportDraft` `{ title, details, screenshot }`  | The unsent form, kept in `localStorage`                              |

"Report a Bug" is the one name for the entry, the dialog title and the help article. Never "feedback" in copy (the
telemetry category alone is `Feedback`).

## Modules

| File                                                                                    | Responsibility                                                                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api-schema/src/bug-report.ts`                                                 | Types, `BUG_REPORT_LIMITS`, `parseBugReportSubmission`, `parseBugReportContext`, `parseBugReportScreenshot`                         |
| `packages/api-schema/src/bug-report-context-lines.ts`                                   | `describeUserAgent`, `bugReportContextLines` (the plain-word lines the form and the card share), `redactErrorText`                  |
| `packages/api-schema/src/bug-report-card.ts`                                            | `BUG_REPORT_TYPE_LABEL`, `findBugReportType`, `reporterLine`, `bugReportCard`                                                       |
| `apps/api/migrations/0112_bug_reports.sql`                                              | `bug_reports`, `bug_report_windows`                                                                                                 |
| `apps/api/src/db/bug-reports.ts`                                                        | `storeBugReport`, `listDueBugReports`, `noteBugReportAttempt`, `deleteBugReport`, `claimBugReportSlot`, `deleteOldBugReportWindows` |
| `apps/api/src/bug-reports/route.ts`                                                     | `handleBugReports(ctx)`: dispatch on method and path                                                                                |
| `apps/api/src/bug-reports/submit.ts`                                                    | `submitBugReport(ctx)`: the spec's filing steps 1-6                                                                                 |
| `apps/api/src/bug-reports/rate.ts`                                                      | `bugReportRateLimit(ctx, visitor)`: the binding, then the D1 window                                                                 |
| `apps/api/src/bug-reports/reporter.ts`                                                  | `resolveBugReporter(ctx)`, `reporterTag`                                                                                            |
| `apps/api/src/bug-reports/screenshots.ts`                                               | `putBugScreenshot`, `serveBugScreenshot(ctx)`, `deleteBugScreenshotsOf(env, id)`, `SCREENSHOT_KEY_PATTERN`                          |
| `apps/api/src/bug-reports/file.ts`                                                      | `fileBugReport(env, filing)`: configuration, document pre-check, the room call, the outcome                                         |
| `apps/api/src/bug-reports/room-file.ts`                                                 | `fileBugReportInRoom(env, tabId, filing, waitUntil)`: board, type, card, item store write, relay (runs in the room)                 |
| `apps/api/src/bug-reports/refile.ts`                                                    | `runBugReportRefile(env, now)`                                                                                                      |
| `apps/api/src/document-room/document-rpc.ts`, `document-client.ts`, `document-room.ts`  | The `fileBugReport` room RPC                                                                                                        |
| `apps/api/src/db/account.ts`                                                            | Account deletion deletes rows; owner migration moves them                                                                           |
| `apps/live/lib/bug-report/recent-errors.ts`                                             | The ring buffer: `recordClientError`, `recentClientErrors`, `installRecentErrorCapture`                                             |
| `apps/live/lib/bug-report/place.ts`                                                     | `useBugReportPlace(place)`, `currentBugReportPlace()`                                                                               |
| `apps/live/lib/bug-report/collect-context.ts`                                           | `collectBugReportContext(deps)`                                                                                                     |
| `apps/live/lib/bug-report/screenshot.ts`                                                | `captureScreen()`, `encodeImageFile(blob)`, `encodeCanvas`, `encodeToFit`: scale, encode, step quality                              |
| `apps/live/lib/bug-report/draft.ts`                                                     | `readBugReportDraft`, `saveBugReportDraftText`, `saveBugReportDraftScreenshot`, `clearBugReportDraft`                               |
| `apps/live/lib/bug-report/send.ts`                                                      | `sendBugReport(submission)`: identity headers, the POST, the outcome                                                                |
| `apps/live/components/bug-report/BugReportProvider.tsx`                                 | The opener context, `useOpenBugReport()`, the lazy dialog                                                                           |
| `apps/live/components/bug-report/BugReportDialog.tsx`                                   | The form                                                                                                                            |
| `apps/live/components/bug-report/BugReportScreenshotField.tsx`                          | Capture, upload, paste, drop, preview, remove                                                                                       |
| `apps/live/components/bug-report/BugReportAttached.tsx`                                 | What's Attached                                                                                                                     |
| `apps/live/components/bug-report/ReportBugButton.tsx`                                   | `ReportBugButton` (chrome icon), `ReportBugScreenButton` (error cards)                                                              |
| `apps/live/app/report-a-bug/page.tsx`, `apps/live/app/report-a-bug/screenshot/page.tsx` | The standalone form page and the screenshot page                                                                                    |

## Interfaces and contracts

```ts
type BugReportSubmission = {
  title: string; // trimmed, 1..200
  details?: string; // trimmed, ..5000, absent when empty
  context?: BugReportContext;
  screenshot?: BugReportScreenshot;
};
type BugReportContext = {
  route: string; // isValidPageViewPath
  from?: string; // isValidPageViewPath
  mode?: EditorMode;
  tabKind?: TabKind;
  shareRole?: 'owner' | AccessLevel;
  release?: string; // /^[A-Za-z0-9._-]{1,64}$/
  userAgent?: string; // ..512
  viewport: { width: number; height: number; pixelRatio: number }; // ints 0..100000, ratio 0..16
  online: boolean;
  recentErrors: BugReportRecentError[]; // ..5
};
type BugReportRecentError = {
  at: string; // ISO 8601, ..40
  source: 'uncaught' | 'rejection' | 'render' | 'api';
  message: string; // ..200
};
type BugReportScreenshot = { contentType: 'image/webp' | 'image/jpeg' | 'image/png'; data: string };
```

- `parseBugReportSubmission(raw)` answers `{ ok: true; submission; contextDropped }` or `{ ok: false; problem }`,
  `problem` one of `not_an_object`, `title_missing`, `title_too_long`, `details_too_long`, `screenshot_invalid`. A
  context that does not parse is dropped (`contextDropped: true`); unknown fields are dropped.
- `parseBugReportScreenshot` refuses an unknown type, non-base64 data, or data whose decoded size exceeds
  `BUG_REPORT_LIMITS.screenshotBytes`.
- `POST /api/bug-reports`, JSON body. Answers `201 BugReportFiledResponse`, `202 BugReportStoredResponse`, `400
{ error: 'invalid_bug_report', problem }`, `405`, `413 { error: 'payload_too_large' }`, `429 { error:
'rate_limited' }` with `Retry-After`, `503 { error: 'bug_reports_unavailable' }`.
- `GET /api/bug-reports/screenshots/<tag>/<uuid>.<ext>`: the bytes, or `404 { error: 'screenshot_not_found' }`.
- Room RPC: `fileBugReport(documentId, tabId, filing): Promise<BugReportFileOutcome>`, where
  `BugReportFileOutcome = { filed: true; number } | { filed: false; reason: BugReportStoreReason }`.
- `bugReportCard(filing, type)`: `{ type: type.id, fields }`, fields keyed by the type's custom field ids, the
  leftovers appended to `description` under `<Label>:` lines, every value cut to the item store's bounds
  (`ITEM_TITLE_MAX`, `ITEM_DESCRIPTION_MAX`).
- Editor: `useOpenBugReport(): (opts?: { trigger?: HTMLElement | null }) => void`; `useBugReportPlace(place)`.
- Draft: `readBugReportDraft(): BugReportDraft` (`{ title: '', details: '', screenshot: null }` when none);
  `saveBugReportDraftText({ title, details })`; `saveBugReportDraftScreenshot(screenshot | null): boolean` (false when
  the browser refused it); `clearBugReportDraft()`. `restoreScreenshot(screenshot): PreparedScreenshot | null` makes
  its preview again.

## Data and persistence

`0112_bug_reports.sql`:

```sql
CREATE TABLE bug_reports (
  id TEXT PRIMARY KEY,            -- uuid
  owner_id TEXT,                  -- the reporter's id; NULL for anonymous
  reporter_kind TEXT NOT NULL,    -- account | guest | anonymous
  title TEXT NOT NULL,
  details TEXT,
  context TEXT,                   -- JSON BugReportContext
  screenshot_key TEXT,            -- R2 key, for erasure
  screenshot_url TEXT,            -- the card's link
  reason TEXT NOT NULL,           -- BugReportStoreReason
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL
);
CREATE INDEX idx_bug_reports_created ON bug_reports (created_at);
CREATE INDEX idx_bug_reports_owner ON bug_reports (owner_id);
CREATE TABLE bug_report_windows (
  visitor TEXT PRIMARY KEY,       -- 32 hex of SHA-256 of the visitor key; never an id
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
```

- A row is deleted once filed. Account deletion deletes the owner's rows (and their screenshots through the tag
  prefix); the owner migration moves `owner_id` and sets `reporter_kind` to `account`.
- `bug_report_windows` holds hashes only; the daily sweep deletes windows older than a day.
- R2 objects carry their content type; nothing else. The lifecycle rule is the bucket's (operations doc).
- The draft is two `localStorage` keys, so typing never rewrites the picture: `livedoc:v2:bug-report-draft`
  (`{ title, details }` JSON, each cut to its limit) and `livedoc:v2:bug-report-draft-screenshot` (a
  `BugReportScreenshot` JSON, read back through `parseBugReportScreenshot`). Either key is removed when empty; anything
  unreadable is read as absent. No migration: an unreadable draft is an empty form.

## Behaviour and state

Dialog states: `editing` → `sending` → `sent { number } | stored` or back to `editing` with `error`. A capture
(`capturing`) runs beside `editing`; Send pressed while capturing enters `sending` and awaits the capture
(`useBugReportScreenshot().settled()`), then sends with whatever it produced.
The dialog opens on the draft (`readBugReportDraft`, once per opening). Every title or details change saves the text;
every screenshot replace (attach, remove) saves or removes the picture, a capture that ends after the form closed
included. A sent report (`filed` or `stored`) clears the draft, even when the form closed while sending; a failure
keeps it. Closing keeps the draft; closing while sending drops the answer (the request still lands).

Filing (worker, `submitBugReport`): method → `content-length` and text length ≤ 1,500,000 → rate → parse → reporter
→ screenshot put → `fileBugReport` → `201`, or `storeBugReport` → `202`, or `503`.

`fileBugReport(env, filing)`: unset vars → `unconfigured`; `getDocument` null → `document_missing`; no Bug Report
type → `type_missing`; else the room RPC; a throw → `room_unavailable`.

`fileBugReportInRoom`: `boardsOnTab` live boards (not archive) → none: `board_missing`; first live board where
`boardTakesType` → none: `type_not_on_board`; its first column's status; `bugReportCard` → `readItemCreate` (a string
rejection is `board_busy`, logged as an incident); `createMany` → `413`: `board_full`, other Response: `board_busy`;
`relay`; `{ filed: true, number: item.key }`.

Refile: on the every-minute cron when `minute % 15 === 0`; unconfigured → nothing (no query); else up to 20 rows oldest
first; each `fileBugReport`, filed → delete row, refused → `noteBugReportAttempt(reason)`.

## Presentation and UX

Copy is the spec's, verbatim. The bottom-bar button uses `CHROME_BTN` and `HoverCard` ("Report a Bug" / "Tell us what
went wrong. Opens a short form."); the error-card button is `Button variant="secondary"`; links use the host's link
class. The screenshot preview is `max-h-48 w-auto max-w-[70%] rounded border object-contain`. The counter shows `n/200` from 160
characters on. `/report-a-bug` shows the form open over a plain page with a "Report a Bug" button to open it again; closing
the form calls `history.back()` when there is history, else loads `/` (`leaveReportPage`), never a URL from the query.

## Accessibility

The dialog is labelled by its title; fields have visible labels; the counter is `aria-live="polite"` only near the
limit; "Screenshot added." and send errors are announced (`role="status"`, `role="alert"`). Entries carry
`aria-haspopup="dialog"`; focus returns to the trigger on close. Every control is reachable by Tab; the drop zone is
the whole form, with the buttons as the keyboard path. Contrast follows the app palette (AA in both schemes).

## Web Experience

Nothing on first paint: the dialog body, the capture library (`modern-screenshot`) and the encoder load on demand
(`next/dynamic`, `import()`). The provider and entries add only a few hundred bytes to the root. The ring buffer is
installed in `ErrorTelemetryBoot`'s effect. No layout shift: entries are fixed-size icons; the dialog is a portal.

## Errors and edge cases

- Body over the cap, wrong method, malformed JSON, blank title, bad screenshot: refused as listed.
- Context from a newer or older client that does not parse: dropped, logged `[bug-reports] context.dropped`.
- Signature mismatch on the screenshot: `400 screenshot_invalid`.
- R2 absent or put failure: filed without a screenshot, logged `[bug-reports] screenshot.unstored`.
- Guest header shaped like an account id, or failing its signature where enforced: reporter `anonymous`, logged.
- D1 down on the rate count: allowed, logged `[bug-reports] rate.uncounted`.
- Board refuses and the D1 insert fails: `503`, logged `[bug-reports] report.lost` (error).
- Draft: storage refused or full on the screenshot → the text is kept, the picture lasts for the opening, logged
  `[bug-reports] draft.screenshot-unsaved`; a draft that does not parse → an empty form.
- Client: no session token → sent without identity; network failure → "Sending failed"; capture failure; undecodable
  image; image over the bounds at the lowest quality.

## Security and trust

Identity is never read from the body. Every field is bounded before D1, R2 or the item store. The draft never
leaves the browser until it is sent, and is read back through the same parsers and limits as a submission. Screenshots are checked by
signature, served only to the Bug Tracker's owner, with `nosniff` and `default-src 'none'`. Keys are unguessable
(uuid) and validated by pattern before any R2 read. The route answers `404` alike for "not yours", "unknown" and
"unconfigured". Rate limits: the binding per network, the D1 window per visitor; the global write limiter applies too.

## Performance and limits

Body ≤ 1.5 MB; screenshot ≤ 1 MB decoded (≈1.37 MB base64); one D1 upsert for the window, one R2 put, one D1 read for
the document, one room call. Refile ≤ 20 rows a run, each one room call, well inside a cron invocation's subrequests.

## Observability

Fingerprint `[bug-reports]`, one line per decision: `report.received`, `report.refused` (`problem`), `rate.limited`
(`by: binding | window`), `rate.uncounted`, `context.dropped`, `reporter.anonymous` (`why`), `screenshot.stored`,
`screenshot.unstored` (`why`), `screenshot.put-failed`, `report.filed` (`number`, `refiled` on a refile),
`report.stored` (`reason`), `report.lost`, `room.failed`, `card.unmade` (`rejection`), `refile.run` (`due`, `filed`,
`stored`), `refile.failed`, `screenshot.served`, `screenshot.refused` (`why`), `erasure.screenshots` (`objects`).
Client: `[bug-reports] opened`, `opened.outside-provider`, `sent` (`number` or `stored`), `send.failed` (`status`),
`send.anonymous`, `capture.failed`, `image.refused`, `screenshot.unavailable`, `draft.screenshot-unsaved`.

## Testing

| Spec rule                                  | Test                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Parsing and bounds                         | `packages/api-schema/src/bug-report.test.ts`                              |
| Context lines, user agent, redaction       | `packages/api-schema/src/bug-report-context-lines.test.ts`                |
| The card a report makes                    | `packages/api-schema/src/bug-report-card.test.ts`                         |
| The endpoint's outcomes, limits, reporter  | `apps/api/src/bug-reports/route.test.ts`                                  |
| Filing on the board and every store reason | `apps/api/src/bug-reports/file.test.ts`                                   |
| Screenshot store and owner-only serving    | `apps/api/src/bug-reports/screenshots.test.ts`                            |
| Refile                                     | `apps/api/src/bug-reports/refile.test.ts`                                 |
| Erasure and migration                      | `apps/api/src/db/account-owner-columns.test.ts`, `db/bug-reports.test.ts` |
| Ring buffer, context, encoder, send, draft | `apps/live/lib/bug-report/*.test.ts`                                      |
| Dialog, entries                            | `apps/live/components/bug-report/*.test.tsx`                              |
| End to end                                 | `apps/live/e2e/bug-report.spec.ts`                                        |

## Constants and configuration

| Constant                                      | Value      | Provenance                                         | Safe range   |
| --------------------------------------------- | ---------- | -------------------------------------------------- | ------------ |
| `BUG_REPORT_LIMITS.title`                     | 200        | Spec                                               | 80..500      |
| `BUG_REPORT_LIMITS.details`                   | 5000       | Spec                                               | 1000..10000  |
| `BUG_REPORT_LIMITS.bodyBytes`                 | 1,500,000  | Spec                                               | ≥ 1.4 MB     |
| `BUG_REPORT_LIMITS.screenshotBytes`           | 1,048,576  | Spec (1 MB)                                        | 256 KB..2 MB |
| `BUG_REPORT_LIMITS.screenshotSide`            | 1600       | Spec                                               | 800..2400    |
| `BUG_REPORT_LIMITS.recentErrors`              | 5          | Spec                                               | 1..10        |
| `BUG_REPORT_LIMITS.errorMessage`              | 200        | Spec                                               | 80..500      |
| `BUG_REPORT_LIMITS.userAgent`                 | 512        | Default (D11)                                      | 256..1024    |
| `BUG_REPORT_WINDOW_MS`                        | 600,000    | Spec (600 s)                                       | 60 s..1 h    |
| `BUG_REPORT_WINDOW_MAX`                       | 5          | Spec                                               | 3..20        |
| `BUG_REPORT_REFILE_EVERY_MINUTES`             | 15         | Default (D12)                                      | 5..60        |
| `BUG_REPORT_REFILE_BATCH`                     | 20         | Default (D13)                                      | 5..50        |
| `SCREENSHOT_QUALITY_STEPS`                    | 0.9 → 0.4  | Default (D14), step 0.1                            | 0.3..0.95    |
| `BUG_REPORT_RATE_LIMITER`                     | 5 per 60 s | Spec (burst gate), namespace `7018`                | 3..20        |
| `BUG_REPORT_DOCUMENT_ID`, `BUG_REPORT_TAB_ID` | vars       | Spec; unset in the repo, set by the hosted profile | ids          |

## Assets and external resources

- `modern-screenshot` (MIT), npm, lazy chunk of the editor app; listed by the licences generator.
- The `bug` icon: Lucide (ISC), through the app's icon set.

## Defaults ledger

D11-D16 in [DEFAULTS](./DEFAULTS.md).
