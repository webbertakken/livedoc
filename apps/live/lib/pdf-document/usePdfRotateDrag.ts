'use client';

// A drag of the rotate handle (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate, The handle): pointer
// events captured on the handle, the mark drawn turned as the drag goes, snapped; letting go turns it, one change;
// Escape or a cancelled drag puts it back. A finger drags it as a pointer does.
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Mark as Marks,
  MarkTurn,
  PageView,
  type Box,
  type Mark,
  type MarkTurned,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';
import { rotateDraft, type RotateDraft } from './pdf-rotate-handle';

export type PdfRotateDrag = {
  /** The mark as the drag has it now: the mark itself before a drag and after. */
  readonly shown: Mark;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
};

/** Whether a drag's last turn changes the mark: a boxed mark to another angle, one that turns its points at all. */
const changes = (mark: Mark, draft: RotateDraft): boolean =>
  Marks.turnsByBox(mark)
    ? (MarkTurn.normal(draft.to) ?? 0) !== MarkTurn.angleOf(mark)
    : MarkTurn.normal(draft.to) !== undefined;

export function usePdfRotateDrag({
  mark,
  matrix,
  rest,
  toView,
  pageBox,
  onPreview,
  onTurn,
}: {
  mark: Mark;
  // Page space to view space, as the page is drawn.
  matrix: PageMatrix;
  // Where the handle stands before the drag, in view space.
  rest: PagePoint;
  // A point of the window in view space; null before the page is laid out.
  toView: (client: { x: number; y: number }) => PagePoint | null;
  // The page as the file has it, in page space; null before it is drawn.
  pageBox: () => Box | null;
  // The mark as the drag has it, while it lasts; null once it ends.
  onPreview: (place: MarkTurned | null) => void;
  // Let go: the angle asked (a mark that turns its points, how far).
  onTurn: (to: number) => void;
}): PdfRotateDrag {
  const drag = useRef<{ pointerId: number; rest: PagePoint } | null>(null);
  const draft = useRef<RotateDraft | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<MarkTurned | null>(null);

  const end = useCallback(() => {
    drag.current = null;
    draft.current = null;
    setDragging(false);
    setPreview(null);
    onPreview(null);
  }, [onPreview]);

  // Escape puts the mark back while the drag lasts; the drag itself ends once the pointer lets go.
  useEffect(() => {
    if (!dragging) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      end();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dragging, end]);

  return {
    shown: preview ? { ...mark, ...preview } : mark,
    onPointerDown: (event) => {
      event.stopPropagation();
      event.preventDefault();
      const page = PageView.toPage(matrix, rest);
      if (!page) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, rest: page };
      setDragging(true);
    },
    onPointerMove: (event) => {
      const held = drag.current;
      if (held?.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const view = toView({ x: event.clientX, y: event.clientY });
      const pointer = view ? PageView.toPage(matrix, view) : null;
      const page = pageBox();
      const next = pointer && page ? rotateDraft(mark, held.rest, pointer, page) : null;
      if (!next) return;
      draft.current = next;
      setPreview(next.place);
      onPreview(next.place);
    },
    onPointerUp: (event) => {
      event.stopPropagation();
      const last = drag.current?.pointerId === event.pointerId ? draft.current : null;
      end();
      if (last && changes(mark, last)) onTurn(last.to);
    },
    onPointerCancel: (event) => {
      event.stopPropagation();
      end();
    },
  };
}
