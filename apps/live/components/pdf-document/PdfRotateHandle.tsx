'use client';

// The rotate handle of one selected mark that turns (docs/specs/035-pdf-documents/marks.md "Changing a mark": Rotate,
// The handle; "Keyboard and accessibility": 24 px targets, 44 on touch): a round handle in the focus colour a gap above
// the top of its box as it shows, joined to it by a line, dragged to turn the mark, snapped. Hidden from assistive
// technology like the other handles: Format > Rotate and Properties' Angle are its keyboard equals.
import type { Box, Mark, MarkTurned, PageMatrix, PagePoint } from '@livedoc/pdf-documents';
import { rotateHandlePlace } from '@/lib/pdf-document/pdf-rotate-handle';
import { usePdfRotateDrag } from '@/lib/pdf-document/usePdfRotateDrag';

export function PdfRotateHandle({
  mark,
  matrix,
  width,
  height,
  gap,
  toView,
  pageBox,
  onPreview,
  onTurn,
}: {
  mark: Mark;
  // Page space to view space, as the page is drawn.
  matrix: PageMatrix;
  // The page as it shows, in points: the view space's size.
  width: number;
  height: number;
  // PDF_ROTATE_HANDLE_GAP_PX in view units at the page's scale.
  gap: number;
  // A point of the window in view space; null before the page is laid out.
  toView: (client: { x: number; y: number }) => PagePoint | null;
  // The page as the file has it, in page space; null before it is drawn.
  pageBox: () => Box | null;
  // The mark as a drag has it, while it lasts; null once it ends.
  onPreview: (place: MarkTurned | null) => void;
  // Let go: the angle asked (a mark that turns its points, how far).
  onTurn: (to: number) => void;
}) {
  const rest = rotateHandlePlace(mark, matrix, gap);
  const drag = usePdfRotateDrag({
    mark,
    matrix,
    rest: rest?.at ?? { x: 0, y: 0 },
    toView,
    pageBox,
    onPreview,
    onTurn,
  });
  // The handle goes round with the mark as the drag turns it.
  const place = rotateHandlePlace(drag.shown, matrix, gap);
  if (!place) return null;
  const { foot, at } = place;
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full stroke-(--office-focus)"
      >
        <line
          data-pdf-rotate-line={mark.id}
          x1={foot.x}
          y1={foot.y}
          x2={at.x}
          y2={at.y}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden="true"
        data-pdf-rotate-handle={mark.id}
        className="absolute flex size-chip -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center pointer-coarse:size-11"
        style={{ left: `${(at.x / width) * 100}%`, top: `${(at.y / height) * 100}%` }}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
      >
        <span className="size-icon-chevron rounded-full bg-(--office-focus) outline outline-1 outline-(--office-ground)" />
      </span>
    </>
  );
}
