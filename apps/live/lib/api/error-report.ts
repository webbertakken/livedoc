// Error telemetry hook for the api client (docs/specs/017-telemetry/telemetry.md 'Error' category). This
// module can't import lib/telemetry directly: it sits under the
// user-preferences -> api-client import cycle that already forced the emitter
// lazy, so the editor's boot registers a reporter instead (same module-level
// pattern as setTokenProvider in core.ts). A no-op while unwired (SSR, tests,
// other hosts of this lib).
//
// Two failures reach it, each labelled with WHERE, from closed vocabularies:
//
//   - a non-2xx response: `Http<status>.<Action>.<Code>`
//     (`Http403.SaveTab.Forbidden`), the action being the caller's own intent
//     string and the code the worker's snake_case `error` token. Reporting
//     only the status made a spike unattributable: 297 `Http403` in a day
//     tells you something is being refused and nothing about what, and 8
//     `Http401.SaveTab` could have been any of three different rules.
//   - a request that never got a response (fetch rejected: DNS, CORS, a
//     dropped connection): `Network.<Method>.<Route>`
//     (`Network.Put.Documents.Tabs`), since apiFetch sees the URL but not the
//     caller's action. The route label keeps only the api's fixed route words,
//     never an id or share code.
//   - a signed-in owner with no session token, whose request is never sent
//     (core.ts SessionTokenUnavailableError): `Auth.NoSessionToken`.
//   - any other autosave failure (reportSaveFailure): `SaveFailed.<Kind>`.
//     Without it, a throw outside the api client showed "Couldn't save your
//     changes" and left no trace at all.
//   - a request a workbench frame refused unsent: `Confined.<Method>.<Route>`.
//   - any other failure of a load that only says "Couldn't load" (reportLoadFailure):
//     `LoadFailed.<Surface>.<Kind>`.
//
// Each type reports at most ERROR_EMIT_CAP_PER_TYPE times per page load, the
// same budget the uncaught-error path has (docs/specs/017-telemetry/telemetry.md). A request that fails in
// a loop floods as hard as a throw that does: one editor stuck refetching a
// forbidden tab sent `Http403.LoadTab` every 15 to 65 seconds for weeks,
// nearly half of every stored event.
import { apiRouteLabel, errorNameToken, errorTypeToken, readErrorCode } from '@livedoc/api-schema';
import { createPerTypeCap } from '@livedoc/telemetry-client';

let apiErrorReporter: ((type: string) => void) | null = null;
let allowReport = createPerTypeCap();

// Failures already reported where they happened, so the autosave's catch-all
// (reportSaveFailure) doesn't count them a second time.
const reported = new WeakSet<object>();

export function markReported(err: unknown): void {
  if (typeof err === 'object' && err !== null) reported.add(err);
}

// Wiring a reporter (or clearing it) starts a fresh budget and drops any held network report, so a test, or a
// host that re-registers, isn't charged for reports made before it. It also starts watching the page leave.
export function setApiErrorReporter(fn: ((type: string) => void) | null): void {
  apiErrorReporter = fn;
  allowReport = createPerTypeCap();
  dropHeldNetworkReports();
  watchPageLeaves();
}

function report(type: string): void {
  try {
    if (!apiErrorReporter || !allowReport(type)) return;
    apiErrorReporter(type);
  } catch {
    // Telemetry can never throw into the caller's error handling.
  }
}

// The worker's `error` field is a snake_case token (`sign_in_required`) on
// almost every route; the few that put a sentence there are left out.
const ERROR_CODE_TOKEN = /^[a-z][a-z0-9_]*$/;

// The api-client's intent string ('save tab') becomes a PascalCase suffix
// ('SaveTab'), then the worker's error token ('Forbidden'). Safe by construction: these strings are written in lib/api,
// never derived from anything a user typed, and errorTypeToken keeps only
// letters and digits so a future one can't smuggle in a path, id, or share
// code.
export function apiErrorType(status: number, action: string, code: string | null = null): string {
  const token = code && ERROR_CODE_TOKEN.test(code) ? code : null;
  return errorTypeToken(`Http${status}`, action, token);
}

export function reportApiError(status: number, action: string, code: string | null = null): void {
  report(apiErrorType(status, action, code));
}

// A failed response, counted once however many helpers read it (`reportServerError`, then an `expectOk*`).
export function reportResponseFailure(res: Response, action: string, code: string | null): void {
  if (reported.has(res)) return;
  reported.add(res);
  reportApiError(res.status, action, code);
}

// A response its reader judges for itself rather than through expectOk* (a read that answers null or a fallback on
// failure). A 5xx is never an answer the reader expected, so it is reported here as `Http<status>.<Action>.<Code>`,
// once per response however many helpers read it; a 4xx stays the reader's to judge
// (docs/specs/017-telemetry/telemetry.md). The body is read from a clone, so the reader can still read it. It lives
// here rather than in core.ts so a page kept free of editor modules (a form link's) can report too.
export async function reportServerError(res: Response, action: string): Promise<void> {
  const isServerError = res.status >= 500 && res.status <= 599;
  if (!isServerError) return;
  reportResponseFailure(res, action, await readErrorCode(res));
}

// Warnings (`Error·Warning`): a degradation the load was carried through rather than stopped by, such
// as a session token or the offline store giving up (docs/specs/007-editor/load-recovery.md). Same
// wiring and per-type cap as the error reports; the boot registers where they go.
let apiWarningReporter: ((type: string) => void) | null = null;

export function setApiWarningReporter(fn: ((type: string) => void) | null): void {
  apiWarningReporter = fn;
}

export function reportApiWarning(type: string): void {
  try {
    if (!apiWarningReporter || !allowReport(type)) return;
    apiWarningReporter(type);
  } catch {
    // Telemetry can never throw into the caller.
  }
}

export function reportNoSessionToken(): void {
  report('Auth.NoSessionToken');
}

// The autosave's catch-all, so every failed save leaves a trace exactly once.
export function reportSaveFailure(err: unknown): void {
  if (typeof err === 'object' && err !== null && reported.has(err)) return;
  report(errorTypeToken('SaveFailed', errorNameToken(err)));
}

// A load's catch-all, for a surface that only says "Couldn't load" (a Sheet): `LoadFailed.<Surface>.<Kind>`,
// unless the api client reported the failure already (WB70).
export function reportLoadFailure(surface: string, err: unknown): void {
  if (typeof err === 'object' && err !== null && reported.has(err)) return;
  report(errorTypeToken('LoadFailed', surface, errorNameToken(err)));
}

// A request a workbench frame refused unsent (workbench-confinement.ts): `Confined.<Method>.<Route>`, so a tab that
// cannot load in a frame names the route it was refused (docs/specs/013-workspace/workbench-embeds.md WB70).
export function reportConfinedRequest(method: string, url: string): void {
  report(errorTypeToken('Confined', apiRouteLabel(method, url)));
}

export function networkErrorType(method: string, url: string): string {
  return errorTypeToken('Network', apiRouteLabel(method, url));
}

// How long a network report waits before it is sent, so a page leave can take it back
// (docs/specs/017-telemetry/telemetry.md `Network.*`). Firefox rejects every request in flight the moment a page
// starts to leave, and fires `pagehide` only when the next page arrives: measured at 34 to 213 ms on docs.nu, and
// 4.1 s when the next page took 4 s. 10 s covers five times the web's "poor" time to first byte (1.8 s). Safe range
// 3 s to 30 s: shorter reports slow leaves as drops, longer loses more real drops to a leave that follows them.
export const NETWORK_REPORT_GRACE_MS = 10_000;

// Which life of the page this is: each `pagehide` starts a new one, so a request sent before it, rejected after a
// return from the back/forward cache, is known to have been lost on the way out.
let pageLife = 0;
const heldNetworkReports = new Set<ReturnType<typeof setTimeout>>();
let watchedPage: EventTarget | null = null;

export function currentPageLife(): number {
  return pageLife;
}

function dropHeldNetworkReports(): void {
  for (const timer of heldNetworkReports) clearTimeout(timer);
  heldNetworkReports.clear();
}

function onPageHide(): void {
  pageLife += 1;
  dropHeldNetworkReports();
}

// `pagehide`, never `unload` or `beforeunload`: neither of those keeps a page out of the back/forward cache.
function watchPageLeaves(): void {
  const page = typeof window === 'undefined' ? null : window;
  if (page === watchedPage) return;
  watchedPage?.removeEventListener('pagehide', onPageHide);
  page?.addEventListener('pagehide', onPageHide);
  watchedPage = page;
}

// A rejected fetch, reported as `Network.<Method>.<Route>` once the grace period ends with the page still there.
// Three rejections are not faults and stay out of the count: an abort is the caller cancelling on purpose, a
// browser that knows it is offline is the user's connection, not ours (it would also report every autosave retry
// until the connection came back), and a page leave is the browser cancelling what the page no longer needs.
export function reportNetworkError(
  request: { method: string; url: string; sentInLife: number },
  err: unknown,
): void {
  // Decided here either way, so the autosave catch-all never recounts it.
  markReported(err);
  if (err instanceof Error && err.name === 'AbortError') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (request.sentInLife !== pageLife) return;
  const type = networkErrorType(request.method, request.url);
  const timer = setTimeout(() => {
    heldNetworkReports.delete(timer);
    report(type);
  }, NETWORK_REPORT_GRACE_MS);
  heldNetworkReports.add(timer);
}
