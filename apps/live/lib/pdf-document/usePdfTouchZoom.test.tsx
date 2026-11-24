// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a pinch zooms the pages about the fingers and two
// fingers pan; one finger is the browser's own scroll; a pinch's zoom is told to telemetry once, as it settles.
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_ZOOM_SETTLE_MS } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import { usePdfTouchZoom } from './usePdfTouchZoom';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

type Finger = { clientX: number; clientY: number };

function touch(element: HTMLElement, type: string, fingers: Finger[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: fingers });
  element.dispatchEvent(event);
  return event;
}

const apart = (x: number, y: number, half: number): Finger[] => [
  { clientX: x - half, clientY: y },
  { clientX: x + half, clientY: y },
];

function pages() {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
  const zoomBy = vi.fn();
  renderHook(() => usePdfTouchZoom({ element, zoomBy }));
  return { element, zoomBy };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePdfTouchZoom', () => {
  it('zooms by how far two fingers spread, about where they were, to where they went', () => {
    const { element, zoomBy } = pages();
    touch(element, 'touchstart', apart(110, 220, 50));
    const moved = touch(element, 'touchmove', apart(130, 200, 100));

    expect(moved.defaultPrevented).toBe(true);
    expect(zoomBy).toHaveBeenCalledWith(2, { x: 100, y: 200 }, { x: 120, y: 180 });
  });

  it('tells telemetry once, as the pinch settles', () => {
    const { element } = pages();
    touch(element, 'touchstart', apart(110, 220, 50));
    touch(element, 'touchmove', apart(110, 220, 60));
    touch(element, 'touchmove', apart(110, 220, 70));
    vi.advanceTimersByTime(PDF_ZOOM_SETTLE_MS);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Pdf', 'Zoomed', 'Custom');
  });

  it('leaves one finger to the browser, and starts again as a second lands', () => {
    const { element, zoomBy } = pages();
    touch(element, 'touchstart', [{ clientX: 50, clientY: 50 }]);
    const scrolled = touch(element, 'touchmove', [{ clientX: 50, clientY: 90 }]);
    touch(element, 'touchstart', apart(110, 220, 50));
    touch(element, 'touchend', [{ clientX: 60, clientY: 220 }]);
    touch(element, 'touchmove', apart(110, 220, 80));

    expect(scrolled.defaultPrevented).toBe(false);
    expect(zoomBy).not.toHaveBeenCalled();
  });

  it('holds still for two fingers that land on one point', () => {
    const { element, zoomBy } = pages();
    touch(element, 'touchstart', apart(110, 220, 0));
    touch(element, 'touchmove', apart(120, 220, 10));

    expect(zoomBy).toHaveBeenCalledWith(1, { x: 100, y: 200 }, { x: 110, y: 200 });
  });

  it('hears nothing while the pages are not there, and stops as they go', () => {
    renderHook(() => usePdfTouchZoom({ element: null, zoomBy: vi.fn() }));
    const element = document.createElement('div');
    const zoomBy = vi.fn();
    const hook = renderHook(() => usePdfTouchZoom({ element, zoomBy }));
    hook.unmount();
    touch(element, 'touchstart', apart(110, 220, 50));
    touch(element, 'touchmove', apart(110, 220, 80));

    expect(zoomBy).not.toHaveBeenCalled();
  });
});
