// @vitest-environment jsdom
// docs/specs/029-sheets/formulas.md "Text", On a touch screen: Ctrl/⌘ held with a tap opens a HYPERLINK, and a plain
// tap on one marks its cell for the link chip.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSheetTouchLink } from './useSheetTouchLink';

const { openHyperlink } = vi.hoisted(() => ({ openHyperlink: vi.fn() }));
vi.mock('@/lib/open-hyperlink', () => ({ openHyperlink }));

const keys = (over: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...over,
});
const LINK = 'https://docs.nu';

beforeEach(() => openHyperlink.mockReset());

describe('useSheetTouchLink', () => {
  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['⌘', { metaKey: true }],
  ])('opens a link on %s and a tap, marking nothing', (_key, held) => {
    const { result } = renderHook(() => useSheetTouchLink());
    let opened = false;
    act(() => {
      opened = result.current.tap(keys(held), { r: 1, c: 2 }, LINK, false);
    });
    expect(opened).toBe(true);
    expect(openHyperlink).toHaveBeenCalledWith(LINK);
    expect(result.current.tapped).toBeNull();
  });

  it('marks a link’s cell on a plain tap, and lets go of it on a tap elsewhere', () => {
    const { result } = renderHook(() => useSheetTouchLink());
    act(() => void result.current.tap(keys(), { r: 1, c: 2 }, LINK, false));
    expect(result.current.tapped).toEqual({ r: 1, c: 2 });
    expect(openHyperlink).not.toHaveBeenCalled();
    act(() => void result.current.tap(keys({ ctrlKey: true }), { r: 3, c: 0 }, null, false));
    expect(result.current.tapped).toBeNull();
  });

  it('opens nothing with Shift held or while painting a format', () => {
    const { result } = renderHook(() => useSheetTouchLink());
    act(
      () =>
        void result.current.tap(
          keys({ ctrlKey: true, shiftKey: true }),
          { r: 0, c: 0 },
          LINK,
          false,
        ),
    );
    act(() => void result.current.tap(keys({ metaKey: true }), { r: 0, c: 0 }, LINK, true));
    expect(openHyperlink).not.toHaveBeenCalled();
    expect(result.current.tapped).toEqual({ r: 0, c: 0 });
  });

  it('opens the marked link from its chip and lets go of it', () => {
    const { result } = renderHook(() => useSheetTouchLink());
    act(() => void result.current.tap(keys(), { r: 1, c: 2 }, LINK, false));
    act(() => result.current.open(LINK));
    expect(openHyperlink).toHaveBeenCalledWith(LINK);
    expect(result.current.tapped).toBeNull();
    act(() => result.current.dismiss());
    expect(result.current.tapped).toBeNull();
  });
});
