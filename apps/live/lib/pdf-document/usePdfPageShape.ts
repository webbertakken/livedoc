'use client';

// A line or shape dragged on one page with a shape tool in hand (docs/specs/035-pdf-documents/marks.md "Making a
// mark"): from where the press lands to where the pointer is, held to the page and, with ⇧, square for a box; shown
// as it is dragged and handed over once let go. A second pointer, or a cancel, lets it go unmade.
import { useRef, useState, type PointerEvent } from 'react';
import type { BoxShape, LineShape, PagePoint } from '@livedoc/pdf-documents';
import { dragShape, shapeOf, type ScreenBox } from './pdf-shape';
import type { ShapeToolKind } from './pdf-shape-pick';

/** What a page draws a line or shape with, while a shape tool is in hand. */
export type PdfPageShaping = {
  readonly kind: ShapeToolKind;
  readonly colour: string;
  readonly opacity: number;
  readonly width: number;
  // `shape` null for a press: nothing to make.
  readonly onShape: (index: number, shape: LineShape | BoxShape | null) => void;
};

type Client = { x: number; y: number };

export function usePdfPageShape({
  index,
  shaping,
  pointAt,
  screenBox,
}: {
  index: number;
  // The shape tool's kind, look and where its marks go; null while another tool is in hand.
  shaping: PdfPageShaping | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: Client) => PagePoint | null;
  // The page's box on screen; null before it is laid out.
  screenBox: () => ScreenBox | null;
}) {
  const [draft, setDraft] = useState<LineShape | BoxShape | null>(null);
  // The pointer dragging, where it was pressed, and the shape so far, read as events arrive between renders.
  const dragging = useRef<{
    pointer: number;
    from: Client;
    start: PagePoint;
    shape: LineShape | BoxShape | null;
  } | null>(null);

  const letGo = () => {
    dragging.current = null;
    setDraft(null);
  };

  /** A press: a drag begun where it lands; true where the press is a shape tool's. */
  const down = (event: PointerEvent<HTMLElement>): boolean => {
    if (!shaping) return false;
    // A second pointer at once is no drag: the first is let go.
    if (dragging.current) {
      letGo();
      return true;
    }
    const from = { x: event.clientX, y: event.clientY };
    const start = event.button === 0 ? pointAt(from) : null;
    if (!start) return true;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragging.current = { pointer: event.pointerId, from, start, shape: null };
    return true;
  };

  const move = (event: PointerEvent<HTMLElement>): boolean => {
    const now = dragging.current;
    const box = now && shaping ? screenBox() : null;
    if (!now || !shaping || now.pointer !== event.pointerId || !box) return shaping !== null;
    const client = { x: event.clientX, y: event.clientY };
    const to = pointAt(dragShape(shaping.kind, now.from, client, box, event.shiftKey));
    now.shape = to ? shapeOf(shaping.kind, now.start, to, shaping.width) : null;
    setDraft(now.shape);
    return true;
  };

  /** The drag let go: handed over to be made, or, `made` false, let go. */
  const up = (event: PointerEvent<HTMLElement>, made: boolean): boolean => {
    const now = dragging.current;
    if (!now || now.pointer !== event.pointerId) return shaping !== null;
    letGo();
    if (made && shaping) shaping.onShape(index, now.shape);
    return true;
  };

  return { draft, active: shaping !== null, down, move, up };
}
