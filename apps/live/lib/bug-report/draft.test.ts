// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUG_REPORT_DRAFT_KEY,
  BUG_REPORT_DRAFT_SCREENSHOT_KEY,
  clearBugReportDraft,
  readBugReportDraft,
  saveBugReportDraftScreenshot,
  saveBugReportDraftText,
} from './draft';

// docs/specs/016-platform/bug-reports.md "The form" (the draft).

const shot = { contentType: 'image/webp', data: 'AAAA' } as const;

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('bug report draft', () => {
  it('reads an empty draft when nothing is kept', () => {
    expect(readBugReportDraft()).toEqual({ title: '', details: '', screenshot: null });
  });

  it('keeps the words and the screenshot apart, and reads both back', () => {
    saveBugReportDraftText({ title: 'Save fails', details: 'Spins' });
    expect(saveBugReportDraftScreenshot(shot)).toBe(true);
    expect(localStorage.getItem(BUG_REPORT_DRAFT_KEY)).not.toContain('AAAA');
    expect(readBugReportDraft()).toEqual({
      title: 'Save fails',
      details: 'Spins',
      screenshot: shot,
    });
  });

  it('forgets the words once both fields are empty, and the screenshot once removed', () => {
    saveBugReportDraftText({ title: 'x', details: '' });
    saveBugReportDraftScreenshot(shot);
    saveBugReportDraftText({ title: '', details: '' });
    saveBugReportDraftScreenshot(null);
    expect(localStorage.getItem(BUG_REPORT_DRAFT_KEY)).toBeNull();
    expect(localStorage.getItem(BUG_REPORT_DRAFT_SCREENSHOT_KEY)).toBeNull();
  });

  it('clears the whole draft', () => {
    saveBugReportDraftText({ title: 'x', details: 'y' });
    saveBugReportDraftScreenshot(shot);
    clearBugReportDraft();
    expect(readBugReportDraft()).toEqual({ title: '', details: '', screenshot: null });
  });

  it('reads anything unreadable as absent, field by field', () => {
    localStorage.setItem(BUG_REPORT_DRAFT_KEY, JSON.stringify({ title: 3, details: 'kept' }));
    localStorage.setItem(
      BUG_REPORT_DRAFT_SCREENSHOT_KEY,
      '{"contentType":"text/html","data":"AAAA"}',
    );
    expect(readBugReportDraft()).toEqual({ title: '', details: 'kept', screenshot: null });
    localStorage.setItem(BUG_REPORT_DRAFT_KEY, 'not json');
    expect(readBugReportDraft().title).toBe('');
  });

  it('cuts the words to the form limits', () => {
    localStorage.setItem(
      BUG_REPORT_DRAFT_KEY,
      JSON.stringify({ title: 'a'.repeat(500), details: '' }),
    );
    expect(readBugReportDraft().title).toHaveLength(200);
  });

  it('says so, and logs, when the browser refuses the screenshot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(saveBugReportDraftScreenshot(shot)).toBe(false);
    expect(warn).toHaveBeenCalledWith('[bug-reports] draft.screenshot-unsaved', expect.anything());
  });
});
