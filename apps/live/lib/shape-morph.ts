// Morphing shapes into another kind (docs/specs/008-canvas/canvas-and-palette.md "Shape"): each element in place.
// Boxes that become mind nodes also join the map their arrows draw (docs/specs/009-elements/mind-node.md "Converting
// a flow"), in the same change, so the conversion is one undo step.
import { joinConvertedMindNodes, type Element, type ShapeKind } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { applyShapeKindToEl } from '@/lib/style-presets';

/** The elements with every one in `ids` morphed into `kind`. */
export function morphShapes(
  elements: Element[],
  ids: ReadonlySet<string>,
  kind: ShapeKind,
): Element[] {
  const converted = new Set<string>();
  const morphed = elements.map((el) => {
    if (!ids.has(el.id)) return el;
    if (kind === 'mind-node' && el.type === 'shape' && el.shape !== 'mind-node')
      converted.add(el.id);
    return applyShapeKindToEl(el, kind);
  });
  if (converted.size === 0) return morphed;
  const joined = joinConvertedMindNodes(morphed, converted);
  debugLog(
    `[mind-convert] converted=${converted.size} joined=${joined === morphed ? 'none' : 'map'}`,
  );
  return joined;
}
