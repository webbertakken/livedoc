// Mirroring across a logo page's vertical centre line (docs/specs/007-editor/logo-pages.md
// "Mirror"), and a selection's flip across either axis (docs/specs/008-canvas/selection-transforms.md):
// an element reflected. A path's points and a stroke's points are reflected; a
// shape takes the reflected box; text, an image and anything else move to the reflected place
// unflipped. Every one turns the other way (its rotation negated). Pure: the caller gives the twin its own id.
import type { PathNode, PathPoint } from './element-types';
import type { BoxedElement } from './index';
import { decodeStrokePoints } from './stroke-points-cache';
import { encodeStrokePoints } from './stroke-points';
import { logoPageAt } from './logo-page';
import type { LaidOutPage } from './page';

// An element whose centre is this close to the axis (a share of the artboard's width) already
// sits on it: mirroring it would only stack a copy on itself.
export const MIRROR_AXIS_TOLERANCE = 0.01;

// Which way a reflection runs: across a vertical line (left to right) or a horizontal one (top to bottom).
export type ReflectionAxis = 'vertical' | 'horizontal';

const flipPoint = (p: PathPoint, axis: ReflectionAxis): PathPoint =>
  axis === 'vertical' ? { ...p, nx: 1 - p.nx } : { ...p, ny: 1 - p.ny };
const flipNode = (n: PathNode, axis: ReflectionAxis): PathNode => ({
  ...flipPoint(n, axis),
  mode: n.mode,
  ...(n.handleIn ? { handleIn: flipPoint(n.handleIn, axis) } : {}),
  ...(n.handleOut ? { handleOut: flipPoint(n.handleOut, axis) } : {}),
});

/** The element reflected across the vertical line x = axisX (same id). */
export function mirrorElement<T extends BoxedElement>(el: T, axisX: number): T {
  return reflectElement(el, 'vertical', axisX);
}

/**
 * The element reflected across the line at `at` (same id): x = at for a vertical axis, y = at for a horizontal one.
 * Its box is reflected, a path's and a stroke's points are reflected inside it, and anything else keeps its face.
 */
export function reflectElement<T extends BoxedElement>(el: T, axis: ReflectionAxis, at: number): T {
  // A reflection turns the other way: any rotation is negated, whatever the element.
  const rotation = (el as { rotation?: number }).rotation;
  const moved = {
    ...el,
    ...(axis === 'vertical' ? { x: 2 * at - el.x - el.width } : { y: 2 * at - el.y - el.height }),
    ...(rotation ? { rotation: -rotation } : {}),
  };
  if (moved.type === 'path') {
    return {
      ...moved,
      nodes: moved.nodes.map((n) => flipNode(n, axis)),
      ...(moved.subpaths
        ? { subpaths: moved.subpaths.map((c) => c.map((n) => flipNode(n, axis))) }
        : {}),
    };
  }
  if (moved.type === 'freehand') {
    const pts = decodeStrokePoints(moved.packedPoints);
    const points = Array.from({ length: pts.count }, (_, i) =>
      axis === 'vertical'
        ? { nx: 1 - pts.nx[i]!, ny: pts.ny[i]! }
        : { nx: pts.nx[i]!, ny: 1 - pts.ny[i]! },
    );
    const pressures = pts.pressures ? Array.from(pts.pressures) : undefined;
    return { ...moved, packedPoints: encodeStrokePoints(points, pressures) };
  }
  return moved;
}

type MirrorUse = 'drawing' | 'copy';

/**
 * The twin an element gets on the logo page under its centre, or null: off every logo page, on
 * the axis already, or (when drawing) not a stroke, path or shape. Mirror Copy also takes text and
 * images. Arrows never mirror.
 */
/** The centre line a box drawn here reflects across: its logo page's, unless the box sits on the
 *  line already (it would be its own twin); null off a logo page. Shared by the twin a release
 *  adds and the twin previewed while drawing, so the two always agree. */
function mirrorAxisFor(
  pages: readonly LaidOutPage[],
  box: { x: number; y: number; width: number; height: number },
): number | null {
  const cx = box.x + box.width / 2;
  const page = logoPageAt(pages, { x: cx, y: box.y + box.height / 2 });
  if (!page) return null;
  const axisX = page.rect.x + page.rect.width / 2;
  return Math.abs(cx - axisX) <= MIRROR_AXIS_TOLERANCE * page.rect.width ? null : axisX;
}

export function twinFor(
  el: BoxedElement,
  pages: readonly LaidOutPage[],
  use: MirrorUse,
): BoxedElement | null {
  const drawn = el.type === 'freehand' || el.type === 'path' || el.type === 'shape';
  if (!drawn && !(use === 'copy' && (el.type === 'text' || el.type === 'image'))) return null;
  const axisX = mirrorAxisFor(pages, el);
  if (axisX === null) return null;
  const twin = mirrorElement(el, axisX);
  return use === 'copy' ? { ...twin, locked: false } : twin;
}
