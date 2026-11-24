// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a finger with Select in hand taps to clear,
// double taps to zoom and holds to select; with another tool in hand, off the page or with a mouse, it does none.
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_LONG_PRESS_MS, type PageMatrix } from '@livedoc/pdf-documents';
import { usePdfPageFingers } from './usePdfPageFingers';

const MATRIX: PageMatrix = [1, 0, 0, -1, 0, 792];

function fingers({ selecting = true, onPage = true } = {}) {
  const box = document.createElement('div');
  box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792 }) as DOMRect;
  const onText = vi.fn();
  const onDoubleTap = vi.fn();
  const hook = renderHook(() =>
    usePdfPageFingers({
      index: 0,
      box,
      toView: selecting ? MATRIX : null,
      shown: { width: 612, height: 792 },
      pointAt: (client) => (onPage ? { x: client.x, y: 792 - client.y } : null),
      onText,
      onDoubleTap,
    }),
  );
  return { box, hook, onText, onDoubleTap };
}

const pointer = (box: HTMLElement, pointerType = 'touch') =>
  ({
    pointerType,
    pointerId: 1,
    clientX: 72,
    clientY: 92,
    timeStamp: 0,
    currentTarget: box,
  }) as unknown as PointerEvent<HTMLElement>;

afterEach(() => {
  vi.useRealTimers();
});

describe('usePdfPageFingers', () => {
  it('does nothing with another tool in hand, off the page, or for a mouse', () => {
    for (const shape of [{ selecting: false }, { onPage: false }]) {
      const { box, hook, onText } = fingers(shape);
      hook.result.current.down(pointer(box));
      hook.result.current.up(pointer(box));
      expect(onText).not.toHaveBeenCalled();
    }
    const { box, hook, onText } = fingers();
    hook.result.current.down(pointer(box, 'mouse'));
    hook.result.current.up(pointer(box, 'mouse'));
    hook.result.current.cancel(pointer(box, 'mouse'));
    expect(onText).not.toHaveBeenCalled();
    expect(hook.result.current.byFinger()).toBe(false);
  });

  it('forgets a tap the browser took for a scroll', () => {
    const { box, hook, onText } = fingers();
    hook.result.current.down(pointer(box));
    expect(hook.result.current.byFinger()).toBe(true);
    hook.result.current.cancel(pointer(box));
    hook.result.current.up(pointer(box));
    expect(onText).not.toHaveBeenCalled();
  });

  it('holds still for nothing where the finger is off the page', () => {
    vi.useFakeTimers();
    const { box, onText } = fingers({ onPage: false });
    const down = new Event('pointerdown');
    Object.assign(down, { pointerType: 'touch', pointerId: 1, clientX: 1, clientY: 1 });
    box.dispatchEvent(down);
    act(() => {
      vi.advanceTimersByTime(PDF_LONG_PRESS_MS);
    });
    expect(onText).not.toHaveBeenCalled();
  });
});
