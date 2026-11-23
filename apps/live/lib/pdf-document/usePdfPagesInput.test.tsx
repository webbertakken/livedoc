// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages" (Zoom: ⌘ with the wheel and a pinch about the pointer;
// Single page and Two pages: a wheel or a key pushed past the row's end turns it, a wheel once until it rests);
// keyboard-shortcuts.md "Reading" (← and → turn a page where the pages fit, Home and End): what the pages hear.
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_WHEEL_TURN_MS } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import { PdfView } from './pdf-view';
import { usePdfPagesInput } from './usePdfPagesInput';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

type Scrolled = { top: number; height: number; content: number };

function pages(over: { continuous?: boolean; wide?: boolean; scrolled?: Scrolled } = {}) {
  const element = document.createElement('div');
  const scrolled = over.scrolled ?? { top: 0, height: 800, content: 800 };
  Object.defineProperty(element, 'scrollTop', { get: () => scrolled.top });
  Object.defineProperty(element, 'clientHeight', { get: () => scrolled.height });
  Object.defineProperty(element, 'scrollHeight', { get: () => scrolled.content });
  element.getBoundingClientRect = () => ({ left: 100, top: 50, height: 800 }) as DOMRect;
  const view = PdfView.withDisplay(
    PdfView.initial(),
    over.continuous === false ? 'single' : 'continuous',
  );
  const at = {
    element,
    view,
    count: 9,
    layout: { width: over.wide ? 2000 : 1000, height: 800, boxes: [] },
    viewport: { width: 1000, height: 800 },
    zoomBy: vi.fn(),
    turn: vi.fn(),
    goToPage: vi.fn(),
  };
  renderHook(() => usePdfPagesInput(at));
  return { at, element, scrolled };
}

function wheel(element: HTMLElement, init: WheelEventInit, at: number): WheelEvent {
  const event = new WheelEvent('wheel', { cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: at });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function key(
  input: ReturnType<typeof usePdfPagesInput>,
  name: string,
  over: Partial<KeyboardEvent<HTMLElement>> = {},
) {
  const preventDefault = vi.fn();
  input.onKeyDown({
    key: name,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault,
    ...over,
  } as unknown as KeyboardEvent<HTMLElement>);
  return preventDefault;
}

function keys(over: Parameters<typeof pages>[0] = {}) {
  const made = pages(over);
  const { result } = renderHook(() => usePdfPagesInput(made.at));
  return { ...made, input: result.current };
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(track).mockClear();
});

describe('the wheel on the pages', () => {
  it('zooms about the pointer with ⌘ or Ctrl held, the browser’s own zoom kept off', () => {
    vi.useFakeTimers();
    const { at, element } = pages();
    const event = wheel(element, { deltaY: -100, ctrlKey: true, clientX: 400, clientY: 250 }, 1000);
    expect(event.defaultPrevented).toBe(true);
    expect(at.zoomBy).toHaveBeenCalledOnce();
    const [factor, focus] = at.zoomBy.mock.calls[0]!;
    expect(factor).toBeCloseTo(Math.exp(0.2), 9);
    expect(focus).toEqual({ x: 300, y: 200 });
    wheel(element, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE, metaKey: true }, 1010);
    expect(at.zoomBy.mock.calls[1]![0]).toBeCloseTo(Math.exp(-48 * 0.002), 9);
    // "Telemetry": a wheel's zoom is told once, as it settles.
    expect(track).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(vi.mocked(track).mock.calls).toEqual([['Pdf', 'Zoomed', 'Custom']]);
  });

  it('scrolls as a browser does where every row is down the view', () => {
    const { at, element } = pages({ scrolled: { top: 0, height: 800, content: 800 } });
    const event = wheel(element, { deltaY: 100 }, 1000);
    expect(event.defaultPrevented).toBe(false);
    expect(at.turn).not.toHaveBeenCalled();
  });

  it('turns to the next row past the end of the row shown, and to the one before past its start', () => {
    const scrolled = { top: 400, height: 800, content: 1200 };
    const { at, element } = pages({ continuous: false, scrolled });
    wheel(element, { deltaY: 100 }, 1000);
    expect(at.turn).toHaveBeenCalledWith(1);
    scrolled.top = 0;
    wheel(element, { deltaY: -100 }, 2000);
    expect(at.turn).toHaveBeenLastCalledWith(-1, true);
  });

  it('turns one row, then none until the wheel has rested', () => {
    const { at, element } = pages({ continuous: false });
    wheel(element, { deltaY: 40 }, 1000);
    wheel(element, { deltaY: 40 }, 1000 + PDF_WHEEL_TURN_MS - 1);
    wheel(element, { deltaY: 40 }, 1000 + 2 * PDF_WHEEL_TURN_MS - 2);
    expect(at.turn).toHaveBeenCalledOnce();
    wheel(element, { deltaY: 40 }, 1000 + 3 * PDF_WHEEL_TURN_MS);
    expect(at.turn).toHaveBeenCalledTimes(2);
  });

  it('does not turn within the row', () => {
    const { at, element } = pages({
      continuous: false,
      scrolled: { top: 100, height: 800, content: 1200 },
    });
    wheel(element, { deltaY: 100 }, 1000);
    wheel(element, { deltaY: -100 }, 2000);
    expect(at.turn).not.toHaveBeenCalled();
  });
});

describe('the keys on the pages', () => {
  it('goes to the first and the last page with Home and End', () => {
    const { at, input } = keys();
    expect(key(input, 'Home')).toHaveBeenCalled();
    key(input, 'End');
    expect(at.goToPage.mock.calls).toEqual([[0], [8]]);
  });

  // "Where the pages fit, ← and → turn the page."
  it('turns a page with ← and → where the pages fit across', () => {
    const { at, input } = keys();
    key(input, 'ArrowLeft');
    key(input, 'ArrowRight');
    expect(at.turn.mock.calls).toEqual([[-1], [1]]);
  });

  // "Where the pages are wider than the view, ← and → scroll them sideways, as a browser does."
  it('leaves ← and → to scroll where the pages are wider than the view', () => {
    const { at, input } = keys({ wide: true });
    expect(key(input, 'ArrowRight')).not.toHaveBeenCalled();
    expect(at.turn).not.toHaveBeenCalled();
  });

  it('leaves a key with a modifier to the shortcuts', () => {
    const { at, input } = keys();
    key(input, 'Home', { ctrlKey: true });
    key(input, 'ArrowLeft', { altKey: true });
    expect([at.goToPage, at.turn].map((move) => move.mock.calls.length)).toEqual([0, 0]);
  });

  // keyboard-shortcuts.md "Reading": "In Single page and Two pages, a key that scrolls turns the row at the row's end."
  it('turns the row shown with a key that scrolls, pushed past its end or its start', () => {
    const scrolled = { top: 400, height: 800, content: 1200 };
    const { at, input } = keys({ continuous: false, scrolled });
    key(input, 'ArrowDown');
    key(input, 'PageDown');
    key(input, ' ');
    expect(at.turn.mock.calls).toEqual([[1], [1], [1]]);
    scrolled.top = 0;
    key(input, 'ArrowUp');
    key(input, ' ', { shiftKey: true });
    expect(at.turn.mock.calls.slice(3)).toEqual([
      [-1, true],
      [-1, true],
    ]);
  });

  it('leaves the keys that scroll to scroll within the row, and in a continuous display', () => {
    const inRow = keys({ continuous: false, scrolled: { top: 100, height: 800, content: 1200 } });
    expect(key(inRow.input, 'ArrowDown')).not.toHaveBeenCalled();
    const down = keys({ scrolled: { top: 400, height: 800, content: 1200 } });
    expect(key(down.input, 'PageDown')).not.toHaveBeenCalled();
    expect(inRow.at.turn).not.toHaveBeenCalled();
    expect(down.at.turn).not.toHaveBeenCalled();
  });
});
