'use client';

// What a page draws by pointer with a mark tool in hand that is not a text tool (docs/specs/035-pdf-documents/marks.md
// "Making a mark"): the Drawing's strokes and the shape tools' lines and shapes, each shown as it is drawn, in its
// tool's look, and handed over once let go; and the Stamp tool's press ("Stamps").
import type { PointerEvent } from 'react';
import type { Box, MarkShape, PagePoint } from '@livedoc/pdf-documents';
import type { PdfPageInk } from './usePdfMarkTools';
import { screenBoxOf } from './pdf-shape';
import { usePdfPageInk } from './usePdfPageInk';
import { usePdfPageShape, type PdfPageShaping } from './usePdfPageShape';
import { usePdfPageStamp } from './usePdfPageStamp';
import type { PdfPageStamping } from './usePdfStampTool';

/** The mark being drawn, in its tool's look. */
export type PdfPageDraft = { shape: MarkShape; colour: string; opacity: number };

export function usePdfPageDraft({
  index,
  ink,
  shaping,
  stamping,
  pointAt,
  pageBox,
  box,
}: {
  index: number;
  // The Drawing tool's look and where its strokes go; null while another tool is in hand.
  ink: PdfPageInk | null;
  // A shape tool's kind and look and where its marks go; null while another tool is in hand.
  shaping: PdfPageShaping | null;
  // Where the Stamp tool's presses go; null while another tool is in hand.
  stamping: PdfPageStamping | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
  // The page as the file has it, in page space; null before the page is drawn.
  pageBox: () => Box | null;
  // The page's box on screen; null before it is laid out.
  box: HTMLElement | null;
}) {
  const inking = usePdfPageInk({ index, ink, pointAt });
  const shape = usePdfPageShape({
    index,
    shaping,
    pointAt,
    screenBox: () => screenBoxOf(box),
  });
  const stamp = usePdfPageStamp({ index, stamping, pointAt, pageBox });
  const draft: PdfPageDraft | null =
    ink && inking.stroke.length > 0
      ? {
          shape: { kind: 'drawing', strokes: [inking.stroke], width: ink.width },
          colour: ink.colour,
          opacity: ink.opacity,
        }
      : shaping && shape.draft
        ? { shape: shape.draft, colour: shaping.colour, opacity: shaping.opacity }
        : null;
  return {
    draft,
    // Whether a press on the page is the Drawing's, a shape tool's or the Stamp tool's.
    active: inking.active || shape.active || stamp.active,
    // Each true where the pointer was the tool's.
    down: (event: PointerEvent<HTMLElement>) =>
      inking.down(event) || shape.down(event) || stamp.down(event),
    move: (event: PointerEvent<HTMLElement>) => inking.move(event) || shape.move(event),
    up: (event: PointerEvent<HTMLElement>, made: boolean) =>
      inking.up(event, made) || shape.up(event, made),
  };
}
