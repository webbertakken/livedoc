'use client';

// Typing a Text or a Callout onto one page (docs/specs/035-pdf-documents/marks.md "Making a mark"): over the page while
// the Text or the Callout tool is in hand. A press or a drag opens a box for typing at once; a Callout's first press
// marks what is meant, its second opens the box. Enter starts a new line; Escape, or a press anywhere else, ends the
// typing, and that press makes nothing else. The words are typed upright on the page as the file has it, so the box
// turns with a turned view. Its writing direction follows what is typed.
import { useContext, useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  DarkPages,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_SHAPE_MIN_PT,
  PDF_TEXT_PADDING_PT,
  PageView,
  TYPED_LINE_HEIGHT,
  TypedLayout,
  type Box,
  type MarkShape,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import { dragShape, type ScreenBox } from '@/lib/pdf-document/pdf-shape';
import {
  openByDrag,
  openByPress,
  pageBoxOf,
  TYPED_FACES,
  TYPED_NAMES,
  typedBox,
  typedOf,
  type TypedOpening,
} from '@/lib/pdf-document/pdf-typed';
import type { PdfPageTyping as Typing } from '@/lib/pdf-document/usePdfTyping';
import { MarkShapes } from './PdfMarksOverlay';

type Client = { x: number; y: number };

/** (default) How wide the dot showing a Callout's first press is, in points. */
const TIP_DOT_PT = 6;

/** Whether the element holding the keys is a box being typed in, on any page. */
const typingIn = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement && element.dataset.pdfTyping !== undefined;

export function PdfPageTyping({
  index,
  typing,
  matrix,
  shown,
  cssPerPoint,
  pointAt,
  screenBox,
}: {
  index: number;
  typing: Typing;
  // Page space to view space, as the page was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points.
  shown: { width: number; height: number };
  // CSS pixels a point, at the zoom shown.
  cssPerPoint: number;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: Client) => PagePoint | null;
  // The page's box on screen; null before it is laid out.
  screenBox: () => ScreenBox | null;
}) {
  const dark = useContext(PdfLookContext) === 'dark';
  const colour = dark ? DarkPages.hex(typing.colour) : typing.colour;
  const [opening, setOpening] = useState<TypedOpening | null>(null);
  const [words, setWords] = useState('');
  // A text box being dragged open, in page space.
  const [dragged, setDragged] = useState<Box | null>(null);
  const press = useRef<{ pointer: number; from: Client; start: PagePoint } | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const page = pageBoxOf(matrix, shown);

  // "Opens for typing at once".
  useEffect(() => {
    if (opening) area.current?.focus();
  }, [opening]);

  /** The box typed in ended, by its losing the keys: what it makes handed over. */
  const end = (open: TypedOpening) => {
    typing.onTyped(index, open.kind, typedOf(open, words, typing.size, page));
    setOpening(null);
    setWords('');
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    // A press in the box being typed in moves its caret.
    if (event.target === area.current || event.button !== 0) return;
    event.preventDefault();
    // A press while a box is open, here or on another page, only ends the typing.
    const active = document.activeElement;
    if (typingIn(active)) return active.blur();
    const from = { x: event.clientX, y: event.clientY };
    const start = pointAt(from);
    if (!start) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    press.current = { pointer: event.pointerId, from, start };
  };

  /** Where the pointer is on the page, held to its edge. */
  const pointerAt = (event: PointerEvent<HTMLElement>): PagePoint | null => {
    const now = press.current;
    const box = screenBox();
    if (!now || !box) return null;
    return pointAt(
      dragShape('rectangle', now.from, { x: event.clientX, y: event.clientY }, box, false),
    );
  };
  const spans = (from: PagePoint, to: PagePoint): boolean =>
    Math.abs(to.x - from.x) >= PDF_SHAPE_MIN_PT || Math.abs(to.y - from.y) >= PDF_SHAPE_MIN_PT;

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const now = press.current;
    const to =
      now && typing.kind === 'text' && now.pointer === event.pointerId ? pointerAt(event) : null;
    if (!now || !to) return;
    const { x, y } = now.start;
    setDragged(
      spans(now.start, to)
        ? [Math.min(x, to.x), Math.min(y, to.y), Math.max(x, to.x), Math.max(y, to.y)]
        : null,
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const now = press.current;
    if (!now || now.pointer !== event.pointerId) return;
    const to = pointerAt(event) ?? now.start;
    press.current = null;
    setDragged(null);
    let next: TypedOpening;
    if (typing.kind === 'callout') {
      // The first press marks what is meant; the second, on the same page, opens the box.
      if (typing.tip?.index !== index) return typing.onTip(index, now.start);
      next = openByPress('callout', now.start, page, typing.tip.at);
      typing.onTip(index, null);
    } else
      next = spans(now.start, to)
        ? openByDrag(now.start, to, typing.size)
        : openByPress('text', now.start, page);
    setOpening(next);
    setWords('');
  };

  const onPointerCancel = () => {
    press.current = null;
    setDragged(null);
  };

  // The box as it is typed in: as wide as opened, as high as its lines; a Callout's border round its words.
  const box = opening ? typedBox(opening, words, typing.size, page, false) : null;
  const corner = box ? PageView.toView(matrix, { x: box[0], y: box[3] }) : null;
  const tip = typing.tip?.index === index ? typing.tip.at : null;
  const drafts: MarkShape[] = [
    ...(dragged ? [{ kind: 'rectangle' as const, rect: dragged, width: 1 }] : []),
    ...(tip ? [{ kind: 'drawing' as const, strokes: [[tip.x, tip.y]], width: TIP_DOT_PT }] : []),
  ];
  if (opening?.kind === 'callout' && opening.tip) {
    const hugged = typedBox(opening, words || ' ', typing.size, page, true);
    drafts.push({
      kind: 'callout',
      rect: hugged,
      callout: TypedLayout.calloutLine(opening.tip, hugged),
    });
  }
  return (
    <div
      data-pdf-typing-layer={typing.kind}
      className="absolute inset-0 cursor-text touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {drafts.length > 0 ? (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${shown.width} ${shown.height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill={colour}
          stroke={colour}
          opacity={typing.opacity}
        >
          {drafts.map((shape, at) => (
            <g key={at} data-pdf-typing-draft={shape.kind}>
              <MarkShapes matrix={matrix} shape={shape} />
            </g>
          ))}
        </svg>
      ) : null}
      {opening && box && corner ? (
        <textarea
          ref={area}
          data-pdf-typing={opening.kind}
          aria-label={TYPED_NAMES[opening.kind]}
          dir="auto"
          spellCheck
          maxLength={PDF_MARK_TEXT_MAX_CHARS}
          value={words}
          onChange={(event) => setWords(event.target.value)}
          onBlur={() => end(opening)}
          onKeyDown={(event) => {
            // The words' own keys: none reaches the pages' tools.
            event.stopPropagation();
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.currentTarget.blur();
          }}
          className="absolute resize-none overflow-hidden bg-transparent outline-1 outline-(--office-focus) outline-dashed"
          style={{
            left: corner.x * cssPerPoint,
            top: corner.y * cssPerPoint,
            width: (box[2] - box[0]) * cssPerPoint,
            height: (box[3] - box[1]) * cssPerPoint,
            padding: PDF_TEXT_PADDING_PT * cssPerPoint,
            transform: `rotate(${Math.atan2(matrix[1], matrix[0])}rad)`,
            transformOrigin: '0 0',
            font: `${typing.size * cssPerPoint}px/${TYPED_LINE_HEIGHT} ${TYPED_FACES}`,
            color: colour,
            opacity: typing.opacity,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        />
      ) : null}
    </div>
  );
}
