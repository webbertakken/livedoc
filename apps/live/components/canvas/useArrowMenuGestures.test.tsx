// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { LONG_PRESS_MS } from '@/hooks/ui/useLongPress';
import { elementMenuAnchor, pointerMenuAnchor } from '@/lib/context-menu-anchor';
import { useArrowMenuGestures } from './useArrowMenuGestures';

// docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor": a pointer right-click on an arrow or its label
// opens the menu at the pointer; the keyboard and a touch long-press open it beside the arrow's bounding box.

const BAND = { left: 300, top: 200, right: 500, bottom: 260 };
const POINTER = { x: 380, y: 230 };

afterEach(() => vi.useRealTimers());

function harness({ measurable = true } = {}) {
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  band.getBoundingClientRect = () =>
    ({ ...BAND, x: BAND.left, y: BAND.top, width: 200, height: 60 }) as DOMRect;
  const onContextSelect = vi.fn();
  const { result } = renderHook(() =>
    useArrowMenuGestures('a', { current: measurable ? band : null }, onContextSelect),
  );
  const rightClick = () =>
    act(() => {
      result.current.rightClick.onContextMenu({
        button: 2,
        buttons: 0,
        clientX: POINTER.x,
        clientY: POINTER.y,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as ReactMouseEvent);
    });
  const longPress = () => {
    vi.useFakeTimers();
    act(() => {
      result.current.longPress.onPointerDown({
        button: 0,
        timeStamp: 1,
        clientX: POINTER.x,
        clientY: POINTER.y,
        pointerId: 1,
        pointerType: 'touch',
        stopPropagation: vi.fn(),
        nativeEvent: new Event('pointerdown'),
      } as unknown as ReactPointerEvent);
    });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    });
  };
  return { result, onContextSelect, rightClick, longPress };
}

const lastPressWasPointer = () => document.dispatchEvent(new Event('pointerdown'));
const lastPressWasKey = () => document.dispatchEvent(new Event('keydown'));

describe('the arrow menu anchor', () => {
  it('opens at the pointer on a right-click on the line', () => {
    const h = harness();
    lastPressWasPointer();
    h.rightClick();
    const { x, y } = pointerMenuAnchor(POINTER);
    expect(h.onContextSelect).toHaveBeenCalledWith('a', x, y);
  });

  it('opens at the pointer on a right-click on the label', () => {
    const h = harness();
    lastPressWasPointer();
    act(() => h.result.current.onLabelContextMenu({ clientX: POINTER.x, clientY: POINTER.y }));
    const { x, y } = pointerMenuAnchor(POINTER);
    expect(h.onContextSelect).toHaveBeenCalledWith('a', x, y);
  });

  it('opens beside the arrow from the keyboard', () => {
    const h = harness();
    lastPressWasKey();
    h.rightClick();
    const { x, y } = elementMenuAnchor(BAND);
    expect(h.onContextSelect).toHaveBeenCalledWith('a', x, y);
  });

  it('opens beside the arrow on a touch long-press', () => {
    const h = harness();
    h.longPress();
    const { x, y } = elementMenuAnchor(BAND);
    expect(h.onContextSelect).toHaveBeenCalledWith('a', x, y);
  });

  it('falls back to the finger when the long-pressed arrow cannot be measured', () => {
    const h = harness({ measurable: false });
    h.longPress();
    expect(h.onContextSelect).toHaveBeenCalledWith('a', POINTER.x, POINTER.y);
  });
});
