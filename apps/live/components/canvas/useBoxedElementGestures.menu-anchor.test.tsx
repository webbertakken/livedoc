// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createSticky } from '@livedoc/document';
import { LONG_PRESS_MS } from '@/hooks/ui/useLongPress';
import { elementMenuAnchor, pointerMenuAnchor } from '@/lib/context-menu-anchor';
import { useBoxedElementGestures } from './useBoxedElementGestures';

// docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor": a pointer right-click opens the element menu at
// the pointer; the keyboard and a touch long-press open it beside the element.

const ELEMENT = { left: 100, top: 80, right: 260, bottom: 200 };
const POINTER = { x: 150, y: 140 };

afterEach(() => vi.useRealTimers());

function harness({ measurable = true, isEditing = false } = {}) {
  const node = document.createElement('div');
  document.body.append(node);
  node.getBoundingClientRect = () =>
    ({
      ...ELEMENT,
      x: ELEMENT.left,
      y: ELEMENT.top,
      width: ELEMENT.right - ELEMENT.left,
      height: ELEMENT.bottom - ELEMENT.top,
    }) as DOMRect;
  const onContextSelect = vi.fn();
  const { result } = renderHook(() =>
    useBoxedElementGestures({
      element: { ...createSticky(0, 0), id: 's' },
      wrapperRef: { current: measurable ? node : null },
      isEditing,
      remotelyLocked: false,
      isAnnotation: false,
      isMultiSelected: false,
      isSelected: false,
      isPaintMode: false,
      onBeginDrag: vi.fn(),
      onBeginEdit: vi.fn(),
      onPlainClick: vi.fn(),
      onPressArmedAction: vi.fn(() => false),
      onContextSelect,
    }),
  );
  // A contextmenu that arrives with no button held: the release is already behind it (Windows), or there was
  // never a pointer (the keyboard). Either way the menu opens straight away.
  const contextMenu = () => {
    const e = {
      button: 2,
      buttons: 0,
      clientX: POINTER.x,
      clientY: POINTER.y,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    act(() => result.current.handleContextMenu(e as unknown as ReactMouseEvent));
    return e;
  };
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
  return { onContextSelect, contextMenu, longPress };
}

// The document-level input modality (@livedoc/ui) reads the last press: a pointer or a key.
const lastPressWasPointer = () => document.dispatchEvent(new Event('pointerdown'));
const lastPressWasKey = () => document.dispatchEvent(new Event('keydown'));

describe('the element menu anchor', () => {
  it('opens at the pointer on a pointer right-click', () => {
    const h = harness();
    lastPressWasPointer();
    h.contextMenu();
    const { x, y } = pointerMenuAnchor(POINTER);
    expect(h.onContextSelect).toHaveBeenCalledWith('s', x, y);
  });

  it('opens beside the element from the keyboard', () => {
    const h = harness();
    lastPressWasKey();
    h.contextMenu();
    const { x, y } = elementMenuAnchor(ELEMENT);
    expect(h.onContextSelect).toHaveBeenCalledWith('s', x, y);
  });

  it('opens beside the element on a touch long-press', () => {
    const h = harness();
    lastPressWasPointer();
    h.longPress();
    const { x, y } = elementMenuAnchor(ELEMENT);
    expect(h.onContextSelect).toHaveBeenCalledWith('s', x, y);
  });

  it('opens at the event point from the keyboard when the element cannot be measured', () => {
    const h = harness({ measurable: false });
    lastPressWasKey();
    h.contextMenu();
    expect(h.onContextSelect).toHaveBeenCalledWith('s', POINTER.x, POINTER.y);
  });

  it('opens at the element origin on a long-press when the element cannot be measured', () => {
    const h = harness({ measurable: false });
    h.longPress();
    expect(h.onContextSelect).toHaveBeenCalledWith('s', 0, 0);
  });

  it('leaves a right-click during a label edit to the native text menu', () => {
    const h = harness({ isEditing: true });
    lastPressWasPointer();
    const e = h.contextMenu();
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(h.onContextSelect).not.toHaveBeenCalled();
  });
});
