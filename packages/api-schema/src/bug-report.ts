// A bug report as the browser sends it (docs/specs/016-platform/bug-reports.md):
// the submission, the context the browser attaches by itself, an opt-in screenshot, and the bounded parsers the api
// runs on all of it. The editor builds the same shapes, so both read one definition.
import { EDITOR_MODES, TAB_KINDS, type EditorMode, type TabKind } from '@livedoc/document';
import { ACCESS_LEVELS, type AccessLevel } from './access-levels';
import { isValidPageViewPath } from './page-views';

// Every bound a report is held to.
export const BUG_REPORT_LIMITS = {
  title: 200,
  details: 5000,
  userAgent: 512,
  errorMessage: 200,
  recentErrors: 5,
  // Decoded bytes of a screenshot: 1 MB.
  screenshotBytes: 1_048_576,
  // The longer side of a screenshot, in pixels.
  screenshotSide: 1600,
  // The whole request body: a 1 MB screenshot in base64 and the rest.
  bodyBytes: 1_500_000,
} as const;

export const BUG_REPORT_ERROR_SOURCES = ['uncaught', 'rejection', 'render', 'api'] as const;
export type BugReportErrorSource = (typeof BUG_REPORT_ERROR_SOURCES)[number];

export type BugReportRecentError = {
  at: string;
  source: BugReportErrorSource;
  message: string;
};

export type BugReportShareRole = 'owner' | AccessLevel;

export type BugReportContext = {
  // The page, as pageViewPath reduces it: never an id.
  route: string;
  // On /report-a-bug: the page of another site the reporter came from.
  from?: string;
  mode?: EditorMode;
  tabKind?: TabKind;
  shareRole?: BugReportShareRole;
  release?: string;
  userAgent?: string;
  viewport: { width: number; height: number; pixelRatio: number };
  online: boolean;
  // True when the page runs inside another page's frame; left out otherwise.
  embedded?: true;
  // Newest last.
  recentErrors: BugReportRecentError[];
};

export const BUG_REPORT_SCREENSHOT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type BugReportScreenshotType = (typeof BUG_REPORT_SCREENSHOT_TYPES)[number];

export type BugReportScreenshot = { contentType: BugReportScreenshotType; data: string };

export type BugReportSubmission = {
  title: string;
  details?: string;
  context?: BugReportContext;
  screenshot?: BugReportScreenshot;
};

export type BugReportProblem =
  'not_an_object' | 'title_missing' | 'title_too_long' | 'details_too_long' | 'screenshot_invalid';

export type BugReportParse =
  | { ok: true; submission: BugReportSubmission; contextDropped: boolean }
  | { ok: false; problem: BugReportProblem };

// The api's answers (docs/specs/016-platform/bug-reports.md "Filing").
export type BugReportFiledResponse = { number: number };
export type BugReportStoredResponse = { stored: true };

const RELEASE = /^[A-Za-z0-9._-]{1,64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const VIEWPORT_MAX = 100_000;
const PIXEL_RATIO_MAX = 16;
const AT_MAX = 40;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

const isPath = (v: unknown): v is string => typeof v === 'string' && isValidPageViewPath(v);

const inRange = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

function parseViewport(raw: unknown): BugReportContext['viewport'] | null {
  if (!isRecord(raw)) return null;
  const { width, height, pixelRatio } = raw;
  if (!inRange(width, VIEWPORT_MAX) || !inRange(height, VIEWPORT_MAX)) return null;
  if (!inRange(pixelRatio, PIXEL_RATIO_MAX)) return null;
  return { width: Math.round(width), height: Math.round(height), pixelRatio };
}

function parseRecentError(raw: unknown): BugReportRecentError | null {
  if (!isRecord(raw) || !oneOf(BUG_REPORT_ERROR_SOURCES, raw.source)) return null;
  if (typeof raw.at !== 'string' || typeof raw.message !== 'string') return null;
  return {
    at: raw.at.slice(0, AT_MAX),
    source: raw.source,
    message: raw.message.slice(0, BUG_REPORT_LIMITS.errorMessage),
  };
}

// The context, or null when its required parts are missing or malformed; optional parts out of bounds are left out.
export function parseBugReportContext(raw: unknown): BugReportContext | null {
  if (!isRecord(raw) || !isPath(raw.route)) return null;
  const viewport = parseViewport(raw.viewport);
  if (!viewport || typeof raw.online !== 'boolean' || !Array.isArray(raw.recentErrors)) return null;
  const recentErrors = raw.recentErrors
    .map(parseRecentError)
    .filter((e): e is BugReportRecentError => e !== null)
    .slice(-BUG_REPORT_LIMITS.recentErrors);
  const context: BugReportContext = {
    route: raw.route,
    viewport,
    online: raw.online,
    recentErrors,
  };
  if (isPath(raw.from)) context.from = raw.from;
  if (oneOf(EDITOR_MODES, raw.mode)) context.mode = raw.mode;
  if (oneOf(TAB_KINDS, raw.tabKind)) context.tabKind = raw.tabKind;
  if (raw.shareRole === 'owner' || oneOf(ACCESS_LEVELS, raw.shareRole))
    context.shareRole = raw.shareRole;
  if (typeof raw.release === 'string' && RELEASE.test(raw.release)) context.release = raw.release;
  if (typeof raw.userAgent === 'string' && raw.userAgent)
    context.userAgent = raw.userAgent.slice(0, BUG_REPORT_LIMITS.userAgent);
  if (raw.embedded === true) context.embedded = true;
  return context;
}

// How many bytes base64 text decodes to.
export const base64DecodedLength = (data: string) =>
  Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);

// The screenshot, or null for an unknown type, data that is not base64, or more than the limit once decoded. Its
// bytes are checked against the type's signature where they are stored.
export function parseBugReportScreenshot(raw: unknown): BugReportScreenshot | null {
  if (!isRecord(raw) || !oneOf(BUG_REPORT_SCREENSHOT_TYPES, raw.contentType)) return null;
  const { data } = raw;
  if (typeof data !== 'string' || !BASE64.test(data)) return null;
  if (base64DecodedLength(data) > BUG_REPORT_LIMITS.screenshotBytes) return null;
  return { contentType: raw.contentType, data };
}

export function parseBugReportSubmission(raw: unknown): BugReportParse {
  if (!isRecord(raw)) return { ok: false, problem: 'not_an_object' };
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return { ok: false, problem: 'title_missing' };
  if (title.length > BUG_REPORT_LIMITS.title) return { ok: false, problem: 'title_too_long' };
  const submission: BugReportSubmission = { title };
  if (raw.details !== undefined) {
    if (typeof raw.details !== 'string') return { ok: false, problem: 'details_too_long' };
    const details = raw.details.trim();
    if (details.length > BUG_REPORT_LIMITS.details)
      return { ok: false, problem: 'details_too_long' };
    if (details) submission.details = details;
  }
  let contextDropped = false;
  if (raw.context !== undefined) {
    const context = parseBugReportContext(raw.context);
    if (context) submission.context = context;
    else contextDropped = true;
  }
  if (raw.screenshot !== undefined) {
    const screenshot = parseBugReportScreenshot(raw.screenshot);
    if (!screenshot) return { ok: false, problem: 'screenshot_invalid' };
    submission.screenshot = screenshot;
  }
  return { ok: true, submission, contextDropped };
}
