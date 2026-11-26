'use client';

// Erase dragged on one page (docs/specs/035-pdf-documents/marks.md "Changing a mark": Erase): the strokes of the
// Drawings this session may change that the drag comes within PDF_ERASER_REACH_PX of, gathered as it goes and shown
// gone at once, handed over once let go. A second pointer, or a cancel, rubs out none.
import { useRef, useState, type PointerEvent } from 'react';
import {
  MarkErase,
  PDF_ERASER_REACH_PX,
  type DrawingMark,
  type Mark,
  type PagePoint,
} from '@livedoc/pdf-documents';
import type { Erased } from './pdf-erase';
import type { PdfPageErasing } from './usePdfErase';

type Client = { x: number; y: number };

/** The strokes gone so far, by place, of each Drawing by id. */
export type ErasedSoFar = ReadonlyMap<string, readonly number[]>;

const NOTHING: ErasedSoFar = new Map();

export function usePdfPageErase({
  index,
  erasing,
  marks,
  pointAt,
}: {
  index: number;
  // Where a drag's strokes go; null while another tool is in hand.
  erasing: PdfPageErasing | null;
  // The page's marks this session may change.
  marks: readonly Mark[];
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: Client) => PagePoint | null;
}) {
  const [gone, setGone] = useState<ErasedSoFar>(NOTHING);
  // The pointer dragging, its last point, the reach in page space and what it passed, read between renders.
  const dragging = useRef<{
    pointer: number;
    last: PagePoint;
    reach: number;
    gone: Map<string, readonly number[]>;
  } | null>(null);

  const drawings = marks.filter((mark): mark is DrawingMark => mark.kind === 'drawing');

  /** The drag on from its last point to `to`: each stroke it passes added to what is gone. */
  const pass = (to: PagePoint) => {
    const now = dragging.current!;
    let grew = false;
    for (const mark of drawings) {
      const was = now.gone.get(mark.id) ?? [];
      const hit = MarkErase.passed(mark, [now.last, to], now.reach).filter(
        (at) => !was.includes(at),
      );
      if (hit.length === 0) continue;
      now.gone.set(mark.id, [...was, ...hit]);
      grew = true;
    }
    now.last = to;
    if (grew) setGone(new Map(now.gone));
  };

  const letGo = () => {
    dragging.current = null;
    setGone(NOTHING);
  };

  /** A press: a drag of Erase begun; true where the press is Erase's. */
  const down = (event: PointerEvent<HTMLElement>): boolean => {
    if (!erasing) return false;
    if (dragging.current) {
      letGo();
      return true;
    }
    const client = { x: event.clientX, y: event.clientY };
    const at = event.button === 0 ? pointAt(client) : null;
    if (!at) return true;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const aside = pointAt({ x: client.x + PDF_ERASER_REACH_PX, y: client.y });
    const reach = aside ? Math.hypot(aside.x - at.x, aside.y - at.y) : 0;
    dragging.current = { pointer: event.pointerId, last: at, reach, gone: new Map() };
    pass(at);
    return true;
  };

  const move = (event: PointerEvent<HTMLElement>): boolean => {
    const now = dragging.current;
    if (!now || now.pointer !== event.pointerId) return erasing !== null;
    const to = pointAt({ x: event.clientX, y: event.clientY });
    if (to) pass(to);
    return true;
  };

  /** The drag let go: what it passed handed over, or, `made` false, rubbed out none. */
  const up = (event: PointerEvent<HTMLElement>, made: boolean): boolean => {
    const now = dragging.current;
    if (!now || now.pointer !== event.pointerId) return erasing !== null;
    letGo();
    const erased: Erased[] = drawings.flatMap((mark) => {
      const strokes = now.gone.get(mark.id);
      return strokes ? [{ mark, gone: strokes }] : [];
    });
    if (made && erasing && erased.length > 0) erasing.onErase(index, erased);
    return true;
  };

  return { gone, active: erasing !== null, down, move, up };
}
