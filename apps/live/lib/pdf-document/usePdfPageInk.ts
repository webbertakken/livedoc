'use client';

// A stroke drawn on one page with the Drawing tool in hand (docs/specs/035-pdf-documents/marks.md "Making a mark": A
// Drawing): by a mouse, a pen or one finger; its points kept in page space as the pointer passes, shown as it is
// drawn, and handed over once it ends. A second finger, or a cancel, lets the stroke go unmade.
import { useRef, useState, type PointerEvent } from 'react';
import type { PagePoint, Stroke } from '@livedoc/pdf-documents';
import { extendStroke } from './pdf-drawing';
import type { PdfPageInk } from './usePdfMarkTools';

const NO_STROKE: Stroke = [];

export function usePdfPageInk({
  index,
  ink,
  pointAt,
}: {
  index: number;
  // The Drawing tool's look and where a stroke goes; null while another tool is in hand.
  ink: PdfPageInk | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
}) {
  const [stroke, setStroke] = useState<Stroke>(NO_STROKE);
  // The pointer drawing, and the stroke so far, read as events arrive between renders.
  const drawing = useRef<{ pointer: number; stroke: Stroke } | null>(null);

  const at = (event: PointerEvent<HTMLElement>) => pointAt({ x: event.clientX, y: event.clientY });

  /** A press: a stroke begun where it lands; true where the press is the Drawing tool's. */
  const down = (event: PointerEvent<HTMLElement>): boolean => {
    if (!ink) return false;
    if (drawing.current) {
      // A second pointer at once is no stroke: the first is let go.
      drawing.current = null;
      setStroke(NO_STROKE);
      return true;
    }
    const point = event.button === 0 ? at(event) : null;
    if (!point) return true;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = { pointer: event.pointerId, stroke: extendStroke(NO_STROKE, point) };
    setStroke(drawing.current.stroke);
    return true;
  };

  const move = (event: PointerEvent<HTMLElement>): boolean => {
    const now = drawing.current;
    if (!now || now.pointer !== event.pointerId) return ink !== null;
    const point = at(event);
    const next = point ? extendStroke(now.stroke, point) : now.stroke;
    if (next !== now.stroke) {
      now.stroke = next;
      setStroke(next);
    }
    return true;
  };

  /** The stroke ended: handed over to be made, or, `made` false, let go. */
  const up = (event: PointerEvent<HTMLElement>, made: boolean): boolean => {
    const now = drawing.current;
    if (!now || now.pointer !== event.pointerId) return ink !== null;
    drawing.current = null;
    setStroke(NO_STROKE);
    if (made && ink) ink.onDraw(index, now.stroke);
    return true;
  };

  return { stroke, active: ink !== null, down, move, up };
}
