'use client';

// One PDF page on the surface (docs/specs/035-pdf-documents/reading-surface.md "The pages"; marks.md "Making a
// mark"): a box of the page's true size from the first frame, the engine's picture of it once it is near view, and
// LiveDoc's marks drawn over that picture from the live changes. The file's own marks are in the picture. Nothing of
// the file reaches the page as markup: pixels, and geometry LiveDoc draws itself.
import { memo, useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  PageView,
  type Mark,
  type PageBitmap,
  type PageInfo,
  type PageMatrix,
  type PagePoint,
  type PdfEngine,
  type Quad,
  type TextSelection,
} from '@livedoc/pdf-documents';
import { pictureScale, type PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';

// How long a page waits after its size last changed before it is drawn again, so a zoom or a resize under way
// redraws once. Safe range: 80 to 400 ms.
const REDRAW_SETTLE_MS = 150;

export type PdfPageTool = 'select' | 'highlight';

// `by`: the drawer that drew it. A replaced stored file comes with another, and the page is then drawn again,
// its picture staying until the new one arrives (live-editing-and-storage.md "Replacing the stored file").
type Drawn = {
  toView: PageMatrix;
  scale: number;
  fileMarks: readonly string[];
  by: PdfPageDrawer;
};

const pointsOf = (matrix: PageMatrix, quad: Quad): string =>
  // The standard orders a quad upper left, upper right, lower left, lower right: around its edge is 0, 1, 3, 2.
  [0, 1, 3, 2]
    .map((corner) => PageView.quadToView(matrix, quad)[corner]!)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');

function paint(canvas: HTMLCanvasElement, bitmap: PageBitmap): void {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas
    .getContext('2d')
    ?.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
}

export const PdfPage = memo(function PdfPage({
  index,
  count,
  page,
  cssPerPoint,
  wanted,
  held,
  engine,
  drawer,
  marks,
  tool,
  onHighlight,
  register,
}: {
  index: number;
  count: number;
  page: PageInfo;
  // CSS pixels a point, at the zoom shown.
  cssPerPoint: number;
  // Near view: its picture is drawn. Held: its picture is kept though it left view.
  wanted: boolean;
  held: boolean;
  engine: Pick<PdfEngine, 'selectText' | 'fileMarks'>;
  drawer: PdfPageDrawer;
  marks: readonly Mark[];
  tool: PdfPageTool;
  onHighlight: (index: number, selection: TextSelection) => void;
  // Hands the page's box to whoever watches which pages are near view.
  register: (index: number, element: HTMLElement | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<readonly Quad[]>([]);
  const drag = useRef<{ from: PagePoint; asking: boolean; next: PagePoint | null } | null>(null);

  // Draw the page while it is near view, again once its size has settled on another scale; let its picture go once
  // it is far from view.
  useEffect(() => {
    if (!held) {
      drawer.forget(index);
      if (canvas.current) canvas.current.width = canvas.current.height = 0;
      setDrawn(null);
      return;
    }
    if (!wanted) return;
    const scale = pictureScale(page, cssPerPoint, window.devicePixelRatio || 1);
    if (drawn && drawn.by === drawer && Math.abs(drawn.scale - scale) < 0.01) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void drawer.draw(index, scale).then(async (bitmap) => {
          if (cancelled) return;
          if (!bitmap) return setFailed(true);
          const fileMarks = await engine.fileMarks(index);
          if (cancelled || !canvas.current) return;
          paint(canvas.current, bitmap);
          setFailed(false);
          const marks = fileMarks.map((mark) => mark.id);
          setDrawn({ toView: bitmap.toView, scale, fileMarks: marks, by: drawer });
        });
      },
      drawn ? REDRAW_SETTLE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted, held, cssPerPoint, page, index, drawer, engine, drawn]);

  // A pointer's place on the page as the file has it (marks.md: a mark is made on the page as the file has it).
  const pagePoint = (event: PointerEvent<HTMLElement>): PagePoint | null => {
    if (!drawn) return null;
    const box = event.currentTarget.getBoundingClientRect();
    return PageView.toPage(drawn.toView, {
      x: ((event.clientX - box.left) / box.width) * page.width,
      y: ((event.clientY - box.top) / box.height) * page.height,
    });
  };

  // The text under the drag so far, asked one at a time: the latest place always follows.
  const previewTo = (to: PagePoint) => {
    const dragging = drag.current;
    if (!dragging) return;
    if (dragging.asking) {
      dragging.next = to;
      return;
    }
    dragging.asking = true;
    void engine.selectText(index, dragging.from, to).then((selection) => {
      if (drag.current !== dragging) return;
      dragging.asking = false;
      setPreview(selection?.quads ?? []);
      const next = dragging.next;
      dragging.next = null;
      if (next) previewTo(next);
    });
  };

  const marking = tool === 'highlight' && drawn !== null;
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!marking || event.button !== 0) return;
    const from = pagePoint(event);
    if (!from) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { from, asking: false, next: null };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const to = drag.current ? pagePoint(event) : null;
    if (to) previewTo(to);
  };
  const endDrag = (event: PointerEvent<HTMLElement>, make: boolean) => {
    const dragging = drag.current;
    drag.current = null;
    setPreview([]);
    const to = dragging && make ? pagePoint(event) : null;
    if (!dragging || !to) return;
    void engine.selectText(index, dragging.from, to).then((selection) => {
      if (selection) onHighlight(index, selection);
    });
  };

  const matrix = drawn?.toView;
  return (
    <div
      ref={(element) => register(index, element)}
      role="region"
      aria-label={`Page ${index + 1} of ${count}`}
      data-pdf-page={index + 1}
      data-pdf-page-name={page.name}
      data-pdf-page-drawn={drawn ? 'true' : 'false'}
      data-pdf-file-marks={drawn?.fileMarks.join(' ') ?? ''}
      className={`relative shrink-0 bg-white shadow-sm outline outline-1 outline-(--office-line) ${
        marking ? 'cursor-text touch-none' : ''
      }`}
      style={{ width: page.width * cssPerPoint, height: page.height * cssPerPoint }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
    >
      <canvas ref={canvas} aria-hidden="true" className="block h-full w-full" />
      {matrix ? (
        // Multiplied onto the page, so the words under a highlight keep their own colour (marks.md).
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${page.width} ${page.height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full mix-blend-multiply"
        >
          {marks.map((mark) => (
            <g
              key={mark.id}
              data-pdf-mark={mark.id}
              data-pdf-mark-kind={mark.kind}
              fill={mark.colour}
              opacity={mark.opacity}
            >
              {mark.quads.map((quad, at) => (
                <polygon key={at} points={pointsOf(matrix, quad)} />
              ))}
            </g>
          ))}
          {preview.length > 0 ? (
            <g data-pdf-mark-preview="true" fill="#bae6fd">
              {preview.map((quad, at) => (
                <polygon key={at} points={pointsOf(matrix, quad)} />
              ))}
            </g>
          ) : null}
        </svg>
      ) : null}
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
          This page couldn’t be drawn.
        </p>
      ) : null}
    </div>
  );
});
