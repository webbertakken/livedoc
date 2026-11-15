// The bounding box of a tab's visible content (docs/specs/020-import-export/export-fidelity.md): what an export
// frames, a deck fits to and a library shape is placed by. A leaf apart from the SVG renderer, which uses it too, so
// the editor fits and places without loading the renderer (docs/specs/016-platform/web-performance.md "Pictures of
// the board"). Pure.
import { arrowRoutePoints, type ArrowLabelPass } from './arrow-label-layout';
import { boundsOfPoints, type Point } from './geometry-primitives';
import type { Element } from './index';
import { isPointerNote, pointerTipOf } from './pointer-note';

// Bounding box of the visible content. Arrows count via free endpoints; boxed
// elements via their rectangle. Empty / degenerate tabs default to a page.
// Arrows count by their drawn route (a bow can swing well outside the boxes
// it joins) and, when a label pass is given, by their label plates.
export function contentBounds(
  elements: Element[],
  labels?: ArrowLabelPass,
): { x: number; y: number; w: number; h: number } {
  const points: Point[] = [];
  for (const el of elements) {
    if (el.type === 'arrow') {
      points.push(...arrowRoutePoints(el, elements));
      const l = labels?.layouts.get(el.id);
      if (l) {
        points.push(
          { x: l.center.x - l.width / 2, y: l.center.y - l.height / 2 },
          { x: l.center.x + l.width / 2, y: l.center.y + l.height / 2 },
        );
      }
    } else {
      points.push({ x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height });
      // A pointer note's tip can sit well outside its box (docs/specs/009-elements/pointer-note.md).
      if (isPointerNote(el)) {
        const t = pointerTipOf(el);
        points.push(
          { x: el.x + t.x - 4, y: el.y + t.y - 4 },
          { x: el.x + t.x + 4, y: el.y + t.y + 4 },
        );
      }
    }
  }
  const b = boundsOfPoints(points);
  if (!b || !Number.isFinite(b.x)) return { x: 0, y: 0, w: 600, h: 400 };
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
