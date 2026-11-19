'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { isPillRect, type Finish } from '@livedoc/document';
import { watchUntilSettled } from '@/components/canvas/settle-watch';
import { isKindFamilyLoaded, loadKindFamily, requireKindFamily } from '@/lib/element-kinds/store';
import {
  DRAWN_ATTR,
  INK_ATTR,
  ISOLATED_ATTR,
  MEASURE_ATTR,
  PILL_ATTR,
  RULES_ATTR,
  clearMarkerFace,
} from './face-finish-marks';

// A face's own parts in its finish on the canvas. Under Marker (docs/specs/008-canvas/finish.md "Marker", "Faces: frames and shapes"):
// once the face has settled, its frames (outlined HTML boxes) and its SVG shapes are read from the live DOM and
// described to markerFacePart, the same rules and drawing the export runs over its markup (svgMarkerFace). Each
// part's ink goes in beside the part itself: an <svg> inside a frame, a <g> after a shape, in the shape's own
// coordinates. So it moves with the part (a column that scrolls, a band that animates) and sits under whatever the
// face draws above the part (its words). The part's own line is hidden by app/face-finish.css through the mark set
// here. The ink is ours, not React's: React never sees it, and every take clears the last one first. Marker's and
// Sketch's drawing is the sketches family's (hand-drawn-face.ts, docs/specs/016-platform/web-performance.md): in by
// the time a hand-drawn element draws; a face drawn before it (a maximised plan's) is drawn once it lands.

/** The face under `root` in its finish, re-taken whenever it settles after a change: Marker draws its frames and
 *  shapes in marker; Sketch shades its shapes in pencil; Professional keeps its SVG pills round (face-finish.css
 *  squares every other rectangle). */
export function useFaceFinishPass(
  rootRef: RefObject<HTMLElement | null>,
  finish: Finish | undefined,
  elementId: string,
  // A body that fills its tab or the screen (MaximisedPlanLayer's OverFace) is the page, not a box on it: its own box
  // is never coloured in.
  { page = false }: { page?: boolean } = {},
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || finish === undefined || finish === 'flexible') return;
    let live = true;
    const pen = finish === 'marker' ? 'marker' : 'pencil';
    const take =
      finish === 'professional'
        ? () => markFacePills(root)
        : () => {
            if (isKindFamilyLoaded('sketches'))
              requireKindFamily('sketches').drawMarkerFace(root, elementId, pen, page);
          };
    if (finish !== 'professional' && !isKindFamilyLoaded('sketches'))
      void loadKindFamily('sketches', 'element').then((ok) => live && ok && take());
    take();
    const stop = watchUntilSettled(root, take, { resize: true, ignore: ownChange });
    // Lettering that loads late reflows the face without a mutation.
    void document.fonts?.ready.then(() => live && take());
    return () => {
      live = false;
      stop();
      clearMarkerFace(root);
      for (const pill of root.querySelectorAll(`[${PILL_ATTR}]`)) pill.removeAttribute(PILL_ATTR);
    };
  }, [rootRef, finish, elementId, page]);
}

/** Marks every SVG rectangle under `root` whose ends are round (a pill, a disc), which Professional keeps. */
export function markFacePills(root: Element): void {
  if (typeof SVGRectElement === 'undefined') return;
  for (const rect of root.querySelectorAll('rect')) {
    const pill = isPillRect(
      rect.width.baseVal.value,
      rect.height.baseVal.value,
      rect.rx.baseVal.value || rect.ry.baseVal.value,
    );
    if (pill !== rect.hasAttribute(PILL_ATTR)) rect.toggleAttribute(PILL_ATTR, pill);
  }
}

// A change the pass made: its ink going in or out, its marks.
function ownChange(r: MutationRecord): boolean {
  // Sketch's ink copy of the face (SketchFace) is re-taken from the live face: never a change to read.
  const target = r.target instanceof Element ? r.target : r.target.parentElement;
  if (target?.closest('[data-sketch-ink]')) return true;
  if (r.type === 'attributes')
    return (
      r.attributeName === DRAWN_ATTR ||
      r.attributeName === PILL_ATTR ||
      r.attributeName === RULES_ATTR ||
      r.attributeName === MEASURE_ATTR ||
      r.attributeName === ISOLATED_ATTR ||
      // The isolation it sets on a box it colours in.
      (r.attributeName === 'style' && (r.target as Element).hasAttribute?.(ISOLATED_ATTR))
    );
  if (r.type !== 'childList') return false;
  const ours = (n: Node) => n instanceof Element && n.hasAttribute(INK_ATTR);
  return [...r.addedNodes, ...r.removedNodes].every(ours);
}
