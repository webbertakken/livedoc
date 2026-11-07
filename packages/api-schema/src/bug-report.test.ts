import { describe, expect, it } from 'vitest';
import {
  BUG_REPORT_LIMITS,
  parseBugReportContext,
  parseBugReportScreenshot,
  parseBugReportSubmission,
  type BugReportContext,
} from './bug-report';
import { bytesToBase64 } from './bytes';

// docs/specs/016-platform/bug-reports.md "Filing" step 2.

const context = (extra: Partial<BugReportContext> = {}): BugReportContext => ({
  route: '/document',
  viewport: { width: 1280, height: 800, pixelRatio: 2 },
  online: true,
  recentErrors: [],
  ...extra,
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 1, 2]);

describe('parseBugReportSubmission', () => {
  it('takes a trimmed title and drops empty details', () => {
    const parsed = parseBugReportSubmission({ title: '  Save fails  ', details: '   ' });
    expect(parsed).toEqual({
      ok: true,
      submission: { title: 'Save fails' },
      contextDropped: false,
    });
  });

  it('keeps trimmed details, a context and a screenshot', () => {
    const shot = { contentType: 'image/png', data: bytesToBase64(PNG) };
    const parsed = parseBugReportSubmission({
      title: 'x',
      details: ' steps ',
      context: context(),
      screenshot: shot,
    });
    expect(parsed).toEqual({
      ok: true,
      submission: { title: 'x', details: 'steps', context: context(), screenshot: shot },
      contextDropped: false,
    });
  });

  it('drops fields it does not know, a client-sent reporter included', () => {
    const parsed = parseBugReportSubmission({ title: 'x', reporter: 'someone', steps: 'a' });
    expect(parsed.ok && parsed.submission).toEqual({ title: 'x' });
  });

  it.each([
    [null, 'not_an_object'],
    ['text', 'not_an_object'],
    [[], 'not_an_object'],
    [{}, 'title_missing'],
    [{ title: '   ' }, 'title_missing'],
    [{ title: 3 }, 'title_missing'],
    [{ title: 'x'.repeat(BUG_REPORT_LIMITS.title + 1) }, 'title_too_long'],
    [{ title: 'x', details: 'x'.repeat(BUG_REPORT_LIMITS.details + 1) }, 'details_too_long'],
    [{ title: 'x', details: 4 }, 'details_too_long'],
    [{ title: 'x', screenshot: { contentType: 'image/gif', data: 'AAAA' } }, 'screenshot_invalid'],
  ])('refuses %j as %s', (raw, problem) => {
    expect(parseBugReportSubmission(raw)).toEqual({ ok: false, problem });
  });

  it('takes a title of exactly the limit', () => {
    expect(parseBugReportSubmission({ title: 'x'.repeat(BUG_REPORT_LIMITS.title) }).ok).toBe(true);
  });

  it('drops a context it cannot read and says so', () => {
    const parsed = parseBugReportSubmission({ title: 'x', context: { route: 7 } });
    expect(parsed).toEqual({ ok: true, submission: { title: 'x' }, contextDropped: true });
  });
});

describe('parseBugReportContext', () => {
  it('reads a full context', () => {
    const full = context({
      from: '/help/contact',
      mode: 'draw',
      tabKind: 'board',
      shareRole: 'participate',
      release: 'abc123.1',
      userAgent: 'Mozilla/5.0',
      recentErrors: [{ at: '2026-10-28T10:00:00.000Z', source: 'api', message: 'Http500.SaveTab' }],
    });
    expect(parseBugReportContext(full)).toEqual(full);
  });

  it('drops optional fields that are out of their bounds', () => {
    const parsed = parseBugReportContext({
      ...context(),
      from: 'not a path',
      mode: 'paint',
      tabKind: 'spreadsheet',
      shareRole: 'admin',
      release: 'has space',
      userAgent: 7,
    });
    expect(parsed).toEqual(context());
  });

  it('cuts the user agent and error messages to their bounds', () => {
    const parsed = parseBugReportContext({
      ...context(),
      userAgent: 'u'.repeat(BUG_REPORT_LIMITS.userAgent + 10),
      recentErrors: [{ at: 'now', source: 'uncaught', message: 'm'.repeat(300) }],
    });
    expect(parsed?.userAgent).toHaveLength(BUG_REPORT_LIMITS.userAgent);
    expect(parsed?.recentErrors[0]?.message).toHaveLength(BUG_REPORT_LIMITS.errorMessage);
  });

  it('keeps only the newest recent errors and drops malformed ones', () => {
    const err = (n: number) => ({ at: `t${n}`, source: 'render', message: `e${n}` });
    const parsed = parseBugReportContext({
      ...context(),
      recentErrors: [
        err(1),
        { source: 'other', at: 'x', message: 'y' },
        5,
        err(2),
        err(3),
        err(4),
        err(5),
        err(6),
      ],
    });
    expect(parsed?.recentErrors.map((e) => e.message)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']);
  });

  it.each([
    ['no route', { ...context(), route: undefined }],
    ['an id-shaped route', { ...context(), route: '/document/x y' }],
    ['no viewport', { ...context(), viewport: undefined }],
    ['a negative width', { ...context(), viewport: { width: -1, height: 1, pixelRatio: 1 } }],
    ['a huge pixel ratio', { ...context(), viewport: { width: 1, height: 1, pixelRatio: 99 } }],
    ['online not a boolean', { ...context(), online: 'yes' }],
    ['recent errors not a list', { ...context(), recentErrors: 'none' }],
  ])('refuses a context with %s', (_label, raw) => {
    expect(parseBugReportContext(raw)).toBeNull();
  });
});

describe('parseBugReportScreenshot', () => {
  it('reads each accepted type', () => {
    for (const contentType of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      expect(parseBugReportScreenshot({ contentType, data: 'AAAA' })).toEqual({
        contentType,
        data: 'AAAA',
      });
    }
  });

  it.each([
    ['an unknown type', { contentType: 'image/svg+xml', data: 'AAAA' }],
    ['data that is not base64', { contentType: 'image/png', data: '***' }],
    ['empty data', { contentType: 'image/png', data: '' }],
    ['no object', 'AAAA'],
  ])('refuses %s', (_label, raw) => {
    expect(parseBugReportScreenshot(raw)).toBeNull();
  });

  it('refuses data larger than the limit once decoded', () => {
    const big = 'A'.repeat(Math.ceil((BUG_REPORT_LIMITS.screenshotBytes + 3) / 3) * 4);
    expect(parseBugReportScreenshot({ contentType: 'image/png', data: big })).toBeNull();
  });
});
