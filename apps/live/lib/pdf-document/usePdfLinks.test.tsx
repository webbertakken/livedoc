// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Following a link": a place gone to at once, an address asked about,
// the rest said and logged, a page no longer in the file going nowhere.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageName, type PageInfo, type PageMatrix } from '@livedoc/pdf-documents';
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

// Upright Letter pages: page space's y runs up from the bottom edge.
const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 792];

function links(
  pageMatrix = vi.fn(async (): Promise<PageMatrix | null> => UPRIGHT),
  turns: 0 | 1 = 0,
) {
  const goToPage = vi.fn();
  const hook = renderHook(() =>
    usePdfLinks({ pages: PAGES, turns, engine: { pageMatrix }, goTo: goToPage }),
  );
  return { hook, goToPage, pageMatrix };
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

  // "A place in the document": its point at the view's top left, reckoned through the page's matrix.
  it('goes to a place’s point on its page, reckoned through the page’s matrix as it is turned', async () => {
    const { hook, goToPage, pageMatrix } = links(undefined, 1);
    await act(async () =>
      hook.result.current.follow({ kind: 'place', page: PageName.ofObject(5), x: null, y: 594 }),
    );
    expect(pageMatrix).toHaveBeenCalledWith(1, 1);
    // The page shows on its side, 792 wide and 612 tall: the point is 198 down it.
    expect(goToPage).toHaveBeenCalledWith(1, { across: 0, down: 198 / 612 });
  });

  it('goes to the page’s top where the matrix cannot be read', async () => {
    const { hook, goToPage } = links(vi.fn(async () => null));
    await act(async () =>
      hook.result.current.follow({ kind: 'place', page: PageName.ofObject(3), x: 10, y: 20 }),
    );
    expect(goToPage).toHaveBeenCalledWith(0, undefined);
  });

  it('goes to the page’s top before the engine is there', () => {
    const goToPage = vi.fn();
    const hook = renderHook(() =>
      usePdfLinks({ pages: PAGES, turns: 0, engine: null, goTo: goToPage }),
    );
    act(() =>
      hook.result.current.follow({ kind: 'place', page: PageName.ofObject(3), x: 10, y: 20 }),
    );
    expect(goToPage).toHaveBeenCalledWith(0);
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
