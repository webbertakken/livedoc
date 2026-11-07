# Bug reports

**Report a Bug** is how anyone using LiveDoc tells the team something went wrong, from every screen, in one form. A
report becomes a card on a private Plan board in a LiveDoc document, the **Bug Tracker**, and never a public GitHub
issue: the repository is public, and a report can name a document, a person or what was on screen.

The form carries more than the words typed: an opt-in screenshot and a context block the browser attaches by itself
(which page, which mode, which build, which browser, what just failed), so a report can be triaged without asking the
reporter again. Nothing personal is attached beyond the reporter's id and what they type or choose to show.

## Vocabulary

- **Bug report** (`BugReportSubmission`): what the browser sends: a title, optional details, the context and an
  optional screenshot. It never names its reporter; the api establishes that.
- **Entry**: a control that opens the form. Every entry is named "Report a Bug".
- **Context** (`BugReportContext`): what the browser attaches on its own, listed under [Context](#context).
- **Screenshot** (`BugReportScreenshot`): a picture the reporter chose to attach, captured from the page or chosen
  from their device.
- **Reporter** (`BugReporter`): who sent the report, as the api resolved it: an **account** (a verified session or
  token), a **guest** (the browser's guest id) or **anonymous** (no identity at all).
- **Bug Tracker**: the LiveDoc document the reports land in, and its **board**: the Plan board on the configured tab.
- **Filed**: the report became a card on the board. Its number is the card's `#key`.
- **Stored**: the board could not take the report, so it is a row in D1 `bug_reports` with the reason, waiting to be
  filed by the scheduled refile.

## Entries

Every screen can report a bug, one press away. The editor app holds one form (`BugReportDialog`, mounted once in the
root layout) and every entry opens it through `useOpenBugReport()`; no entry mounts a form of its own or passes the
context, which the form collects itself. Each entry is drawn in its neighbours' style.

| Where                                                                                           | Entry                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| The editor's bottom bar and the Explorer's bottom bar (`ChromeControls`)                        | A bug icon button, labelled "Report a Bug" when labelled  |
| The account menu (signed in)                                                                    | A "Report a Bug" item above "Sign out"                    |
| Every error card and crash panel (connection error, load error, area crash), the not-found card | A secondary "Report a Bug" button beside the retry action |
| The root error page (`global-error`)                                                            | A "Report a Bug" link to `/report-a-bug`                  |
| The help centre's home and contact page, and the shared site footer                             | A "Report a Bug" link to `/report-a-bug`                  |

The root error page has no app around it (the root layout itself failed), and the help centre, marketing site and
telemetry dashboard are other apps: they link to **`/report-a-bug`**, a light page of the editor app that shows the
form on its own; closing it goes back in the browser's history to where the reporter came from, else home. A link from
another site carries its page as `?from=<path>` (a page path as `pageViewPath` reduces it, so never an id); the context
names it as **from**, and it never decides where the browser goes (no redirect from a query).

Every entry has `aria-haspopup="dialog"` (links excepted), and focus returns to it when the form closes (to the account
menu's button for the menu item, which is gone by then). Every icon entry carries `data-bug-report-entry`, by which a
screenshot leaves the entries out of the picture.

**Anyone can report**: guests, signed-in people, link visitors of every share role, and people on error screens. The
form is not gated by the share session's `can`: reporting reaches no shared document. A share role only appears in the
report's context.

## The form

`BugReportDialog` is titled "Report a Bug", `lg` wide (34rem), a sheet on a phone, and holds, in order:

1. **What went wrong?** (required, at most 200 characters, with a counter).
2. **More details** (optional, at most 5,000): a text area at least three lines tall, growing with its text to about
   twelve lines, then scrolling.
3. **Screenshot (optional)**: two buttons, "Capture Screen" and "Upload Image", and the note under them: "Screenshots
   can show your document and the names on it. We keep them for 90 days, for the LiveDoc team only." A screenshot is
   off by default for every report: a document is often private work. Capture Screen pictures the page behind the
   form, without the form; Upload Image picks a file; an image pasted (Ctrl or Cmd+V) anywhere in the form or dropped
   on it attaches the same way ("Or paste or drop an image here."). A paste without an image stays with the field it
   lands in. Either replaces what is attached. A preview shows what will be sent ("Screenshot to send"), with "Remove
   Screenshot" beside it, so a picture is only sent after the reporter has seen it and could remove it; removing it
   moves focus to "Capture Screen". "Screenshot added." is announced politely.
4. **What's Attached** (a closed disclosure): every context line in plain words (page, from, mode, tab kind, share role,
   app version, browser and system, screen size, online, the number of recent errors), "You": "Your account id" or
   "Your guest id" (or "No id: you are not signed in" when the browser has none), and the screenshot when one is
   attached.
5. **Send Report**, in the footer with any send error. Enter in the title sends. While a capture runs, Send reads
   "Sending…" and sends once the capture ends, with its picture, or without one when it failed.

The form asks for no email and no steps to reproduce: the details hold whatever the reporter wants to add.

**The screenshot** is encoded in the browser: scaled so its longer side is at most 1,600 px, encoded as WebP (JPEG
where WebP is unavailable), the quality stepped down until it fits 1 MB. A capture that fails says "Could not capture
the screen. Upload an image instead."; an image that cannot be decoded or fit says "That image could not be attached.
Try a smaller one." Types accepted: PNG, JPEG, WebP. The capture library loads only on the first capture.

**After sending** the form stays open on a confirmation: "Thanks for the report", then "Logged as report #<n>." when
it was filed, or "Saved; we will file it shortly." when it was stored. No link is shown: the board is private. Focus
moves to the confirmation; "Done" closes the form and clears it.

**The draft**: what the reporter writes and attaches is kept in this browser while they work, so closing the form,
reloading or leaving the page loses nothing: the next opening, from any entry or `/report-a-bug`, continues it. The
title and details are saved as they are typed; the screenshot (captured, uploaded, pasted or dropped) once it is
attached, and forgotten when it is removed. A report sent (filed or stored) clears the draft, and so does emptying both
fields with no screenshot attached; a failed send keeps it. One draft per browser, shared by its tabs: the last write
wins. When the browser cannot keep the screenshot (its storage is full or refused), the words are still kept and the
screenshot lasts only while the form is open.

**On failure** the form keeps every field and says: "You have sent a few reports just now. Try again in a few
minutes." for `429`; "The screenshot is too large. Remove it or choose a smaller one." for `413`; otherwise "Sending
failed. Please try again."

## Context

`collectBugReportContext` builds the context when the reporter sends:

- **route**: the page, `pageViewPath(location.pathname)`: every document is `/document`, a form link `/form`, and
  any id-shaped segment and what follows it are dropped; `/` when the path cannot be expressed safely. No document id,
  share code or query ever leaves the browser.
- **from**: on `/report-a-bug`, the page the reporter came from (`?from=`), reduced the same way.
- **mode** and **tabKind**: the editor mode (`diagram`, `draw`, `workshop`, `pages`, `plan`) and the open tab's kind,
  when an editor is open. The editor publishes them while mounted (`useBugReportPlace`).
- **shareRole**: `owner` on one's own document, else the link's level (`edit`, `participate`, `view`), when a
  document is open.
- **release**: the build id (`EDITOR_BUILD_ID`), when the build has one.
- **userAgent**: `navigator.userAgent`, cut to 512 characters; shown and filed as browser and system
  (`describeUserAgent`: "Chrome 141 on Windows").
- **viewport**: `innerWidth`, `innerHeight` and `devicePixelRatio`.
- **online**: `navigator.onLine`.
- **recentErrors**: the newest five client errors, newest last, from a ring buffer installed at boot that records
  uncaught errors, unhandled rejections, render crashes caught by an error boundary and failed api requests. Each is
  `{ at, source, message }`, its message redacted (`redactErrorText`: emails, URLs, UUIDs, long tokens and numbers
  replaced) and cut to 200 characters. The buffer is kept in `sessionStorage` too, so the report page a crash links to
  still carries the crash.

## Filing

The browser posts the report to `POST /api/bug-reports` with its identity (a session token, else the guest id), as
every api call does. A report never waits on sign-in: when no token can be had it goes without one.

The api, in order:

1. Refuses any method but `POST` (`405`), a body over 1.5 MB (`413`), and a visitor over the limit (`429` with
   `Retry-After`). The limit is the `BUG_REPORT_RATE_LIMITER` binding (a burst gate per network) and **5 reports per
   600 s per visitor**, counted in D1 (`bug_report_windows`): the visitor is the reporter's id, else their network.
   Absent binding or a D1 failure on the count lets the report through, logged.
2. Parses the body (`parseBugReportSubmission`): malformed JSON or a refused submission is `400`. The title is trimmed
   and required; every field is bounded; a context the parser cannot read is dropped (logged) and the report goes on
   without it; a bad screenshot is refused. Any other field is dropped.
3. Resolves the reporter from the request's identity: a verified account (session, token or workbench owner) is an
   **account**, a guest id (signature-checked where the host signs them) a **guest**, none **anonymous**. Never from
   the body.
4. **Screenshot**: checks the decoded bytes start with the claimed type's signature (`400` otherwise), then puts them
   in the `BUG_SCREENSHOTS` R2 bucket under `bug-reports/<reporter tag>/<uuid>.<ext>` (the tag is a hash of the
   reporter's id, or `anonymous`). An absent bucket or a failed put is logged and the report goes on without it.
5. **Files** it on the board, through the Bug Tracker's room and the item store (the same write a form response
   makes): a **Bug Report** card in the first column of the first board on the configured tab that takes that type.
6. When the board cannot take it, **stores** it in D1 `bug_reports` with the reason.

| Outcome                        | Response                                 |
| ------------------------------ | ---------------------------------------- |
| Filed                          | `201 { number }`                         |
| Stored                         | `202 { stored: true }`                   |
| Throttled                      | `429` `rate_limited`, with `Retry-After` |
| Body too large                 | `413` `payload_too_large`                |
| Invalid body                   | `400` `invalid_bug_report`               |
| Not filed and the store failed | `503` `bug_reports_unavailable`          |

**Never lost**: every report the board cannot take is stored, whatever the reason:

| Reason              | When                                                        |
| ------------------- | ----------------------------------------------------------- |
| `unconfigured`      | `BUG_REPORT_DOCUMENT_ID` or `BUG_REPORT_TAB_ID` is unset    |
| `document_missing`  | The document is gone (or in the Trash)                      |
| `board_missing`     | The tab is gone, is not a board tab, or holds no live board |
| `type_missing`      | The document has no Bug Report card type                    |
| `type_not_on_board` | No board on the tab takes Bug Report cards                  |
| `board_full`        | The document's item store is full                           |
| `board_busy`        | The item store stayed busy through its retries              |
| `room_unavailable`  | The document's room failed                                  |

The **scheduled refile** (every 15 minutes, on the every-minute cron) files up to 20 stored reports, oldest first,
when the Bug Tracker is configured; a filed row is deleted, one still refused keeps its row with the new reason and its
attempt count. Every path logs under `[bug-reports]`.

## The Bug Tracker board

The Bug Tracker is a document in the hosted operator's account, unshared, with:

- a **Board tab** (its id is `BUG_REPORT_TAB_ID`; a board on any other tab is not found), whose board has the columns **Reported**, **Triaged**, **In Progress**,
  **Fixed** and **Won't Fix**, Fixed and Won't Fix done columns; reports land in the first column;
- a card type labelled **Bug Report** with the custom fields **Severity** (Choice: Low, Medium, High, Critical),
  **Context** (Long Text), **Screenshot** (Link), **Reporter** (Text) and **Release** (Text).

The card a report makes (`bugReportCard`):

- **Title**: the report's title.
- **Description** (the card's Details): the report's details, when given.
- **Severity**: unset; triage sets it.
- **Context**: one line per context entry, in the form's words ("Page: /document", "Mode: Draw", "Recent errors:" then
  one line each).
- **Screenshot**: the screenshot page's link, when one is attached.
- **Reporter**: "Account `<id>`", "Guest `<id>`" or "Anonymous".
- **Release**: the build id, when known.

Fields are matched to the type by label, case apart; a field the type does not have goes into the Description under
its label, so nothing is lost when the board's type is edited.

The board is read and worked with the CLI and MCP, like any document.

## Screenshots

A filed card's Screenshot is a link to `/report-a-bug/screenshot?key=<key>`, a page of the editor app that fetches
`GET /api/bug-reports/screenshots/<key>` with the viewer's identity and shows the picture. The api serves it **only to
the Bug Tracker's owner** (the configured document's owner, by the request's resolved identity); anyone else, an
unknown or expired key, or an unconfigured host, gets the same `404` `screenshot_not_found`. A hit is served with its stored type,
`Cache-Control: private, max-age=3600`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy:
default-src 'none'`. Agents read it with their token the same way.

The bucket expires every object 90 days after upload (an R2 lifecycle rule). Deleting an account deletes its stored
reports and its screenshots (the objects under its reporter tag). A screenshot sent as a guest who later signed up stays
under the guest's tag until it expires.

## Self-hosting

Every binding is optional. Without `BUG_REPORT_DOCUMENT_ID` and `BUG_REPORT_TAB_ID`, reports are stored with reason
`unconfigured` (read them with `wrangler d1 execute`), and the reporter still sees "Saved; we will file it shortly.".
Without `BUG_SCREENSHOTS`, reports go without their screenshot. Without the rate limiter binding, only the D1 window
limits.

## Privacy

- A screenshot is opt-in per report, shown before sending, kept 90 days, and served only to the Bug Tracker's owner.
- An unsent draft, its screenshot included, stays in the reporter's browser only, until it is sent or emptied.
- The context names no document, share code, query, email or person; error messages are redacted.
- The reporter is an id with its kind, never an email or a name.
- The privacy policy says so under what we store; the terms name the 90 days.

## Telemetry

Opening the form emits `track('Feedback', 'Opened', 'Bug')`; a report sent (filed or stored) emits
`track('Feedback', 'Completed', 'Bug')`.

## Decisions

- **A private Plan board, not GitHub issues** (Webber, 2026-10-28): the repository is public.
- **Configured by two plain vars**: an id is not a secret, and the document is private and unshared.
- **Stored, never lost**: a D1 row with its reason, refiled on a schedule.
- **Anyone can report**, not gated by share role: reporting reaches no shared document.
- **Screenshot off by default**, at most 1,600 px and 1 MB, 90 days, owner only.
- **A draft kept in the browser** (Webber, 2026-11-07): closing the form never wipes it; local storage, screenshot
  included.
- **One form, many entries**; other apps link to `/report-a-bug` rather than carrying a second form.
- **5 per 600 s per visitor**: the binding's longest period is 60 s, so the binding gates bursts per network and a D1
  fixed window holds the 600 s count.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D11** How long a user agent may be: 512 characters, Minigames' bound (default).
- **D12** How often stored reports are refiled: Every 15 minutes, on the every-minute cron (default).
- **D13** How many a refile files: 20, oldest first (default).
- **D14** How a screenshot is fitted to 1 MB: WebP (JPEG where unsupported), quality 0.9 stepping down by 0.1 to 0.4,
  then refused (default).
- **D15** Which board column a report lands in: The first column of the first live board on the tab that takes Bug
  Report cards (default).
- **D16** How the card's fields are found: By label, case apart; a missing field's value goes into Details under its
  label (default).
