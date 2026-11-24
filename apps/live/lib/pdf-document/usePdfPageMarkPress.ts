'use client';

// A press on a page's marks with Select in hand (docs/specs/035-pdf-documents/marks.md "Changing a mark"): the mark it
// reaches selected, ⇧ adding it or taking it out; a drag from a selected mark moving the selection, shown as it goes,
// held on the page and made one move once let go; a press on a text mark selecting it once let go where pressed, a
// drag from it handed to the text; and an arrow key's move, the way it points on screen. A finger scrolls, as it does
// on text.
import { useRef, useState, type PointerEvent } from 'react';
import {
  MarkHit,
  MarkPlace,
  PageView,
  PDF_DRAG_SLOP_PX,
  PDF_MARK_REACH_PX,
  type Box,
  type Mark,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';
import type { PdfPageChoosing } from './usePdfMarkSelection';

/** The marks being dragged, and how far, in page space, held on the page. */
export type PdfMarksMoving = { readonly ids: readonly string[]; readonly by: PagePoint };

// A press under way: on a text mark, to select once let go; or on another, `ids` the marks a drag moves (none where ⇧
// took the mark out).
type Press = {
  readonly pointerId: number;
  readonly client: { x: number; y: number };
  readonly from: PagePoint;
  readonly id: string;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly text: boolean;
  readonly ids: readonly string[];
  dragging: boolean;
};

/** The marks a drag from a press on `id` moves, as PdfPageChoosing's `choose` leaves them selected; none where ⇧
 *  takes the mark pressed out. */
function movedBy(chosen: readonly string[], id: string, shift: boolean): readonly string[] {
  if (chosen.includes(id)) return shift ? [] : chosen;
  return shift ? [...chosen, id] : [id];
}

export function usePdfPageMarkPress({
  index,
  marks,
  chosen,
  choosing,
  cssPerPoint,
  pointAt,
  matrix,
  pageBox,
  onTextPress,
  focusMark,
}: {
  index: number;
  // The page's marks, in the order they are drawn, and the ids of those selected.
  marks: readonly Mark[];
  chosen: readonly string[];
  // Where a selection goes; null while marks may not be changed.
  choosing: PdfPageChoosing | null;
  // CSS pixels a point, at the zoom shown: a reach on screen in points.
  cssPerPoint: number;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
  // Page space to view space as the page is drawn; null before it is.
  matrix: () => PageMatrix | null;
  // The page as the file has it, in page space; null before the page is drawn.
  pageBox: () => Box | null;
  // A drag from a text mark: the text selection begins where it was pressed.
  onTextPress: (at: PagePoint, shift: boolean, alt: boolean) => void;
  // The keys go to the mark pressed.
  focusMark: (id: string) => void;
}) {
  const press = useRef<Press | null>(null);
  const [moving, setMoving] = useState<PdfMarksMoving | null>(null);
  // What the pointer is over, for its cursor: a mark it would move, a text mark, or neither.
  const [over, setOver] = useState<'movable' | 'text' | null>(null);

  /** The mark a pointer at `client` reaches, or null. */
  const reached = (client: { x: number; y: number }): Mark | null => {
    const at = pointAt(client);
    return at ? MarkHit.at(marks, at, PDF_MARK_REACH_PX / cssPerPoint) : null;
  };

  /** `by` held so the marks of `ids` stay on the page. */
  const held = (ids: readonly string[], by: PagePoint): PagePoint | null => {
    const page = pageBox();
    return page
      ? MarkPlace.held(
          marks.filter((mark) => ids.includes(mark.id)),
          by,
          page,
        )
      : null;
  };

  const down = (event: PointerEvent<HTMLElement>): boolean => {
    if (!choosing || event.button !== 0 || event.pointerType === 'touch') return false;
    const from = pointAt({ x: event.clientX, y: event.clientY });
    const mark = reached({ x: event.clientX, y: event.clientY });
    if (!from || !mark) {
      choosing.letGo();
      return false;
    }
    const text = !MarkPlace.isMovable(mark);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = {
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      from,
      id: mark.id,
      shift: event.shiftKey,
      alt: event.altKey,
      text,
      ids: text ? [] : movedBy(chosen, mark.id, event.shiftKey),
      dragging: false,
    };
    if (!text) choosing.choose(index, mark.id, event.shiftKey);
    return true;
  };

  const move = (event: PointerEvent<HTMLElement>): boolean => {
    const now = press.current;
    if (!now) {
      const mark = choosing ? reached({ x: event.clientX, y: event.clientY }) : null;
      setOver(mark ? (MarkPlace.isMovable(mark) ? 'movable' : 'text') : null);
      return false;
    }
    if (now.pointerId !== event.pointerId) return false;
    const far = Math.hypot(event.clientX - now.client.x, event.clientY - now.client.y);
    if (!now.dragging && far < PDF_DRAG_SLOP_PX) return true;
    now.dragging = true;
    if (now.text) {
      press.current = null;
      onTextPress(now.from, now.shift, now.alt);
      return false;
    }
    const to = pointAt({ x: event.clientX, y: event.clientY });
    const by =
      to && now.ids.length > 0
        ? held(now.ids, { x: to.x - now.from.x, y: to.y - now.from.y })
        : null;
    if (by) setMoving({ ids: now.ids, by });
    return true;
  };

  const up = (event: PointerEvent<HTMLElement>): boolean => {
    const now = press.current;
    if (!now || now.pointerId !== event.pointerId) return false;
    press.current = null;
    setMoving(null);
    if (now.text) choosing?.choose(index, now.id, now.shift);
    else if (moving && now.dragging) choosing?.move(index, moving.by);
    if (now.text || now.ids.includes(now.id)) focusMark(now.id);
    return true;
  };

  const cancel = (): boolean => {
    if (!press.current) return false;
    press.current = null;
    setMoving(null);
    return true;
  };

  /** An arrow key: the selection moved `step` the way it points in view space, held on the page. */
  const nudge = (step: PagePoint): boolean => {
    const toView = matrix();
    if (!choosing || !toView) return false;
    const origin = PageView.toPage(toView, { x: 0, y: 0 });
    const to = PageView.toPage(toView, step);
    const by =
      origin && to ? held(chosen, { x: to.x - origin.x + 0, y: to.y - origin.y + 0 }) : null;
    if (by) choosing.move(index, by);
    return true;
  };

  return { down, move, up, cancel, nudge, moving, over: choosing ? over : null };
}
