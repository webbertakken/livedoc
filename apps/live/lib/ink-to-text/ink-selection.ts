// Which selected strokes are ink for Convert to Text (docs/specs/023-draw-mode/ink-to-text.md "When it is offered").
// Apart from the rest, as the editor asks it on every selection; the reading loads only at a conversion. Pure.
import type { Element, FreehandElement } from '@livedoc/document';

/** The selected pen strokes, in the tab's order; null unless the selection is only unlocked pen strokes. */
export function inkSelection(
  elements: readonly Element[],
  ids: ReadonlySet<string>,
  layerLockedIds: ReadonlySet<string>,
): FreehandElement[] | null {
  if (ids.size === 0) return null;
  const picked = elements.filter((el) => ids.has(el.id));
  if (picked.length !== ids.size) return null;
  const ink = picked.filter(
    (el): el is FreehandElement =>
      el.type === 'freehand' &&
      el.pen !== 'highlighter' &&
      el.locked !== true &&
      !layerLockedIds.has(el.id),
  );
  return ink.length === picked.length ? ink : null;
}
