'use client';

// What the pages hear themselves (docs/specs/035-pdf-documents/reading-surface.md "The pages"; keyboard-shortcuts.md
// "Reading"): ⌘ with the wheel, and a trackpad's pinch, zoom about the pointer; where one row shows at a time, a
// wheel or a key that scrolls, pushed past the row's end, turns to the next; ← and → turn a page where the pages fit
// across, Home and End go to the first and the last. Plain keys are heard on the pages alone, never in a field. Two
// fingers pinch and pan (usePdfTouchZoom.ts).
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { PDF_WHEEL_TURN_MS, PDF_WHEEL_ZOOM_RATE, PDF_ZOOM_SETTLE_MS } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import { PDF_PAGE_KEYS } from './pdf-shortcuts';
import { usePdfTouchZoom } from './usePdfTouchZoom';
import type { PdfViewer } from './usePdfView';

// A wheel that scrolls by lines or pages is told in pixels as a browser's own line is.
const LINE_PX = 16;
// The scroller's edge, within a pixel's rounding.
const EDGE_PX = 1;

type Pages = Pick<
  PdfViewer,
  'element' | 'zoomBy' | 'turn' | 'goToPage' | 'count' | 'layout' | 'viewport' | 'view'
>;

const pixelsOf = (event: WheelEvent, height: number): number =>
  event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * LINE_PX
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? event.deltaY * height
      : event.deltaY;

const atEnd = (element: HTMLElement) =>
  element.scrollTop + element.clientHeight >= element.scrollHeight - EDGE_PX;
const atStart = (element: HTMLElement) => element.scrollTop <= EDGE_PX;

export function usePdfPagesInput(pages: Pages): {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
} {
  const latest = useRef(pages);
  useEffect(() => {
    latest.current = pages;
  });
  const { element } = pages;
  usePdfTouchZoom(pages);

  useEffect(() => {
    if (!element) return;
    let lastWheel = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      const now = latest.current;
      const rested = event.timeStamp - lastWheel >= PDF_WHEEL_TURN_MS;
      lastWheel = event.timeStamp;
      // A trackpad's pinch comes as a wheel with Ctrl held.
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const factor = Math.exp(-pixelsOf(event, rect.height) * PDF_WHEEL_ZOOM_RATE);
        now.zoomBy(factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        clearTimeout(settle);
        settle = setTimeout(() => track('Pdf', 'Zoomed', 'Custom'), PDF_ZOOM_SETTLE_MS);
        return;
      }
      if (now.view.display.continuous || !rested || event.deltaY === 0) return;
      if (event.deltaY > 0 && atEnd(element)) now.turn(1);
      else if (event.deltaY < 0 && atStart(element)) now.turn(-1, true);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      clearTimeout(settle);
      element.removeEventListener('wheel', onWheel);
    };
  }, [element]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const now = latest.current;
    const scroller = now.element;
    if (!scroller || event.ctrlKey || event.metaKey || event.altKey) return;
    const fits = now.layout.width <= now.viewport.width;
    const key = event.key;
    if (key === PDF_PAGE_KEYS.firstPage) now.goToPage(0);
    else if (key === PDF_PAGE_KEYS.lastPage) now.goToPage(now.count - 1);
    else if (key === PDF_PAGE_KEYS.previousPage && fits) now.turn(-1);
    else if (key === PDF_PAGE_KEYS.nextPage && fits) now.turn(1);
    else if (!now.view.display.continuous && turnsForward(event) && atEnd(scroller)) now.turn(1);
    else if (!now.view.display.continuous && turnsBack(event) && atStart(scroller))
      now.turn(-1, true);
    else return;
    event.preventDefault();
  }, []);

  return { onKeyDown };
}

const turnsForward = (event: KeyboardEvent<HTMLElement>) =>
  event.key === 'ArrowDown' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey);
const turnsBack = (event: KeyboardEvent<HTMLElement>) =>
  event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
