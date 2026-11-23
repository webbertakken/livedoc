'use client';

// One PDF page on the surface (docs/specs/035-pdf-documents/reading-surface.md "The pages"; marks.md "Making a
// mark"): a box of the page's true size from the first frame, the engine's picture of it once it is near view, and
// LiveDoc's marks drawn over that picture from the live changes. The file's own marks are in the picture. Nothing of
// the file reaches the page as markup: pixels, and geometry LiveDoc draws itself.
import { memo, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import {
  PageView,
  type LinkTarget,
  type Mark,
  type PageInfo,
  type PageLink,
  type PageMatrix,
  type PagePoint,
  type PageTurns,
  type PdfEngine,
  type Quad,
  type TextSelection,
} from '@livedoc/pdf-documents';
import { pictureScale, type PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { PdfMarksOverlay } from './PdfMarksOverlay';
import { PdfPageLinks } from './PdfPageLinks';
import { PdfPageTiles, type PdfTileSource } from './PdfPageTiles';
import { paintPicture, REDRAW_SETTLE_MS } from '@/lib/pdf-document/pdf-paint';
import { PdfView } from '@/lib/pdf-document/pdf-view';
import type { PdfTextGesture } from '@/lib/pdf-document/usePdfTextSelection';
import type { PdfFindTints } from '@/lib/pdf-document/usePdfFind';

export type PdfPageTool = 'select' | 'highlight';

// `by`: the drawer that drew it. A replaced stored file comes with another, and the page is then drawn again,
// its picture staying until the new one arrives (live-editing-and-storage.md "Replacing the stored file").
type Drawn = {
  toView: PageMatrix;
  scale: number;
  turns: PageTurns;
  fileMarks: readonly string[];
  by: PdfPageDrawer;
};

export const PdfPage = memo(function PdfPage({
  index,
  count,
  page,
  cssPerPoint,
  left,
  top,
  turns,
  tiles,
  wanted,
  held,
  engine,
  drawer,
  marks,
  tool,
  onHighlight,
  selected,
  onText,
  linkName,
  onFollow,
  found,
  register,
}: {
  index: number;
  count: number;
  page: PageInfo;
  // CSS pixels a point, at the zoom shown.
  cssPerPoint: number;
  // Where the page lies in the pages' layout, in CSS pixels (pdf-page-layout.ts).
  left: number;
  top: number;
  // Rotate view's turn, in quarters clockwise: the engine draws the page turned.
  turns: PageTurns;
  // What its sharp tiles are drawn with (reading-surface.md "The pages").
  tiles: PdfTileSource;
  // Near view: its picture is drawn. Held: its picture is kept though it left view.
  wanted: boolean;
  held: boolean;
  engine: Pick<PdfEngine, 'selectText' | 'fileMarks' | 'links'>;
  drawer: PdfPageDrawer;
  marks: readonly Mark[];
  tool: PdfPageTool;
  onHighlight: (index: number, selection: TextSelection) => void;
  // The text selected on this page, and where a press, a drag or presses in a row go while Select is in hand.
  selected: readonly Quad[];
  onText: (index: number, gesture: PdfTextGesture) => void;
  // What a link of the page is called, and where a press on one goes (reading-surface.md "Following a link").
  linkName: (target: LinkTarget) => string;
  onFollow: (target: LinkTarget) => void;
  // Find's results on this page, tinted.
  found: PdfFindTints | null;
  // Hands the page's box to whoever watches which pages are near view.
  register: (index: number, element: HTMLElement | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<readonly Quad[]>([]);
  const drag = useRef<{ from: PagePoint; asking: boolean; next: PagePoint | null } | null>(null);
  // The page's links, read once its picture is drawn, again for another drawer (a replaced stored file).
  const [links, setLinks] = useState<{ by: PdfPageDrawer; links: readonly PageLink[] } | null>(
    null,
  );
  const drawnBy = drawn?.by ?? null;
  useEffect(() => {
    if (!drawnBy || links?.by === drawnBy) return;
    let gone = false;
    void engine.links(index).then((read) => {
      if (!gone) setLinks({ by: drawnBy, links: read });
    });
    return () => {
      gone = true;
    };
  }, [drawnBy, links, engine, index]);
  // A text selection being dragged with Select in hand.
  const selecting = useRef(false);

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
    if (
      drawn &&
      drawn.by === drawer &&
      drawn.turns === turns &&
      Math.abs(drawn.scale - scale) < 0.01
    )
      return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        void drawer.draw(index, scale, turns).then(async (bitmap) => {
          if (cancelled) return;
          if (!bitmap) return setFailed(true);
          const fileMarks = await engine.fileMarks(index);
          if (cancelled || !canvas.current) return;
          paintPicture(canvas.current, bitmap);
          setFailed(false);
          const marks = fileMarks.map((mark) => mark.id);
          setDrawn({ toView: bitmap.toView, scale, turns, fileMarks: marks, by: drawer });
        });
      },
      // A turn is drawn at once: the picture there is the page on its other side.
      drawn && drawn.turns === turns ? REDRAW_SETTLE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted, held, cssPerPoint, page, turns, index, drawer, engine, drawn]);

  // The page as it shows: on its side for an odd turn. The matrix's view space is this size, in points.
  const shown = PdfView.sizeTurned(page, turns);
  // The picture there as it is turned now; a picture of the page turned otherwise is hidden until it is drawn again,
  // never stretched across the turned box with its marks misplaced.
  const current = drawn?.turns === turns ? drawn : null;

  // A pointer's place on the page as the file has it (marks.md: a mark is made on the page as the file has it).
  const pagePoint = (event: MouseEvent<HTMLElement>): PagePoint | null => {
    if (!current) return null;
    const box = event.currentTarget.getBoundingClientRect();
    return PageView.toPage(current.toView, {
      x: ((event.clientX - box.left) / box.width) * shown.width,
      y: ((event.clientY - box.top) / box.height) * shown.height,
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

  const marking = tool === 'highlight' && current !== null;
  // "Selecting text": a mouse or a pen selects with Select in hand; a finger scrolls.
  const selectingText = (event: PointerEvent<HTMLElement>) =>
    tool === 'select' && event.button === 0 && event.pointerType !== 'touch';
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (selectingText(event)) {
      const at = pagePoint(event);
      if (!at) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      selecting.current = true;
      return onText(index, { kind: 'press', at, shift: event.shiftKey, alt: event.altKey });
    }
    if (!marking || event.button !== 0) return;
    const from = pagePoint(event);
    if (!from) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { from, asking: false, next: null };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const at = selecting.current ? pagePoint(event) : null;
    if (at) return onText(index, { kind: 'drag', at });
    const to = drag.current ? pagePoint(event) : null;
    if (to) previewTo(to);
  };
  // Two presses in a row select a word, three a line.
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const at = tool === 'select' && event.detail >= 2 ? pagePoint(event) : null;
    if (at) onText(index, { kind: 'presses', at, count: event.detail });
  };
  const endDrag = (event: PointerEvent<HTMLElement>, make: boolean) => {
    selecting.current = false;
    const dragging = drag.current;
    drag.current = null;
    setPreview([]);
    const to = dragging && make ? pagePoint(event) : null;
    if (!dragging || !to) return;
    void engine.selectText(index, dragging.from, to).then((selection) => {
      if (selection) onHighlight(index, selection);
    });
  };

  const matrix = current?.toView;
  return (
    <div
      ref={(element) => register(index, element)}
      role="region"
      aria-label={`Page ${index + 1} of ${count}`}
      data-pdf-page={index + 1}
      data-pdf-page-name={page.name}
      data-pdf-page-drawn={drawn ? 'true' : 'false'}
      data-pdf-page-turns={drawn?.turns ?? ''}
      data-pdf-file-marks={drawn?.fileMarks.join(' ') ?? ''}
      className={`absolute bg-white shadow-sm outline outline-1 outline-(--office-line) select-none ${
        marking ? 'cursor-text touch-none' : tool === 'select' && current ? 'cursor-text' : ''
      }`}
      style={{ left, top, width: shown.width * cssPerPoint, height: shown.height * cssPerPoint }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
      onClick={onClick}
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        className={`block h-full w-full ${drawn && !current ? 'invisible' : ''}`}
      />
      {current && wanted ? (
        <PdfPageTiles
          index={index}
          width={shown.width}
          height={shown.height}
          cssPerPoint={cssPerPoint}
          turns={turns}
          pictureScale={current.scale}
          box={{
            left,
            top,
            width: shown.width * cssPerPoint,
            height: shown.height * cssPerPoint,
          }}
          source={tiles}
        />
      ) : null}
      {matrix ? (
        <PdfMarksOverlay
          matrix={matrix}
          width={shown.width}
          height={shown.height}
          marks={marks}
          preview={preview}
          selected={selected}
          found={found}
        />
      ) : null}
      {matrix && tool === 'select' && links && links.by === drawnBy ? (
        <PdfPageLinks
          matrix={matrix}
          width={shown.width}
          height={shown.height}
          links={links.links}
          nameOf={linkName}
          onFollow={onFollow}
        />
      ) : null}
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
          This page couldn’t be drawn.
        </p>
      ) : null}
    </div>
  );
});
