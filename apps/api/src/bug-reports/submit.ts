// POST /api/bug-reports (docs/specs/016-platform/bug-reports.md "Filing"): bounded,
// limited, parsed, its reporter resolved from the request, its screenshot stored, then filed on the Bug Tracker's
// board or stored in D1 with the reason. Every report the board cannot take is kept; only a failed store is lost.
import {
  BUG_REPORT_LIMITS,
  parseBugReportSubmission,
  type BugReportFiledResponse,
  type BugReportFiling,
  type BugReportStoredResponse,
} from '@livedoc/api-schema';
import { storeBugReport } from '../db/bug-reports';
import { json } from '../responses';
import type { RouteContext } from '../routes/context';
import { fileBugReport } from './file';
import { bugReportRateLimit } from './rate';
import { resolveBugReporter } from './reporter';
import { putBugScreenshot } from './screenshots';

const tooLarge = () => json({ error: 'payload_too_large' }, { status: 413 });
const invalid = (problem: string) =>
  json({ error: 'invalid_bug_report', problem }, { status: 400 });

// Where the card's Screenshot link opens: the editor app's screenshot page on this host.
function screenshotPageUrl(ctx: RouteContext, key: string): string {
  const base = ctx.env.APP_BASE_URL || ctx.request.headers.get('Origin') || ctx.url.origin;
  return `${base.replace(/\/$/, '')}/report-a-bug/screenshot?key=${encodeURIComponent(key)}`;
}

// The body as JSON, or null for text that is not: the parser refuses both alike.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function readBody(request: Request): Promise<string | Response> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > BUG_REPORT_LIMITS.bodyBytes) return tooLarge();
  const text = await request.text();
  return text.length > BUG_REPORT_LIMITS.bodyBytes ? tooLarge() : text;
}

export async function submitBugReport(ctx: RouteContext): Promise<Response> {
  const text = await readBody(ctx.request);
  if (text instanceof Response) {
    console.info('[bug-reports] report.refused', { problem: 'too_large' });
    return text;
  }
  const reporter = await resolveBugReporter(ctx);
  const rate = await bugReportRateLimit(ctx, reporter.id);
  if (!rate.allowed)
    return json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );

  const parsed = parseBugReportSubmission(parseJson(text));
  if (!parsed.ok) {
    console.info('[bug-reports] report.refused', { problem: parsed.problem });
    return invalid(parsed.problem);
  }
  const { submission } = parsed;
  if (parsed.contextDropped) console.warn('[bug-reports] context.dropped');
  console.info('[bug-reports] report.received', {
    reporter: reporter.kind,
    screenshot: Boolean(submission.screenshot),
  });

  const filing: BugReportFiling = { title: submission.title, reporter };
  if (submission.details) filing.details = submission.details;
  if (submission.context) filing.context = submission.context;
  let screenshotKey: string | null = null;
  if (submission.screenshot) {
    const put = await putBugScreenshot(ctx.env, reporter, submission.screenshot);
    if (put.kind === 'mismatch') {
      console.info('[bug-reports] report.refused', { problem: 'screenshot_invalid' });
      return invalid('screenshot_invalid');
    }
    if (put.kind === 'stored') {
      screenshotKey = put.key;
      filing.screenshotUrl = screenshotPageUrl(ctx, put.key);
      console.info('[bug-reports] screenshot.stored');
    } else {
      console.warn('[bug-reports] screenshot.unstored', { why: put.why });
    }
  }

  const outcome = await fileBugReport(ctx.env, filing);
  if (outcome.filed) {
    console.info('[bug-reports] report.filed', { number: outcome.number });
    const body: BugReportFiledResponse = { number: outcome.number };
    return json(body, { status: 201 });
  }
  try {
    await storeBugReport(ctx.env, { filing, screenshotKey, reason: outcome.reason }, Date.now());
  } catch (error) {
    console.error('[bug-reports] report.lost', { reason: outcome.reason, error: String(error) });
    return json({ error: 'bug_reports_unavailable' }, { status: 503 });
  }
  console.warn('[bug-reports] report.stored', { reason: outcome.reason });
  const body: BugReportStoredResponse = { stored: true };
  return json(body, { status: 202 });
}
