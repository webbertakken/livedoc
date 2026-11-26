'use client';

// A box drawn from empty space with Select in hand (docs/specs/035-pdf-documents/marks.md "Changing a mark"): a mouse's
// or a pen's press where it reaches no mark and no line of text lies within a line height of it is armed once the
// page's text is read; a drag past the slop from it draws the box, and once let go every mark of the page it touches
// is selected, ⇧ adding them. A press on text, or a finger, is left to the text as before.
import { useRef, useState, type PointerEvent } from 'react';
import {
  MarkHit,
  PDF_DRAG_SLOP_PX,
  TextRange,
  type Box,
  type Mark,
  type PagePoint,
} from '@livedoc/pdf-documents';
import type { PdfPageTexts } from './pdf-page-texts';
import type { PdfPageChoosing } from './usePdfMarkSelection';

// A press that may draw a box: `empty` once the page's text is read (null before), `drawing` once past the slop.
type Armed = {
  readonly pointerId: number;
  readonly client: { x: number; y: number };
  readonly from: PagePoint;
  readonly shift: boolean;
  empty: boolean | null;
  drawing: boolean;
  to: PagePoint;
};

/** The box two corners span, `[left, bottom, right, top]`. */
const spanned = (a: PagePoint, b: PagePoint): Box => [
  Math.min(a.x, b.x),
  Math.min(a.y, b.y),
  Math.max(a.x, b.x),
  Math.max(a.y, b.y),
];

export function usePdfPageBoxing({
  index,
  texts,
  marks,
  choosing,
  pointAt,
}: {
  index: number;
  // The pages' text, read once and kept; null before the file is open.
  texts: PdfPageTexts | null;
  // The marks a box may select: those this session may change.
  marks: readonly Mark[];
  // Where a selection goes; null while marks may not be changed or Select is not in hand.
  choosing: PdfPageChoosing | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
}) {
  const armed = useRef<Armed | null>(null);
  // The box as it is drawn, in page space; null while none is.
  const [box, setBox] = useState<Box | null>(null);

  /** A press that reached no mark, at `at` on the page. */
  const down = (event: PointerEvent<HTMLElement>, at: PagePoint): void => {
    armed.current = null;
    if (!choosing || event.button !== 0 || event.pointerType === 'touch') return;
    const press: Armed = {
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      from: at,
      shift: event.shiftKey,
      empty: texts ? null : false,
      drawing: false,
      to: at,
    };
    armed.current = press;
    void texts?.read(index).then((text) => {
      press.empty = !text || TextRange.columnAt(text, at) === null;
    });
  };

  /** The pointer moved: true while it draws the box, which the text then never sees. */
  const move = (event: PointerEvent<HTMLElement>): boolean => {
    const now = armed.current;
    if (!now || now.pointerId !== event.pointerId || now.empty !== true) return false;
    const far = Math.hypot(event.clientX - now.client.x, event.clientY - now.client.y);
    if (!now.drawing && far < PDF_DRAG_SLOP_PX) return true;
    const to = pointAt({ x: event.clientX, y: event.clientY });
    if (!to) return true;
    now.drawing = true;
    now.to = to;
    setBox(spanned(now.from, to));
    return true;
  };

  /** Let go: true where a box was drawn, its marks then selected. */
  const up = (event: PointerEvent<HTMLElement>): boolean => {
    const now = armed.current;
    if (!now || now.pointerId !== event.pointerId) return false;
    armed.current = null;
    setBox(null);
    if (!now.drawing || !choosing) return false;
    const touched = MarkHit.touching(marks, spanned(now.from, now.to));
    choosing.chooseAll(
      index,
      touched.map((mark) => mark.id),
      now.shift,
    );
    return true;
  };

  const cancel = (): void => {
    armed.current = null;
    setBox(null);
  };

  return { down, move, up, cancel, box };
}
