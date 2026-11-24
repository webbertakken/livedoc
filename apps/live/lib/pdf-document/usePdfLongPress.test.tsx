// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a long press is one finger held still for
// PDF_LONG_PRESS_MS; a second finger, a lift, a move or a scroll the browser takes ends it; the browser's own menu
// for it is not shown.
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_DOUBLE_TAP_PX, PDF_LONG_PRESS_MS } from '@livedoc/pdf-documents';
import { usePdfLongPress } from './usePdfLongPress';

type Pointer = { id?: number; x?: number; y?: number; type?: string };

function pointer(
  element: HTMLElement,
  kind: string,
  { id = 1, x = 50, y = 60, type = 'touch' }: Pointer = {},
) {
  const event = new Event(kind, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: id, pointerType: type, clientX: x, clientY: y });
  element.dispatchEvent(event);
}

function menu(element: HTMLElement): Event {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function held(enabled = true) {
  const element = document.createElement('div');
  const onLongPress = vi.fn();
  const hook = renderHook(({ on }) => usePdfLongPress(element, on, onLongPress), {
    initialProps: { on: enabled },
  });
  return { element, onLongPress, hook };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePdfLongPress', () => {
  it('tells where a finger held still touched, once it has been held long enough', () => {
    const { element, onLongPress } = held();
    pointer(element, 'pointerdown');
    pointer(element, 'pointermove', { x: 51, y: 61 });
    vi.advanceTimersByTime(PDF_LONG_PRESS_MS - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledWith({ x: 50, y: 60 });
  });

  it('is none for a finger lifted, moved, taken by the browser, or joined by another', () => {
    const { element, onLongPress } = held();
    pointer(element, 'pointerdown');
    pointer(element, 'pointerup');
    pointer(element, 'pointerdown');
    pointer(element, 'pointermove', { x: 50 + PDF_DOUBLE_TAP_PX });
    pointer(element, 'pointerup');
    pointer(element, 'pointerdown');
    pointer(element, 'pointercancel');
    pointer(element, 'pointerdown');
    pointer(element, 'pointerdown', { id: 2 });
    pointer(element, 'pointermove', { id: 2 });
    vi.advanceTimersByTime(PDF_LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('leaves a mouse, and a page that does not listen, alone', () => {
    const { element, onLongPress } = held();
    pointer(element, 'pointerdown', { type: 'mouse' });
    vi.advanceTimersByTime(PDF_LONG_PRESS_MS);
    const off = held(false);
    pointer(off.element, 'pointerdown');
    vi.advanceTimersByTime(PDF_LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(off.onLongPress).not.toHaveBeenCalled();
  });

  it('keeps the browser’s menu from a held finger, never from a mouse', () => {
    const { element, hook } = held();
    expect(menu(element).defaultPrevented).toBe(false);
    pointer(element, 'pointerdown');
    expect(menu(element).defaultPrevented).toBe(true);
    hook.unmount();
    expect(menu(element).defaultPrevented).toBe(false);
  });
});
