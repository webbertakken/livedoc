import { useMemo } from 'react';
import {
  isHandDrawn,
  type BoxedElement,
  type Finish,
  type HandDrawnPaint,
} from '@livedoc/document';
import { requireKindFamily } from '@/lib/element-kinds/store';

// A sketched element's body (docs/specs/008-canvas/finish.md "Sketch", "Marker"), worked out for the SketchOverlay.

export type SketchPaint = HandDrawnPaint;

/** The element's sketch, memoised on what shapes it: never on position, so a drag recomputes nothing
 *  (docs/specs/008-canvas/canvas-performance.md). Null when the element is not sketched. The drawing is the
 *  sketches family's (docs/specs/016-platform/web-performance.md), in before a hand-drawn element draws
 *  (BoxedElementView). */
export function useSketchPaint(
  element: BoxedElement,
  finish: Finish,
  fill: string,
  // Something sits on this shape (sketch-backdrop-store): a solid fill, never hatching.
  backdrop = false,
): SketchPaint | null {
  const shape = element.type === 'shape' ? element.shape : undefined;
  const {
    strokeWidth,
    strokeStyle,
    borderRadius,
    packedPoints,
    closed,
    straightEdges,
    penWidth,
    nodes,
    subpaths,
  } = element as {
    strokeWidth?: string;
    strokeStyle?: string;
    borderRadius?: string;
    // A Polygon-tool outline's own points (docs/specs/008-canvas/finish.md "Polygons").
    packedPoints?: string;
    closed?: boolean;
    straightEdges?: boolean;
    penWidth?: number;
    // A Path-tool curve's nodes.
    nodes?: unknown;
    subpaths?: unknown;
  };
  return useMemo(
    () =>
      isHandDrawn(finish)
        ? requireKindFamily('sketches').handDrawnElementPaint(element, finish, fill, backdrop)
        : null,
    // The fields the paint reads, so moving the element keeps the drawing.
    // oxlint-disable-next-line react/exhaustive-deps
    [
      element.id,
      element.type,
      shape,
      element.width,
      element.height,
      strokeWidth,
      strokeStyle,
      borderRadius,
      packedPoints,
      closed,
      straightEdges,
      penWidth,
      nodes,
      subpaths,
      finish,
      fill,
      backdrop,
    ],
  );
}
