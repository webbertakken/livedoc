'use client';

// The marks collaborators hold on a page (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence";
// marks.md "Together"): each outlined in the person's colour, their name over it for PDF_PRESENCE_FRESH_MS after the
// hold moves (another mark held, or the mark moved or resized) and while the pointer is over it. Drawn over the page,
// never in its way: presses fall through, and assistive technology hears presence from the title row's people.
import { useEffect, useRef, useState } from 'react';
import { Mark, type PageMatrix, type PagePoint } from '@livedoc/pdf-documents';
import { OfficePeerTag } from '@/components/office/OfficePeerTag';
import type { PdfPeerHold } from '@/lib/pdf-document/pdf-presence-held';
import { PDF_PRESENCE_FRESH_MS } from '@/lib/pdf-document/pdf-presence-store';
import { linkBox, percentStyle } from './PdfPageLinks';

type Bounds = readonly [number, number, number, number];

/** A mark's box `gap` points out from it and its line, in page space. */
function heldBounds(mark: Mark, gap: number): Bounds {
  const [left, bottom, right, top] = Mark.bounds(mark);
  const out = gap + ('width' in mark ? mark.width / 2 : 0);
  return [left - out, bottom - out, right + out, top + out];
}

const within = ([left, bottom, right, top]: Bounds, at: PagePoint): boolean =>
  at.x >= left && at.x <= right && at.y >= bottom && at.y <= top;

/** One hold, drawn afresh each time it moves (keyed by the mark and its box), so its name shows from then. */
function PeerHold({
  hold,
  bounds,
  matrix,
  width,
  height,
  hover,
}: {
  hold: PdfPeerHold;
  bounds: Bounds;
  matrix: PageMatrix;
  width: number;
  height: number;
  hover: boolean;
}) {
  const [at] = useState(() => Date.now());
  return (
    <div
      data-pdf-peer-hold={hold.mark.id}
      data-pdf-peer={hold.id}
      className="pointer-events-none absolute"
      style={{
        ...percentStyle(linkBox(matrix, bounds, width, height)),
        border: `2px solid ${hold.color}`,
      }}
    >
      <OfficePeerTag
        text={hold.name}
        color={hold.color}
        freshMs={PDF_PRESENCE_FRESH_MS}
        at={at}
        hover={hover}
      />
    </div>
  );
}

export function PdfPeerHolds({
  holds,
  matrix,
  width,
  height,
  gap,
  target,
  pointAt,
}: {
  holds: readonly PdfPeerHold[];
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points.
  width: number;
  height: number;
  // How far out from a mark its outline is, in points.
  gap: number;
  // The page's box, whose pointer shows a name again, and where a pointer is on the page as the file has it.
  target: HTMLElement | null;
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
}) {
  const [pointer, setPointer] = useState<PagePoint | null>(null);
  const reading = useRef(pointAt);
  useEffect(() => {
    reading.current = pointAt;
  });
  const watched = holds.length > 0;
  useEffect(() => {
    if (!target || !watched) return;
    const move = (event: PointerEvent) =>
      setPointer(reading.current({ x: event.clientX, y: event.clientY }));
    const leave = () => setPointer(null);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerleave', leave);
    return () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerleave', leave);
      setPointer(null);
    };
  }, [target, watched]);
  return holds.map((hold) => {
    const bounds = heldBounds(hold.mark, gap);
    return (
      <PeerHold
        key={`${hold.id} ${hold.mark.id} ${bounds.join(' ')}`}
        hold={hold}
        bounds={bounds}
        matrix={matrix}
        width={width}
        height={height}
        hover={pointer !== null && within(bounds, pointer)}
      />
    );
  });
}
