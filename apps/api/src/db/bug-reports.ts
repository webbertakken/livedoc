// Bug reports in D1 (docs/specs/016-platform/bug-reports.md "Filing"): the reports
// the Bug Tracker's board could not take, kept with the reason until the refile files them, and the 600 s report
// window per visitor.
import { parseBugReportContext, type BugReportFiling, type BugReporter } from '@livedoc/api-schema';
import type { Env } from '../types';

// Why the board did not take a report (the spec's reason table).
export type BugReportStoreReason =
  | 'unconfigured'
  | 'document_missing'
  | 'board_missing'
  | 'type_missing'
  | 'type_not_on_board'
  | 'board_full'
  | 'board_busy'
  | 'room_unavailable';

// Five reports per 600 s per visitor (docs/specs/016-platform/bug-reports.md "Filing" step 1).
export const BUG_REPORT_WINDOW_MS = 600_000;
export const BUG_REPORT_WINDOW_MAX = 5;

export type StoredBugReport = {
  id: string;
  filing: BugReportFiling;
  screenshotKey: string | null;
  reason: BugReportStoreReason;
  attempts: number;
  createdAt: number;
};

type Row = {
  id: string;
  owner_id: string | null;
  reporter_kind: string;
  title: string;
  details: string | null;
  context: string | null;
  screenshot_key: string | null;
  screenshot_url: string | null;
  reason: BugReportStoreReason;
  attempts: number;
  created_at: number;
};

function reporterOf(row: Row): BugReporter {
  if (row.owner_id === null) return { kind: 'anonymous', id: null };
  return { kind: row.reporter_kind === 'account' ? 'account' : 'guest', id: row.owner_id };
}

function contextOf(raw: string | null) {
  if (!raw) return null;
  try {
    return parseBugReportContext(JSON.parse(raw));
  } catch {
    return null;
  }
}

function toStored(row: Row): StoredBugReport {
  const filing: BugReportFiling = { title: row.title, reporter: reporterOf(row) };
  if (row.details) filing.details = row.details;
  const context = contextOf(row.context);
  if (context) filing.context = context;
  if (row.screenshot_url) filing.screenshotUrl = row.screenshot_url;
  return {
    id: row.id,
    filing,
    screenshotKey: row.screenshot_key,
    reason: row.reason,
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

// Answers the new row's id.
export async function storeBugReport(
  env: Env,
  report: { filing: BugReportFiling; screenshotKey: string | null; reason: BugReportStoreReason },
  now: number,
): Promise<string> {
  const { filing, screenshotKey, reason } = report;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO bug_reports (id, owner_id, reporter_kind, title, details, context, screenshot_key, screenshot_url,
       reason, attempts, created_at, last_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      filing.reporter.id,
      filing.reporter.kind,
      filing.title,
      filing.details ?? null,
      filing.context ? JSON.stringify(filing.context) : null,
      screenshotKey,
      filing.screenshotUrl ?? null,
      reason,
      now,
      now,
    )
    .run();
  return id;
}

// The oldest stored reports, at most `limit`.
export async function listDueBugReports(env: Env, limit: number): Promise<StoredBugReport[]> {
  const rows = await env.DB.prepare(
    `SELECT id, owner_id, reporter_kind, title, details, context, screenshot_key, screenshot_url, reason, attempts,
       created_at
     FROM bug_reports ORDER BY created_at, id LIMIT ?`,
  )
    .bind(limit)
    .all<Row>();
  return (rows.results ?? []).map(toStored);
}

export async function noteBugReportAttempt(
  env: Env,
  id: string,
  reason: BugReportStoreReason,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE bug_reports SET reason = ?, attempts = attempts + 1, last_attempt_at = ? WHERE id = ?',
  )
    .bind(reason, now, id)
    .run();
}

export async function deleteBugReport(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM bug_reports WHERE id = ?').bind(id).run();
}

// One report counted against the visitor's fixed 600 s window: allowed, or how long until the window ends.
export async function claimBugReportSlot(
  env: Env,
  visitor: string,
  now: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const expired = now - BUG_REPORT_WINDOW_MS;
  const row = await env.DB.prepare(
    `INSERT INTO bug_report_windows (visitor, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(visitor) DO UPDATE SET
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING window_start, count`,
  )
    .bind(visitor, now, expired)
    .first<{ window_start: number; count: number }>();
  if (!row || row.count <= BUG_REPORT_WINDOW_MAX) return { allowed: true };
  const left = row.window_start + BUG_REPORT_WINDOW_MS - now;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(left / 1000)) };
}

// The daily sweep: windows that started before `cutoff` count nothing any more.
export async function deleteOldBugReportWindows(env: Env, cutoff: number): Promise<number> {
  const res = await env.DB.prepare('DELETE FROM bug_report_windows WHERE window_start < ?')
    .bind(cutoff)
    .run();
  return res.meta.changes ?? 0;
}
