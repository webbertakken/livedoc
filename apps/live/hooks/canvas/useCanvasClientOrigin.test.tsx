// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { EditorBoxContext, type EditorBox } from '@/hooks/ui/useEditorBox';
import { useCanvasClientOrigin, useCanvasOverlayOrigin } from './useCanvasClientOrigin';

function wrapperAt(at: { left: number; top: number }) {
  const el = document.createElement('div');
  const measure = vi.fn(() => ({ ...at, width: 100, height: 100 }) as DOMRect);
  el.getBoundingClientRect = measure;
  return { ref: { current: el }, at, measure };
}

describe('useCanvasClientOrigin', () => {
  it('is null and measures nothing while inactive', () => {
    const { ref, measure } = wrapperAt({ left: 10, top: 20 });
    const { result } = renderHook(() => useCanvasClientOrigin(ref, false, 'v'));
    expect(result.current).toBeNull();
    expect(measure).not.toHaveBeenCalled();
  });

  it('has the wrapper origin on the first render that shows it', () => {
    const { ref } = wrapperAt({ left: 10, top: 20 });
    const { result } = renderHook(() => useCanvasClientOrigin(ref, true, 'v'));
    expect(result.current).toEqual({ left: 10, top: 20 });
  });

  it('follows the wrapper when the view moves', () => {
    const w = wrapperAt({ left: 10, top: 20 });
    const { result, rerender } = renderHook(
      ({ view }) => useCanvasClientOrigin(w.ref, true, view),
      {
        initialProps: { view: '0,0,1' },
      },
    );
    w.at.left = 50;
    w.at.top = -5;
    rerender({ view: '40,-25,1' });
    expect(result.current).toEqual({ left: 50, top: -5 });
  });

  // docs/specs/008-canvas/canvas-performance.md: a gesture frame never reads layout. The origin moves
  // only with the view, so renders that keep the view (every frame of a drag) measure nothing.
  it('measures once while the view stays put, however often it renders', () => {
    const w = wrapperAt({ left: 10, top: 20 });
    const { rerender } = renderHook(() => useCanvasClientOrigin(w.ref, true, '0,0,1'));
    const once = w.measure.mock.calls.length;
    for (let i = 0; i < 30; i++) rerender();
    expect(w.measure.mock.calls.length).toBe(once);
  });

  it('keeps the same origin object while the wrapper stays put', () => {
    const { ref } = wrapperAt({ left: 10, top: 20 });
    const { result, rerender } = renderHook(() => useCanvasClientOrigin(ref, true, 'v'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('is null when there is no wrapper to measure', () => {
    const { result } = renderHook(() => useCanvasClientOrigin({ current: null }, true, 'v'));
    expect(result.current).toBeNull();
  });

  it('drops back to null when deactivated', () => {
    const { ref } = wrapperAt({ left: 10, top: 20 });
    const { result, rerender } = renderHook(({ on }) => useCanvasClientOrigin(ref, on, 'v'), {
      initialProps: { on: true },
    });
    rerender({ on: false });
    expect(result.current).toBeNull();
  });
});

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": a `fixed` overlay inside a split's pane counts
// from the pane's corner, so the canvas origin it draws from is the client origin less the pane's offset.
describe('useCanvasOverlayOrigin', () => {
  const inBox =
    (box: EditorBox) =>
    ({ children }: { children: ReactNode }) => (
      <EditorBoxContext.Provider value={box}>{children}</EditorBoxContext.Provider>
    );

  it('is the client origin when the editor fills the window', () => {
    const { ref } = wrapperAt({ left: 10, top: 20 });
    const { result } = renderHook(() => useCanvasOverlayOrigin(ref, true, 'v'));
    expect(result.current).toEqual({ left: 10, top: 20 });
  });

  it("counts from the pane's corner in a split", () => {
    const { ref } = wrapperAt({ left: 1000, top: 20 });
    const { result } = renderHook(() => useCanvasOverlayOrigin(ref, true, 'v'), {
      wrapper: inBox({ left: 893, top: 0, width: 893 }),
    });
    expect(result.current).toEqual({ left: 107, top: 20 });
  });

  it('is null while inactive', () => {
    const { ref } = wrapperAt({ left: 1000, top: 20 });
    const { result } = renderHook(() => useCanvasOverlayOrigin(ref, false, 'v'), {
      wrapper: inBox({ left: 893, top: 0, width: 893 }),
    });
    expect(result.current).toBeNull();
  });
});
