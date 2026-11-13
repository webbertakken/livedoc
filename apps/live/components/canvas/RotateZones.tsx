'use client';

// The rotate zones (docs/specs/008-canvas/selection-transforms.md "Rotating by hand"): an invisible square just
// outside each corner of a selection that can turn, past the corner handle. Hovering one shows the rotate cursor;
// pressing one starts a turn about the selection's pivot. Rendered BEFORE the corner handles in the same frame, so
// where a handle and a zone meet the handle wins and still resizes.
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DragMode } from '@/lib/canvas';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];

// Each corner's anchor, a zero-size point on the frame's corner that the zone hangs off. Counter-scaled about that
// point, so the zone keeps its screen size at every zoom (ST2).
const ANCHOR_CLASS: Record<Corner, string> = {
  nw: 'left-0 top-0',
  ne: 'left-full top-0',
  sw: 'left-0 top-full',
  se: 'left-full top-full',
};

// The zone reaches outwards, away from the frame: 20 px for a mouse or pen; on a coarse pointer it runs 40 px past
// the handle's 22 px touch pad, so a finger finds it without taking the handle's press (ST2).
const ZONE_CLASS: Record<Corner, string> = {
  nw: 'right-0 bottom-0',
  ne: 'left-0 bottom-0',
  sw: 'right-0 top-0',
  se: 'left-0 top-0',
};
const ZONE_SIZE_CLASS = 'h-5 w-5 pointer-coarse:h-[62px] pointer-coarse:w-[62px]';

// Which way each corner's curved arrow faces before the frame's own turn: the north-east one as drawn, the rest
// turned round to their corner.
const CORNER_TURN: Record<Corner, number> = { ne: 0, se: 90, sw: 180, nw: 270 };

// A curved two-headed arrow bowing round the north-east corner, drawn white under black so it reads on any board.
const ARROW_PATH = 'M6 7A11 11 0 0 1 17 18M8.6 4.4 6 7l2.6 2.6M14.4 15.4 17 18l2.6-2.6';

/** The rotate cursor for a corner of a frame turned by `rotation` degrees: the arrow facing that corner. */
export function rotateCursor(corner: Corner, rotation: number): string {
  const turn = Math.round((((CORNER_TURN[corner] + rotation) % 360) + 360) % 360);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='rotate(${turn} 12 12)' fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${ARROW_PATH}' stroke='white' stroke-width='4'/>` +
    `<path d='${ARROW_PATH}' stroke='black' stroke-width='1.6'/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}

export function RotateZones({
  elementId,
  zoom,
  rotation = 0,
  onBeginDrag,
}: {
  // The id the press hands back: the element, or a multi-selection's primary.
  elementId: string;
  zoom: number;
  // The frame's turn in degrees, so each cursor faces its corner as drawn.
  rotation?: number;
  onBeginDrag: (id: string, mode: DragMode, e: ReactPointerEvent) => void;
}) {
  return (
    <>
      {CORNERS.map((corner) => (
        <div
          key={corner}
          className={`pointer-events-none absolute h-0 w-0 ${ANCHOR_CLASS[corner]}`}
          style={{ transform: `scale(${1 / zoom})`, transformOrigin: '0 0' }}
        >
          <div
            data-rotate-zone={corner}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onBeginDrag(elementId, 'rotate', e);
            }}
            style={{ cursor: rotateCursor(corner, rotation) }}
            className={`pointer-events-auto absolute ${ZONE_SIZE_CLASS} ${ZONE_CLASS[corner]}`}
          />
        </div>
      ))}
    </>
  );
}
