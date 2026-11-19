// Outlines drawn on purpose in their finish (docs/specs/008-canvas/finish.md "Polygons and paths"): a Polygon-tool
// outline (docs/specs/008-canvas/polygon-tool.md), placed point by point, and a Path-tool curve
// (docs/specs/023-draw-mode/path-tool.md), placed node by node, are drawings like a shape's outline, not a hand's
// stroke, so they follow their finish as a shape does. Pen strokes, the highlighter and smoothed pencil strokes are
// already hand-drawn and stay as drawn. Their hand-drawn drawing is
// drawn-outline-paint.ts's, which loads only with a hand-drawn board (docs/specs/016-platform/web-performance.md).
import { BORDER_STROKE_PX, IMAGE_DEFAULT_RADIUS_PX, cornerRadiusPx } from './border-style';
import { MARKER_LINE_PX, finishBorderStroke, finishCornerFallbackPx, type Finish } from './finish';
import type { FreehandElement, ImageElement } from './index';
import { isPenStroke } from './pen-stroke';

/** Whether a freehand is a Polygon-tool outline: straight edges, not a pen stroke or the highlighter. */
export function isPolygonOutline(el: FreehandElement): boolean {
  return !!el.straightEdges && !isPenStroke(el) && el.pen !== 'highlighter';
}

/** A drawn outline's line width in its finish, px: a width of its own (a recorded pen width, a picked border)
 *  wins; unset draws Professional's Thin, and Marker's nib for unset or Thin. */
export function polygonStrokePx(
  el: Pick<FreehandElement, 'penWidth' | 'strokeWidth'>,
  finish: Finish,
): number {
  if (el.penWidth !== undefined) return el.penWidth;
  if (finish === 'marker' && (!el.strokeWidth || el.strokeWidth === 'thin')) return MARKER_LINE_PX;
  return BORDER_STROKE_PX[finishBorderStroke(el.strokeWidth, finish)];
}

/** An image's corner in its finish: its own, else the image default, square under Professional. */
export function imageCornerPx(
  el: Pick<ImageElement, 'borderRadius' | 'width' | 'height'>,
  finish: Finish,
): number {
  return cornerRadiusPx(
    el.borderRadius,
    el.width,
    el.height,
    finishCornerFallbackPx(IMAGE_DEFAULT_RADIUS_PX, finish),
  );
}
