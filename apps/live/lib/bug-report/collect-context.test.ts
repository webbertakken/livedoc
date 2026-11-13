import { describe, expect, it } from 'vitest';
import { collectBugReportContext } from './collect-context';

// docs/specs/016-platform/bug-reports.md "Context": no document id, share code or query leaves the browser.

const base = {
  pathname: '/document/0f8fad5b-d9cb-469f-a165-70867728950e',
  search: '?share=SECRETCODE123456789&x=1',
  userAgent: 'Mozilla/5.0 Chrome/141.0',
  viewport: { width: 1280, height: 800, pixelRatio: 2 },
  online: true,
  framed: false,
  release: 'abc1234',
  place: { mode: 'draw' as const, tabKind: 'diagram' as const, shareRole: 'edit' as const },
  recentErrors: [{ at: 't', source: 'api' as const, message: 'Http500.SaveTab' }],
};

describe('collectBugReportContext', () => {
  it('reduces the page to its template and attaches the rest', () => {
    expect(collectBugReportContext(base)).toEqual({
      route: '/document',
      mode: 'draw',
      tabKind: 'diagram',
      shareRole: 'edit',
      release: 'abc1234',
      userAgent: 'Mozilla/5.0 Chrome/141.0',
      viewport: { width: 1280, height: 800, pixelRatio: 2 },
      online: true,
      recentErrors: [{ at: 't', source: 'api', message: 'Http500.SaveTab' }],
    });
  });

  it('names the page another site linked from, reduced the same way', () => {
    const context = collectBugReportContext({
      ...base,
      pathname: '/report-a-bug/',
      search: '?from=%2Fhelp%2Fcontact%2F',
      place: {},
    });
    expect(context).toMatchObject({ route: '/report-a-bug', from: '/help/contact' });
    expect(context.mode).toBeUndefined();
  });

  it('drops a from that is not a page', () => {
    const context = collectBugReportContext({
      ...base,
      pathname: '/report-a-bug',
      search: '?from=https://evil.example',
    });
    expect(context.from).toBeUndefined();
  });

  it('says / for a path it cannot express, and leaves out an unknown release', () => {
    const context = collectBugReportContext({ ...base, pathname: '/%E0%A4%A', release: null });
    expect(context.route).toBe('/');
    expect(context.release).toBeUndefined();
  });

  it('says the page is embedded only when it runs inside another page', () => {
    const context = collectBugReportContext({
      ...base,
      pathname: '/embed/workbench',
      framed: true,
    });
    expect(context).toMatchObject({ route: '/embed/workbench', embedded: true });
    expect(collectBugReportContext(base).embedded).toBeUndefined();
  });

  it('leaves out an empty user agent', () => {
    expect(collectBugReportContext({ ...base, userAgent: '' }).userAgent).toBeUndefined();
  });

  it('rounds a fractional viewport', () => {
    const context = collectBugReportContext({
      ...base,
      viewport: { width: 1280.4, height: 799.6, pixelRatio: 1.5 },
    });
    expect(context.viewport).toEqual({ width: 1280, height: 800, pixelRatio: 1.5 });
  });
});
