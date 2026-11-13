// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserBugReportInputs } from './collect-context';

// docs/specs/016-platform/bug-reports.md "Context": what the page itself says, an embed's frame included.

afterEach(() => vi.restoreAllMocks());

describe('browserBugReportInputs', () => {
  it('reads the page, and says it is not framed at the top of its window', () => {
    const inputs = browserBugReportInputs();

    expect(inputs.framed).toBe(false);
    expect(inputs.pathname).toBe(window.location.pathname);
    expect(inputs.online).toBe(navigator.onLine);
  });

  it('says it is framed when another page holds it', () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);

    expect(browserBugReportInputs().framed).toBe(true);
  });

  it('takes a pixel ratio of 1 where the browser reports none', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(0);

    expect(browserBugReportInputs().viewport.pixelRatio).toBe(1);
  });
});
