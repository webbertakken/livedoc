'use client';

// The canvas zoom, for the parts of an element that are counter-scaled to stay a constant size on
// screen: grips, badges, the edit toolbar (docs/specs/008-canvas/canvas-performance.md); the hit bands read the
// zoom a zoom gesture settles at instead (useHitBandZoom).
// A zoom re-renders those consumers only; the element views around them, which take no zoom, keep
// their last render. Outside a provider the zoom is 1.

import { createContext, useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { useCanvasGesture } from '@/lib/canvas-gesture';

const CanvasZoomContext = createContext(1);
// The zoom the hit bands are drawn at (useHitBandZoom).
const HitBandZoomContext = createContext(1);

export function CanvasZoomProvider({ zoom, children }: { zoom: number; children: ReactNode }) {
  const hitBandZoom = useSettledZoom(zoom);
  return (
    <CanvasZoomContext.Provider value={zoom}>
      <HitBandZoomContext.Provider value={hitBandZoom}>{children}</HitBandZoomContext.Provider>
    </CanvasZoomContext.Provider>
  );
}

// The zoom as it was when the zoom gesture under way started, or the zoom when none is.
function useSettledZoom(zoom: number): number {
  const zooming = useCanvasGesture() === 'zoom';
  const [held, setHeld] = useState(zoom);
  if (!zooming && held !== zoom) setHeld(zoom);
  return zooming ? held : zoom;
}

export function useCanvasZoom(): number {
  return useContext(CanvasZoomContext);
}

// The zoom for the invisible bands that catch a whiteboard shape or stroke a few screen px either side of its line
// (ShapeHitOutline, StrokeHitPath): it holds while a zoom gesture lasts and moves when it ends
// (docs/specs/008-canvas/canvas-performance.md "A zoom moves no hit band"). Hundreds of them on a board, each a
// stroke width written as the zoom moved, restyled and laid out every one of them on every wheel tick; for the
// moment a zoom lasts, a band a little wider or narrower than its screen px catches the same pointers.
export function useHitBandZoom(): number {
  return useContext(HitBandZoomContext);
}

// A div counter-scaled to keep its size on screen. It reads the zoom itself, so whatever renders it
// takes no zoom and does not render for one.
export function CounterScaled({ style, ...props }: ComponentProps<'div'>) {
  const zoom = useCanvasZoom();
  return <div {...props} style={{ ...style, transform: `scale(${1 / zoom})` }} />;
}
