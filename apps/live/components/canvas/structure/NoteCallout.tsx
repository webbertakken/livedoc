'use client';

import { useRef, type ReactNode } from 'react';
import type { Rect } from '@livedoc/document';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { useKeepInWindow } from '@/hooks/canvas/useKeepInWindow';

// What is said under a note (docs/specs/021-event-storming/board-structure.md "Hotspot answers"): a hotspot's answer
// as a caption, and the field it is typed in. It stands a gap under the note's box, never on its paper, at screen
// size whatever the zoom, and is moved back inside the window while its note stands at an edge (useKeepInWindow).

/** How wide it stands, screen px (safe range: 220 to 320; an answer of 300 characters reads in a few lines). */
export const NOTE_CALLOUT_WIDTH_PX = 260;
const GAP_PX = 8;

export function NoteCallout({
  anchor,
  children,
}: {
  // The note's box, canvas units.
  anchor: Rect;
  children: ReactNode;
}) {
  const zoom = useCanvasZoom();
  const ref = useRef<HTMLDivElement>(null);
  useKeepInWindow(ref);
  return (
    <div
      className="absolute"
      style={{
        left: anchor.x,
        top: anchor.y + anchor.height,
        transform: `scale(${1 / zoom})`,
        transformOrigin: '0 0',
      }}
    >
      <div
        ref={ref}
        data-note-callout
        onPointerDown={(e) => e.stopPropagation()}
        className="pointer-events-auto absolute"
        style={{ left: 0, top: GAP_PX, width: NOTE_CALLOUT_WIDTH_PX }}
      >
        {children}
      </div>
    </div>
  );
}
