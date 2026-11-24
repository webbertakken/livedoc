'use client';

// A press on one page with the Stamp tool in hand (docs/specs/035-pdf-documents/marks.md "Stamps": Placing a stamp):
// the stamp the control shows placed where the press lands, held to the page as the file has it. A press of another
// button than the main one places nothing.
import type { PointerEvent } from 'react';
import type { Box, PagePoint } from '@livedoc/pdf-documents';
import type { PdfPageStamping } from './usePdfStampTool';

export function usePdfPageStamp({
  index,
  stamping,
  pointAt,
  pageBox,
}: {
  index: number;
  // Where the Stamp tool's presses go; null while another tool is in hand.
  stamping: PdfPageStamping | null;
  // A pointer's place on the page as the file has it; null before the page is drawn.
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
  // The page as the file has it, in page space; null before the page is drawn.
  pageBox: () => Box | null;
}) {
  /** A press: the stamp placed where it lands; true where the press is the Stamp tool's. */
  const down = (event: PointerEvent<HTMLElement>): boolean => {
    if (!stamping) return false;
    const at = event.button === 0 ? pointAt({ x: event.clientX, y: event.clientY }) : null;
    const box = at ? pageBox() : null;
    if (!at || !box) return true;
    event.preventDefault();
    stamping.onStamp(index, at, box);
    return true;
  };
  return { active: stamping !== null, down };
}
