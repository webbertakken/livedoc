// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { createViewportStore, type ViewportStore } from '@/lib/viewport-store';
import { EditorBoxContext, type EditorBox } from '@/hooks/ui/useEditorBox';
import {
  canvasClientOrigin,
  useCanvasBox,
  useCanvasClientOrigin,
  useCanvasOverlayOrigin,
} from './useCanvasClientOrigin';

// docs/specs/008-canvas/canvas-performance.md "Converting between the screen and the canvas reads no layout":
// where canvas (0, 0) sits on screen is worked out from the view and the canvas's box, measured only when the
// canvas's size changes.

const MAIN = { width: 1000, height: 600 };

// A canvas wrapper laid out at (left, top) inside its positioned parent, which sits at (x, y) on screen.
function wrapperIn(at: { x: number; y: number }) {
  const parent = document.createElement('main');
  const measure = vi.fn(() => ({ left: at.x, top: at.y, width: 1000, height: 600 }) as DOMRect);
  parent.getBoundingClientRect = measure;
  const el = document.createElement('div');
  Object.defineProperties(el, {
    offsetParent: { get: () => parent },
    offsetLeft: { get: () => 0 },
    offsetTop: { get: () => 0 },
    offsetWidth: { get: () => 1000 },
    offsetHeight: { get: () => 600 },
  });
  return { ref: { current: el }, measure, at };
}

function withStore(store: ViewportStore) {
  return ({ children }: { children: ReactNode }) => (
    <ViewportStoreProvider store={store}>{children}</ViewportStoreProvider>
  );
}

describe('canvasClientOrigin', () => {
  const box = { left: 100, top: 50, width: 1000, height: 600 };

  it('is the box corner at zoom 1 with no pan', () => {
    expect(canvasClientOrigin(box, { zoom: 1, offset: { x: 0, y: 0 } })).toEqual({
      left: 100,
      top: 50,
    });
  });

  it('moves with the pan, scaled by the zoom', () => {
    expect(canvasClientOrigin(box, { zoom: 2, offset: { x: 10, y: -5 } })).toEqual({
      // The wrapper scales about its centre (500, 300), then the pan moves it by offset·zoom.
      left: 100 + 500 * (1 - 2) + 2 * 10,
      top: 50 + 300 * (1 - 2) + 2 * -5,
    });
  });

  it('pulls the corner towards the centre when zoomed out', () => {
    expect(canvasClientOrigin(box, { zoom: 0.5, offset: { x: 0, y: 0 } })).toEqual({
      left: 350,
      top: 200,
    });
  });
});

describe('useCanvasBox', () => {
  it("measures the wrapper's untransformed box once, however often it renders", () => {
    const w = wrapperIn({ x: 20, y: 30 });
    const { result, rerender } = renderHook(() => useCanvasBox(w.ref, MAIN));
    for (let i = 0; i < 30; i++) rerender();
    expect(w.measure).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ left: 20, top: 30, width: 1000, height: 600 });
  });

  it('measures again when the canvas changes size', () => {
    const w = wrapperIn({ x: 20, y: 30 });
    const { result, rerender } = renderHook(({ size }) => useCanvasBox(w.ref, size), {
      initialProps: { size: MAIN },
    });
    w.at.x = 300;
    rerender({ size: { width: 700, height: 600 } });
    expect(w.measure).toHaveBeenCalledTimes(2);
    expect(result.current?.left).toBe(300);
  });

  it('is null when there is no wrapper to measure', () => {
    const { result } = renderHook(() => useCanvasBox({ current: null }, MAIN));
    expect(result.current).toBeNull();
  });
});

describe('useCanvasClientOrigin', () => {
  it('is null while inactive', () => {
    const w = wrapperIn({ x: 0, y: 0 });
    const { result } = renderHook(() => useCanvasClientOrigin(w.ref, false, MAIN), {
      wrapper: withStore(createViewportStore(1)),
    });
    expect(result.current).toBeNull();
  });

  it('has the origin on the first render that shows it', () => {
    const w = wrapperIn({ x: 10, y: 20 });
    const { result } = renderHook(() => useCanvasClientOrigin(w.ref, true, MAIN), {
      wrapper: withStore(createViewportStore(1)),
    });
    expect(result.current).toEqual({ left: 10, top: 20 });
  });

  // A pan or a zoom moves the origin without reading layout: every wheel tick of a zoom measured the page, which
  // laid the whole board out.
  it('follows the view without measuring', () => {
    const w = wrapperIn({ x: 0, y: 0 });
    const store = createViewportStore(1);
    const { result } = renderHook(() => useCanvasClientOrigin(w.ref, true, MAIN), {
      wrapper: withStore(store),
    });
    const measured = w.measure.mock.calls.length;
    for (const zoom of [1.1, 1.2, 1.3])
      act(() => store.setView({ zoom, offset: { x: 40, y: -25 } }));
    expect(w.measure.mock.calls.length).toBe(measured);
    expect(result.current).toEqual(
      canvasClientOrigin(
        { left: 0, top: 0, width: 1000, height: 600 },
        { zoom: 1.3, offset: { x: 40, y: -25 } },
      ),
    );
  });

  it('keeps the same origin object while the view stays put', () => {
    const w = wrapperIn({ x: 10, y: 20 });
    const { result, rerender } = renderHook(() => useCanvasClientOrigin(w.ref, true, MAIN), {
      wrapper: withStore(createViewportStore(1)),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": a `fixed` overlay inside a split's pane counts
// from the pane's corner, so the canvas origin it draws from is the client origin less the pane's offset.
describe('useCanvasOverlayOrigin', () => {
  const inBox =
    (box: EditorBox) =>
    ({ children }: { children: ReactNode }) => (
      <ViewportStoreProvider store={createViewportStore(1)}>
        <EditorBoxContext.Provider value={box}>{children}</EditorBoxContext.Provider>
      </ViewportStoreProvider>
    );

  it('is the client origin when the editor fills the window', () => {
    const w = wrapperIn({ x: 10, y: 20 });
    const { result } = renderHook(() => useCanvasOverlayOrigin(w.ref, true, MAIN), {
      wrapper: withStore(createViewportStore(1)),
    });
    expect(result.current).toEqual({ left: 10, top: 20 });
  });

  it("counts from the pane's corner in a split", () => {
    const w = wrapperIn({ x: 1000, y: 20 });
    const { result } = renderHook(() => useCanvasOverlayOrigin(w.ref, true, MAIN), {
      wrapper: inBox({ left: 893, top: 0, width: 893 }),
    });
    expect(result.current).toEqual({ left: 107, top: 20 });
  });

  it('is null while inactive', () => {
    const w = wrapperIn({ x: 1000, y: 20 });
    const { result } = renderHook(() => useCanvasOverlayOrigin(w.ref, false, MAIN), {
      wrapper: inBox({ left: 893, top: 0, width: 893 }),
    });
    expect(result.current).toBeNull();
  });
});
