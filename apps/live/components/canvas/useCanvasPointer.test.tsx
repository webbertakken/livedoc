// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { createViewportStore } from '@/lib/viewport-store';
import { useCanvasPointer } from './useCanvasPointer';

// docs/specs/008-canvas/canvas-performance.md "Converting between the screen and the canvas reads no layout": the
// pointer position broadcast to peers converts with the canvas's box, measured when the canvas changes size, and
// the view as the move arrives; neither a move nor a change of the view measures anything.

const move = (clientX: number, clientY: number) =>
  ({ clientX, clientY, target: null }) as unknown as ReactPointerEvent;

describe('useCanvasPointer', () => {
  it('reports the pointer in canvas coords without measuring on a move', () => {
    // <main> at (100, 50), 800 × 600, which the wrapper fills.
    const main = document.createElement('main');
    const measured = vi.fn(() => ({ left: 100, top: 50, width: 800, height: 600 }) as DOMRect);
    main.getBoundingClientRect = measured;
    const wrapper = document.createElement('div');
    Object.defineProperties(wrapper, {
      offsetParent: { get: () => main },
      offsetWidth: { get: () => 800 },
      offsetHeight: { get: () => 600 },
    });
    const onCanvasPointerMove = vi.fn();
    // Zoomed 2× about the centre (400, 300), and panned so canvas (0, 0) sits on <main>'s corner.
    const store = createViewportStore(2);
    store.setOffset({ x: 200, y: 150 });
    const { result } = renderHook(
      () =>
        useCanvasPointer({
          canvasTool: 'select',
          mainRef: { current: null },
          onCanvasPointerMove,
          wrapperRef: { current: wrapper },
          mainSize: { width: 800, height: 600 },
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <ViewportStoreProvider store={store}>{children}</ViewportStoreProvider>
        ),
      },
    );
    const measuredOnce = measured.mock.calls.length;
    result.current.handlePointerMoveCanvas(move(300, 250));
    result.current.handlePointerMoveCanvas(move(102, 52));
    expect(measured.mock.calls.length).toBe(measuredOnce);
    expect(onCanvasPointerMove).toHaveBeenNthCalledWith(1, 100, 100, null);
    expect(onCanvasPointerMove).toHaveBeenNthCalledWith(2, 1, 1, null);
    result.current.handlePointerLeaveCanvas();
    expect(onCanvasPointerMove).toHaveBeenLastCalledWith(null, null);
    // A zoom back to 1 with no pan: canvas (0, 0) is <main>'s corner again, and nothing was measured for it.
    act(() => store.setView({ zoom: 1, offset: { x: 0, y: 0 } }));
    result.current.handlePointerMoveCanvas(move(300, 250));
    expect(measured.mock.calls.length).toBe(measuredOnce);
    expect(onCanvasPointerMove).toHaveBeenLastCalledWith(200, 200, null);
  });
});
