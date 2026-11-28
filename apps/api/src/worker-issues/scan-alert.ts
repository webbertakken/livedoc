// Cloudflare's scan alerts (docs/specs/016-platform/worker-issues.md "Vulnerability scans"): a probe the site answered
// 404 or static is a log line; one it may have answered with something else is the day's digest card.
import { isSecurityIssue, type WorkerIssue } from '@livedoc/api-schema';

export type ScanVerdict = 'not_scan' | 'not_answered' | 'answered';

const SCAN_TITLE = 'potential vulnerability scan';

// The workers that serve only the built site, by their names in apps/router and apps/live `wrangler.toml`.
const STATIC_SITE_WORKERS: ReadonlySet<string> = new Set(['docs-nu-router', 'docs-nu-live']);

const isSuccess = (status: number) => status >= 200 && status < 300;

export function scanVerdictOf(issue: WorkerIssue): ScanVerdict {
  if (!isSecurityIssue(issue) || !issue.title?.toLowerCase().startsWith(SCAN_TITLE))
    return 'not_scan';
  if (issue.worker !== undefined && STATIC_SITE_WORKERS.has(issue.worker)) return 'not_answered';
  if (issue.status !== undefined && !isSuccess(issue.status)) return 'not_answered';
  return 'answered';
}

// The one delivery key every answered scan of a UTC day shares, so the first files and the rest are repeats.
export const scanDigestKey = (now: number) =>
  `scan-digest:${new Date(now).toISOString().slice(0, 10)}`;
