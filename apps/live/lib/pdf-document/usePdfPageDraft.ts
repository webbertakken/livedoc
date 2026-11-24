'use client';

// What a page draws by pointer with a mark tool in hand that is not a text tool (docs/specs/035-pdf-documents/marks.md
// "Making a mark"): the Drawing's strokes and the shape tools' lines and shapes, each shown as it is drawn, in its
// tool's look, and handed over once let go.
import type { PointerEvent } from 'react';
import type { MarkShape, PagePoint } from '@livedoc/pdf-documents';
import type { PdfPageInk } from './usePdfMarkTools';
import { screenBoxOf } from './pdf-shape';
import { usePdfPageInk } from './usePdfPageInk';
import { usePdfPageShape, type PdfPageShaping } from './usePdfPageShape';

/** The mark being drawn, in its tool's look. */
export type PdfPageDraft = { shape: MarkShape; colour: string; opacity: number };

export function usePdfPageDraft({
  index,
  ink,
  shaping,
  pointAt,
  box,
}: {
  index: number;
  // The Drawing tool's look and where its strokes go; null while another tool is in hand.
  ink: PdfPageInk | null;
  // A shape tool's kind and look and where its marks go; null while another tool is in hand.
  shaping: PdfPageShaping | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
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
    // Whether a press on the page is the Drawing's or a shape tool's.
    active: inking.active || shape.active,
    // Each true where the pointer was the tool's.
    down: (event: PointerEvent<HTMLElement>) => inking.down(event) || shape.down(event),
    move: (event: PointerEvent<HTMLElement>) => inking.move(event) || shape.move(event),
    up: (event: PointerEvent<HTMLElement>, made: boolean) =>
      inking.up(event, made) || shape.up(event, made),
  };
}
