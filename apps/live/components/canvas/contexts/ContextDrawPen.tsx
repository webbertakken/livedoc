'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { CONTEXT_DASH_PX, CONTEXT_STROKE_PX } from '@livedoc/document';
import { loopPath } from '@/lib/context-loop';

// Draw Context's pen (docs/specs/021-event-storming/candidate-contexts.md "Making one by hand"): while it is armed,
// a sheet over the whole board takes the pointer; a press and drag draws a dashed loop in canvas units, and letting
// go hands the loop over. Lives in the context layer's canvas space, so a point is the pointer less the sheet's
// origin, over the zoom. Pointer only: from the keyboard, New Context makes one from a selection.

// How far the sheet reaches from the canvas origin each way, canvas px: past any board.
const SHEET_REACH = 1_000_000;
// The least move that adds a point to the loop, screen px.
const STEP_PX = 4;

type Pt = { x: number; y: number };

export function ContextDrawPen({ zoom, onLoop }: { zoom: number; onLoop: (loop: Pt[]) => void }) {
  const [loop, setLoop] = useState<Pt[] | null>(null);
  const points = useRef<Pt[]>([]);
  const at = (e: PointerEvent<HTMLDivElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / zoom - SHEET_REACH,
      y: (e.clientY - r.top) / zoom - SHEET_REACH,
    };
  };
  return (
    <div
      data-context-pen=""
      className="pointer-events-auto absolute cursor-crosshair touch-none"
      style={{
        left: -SHEET_REACH,
        top: -SHEET_REACH,
        width: 2 * SHEET_REACH,
        height: 2 * SHEET_REACH,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        points.current = [at(e)];
        setLoop(points.current);
      }}
      onPointerMove={(e) => {
        if (!loop) return;
        const p = at(e);
        const last = points.current[points.current.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) * zoom < STEP_PX) return;
        points.current = [...points.current, p];
        setLoop(points.current);
      }}
      onPointerUp={() => {
        if (!loop) return;
        const done = points.current;
        points.current = [];
        setLoop(null);
        onLoop(done);
      }}
    >
      {loop ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute overflow-visible"
          style={{ left: SHEET_REACH, top: SHEET_REACH, width: 1, height: 1 }}
        >
          <path
            data-context-loop=""
            d={loopPath(loop)}
            fill="none"
            stroke="var(--ctx-active)"
            strokeWidth={CONTEXT_STROKE_PX / zoom}
            strokeDasharray={`${CONTEXT_DASH_PX / zoom} ${CONTEXT_DASH_PX / zoom}`}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}
