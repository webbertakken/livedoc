'use client';

// Two fingers on the pages (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): a pinch zooms the
// pages about the fingers and the fingers pan them, the place under their middle staying under it. The pages hold
// `touch-action: pan-x pan-y`, so one finger is the browser's own scroll and a pinch on them never zooms the page
// around them; a pinch elsewhere still does (accessibility.md "Seeing").
import { useEffect, useRef } from 'react';
import { PDF_ZOOM_SETTLE_MS } from '@livedoc/pdf-documents';
import { track } from '@/lib/telemetry';
import type { PdfViewer } from './usePdfView';

type Point = { x: number; y: number };
type Pair = readonly [Point, Point];

const middleOf = ([a, b]: Pair): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const spanOf = ([a, b]: Pair): number => Math.hypot(a.x - b.x, a.y - b.y);

export function usePdfTouchZoom(pages: Pick<PdfViewer, 'element' | 'zoomBy'>): void {
  const latest = useRef(pages);
  useEffect(() => {
    latest.current = pages;
  });
  const { element } = pages;

  useEffect(() => {
    if (!element) return;
    let last: Pair | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    // Two fingers, in the pages' own place; none for one finger or three.
    const pairOf = ({ touches }: TouchEvent): Pair | null => {
      if (touches.length !== 2) return null;
      const { left, top } = element.getBoundingClientRect();
      const at = (finger: Touch): Point => ({ x: finger.clientX - left, y: finger.clientY - top });
      return [at(touches[0]!), at(touches[1]!)];
    };
    const onFingers = (event: TouchEvent) => {
      last = pairOf(event);
    };
    const onMove = (event: TouchEvent) => {
      const now = pairOf(event);
      if (!now) {
        last = null;
        return;
      }
      event.preventDefault();
      if (last) {
        const before = spanOf(last);
        const factor = before > 0 ? spanOf(now) / before : 1;
        latest.current.zoomBy(factor, middleOf(last), middleOf(now));
        clearTimeout(settle);
        settle = setTimeout(() => track('Pdf', 'Zoomed', 'Custom'), PDF_ZOOM_SETTLE_MS);
      }
      last = now;
    };
    element.addEventListener('touchstart', onFingers, { passive: true });
    element.addEventListener('touchend', onFingers, { passive: true });
    element.addEventListener('touchcancel', onFingers, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      clearTimeout(settle);
      element.removeEventListener('touchstart', onFingers);
      element.removeEventListener('touchend', onFingers);
      element.removeEventListener('touchcancel', onFingers);
      element.removeEventListener('touchmove', onMove);
    };
  }, [element]);
}
