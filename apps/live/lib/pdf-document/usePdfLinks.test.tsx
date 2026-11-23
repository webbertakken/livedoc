// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Following a link": a place gone to at once, an address asked about,
// the rest said and logged, a page no longer in the file going nowhere.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageName, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { usePdfLinks } from './usePdfLinks';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PAGES: PageInfo[] = [3, 5].map((n) => ({
  name: PageName.ofObject(n),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
}));

function links() {
  const goToPage = vi.fn();
  const hook = renderHook(() => usePdfLinks(PAGES, goToPage));
  return { hook, goToPage };
}

describe('following a link', () => {
  it('goes to a place in the document at once, asking nothing', () => {
    const { hook, goToPage } = links();
    act(() =>
      hook.result.current.follow({ kind: 'place', page: PageName.ofObject(5), x: null, y: null }),
    );
    expect(goToPage).toHaveBeenCalledWith(1);
    expect(hook.result.current.asked).toBeNull();
  });

  it('asks before an address, and closes the asking', () => {
    const { hook } = links();
    act(() => hook.result.current.follow({ kind: 'address', address: 'https://example.com/' }));
    expect(hook.result.current.asked).toEqual({ kind: 'ask', address: 'https://example.com/' });
    act(() => hook.result.current.close());
    expect(hook.result.current.asked).toBeNull();
  });

  it('says and logs a link it does not follow', () => {
    const { hook } = links();
    act(() => hook.result.current.follow({ kind: 'action', action: 'launch' }));
    expect(hook.result.current.asked).toEqual({ kind: 'action' });
    expect(debugLog).toHaveBeenCalledWith('[pdf] link-refused kind=action');
  });

  it('goes nowhere for a page no longer in the file, saying nothing but the log', () => {
    const { hook, goToPage } = links();
    act(() => hook.result.current.follow(null));
    expect(goToPage).not.toHaveBeenCalled();
    expect(hook.result.current.asked).toBeNull();
    expect(debugLog).toHaveBeenCalledWith('[pdf] link-refused kind=nowhere');
  });
});
