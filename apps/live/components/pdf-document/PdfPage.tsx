'use client';

// One PDF page on the surface (docs/specs/035-pdf-documents/reading-surface.md "The pages"; marks.md "Making a
// mark"): a box of the page's true size from the first frame, the engine's picture of it once it is near view, and
// LiveDoc's marks drawn over that picture from the live changes. The file's own marks are in the picture. Nothing of
// the file reaches the page as markup: pixels, and geometry LiveDoc draws itself.
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  PageView,
  PDF_MARK_OUTLINE_PX,
  type LinkTarget,
  type Mark,
  type PageInfo,
  type PageLink,
  type PageMatrix,
  type PageName,
  type PagePoint,
  type PageTurns,
  type PdfEngine,
  type Quad,
  type TextSelection,
} from '@livedoc/pdf-documents';
import type { PdfChangeableMarks } from '@/lib/pdf-document/pdf-changeable-marks';
import { pictureScale, type PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { PdfMarkHandles } from './PdfMarkHandles';
import { PdfMarksOverlay, type PdfMarkReshaping } from './PdfMarksOverlay';
import { keyResize } from '@/lib/pdf-document/pdf-mark-handles';
import { linkBox, PdfPageLinks } from './PdfPageLinks';
import { PdfPageReading, pageRegionName } from './PdfPageReading';
import { PdfPageTiles, type PdfTileSource } from './PdfPageTiles';
import { paintPicture, REDRAW_SETTLE_MS } from '@/lib/pdf-document/pdf-paint';
import { PdfView } from '@/lib/pdf-document/pdf-view';
import type { PdfTextGesture } from '@/lib/pdf-document/usePdfTextSelection';
import type { PdfFindTints } from '@/lib/pdf-document/usePdfFind';
import type { PdfPageTexts } from '@/lib/pdf-document/pdf-page-texts';
import { usePdfPageFingers } from '@/lib/pdf-document/usePdfPageFingers';
import { PdfSelectionHandles } from './PdfSelectionHandles';
import type { PdfPageTap } from '@/lib/pdf-document/usePdfColumnZoom';

import type { PdfPageInk, PdfPageTool } from '@/lib/pdf-document/usePdfMarkTools';
import { usePdfPageDraft } from '@/lib/pdf-document/usePdfPageDraft';
import { usePdfPageTextMark } from '@/lib/pdf-document/usePdfPageTextMark';
import type { PdfPageShaping } from '@/lib/pdf-document/usePdfPageShape';
import type { PdfPageStamping } from '@/lib/pdf-document/usePdfStampTool';
import { pageBoxOf } from '@/lib/pdf-document/pdf-typed';
import type { PdfPageTyping as Typing } from '@/lib/pdf-document/usePdfTyping';
import { screenBoxOf } from '@/lib/pdf-document/pdf-shape';
import { PdfPageTyping } from './PdfPageTyping';
import { PdfPageMarks } from './PdfPageMarks';
import { usePdfPageBoxing } from '@/lib/pdf-document/usePdfPageBoxing';
import type { PdfPageChoosing } from '@/lib/pdf-document/usePdfMarkSelection';
import { usePdfPageMarkPress } from '@/lib/pdf-document/usePdfPageMarkPress';

// `by`: the drawer that drew it. A replaced stored file comes with another, and the page is then drawn again,
// its picture staying until the new one arrives (live-editing-and-storage.md "Replacing the stored file").
type Drawn = {
  toView: PageMatrix;
  scale: number;
  turns: PageTurns;
  fileMarks: readonly string[];
  by: PdfPageDrawer;
};

/** A box in percent of the page, as the page's overlays are placed. */
const percentBox = (box: { left: number; top: number; width: number; height: number }) => ({
  left: `${box.left}%`,
  top: `${box.top}%`,
  width: `${box.width}%`,
  height: `${box.height}%`,
});

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
  marks: changeable,
  onFileMarks,
  tool,
  onMark,
  ink,
  shaping,
  typing,
  stamping,
  selected,
  handles,
  chosen,
  choosing,
  onText,
  texts,
  linkName,
  onFollow,
  found,
  onDoubleTap,
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
  // The marks a person may change on the page: LiveDoc's, and the file's own its picture draws (marks.md "Changing a
  // mark").
  marks: PdfChangeableMarks;
  // The file's own marks of the page as LiveDoc reads them, each time the page is drawn.
  onFileMarks: (page: PageName, marks: readonly Mark[]) => void;
  tool: PdfPageTool;
  // A drag across the page's text with a text tool in hand: the text it covered, to mark.
  onMark: (index: number, selection: TextSelection) => void;
  // The Drawing tool's look and where its strokes go; null while another tool is in hand.
  ink: PdfPageInk | null;
  // A shape tool's kind and look and where its lines and shapes go; null while another tool is in hand.
  shaping: PdfPageShaping | null;
  // Where the Stamp tool's presses go; null while another tool is in hand.
  stamping: PdfPageStamping | null;
  // The Text or the Callout tool's look and where its marks go; null while another tool is in hand.
  typing: Typing | null;
  // The text selected on this page, and where a press, a drag or presses in a row go while Select is in hand.
  selected: readonly Quad[];
  // A finger made the selection: it has handles (reading-surface.md "Phone and tablet").
  handles: boolean;
  // The marks selected on this page, and where a press on a mark goes; null while marks may not be changed
  // (marks.md "Changing a mark").
  chosen: readonly string[];
  choosing: PdfPageChoosing | null;
  onText: (index: number, gesture: PdfTextGesture) => void;
  // The pages' text, read to assistive technology while the page is near view (accessibility.md).
  texts: PdfPageTexts | null;
  // What a link of the page is called, and where a press on one goes (reading-surface.md "Following a link").
  linkName: (target: LinkTarget) => string;
  onFollow: (target: LinkTarget) => void;
  // Find's results on this page, tinted.
  found: PdfFindTints | null;
  // Where a finger's double tap goes while Select is in hand (reading-surface.md "Phone and tablet").
  onDoubleTap: (index: number, tap: PdfPageTap) => void;
  // Hands the page's box to whoever watches which pages are near view.
  register: (index: number, element: HTMLElement | null) => void;
}) {
  const marks = changeable.marks;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  // The page's box: where a finger's points are read against.
  const [box, setBox] = useState<HTMLElement | null>(null);
  const attach = useCallback(
    (element: HTMLElement | null) => {
      register(index, element);
      setBox(element);
    },
    [register, index],
  );
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [failed, setFailed] = useState(false);
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
          onFileMarks(
            page.name,
            fileMarks.flatMap((mark) => (mark.mark ? [mark.mark] : [])),
          );
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
  }, [wanted, held, cssPerPoint, page, turns, index, drawer, engine, drawn, onFileMarks]);

  // The page as it shows: on its side for an odd turn. The matrix's view space is this size, in points.
  const shown = PdfView.sizeTurned(page, turns);
  // The picture there as it is turned now; a picture of the page turned otherwise is hidden until it is drawn again,
  // never stretched across the turned box with its marks misplaced.
  const current = drawn?.turns === turns ? drawn : null;

  // A pointer's place on the page as the file has it (marks.md: a mark is made on the page as the file has it).
  const pointAt = (client: { x: number; y: number }): PagePoint | null => {
    if (!current || !box) return null;
    const rect = box.getBoundingClientRect();
    return PageView.toPage(current.toView, {
      x: ((client.x - rect.left) / rect.width) * shown.width,
      y: ((client.y - rect.top) / rect.height) * shown.height,
    });
  };
  const pagePoint = (event: MouseEvent<HTMLElement>): PagePoint | null =>
    pointAt({ x: event.clientX, y: event.clientY });
  // A finger's tap, double tap and long press, with Select in hand.
  const fingers = usePdfPageFingers({
    index,
    box,
    toView: tool === 'select' && current ? current.toView : null,
    shown,
    pointAt,
    onText,
    onDoubleTap,
    onTap: (at) => markPress.tap(at),
  });

  // The page as the file has it, in page space; null before it is drawn.
  const pageBox = () => (current ? pageBoxOf(current.toView, shown) : null);
  // A stroke of the Drawing tool, or a line or shape of a shape tool, while one is in hand.
  const inking = usePdfPageDraft({
    index,
    ink: current ? ink : null,
    shaping: current ? shaping : null,
    stamping: current ? stamping : null,
    pointAt,
    pageBox,
    box,
  });
  const textMark = usePdfPageTextMark({ index, engine, onMark });
  // A press on a mark with Select in hand: selected, dragged, or a drag from a text mark handed to the text.
  // A press reaches only the marks this session may change; one on another's falls to the text beneath.
  const pressable = useMemo(
    () => (choosing ? marks.filter(choosing.mayChange) : marks),
    [marks, choosing],
  );
  const markPress = usePdfPageMarkPress({
    index,
    marks: pressable,
    chosen,
    choosing: tool === 'select' && current ? choosing : null,
    cssPerPoint,
    pointAt,
    matrix: () => current?.toView ?? null,
    pageBox,
    onTextPress: (at, shift, alt) => {
      selecting.current = true;
      onText(index, { kind: 'press', at, shift, alt });
    },
    focusMark: (id) =>
      box
        ?.querySelector<HTMLElement>(`[data-pdf-mark-control="${id}"]`)
        ?.focus({ preventScroll: true }),
  });
  // A box drawn from empty space selects the marks it touches (marks.md "Changing a mark").
  const boxing = usePdfPageBoxing({
    index,
    texts,
    marks: pressable,
    choosing: tool === 'select' && current ? choosing : null,
    pointAt,
  });
  // One selected mark has handles; the mark as a handle's drag has it, while it lasts (marks.md "Changing a mark").
  const [reshaping, setReshaping] = useState<PdfMarkReshaping | null>(null);
  const sizing = tool === 'select' && current && choosing && chosen.length === 1 ? choosing : null;
  const sized = sizing ? marks.find((mark) => mark.id === chosen[0]) : undefined;
  // A point of the window in view space.
  const viewAt = (client: { x: number; y: number }): PagePoint | null => {
    const rect = box?.getBoundingClientRect();
    return rect
      ? {
          x: ((client.x - rect.left) / rect.width) * shown.width,
          y: ((client.y - rect.top) / rect.height) * shown.height,
        }
      : null;
  };
  // ⌥ with an arrow key on a mark's control: the mark resized from its right or foot as it shows.
  const resizeBy = (id: string, step: PagePoint) => {
    const mark = marks.find((each) => each.id === id);
    const page = pageBox();
    const place = mark && current && page ? keyResize(mark, current.toView, step, page) : null;
    if (place) choosing?.reshape(index, id, place);
  };
  // A drag across text marks it with a text tool in hand: not with a drawing, shape or typing tool.
  const marking = tool !== 'select' && !inking.active && !typing && current !== null;
  // "Selecting text": a mouse or a pen selects with Select in hand; a finger scrolls.
  const selectingText = (event: PointerEvent<HTMLElement>) =>
    tool === 'select' && event.button === 0 && event.pointerType !== 'touch';
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    fingers.down(event);
    if (inking.down(event)) return;
    if (markPress.down(event)) return;
    if (selectingText(event)) {
      const at = pagePoint(event);
      if (!at) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      selecting.current = true;
      boxing.down(event, at);
      return onText(index, { kind: 'press', at, shift: event.shiftKey, alt: event.altKey });
    }
    if (!marking || event.button !== 0) return;
    const from = pagePoint(event);
    if (!from) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    textMark.begin(from);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (inking.move(event) || markPress.move(event) || boxing.move(event)) return;
    const at = selecting.current ? pagePoint(event) : null;
    if (at) return onText(index, { kind: 'drag', at });
    const to = textMark.dragging() ? pagePoint(event) : null;
    if (to) textMark.move(to);
  };
  // Two presses in a row select a word, three a line; a finger's zoom instead.
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const pressing = tool === 'select' && event.detail >= 2 && !fingers.byFinger();
    const at = pressing ? pagePoint(event) : null;
    if (at) onText(index, { kind: 'presses', at, count: event.detail });
  };
  const endDrag = (event: PointerEvent<HTMLElement>, make: boolean) => {
    selecting.current = false;
    textMark.end(make && textMark.dragging() ? pagePoint(event) : null);
  };

  const matrix = current?.toView;
  return (
    <div
      ref={attach}
      role="region"
      aria-label={pageRegionName(index, count, page.label)}
      data-pdf-page={index + 1}
      data-pdf-page-name={page.name}
      data-pdf-page-drawn={drawn ? 'true' : 'false'}
      data-pdf-page-turns={drawn?.turns ?? ''}
      data-pdf-file-marks={drawn?.fileMarks.join(' ') ?? ''}
      className={`absolute bg-(--pdf-paper) shadow-sm outline outline-1 outline-(--office-line) select-none ${
        marking
          ? 'cursor-text touch-none'
          : inking.active
            ? 'cursor-crosshair touch-none'
            : markPress.over === 'movable' || markPress.moving
              ? 'cursor-move'
              : markPress.over === 'text'
                ? 'cursor-default'
                : tool === 'select' && current
                  ? 'cursor-text'
                  : ''
      }`}
      style={{ left, top, width: shown.width * cssPerPoint, height: shown.height * cssPerPoint }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        fingers.up(event);
        if (inking.up(event, true) || markPress.up(event)) return;
        boxing.up(event);
        endDrag(event, true);
      }}
      onPointerCancel={(event) => {
        fingers.cancel(event);
        if (inking.up(event, false) || markPress.cancel()) return;
        boxing.cancel();
        endDrag(event, false);
      }}
      onClick={onClick}
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        className={`block h-full w-full ${drawn && !current ? 'invisible' : ''}`}
      />
      <PdfPageReading index={index} texts={texts} wanted={wanted} />
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
          fileOwn={changeable.fileOwn}
          preview={textMark.preview}
          draft={inking.draft}
          selected={selected}
          found={found}
          chosen={chosen}
          outline={PDF_MARK_OUTLINE_PX / cssPerPoint}
          moving={markPress.moving}
          reshaping={reshaping}
        />
      ) : null}
      {matrix ? (
        <PdfPageMarks
          index={index}
          matrix={matrix}
          width={shown.width}
          height={shown.height}
          marks={marks}
          chosen={chosen}
          choosing={tool === 'select' ? choosing : null}
          onNudge={markPress.nudge}
          onResize={resizeBy}
        />
      ) : null}
      {matrix && boxing.box ? (
        <div
          aria-hidden
          data-pdf-mark-box
          className="pointer-events-none absolute border border-dashed border-(--office-focus)"
          style={percentBox(linkBox(matrix, boxing.box, shown.width, shown.height))}
        />
      ) : null}
      {matrix && sizing && sized && !markPress.moving ? (
        <PdfMarkHandles
          key={sized.id}
          mark={sized}
          matrix={matrix}
          width={shown.width}
          height={shown.height}
          toView={viewAt}
          pageBox={pageBox}
          onPreview={(place) => setReshaping(place ? { id: sized.id, place } : null)}
          onReshape={(place) => sizing.reshape(index, sized.id, place)}
        />
      ) : null}
      {matrix && typing ? (
        <PdfPageTyping
          key={typing.kind}
          index={index}
          typing={typing}
          matrix={matrix}
          shown={shown}
          cssPerPoint={cssPerPoint}
          pointAt={pointAt}
          screenBox={() => screenBoxOf(box)}
        />
      ) : null}
      {matrix && handles ? (
        <PdfSelectionHandles
          matrix={matrix}
          width={shown.width}
          height={shown.height}
          quads={selected}
          onDrag={(end, client) => {
            const at = pointAt(client);
            if (at) onText(index, { kind: 'handle', end, at });
          }}
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
        <p className="absolute inset-0 flex items-center justify-center text-body text-(--pdf-paper-ink)">
          This page couldn’t be drawn.
        </p>
      ) : null}
    </div>
  );
});
