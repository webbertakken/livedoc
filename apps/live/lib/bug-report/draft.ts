// The unsent Report a Bug form, kept in this browser (docs/specs/016-platform/bug-reports.md "The form", the draft):
// closing the form never wipes what was written or attached. The words and the screenshot are two keys, so typing
// never rewrites the picture. Everything read back is untrusted: it survives releases and may be edited by hand.
import {
  BUG_REPORT_LIMITS,
  parseBugReportScreenshot,
  type BugReportScreenshot,
} from '@livedoc/api-schema';
import {
  readLocalStorageSafe,
  removeLocalStorageSafe,
  safeJson,
  storedRecord,
  writeLocalStorageSafe,
} from '../local-storage-safe';

export const BUG_REPORT_DRAFT_KEY = 'livedoc:v2:bug-report-draft';
export const BUG_REPORT_DRAFT_SCREENSHOT_KEY = 'livedoc:v2:bug-report-draft-screenshot';

export type BugReportDraftText = { title: string; details: string };
export type BugReportDraft = BugReportDraftText & { screenshot: BugReportScreenshot | null };

const text = (value: unknown, limit: number) =>
  typeof value === 'string' ? value.slice(0, limit) : '';

export function readBugReportDraft(): BugReportDraft {
  const words = storedRecord(readLocalStorageSafe(BUG_REPORT_DRAFT_KEY) ?? '');
  const shot = readLocalStorageSafe(BUG_REPORT_DRAFT_SCREENSHOT_KEY);
  return {
    title: text(words?.title, BUG_REPORT_LIMITS.title),
    details: text(words?.details, BUG_REPORT_LIMITS.details),
    screenshot: shot === null ? null : parseBugReportScreenshot(safeJson(shot)),
  };
}

export function saveBugReportDraftText({ title, details }: BugReportDraftText): void {
  if (!title && !details) return removeLocalStorageSafe(BUG_REPORT_DRAFT_KEY);
  writeLocalStorageSafe(BUG_REPORT_DRAFT_KEY, JSON.stringify({ title, details }));
}

// False when the browser refused the picture (storage full or denied): the form keeps it for this opening only.
export function saveBugReportDraftScreenshot(screenshot: BugReportScreenshot | null): boolean {
  if (!screenshot) {
    removeLocalStorageSafe(BUG_REPORT_DRAFT_SCREENSHOT_KEY);
    return true;
  }
  try {
    window.localStorage.setItem(BUG_REPORT_DRAFT_SCREENSHOT_KEY, JSON.stringify(screenshot));
    return true;
  } catch (error) {
    // A stale picture must not come back in place of the one the reporter now sees.
    removeLocalStorageSafe(BUG_REPORT_DRAFT_SCREENSHOT_KEY);
    console.warn('[bug-reports] draft.screenshot-unsaved', { error: String(error) });
    return false;
  }
}

export function clearBugReportDraft(): void {
  removeLocalStorageSafe(BUG_REPORT_DRAFT_KEY);
  removeLocalStorageSafe(BUG_REPORT_DRAFT_SCREENSHOT_KEY);
}
