'use client';

import { useState } from 'react';
import { useSpotlight } from '@/hooks/canvas/useSpotlight';
import { useSpotlightConfig } from '@/hooks/canvas/useSpotlightConfig';
import { spotlightRadius } from '@/lib/spotlight-config';
import type { CanvasProps } from '@/components/canvas/Canvas.types';
import { useCanvasClientOrigin } from '@/hooks/canvas/useCanvasClientOrigin';
import { useCanvasViewKey } from '@/hooks/canvas/useViewportStore';

type CanvasPointerInput = Pick<CanvasProps, 'canvasTool' | 'mainRef' | 'onCanvasPointerMove'> & {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  // <main>'s size: where canvas (0, 0) sits on screen moves with it, the pan and the zoom.
  mainSize: { width: number; height: number };
};

// Where the pointer is over the canvas: the spotlight's light and the eraser's brush ring in screen space, and the
// canvas-coords position broadcast to peers. One measurement serves all three.
export function useCanvasPointer({
  canvasTool,
  mainRef,
  onCanvasPointerMove,
  wrapperRef,
  mainSize,
}: CanvasPointerInput) {
  // Where canvas (0, 0) sits on screen, measured when the view or <main>'s size changes and never on a pointer
  // move: a move during a drag follows the frame's writes, and reading layout there laid out the whole board
  // again on every frame (docs/specs/008-canvas/canvas-performance.md "A gesture frame never reads layout").
  const { viewportZoom, viewKey } = useCanvasViewKey(mainSize);
  const origin = useCanvasClientOrigin(wrapperRef, true, viewKey);
  // Spotlight presenter tool (docs/specs/008-canvas/canvas-and-palette.md): screen-space light position +
  // radius. Local to Canvas so the click handlers, the pointer tracker, and
  // the overlay share one source of truth; survives Pan/Select detours
  // because Canvas stays mounted.
  // The spotlight's look (docs/specs/008-canvas/spotlight-panel.md): persisted per browser, read by the
  // overlay and edited from the Spotlight Panel down in the chrome. The light opens at its saved Size.
  const spotlightLook = useSpotlightConfig();
  const spotlight = useSpotlight(spotlightRadius(spotlightLook.config.size));
  // Where to draw the eraser's brush ring, in <main>-relative px. Null until
  // the pointer has been over the canvas — an eraser ring parked in the middle
  // of the screen would claim a brush that isn't there.
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);

  // Broadcast the local pointer position to peers (canvas-coords).
  // Throttling lives in page.tsx so the Canvas stays prop-driven.
  const handlePointerMoveCanvas = (e: React.PointerEvent) => {
    // Spotlight tracks the cursor in SCREEN space (px relative to <main>),
    // not canvas-coords: its light must stay put on screen as the canvas
    // pans / zooms under it. <main> is `position: relative` with no border,
    // so its content origin is its bounding-rect top-left.
    if (canvasTool === 'spotlight' || canvasTool === 'eraser') {
      const node = mainRef && 'current' in mainRef ? mainRef.current : null;
      const mr = node?.getBoundingClientRect();
      const at = mr ? { x: e.clientX - mr.left, y: e.clientY - mr.top } : null;
      // The eraser's brush ring (docs/specs/008-canvas/eraser-panel.md) needs the same screen-space point
      // the spotlight's light does, so they share the measurement.
      if (at && canvasTool === 'spotlight') spotlight.setPos(at);
      if (at && canvasTool === 'eraser') setEraserPos(at);
    }
    if (!origin) return;
    onCanvasPointerMove(
      (e.clientX - origin.left) / viewportZoom,
      (e.clientY - origin.top) / viewportZoom,
      e.target,
    );
  };
  const handlePointerLeaveCanvas = () => {
    onCanvasPointerMove(null, null);
  };
  return {
    spotlightLook,
    spotlight,
    eraserPos,
    handlePointerMoveCanvas,
    handlePointerLeaveCanvas,
  };
}
