'use client';

// The handles of a selection a finger made (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): one
// below each end, a dot on a stem in the focus colour, 44 px to the finger; dragging one moves that end. Hidden from
// assistive technology: a keyboard and a mouse select without them.
import { useRef, type PointerEvent } from 'react';
import { PageView, type PageMatrix, type PagePoint, type Quad } from '@livedoc/pdf-documents';

export type PdfHandleEnd = 'start' | 'end';

// The handle's reach below the line, in CSS pixels: 44, a finger's.
const HANDLE_REACH_PX = 44;

// Where each handle hangs, in view space: below the first line's start and the last line's end, as the page shows.
function endsOf(matrix: PageMatrix, quads: readonly Quad[]): Record<PdfHandleEnd, PagePoint> {
  const first = PageView.quadToView(matrix, quads[0]!);
  const last = PageView.quadToView(matrix, quads.at(-1)!);
  return {
    start: {
      x: Math.min(...first.map((point) => point.x)),
      y: Math.max(...first.map((point) => point.y)),
    },
    end: {
      x: Math.max(...last.map((point) => point.x)),
      y: Math.max(...last.map((point) => point.y)),
    },
  };
}

export function PdfSelectionHandles({
  matrix,
  width,
  height,
  quads,
  onDrag,
}: {
  matrix: PageMatrix;
  // The page as it shows, in points: the view space's size.
  width: number;
  height: number;
  quads: readonly Quad[];
  // A handle dragged to a point of the window.
  onDrag: (end: PdfHandleEnd, client: { x: number; y: number }) => void;
}) {
  const dragging = useRef<PdfHandleEnd | null>(null);
  if (quads.length === 0) return null;
  const ends = endsOf(matrix, quads);
  const handle = (end: PdfHandleEnd) => {
    const at = ends[end];
    const onPointerDown = (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragging.current = end;
    };
    const onPointerMove = (event: PointerEvent<HTMLElement>) => {
      if (dragging.current !== end) return;
      event.stopPropagation();
      // The finger sits below the handle's dot: the caret is taken from just above it, on the line.
      onDrag(end, { x: event.clientX, y: event.clientY - HANDLE_REACH_PX / 2 });
    };
    const onLift = (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      dragging.current = null;
    };
    return (
      <span
        key={end}
        aria-hidden="true"
        data-pdf-handle={end}
        className="absolute flex size-11 -translate-x-1/2 touch-none justify-center"
        style={{ left: `${(at.x / width) * 100}%`, top: `${(at.y / height) * 100}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onLift}
        onPointerCancel={onLift}
      >
        <span className="h-2 w-0.5 bg-(--office-focus)" />
        <span className="absolute top-2 size-3 rounded-full bg-(--office-focus)" />
      </span>
    );
  };
  return (
    <>
      {handle('start')}
      {handle('end')}
    </>
  );
}
