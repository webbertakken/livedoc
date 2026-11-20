// @vitest-environment jsdom
// docs/specs/006-document/kinds-outside-the-canvas.md "Switching tabs": a surface restores its scroll and selection
// once it is ready, writes them as they change at most every SURFACE_VIEW_WRITE_MS, and once more as it unmounts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSurfaceView, SURFACE_VIEW_WRITE_MS, writeSurfaceView } from '@/lib/surface-view';
import { useSurfaceView } from './useSurfaceView';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function setup(ready: boolean) {
  const scroller = document.createElement('div');
  let selection: { anchor: number; head: number } | null = { anchor: 1, head: 1 };
  const restoreSelection = vi.fn();
  const ref: { current: HTMLElement | null } = { current: scroller };
  const hook = renderHook(
    ({ ready: r }) =>
      useSurfaceView({
        documentId: 'd1',
        tabId: 't1',
        ready: r,
        scroller: ref,
        readSelection: () => selection,
        restoreSelection,
      }),
    { initialProps: { ready } },
  );
  return {
    scroller,
    restoreSelection,
    hook,
    ref,
    select: (next: typeof selection) => (selection = next),
  };
}

describe('useSurfaceView', () => {
  it('restores the remembered scroll and selection once the surface is ready, not before', () => {
    writeSurfaceView('d1', 't1', {
      scrollTop: 300,
      scrollLeft: 4,
      selection: { anchor: 5, head: 8 },
    });
    const { scroller, restoreSelection, hook } = setup(false);
    expect(restoreSelection).not.toHaveBeenCalled();
    hook.rerender({ ready: true });
    expect(scroller.scrollTop).toBe(300);
    expect(scroller.scrollLeft).toBe(4);
    expect(restoreSelection).toHaveBeenCalledWith({ anchor: 5, head: 8 });
  });

  it('puts a scroll the page cannot reach yet again as the writing grows, until a person scrolls', () => {
    writeSurfaceView('d1', 't1', { scrollTop: 300, scrollLeft: 0, selection: null });
    const { scroller, hook } = setup(false);
    // A scroller whose content is still laying out: it reaches 200, then 300 a few frames later.
    let max = 200;
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => top,
      set: (next: number) => (top = Math.min(next, max)),
    });
    hook.rerender({ ready: true });
    expect(scroller.scrollTop).toBe(200);
    max = 300;
    act(() => void vi.advanceTimersByTime(50));
    expect(scroller.scrollTop).toBe(300);
  });

  it('stops putting the scroll back once the person scrolls', () => {
    writeSurfaceView('d1', 't1', { scrollTop: 300, scrollLeft: 0, selection: null });
    const { scroller, hook } = setup(false);
    let max = 200;
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => top,
      set: (next: number) => (top = Math.min(next, max)),
    });
    hook.rerender({ ready: true });
    act(() => void scroller.dispatchEvent(new Event('wheel')));
    max = 300;
    act(() => void vi.advanceTimersByTime(50));
    expect(scroller.scrollTop).toBe(200);
  });

  it('restores nothing for a tab never seen', () => {
    const { restoreSelection, scroller } = setup(true);
    expect(restoreSelection).not.toHaveBeenCalled();
    expect(scroller.scrollTop).toBe(0);
  });

  it('writes the view as it scrolls, at most every SURFACE_VIEW_WRITE_MS', () => {
    const { scroller } = setup(true);
    scroller.scrollTop = 120;
    act(() => void scroller.dispatchEvent(new Event('scroll')));
    expect(readSurfaceView('d1', 't1')).toBeNull();
    act(() => void vi.advanceTimersByTime(SURFACE_VIEW_WRITE_MS));
    expect(readSurfaceView('d1', 't1')).toMatchObject({ scrollTop: 120 });
  });

  it('writes the selection when told it moved, and once more as it unmounts', () => {
    const { hook, select, scroller, ref } = setup(true);
    select({ anchor: 2, head: 6 });
    act(() => hook.result.current.noteViewChanged());
    act(() => void vi.advanceTimersByTime(SURFACE_VIEW_WRITE_MS));
    expect(readSurfaceView('d1', 't1')?.selection).toEqual({ anchor: 2, head: 6 });
    scroller.scrollTop = 50;
    act(() => void scroller.dispatchEvent(new Event('scroll')));
    select(null);
    // React has cleared the ref by the time an unmount's cleanup runs, and the element has left the page, where it
    // reads as scrolled to its top.
    ref.current = null;
    scroller.scrollTop = 0;
    hook.unmount();
    expect(readSurfaceView('d1', 't1')).toEqual({ scrollTop: 50, scrollLeft: 0, selection: null });
  });

  it('reads the last scroll as it unmounts, before any scroll event reported it', () => {
    const { hook, scroller } = setup(true);
    document.body.append(scroller);
    scroller.scrollTop = 75;
    hook.unmount();
    expect(readSurfaceView('d1', 't1')?.scrollTop).toBe(75);
    scroller.remove();
  });

  it('writes nothing before the surface is ready, so a loading surface never forgets the view', () => {
    writeSurfaceView('d1', 't1', { scrollTop: 300, scrollLeft: 0, selection: null });
    const { hook } = setup(false);
    hook.unmount();
    expect(readSurfaceView('d1', 't1')?.scrollTop).toBe(300);
  });
});
