'use client';

// The handles of one selected mark (docs/specs/035-pdf-documents/marks.md "Changing a mark": Handles; "Keyboard and
// accessibility": 24 px targets, 44 on touch): a small square in the focus colour on each, dragged to resize the mark,
// shown as it goes and handed over once let go. Hidden from assistive technology: ⌥ with the arrow keys is their
// keyboard equal.
import { useRef, useState, type PointerEvent } from 'react';
import type {
  Box,
  Mark,
  MarkHandle,
  MarkPlace,
  PageMatrix,
  PagePoint,
} from '@livedoc/pdf-documents';
import { dragHandle, handlePlaces } from '@/lib/pdf-document/pdf-mark-handles';

/** Each handle's cursor, as the side or corner it sizes shows. */
const CURSORS: Readonly<Record<MarkHandle, string>> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  start: 'cursor-move',
  end: 'cursor-move',
  tip: 'cursor-move',
  knee: 'cursor-move',
};

export function PdfMarkHandles({
  mark,
  matrix,
  width,
  height,
  toView,
  pageBox,
  onPreview,
  onReshape,
}: {
  mark: Mark;
  // Page space to view space, as the page is drawn.
  matrix: PageMatrix;
  // The page as it shows, in points: the view space's size.
  width: number;
  height: number;
  // A point of the window in view space; null before the page is laid out.
  toView: (client: { x: number; y: number }) => PagePoint | null;
  // The page as the file has it, in page space; null before it is drawn.
  pageBox: () => Box | null;
  // The mark as a drag has it, while it lasts; null once it ends.
  onPreview: (place: MarkPlace | null) => void;
  // The mark resized, once let go.
  onReshape: (place: MarkPlace) => void;
}) {
  const dragging = useRef<{ handle: MarkHandle; pointerId: number } | null>(null);
  const [place, setPlace] = useState<MarkPlace | null>(null);

  const placeAt = (event: PointerEvent<HTMLElement>, handle: MarkHandle): MarkPlace | null => {
    const to = toView({ x: event.clientX, y: event.clientY });
    const page = pageBox();
    return to && page ? dragHandle(mark, handle, matrix, to, event.shiftKey, page) : null;
  };

  return handlePlaces(mark, matrix).map(({ handle, at }) => (
    <span
      key={handle}
      aria-hidden="true"
      data-pdf-mark-handle={handle}
      className={`absolute flex size-chip -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center pointer-coarse:size-11 ${CURSORS[handle]}`}
      style={{ left: `${(at.x / width) * 100}%`, top: `${(at.y / height) * 100}%` }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = { handle, pointerId: event.pointerId };
      }}
      onPointerMove={(event) => {
        if (dragging.current?.handle !== handle) return;
        event.stopPropagation();
        const next = placeAt(event, handle);
        if (!next) return;
        setPlace(next);
        onPreview(next);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (dragging.current?.handle === handle && place) onReshape(place);
        dragging.current = null;
        setPlace(null);
        onPreview(null);
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        dragging.current = null;
        setPlace(null);
        onPreview(null);
      }}
    >
      <span className="size-2 rounded-control bg-(--office-focus) outline outline-1 outline-(--office-ground)" />
    </span>
  ));
}
