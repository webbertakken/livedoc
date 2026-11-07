'use client';

import { memo, useRef } from 'react';
import { PictureDisc, IDENTITY_FILL, identityVars } from '@livedoc/ui';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { useCursorsNearPointer } from '@/hooks/canvas/useCursorsNearPointer';
import { useHideCursors } from '@/hooks/collab/useHideCursors';
import { initialsOf } from '@/lib/identity';

// Another participant's cursor on the canvas: the arrow in their colour and the pill with their name (and their
// picture, docs/specs/014-identity/profile-picture.md §5, only when there is one).

/** One remote cursor as the canvas draws it: canvas coordinates, joined with the person's name and colour. */
export type RemoteCursorRow = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  picture?: string;
};

const CURSOR_PICTURE_PX = 14;

// Position is in canvas coords (so the cursor pans + zooms with the canvas), but the SVG + name pill are
// counter-scaled so they keep their on-screen size at any zoom, the same trick the badges and plus buttons use.
// It never takes a pointer: `pointer-events-none` lets every click through to what is beneath, faded or not.
// Memoised: one cursor stepping aside re-renders that cursor, not the whole room.
export const RemoteCursor = memo(function RemoteCursor({
  cursor,
  zoom,
  faded = false,
}: {
  cursor: RemoteCursorRow;
  zoom: number;
  // Stepping aside for this screen's pointer (docs/specs/012-collaboration/collaborator-enhancements.md §3).
  faded?: boolean;
}) {
  return (
    <div
      aria-hidden
      data-remote-cursor={cursor.id}
      data-faded={faded || undefined}
      className={`pointer-events-none absolute motion-safe:transition-opacity motion-safe:duration-micro ${faded ? 'opacity-0' : ''}`}
      style={{
        left: cursor.x,
        top: cursor.y,
        transform: `scale(${1 / zoom})`,
        transformOrigin: 'top left',
        zIndex: 40,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill={cursor.color}
        stroke="white"
        strokeWidth="1"
      >
        <path d="M2 1 L14 8 L8 9 L11 14 L9 15 L6 10 L2 14 Z" />
      </svg>
      <span
        className={`absolute left-3 top-3 flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm ${IDENTITY_FILL}`}
        style={identityVars(cursor.color)}
      >
        {cursor.picture ? (
          <PictureDisc
            pictureUrl={cursor.picture}
            size={CURSOR_PICTURE_PX}
            aria-hidden
            className="-ml-0.5 text-[7px]"
          >
            {initialsOf(cursor.name)}
          </PictureDisc>
        ) : null}
        {cursor.name}
      </span>
    </div>
  );
});

// Every remote cursor on the active tab, drawn inside the canvas's panned + zoomed wrapper. It reads the zoom
// itself (docs/specs/008-canvas/canvas-performance.md), so the layer around it takes no view, and it draws
// nothing while this screen hides participant cursors (docs/specs/012-collaboration/collaborator-enhancements.md §2).
// A cursor under or near this screen's own pointer fades out of the way until the pointer leaves (§3); the anchor,
// a point at canvas (0, 0), is where the hit test reads the canvas's place on screen.
const NO_CURSORS: readonly RemoteCursorRow[] = [];

export function RemoteCursors({ cursors }: { cursors: readonly RemoteCursorRow[] }) {
  const zoom = useCanvasZoom();
  const { hidden } = useHideCursors();
  // Hidden draws no cursor, so the hook gets none and attaches no listener.
  const drawn = hidden ? NO_CURSORS : cursors;
  const anchor = useRef<HTMLDivElement>(null);
  const near = useCursorsNearPointer(drawn, zoom, anchor);
  if (drawn.length === 0) return null;
  return (
    <>
      <div ref={anchor} aria-hidden className="pointer-events-none absolute left-0 top-0 size-0" />
      {drawn.map((c) => (
        <RemoteCursor key={c.id} cursor={c} zoom={zoom} faded={near.has(c.id)} />
      ))}
    </>
  );
}
