// Morphing shapes into another kind (docs/specs/008-canvas/canvas-and-palette.md "Shape"): each element in place.
// Boxes that become mind nodes also join the map their arrows draw (docs/specs/009-elements/mind-node.md "Converting
// a flow"), in the same change, so the conversion is one undo step. Joining is the mind maps family's code, so a
// morph into a mind node runs once the family is in (morphWhenReady), as a palette press places once its family is.
import type { Element, ShapeKind } from '@livedoc/document';
import { isKindFamilyLoaded, loadKindFamily, requireKindFamily } from '@/lib/element-kinds/store';
import { debugLog } from '@/lib/debug-log';
import { applyShapeKindToEl } from '@/lib/style-presets';

/** Runs `morph` once a morph into `kind` can run: at once, or once the mind maps family is in; never when it cannot load. */
export function morphWhenReady(kind: ShapeKind, morph: () => void): void {
  if (kind !== 'mind-node' || isKindFamilyLoaded('mind-maps')) return morph();
  void loadKindFamily('mind-maps', 'palette').then((loaded) => {
    if (loaded) morph();
  });
}

/** The elements with every one in `ids` morphed into `kind` (into a mind node only once morphWhenReady says so). */
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
  const joined = requireKindFamily('mind-maps').joinConvertedMindNodes(morphed, converted);
  debugLog(
    `[mind-convert] converted=${converted.size} joined=${joined === morphed ? 'none' : 'map'}`,
  );
  return joined;
}
