'use client';

// A corner tool's presses on one page (docs/specs/035-pdf-documents/marks.md "Making a mark"): each press a corner of
// the Polygon, Cloud or Connected lines in the making, a press within PDF_MARK_REACH_PX of its first corner closing it;
// and the shape so far shown in the tool's look, on to where the pointer is over this page.
import { useState, type PointerEvent } from 'react';
import { PDF_MARK_REACH_PX, type PagePoint, type PolyShape } from '@livedoc/pdf-documents';
import { isPolyTool } from './pdf-shape-pick';
import { polyDraftShape } from './pdf-poly';
import type { PdfPageShaping } from './usePdfPageShape';

type Client = { x: number; y: number };

export function usePdfPagePoly({
  index,
  shaping,
  pointAt,
}: {
  index: number;
  // The shape tool in hand, its look and where its marks go; null while another tool is in hand.
  shaping: PdfPageShaping | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: Client) => PagePoint | null;
}) {
  const poly = shaping && isPolyTool(shaping.kind) ? (shaping.poly ?? null) : null;
  const [pointer, setPointer] = useState<PagePoint | null>(null);
  const here = poly?.draft?.page === index ? poly.draft : null;

  /** A press: a corner where it lands; true where the press is a corner tool's. */
  const down = (event: PointerEvent<HTMLElement>): boolean => {
    if (!poly) return false;
    const client = { x: event.clientX, y: event.clientY };
    const at = event.button === 0 ? pointAt(client) : null;
    if (!at) return true;
    event.preventDefault();
    const aside = pointAt({ x: client.x + PDF_MARK_REACH_PX, y: client.y });
    const reach = aside ? Math.hypot(aside.x - at.x, aside.y - at.y) : 0;
    poly.press({ index, at, reach });
    return true;
  };

  /** The pointer over the page: where the line from the last corner runs to. */
  const move = (event: PointerEvent<HTMLElement>): boolean => {
    if (!poly) return false;
    setPointer(here ? pointAt({ x: event.clientX, y: event.clientY }) : null);
    return true;
  };

  const draft: PolyShape | null = here && shaping ? polyDraftShape(here, pointer, shaping) : null;

  return {
    draft,
    active: poly !== null,
    down,
    move,
    // A double press ends the shape in the making.
    presses: (count: number): boolean => {
      if (!poly || count < 2) return poly !== null;
      poly.end();
      return true;
    },
  };
}
