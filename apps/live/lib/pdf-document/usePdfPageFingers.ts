'use client';

// One finger on a page with Select in hand (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): a tap
// selects the mark it lands on, or else clears the selection, as a press does; a double tap hands its point over to zoom to the column; a long press selects
// the word under it. A finger's presses in a row never select: the page asks `byFinger` before it does.
import { useRef, type PointerEvent } from 'react';
import { PageView, type PageMatrix, type PagePoint } from '@livedoc/pdf-documents';
import { PdfDoubleTap } from './pdf-double-tap';
import type { PdfPageTap } from './usePdfColumnZoom';
import { usePdfLongPress } from './usePdfLongPress';
import type { PdfTextGesture } from './usePdfTextSelection';

type Client = { x: number; y: number };

const touchOf = (event: PointerEvent<HTMLElement>) => ({
  id: event.pointerId,
  x: event.clientX,
  y: event.clientY,
  time: event.timeStamp,
});

export function usePdfPageFingers({
  index,
  box,
  toView,
  shown,
  pointAt,
  onText,
  onDoubleTap,
  onTap,
}: {
  index: number;
  // The page's box, once it is in the document.
  box: HTMLElement | null;
  // The page drawn: its matrix to view space, and its size as it shows, in points. Null with Select not in hand.
  toView: PageMatrix | null;
  shown: { width: number; height: number };
  // A point of the window on the page, as the file has it.
  pointAt: (client: Client) => PagePoint | null;
  onText: (index: number, gesture: PdfTextGesture) => void;
  onDoubleTap: (index: number, tap: PdfPageTap) => void;
  // A tap at a point of the page: true where a mark there took it (marks.md "Changing a mark").
  onTap: (at: PagePoint) => boolean;
}) {
  const taps = useRef(PdfDoubleTap.initial());
  // What last pressed: a finger's presses in a row zoom, never select.
  const pressedBy = useRef('');

  usePdfLongPress(box, toView !== null, (client) => {
    const at = pointAt(client);
    if (at) onText(index, { kind: 'long-press', at });
  });

  const down = (event: PointerEvent<HTMLElement>) => {
    pressedBy.current = event.pointerType;
    if (event.pointerType === 'touch')
      taps.current = PdfDoubleTap.down(taps.current, touchOf(event));
  };

  const up = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    const { state, tapped } = PdfDoubleTap.up(taps.current, touchOf(event));
    taps.current = state;
    const client = { x: event.clientX, y: event.clientY };
    const at = toView ? pointAt(client) : null;
    if (!at || !toView) return;
    if (!tapped) {
      if (state.last && !onTap(at)) onText(index, { kind: 'press', at, shift: false, alt: false });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    onDoubleTap(index, {
      at,
      client,
      toClient: (point) => {
        const shownAt = PageView.toView(toView, point);
        return {
          x: rect.left + (shownAt.x / shown.width) * rect.width,
          y: rect.top + (shownAt.y / shown.height) * rect.height,
        };
      },
    });
  };

  const cancel = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch')
      taps.current = PdfDoubleTap.cancel(taps.current, event.pointerId);
  };

  return { down, up, cancel, byFinger: () => pressedBy.current === 'touch' };
}
