// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { createViewportStore } from '@/lib/viewport-store';
import { useCanvasPointer } from './useCanvasPointer';

// docs/specs/008-canvas/canvas-performance.md "A gesture frame never reads layout after writing it": the pointer
// position broadcast to peers converts with the canvas origin measured when the view changes, never on a move.

const move = (clientX: number, clientY: number) =>
  ({ clientX, clientY, target: null }) as unknown as ReactPointerEvent;

describe('useCanvasPointer', () => {
  it('reports the pointer in canvas coords without measuring on a move', () => {
    const wrapper = document.createElement('div');
    const measured = vi.fn(() => ({ left: 100, top: 50 }) as DOMRect);
    wrapper.getBoundingClientRect = measured;
    const onCanvasPointerMove = vi.fn();
    const store = createViewportStore(2);
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
  });
});
