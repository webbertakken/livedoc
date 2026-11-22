// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetSummaryPick, setSummaryPick, summaryPick, useSummaryPick } from './summary-pick';

afterEach(() => {
  localStorage.clear();
  resetSummaryPick();
});

// docs/specs/029-sheets/surface.md "Sheet bar": the pick is the person's, kept in their browser.
describe('summaryPick', () => {
  it('starts at Sum, and at Sum again for a stored value that is no kind', () => {
    expect(summaryPick()).toBe('Sum');
    resetSummaryPick();
    localStorage.setItem('livedoc:spreadsheet-summary', 'Median');
    expect(summaryPick()).toBe('Sum');
  });

  it('keeps a pick in the browser and tells every summary', () => {
    const { result } = renderHook(() => useSummaryPick());
    expect(result.current).toBe('Sum');
    act(() => setSummaryPick('Count Numbers'));
    expect(result.current).toBe('Count Numbers');
    resetSummaryPick();
    expect(summaryPick()).toBe('Count Numbers');
  });
});

describe('the pick on the server', () => {
  it('is Sum', async () => {
    const { renderToString } = await import('react-dom/server');
    const Probe = () => <>{useSummaryPick()}</>;
    expect(renderToString(<Probe />)).toBe('Sum');
  });
});
