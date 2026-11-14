'use client';

import type { ReactNode } from 'react';
import type { Element } from '@livedoc/document';
import {
  useDocEntry,
  usePreviewEntry,
  type DocEntry,
  type LayerPreviewStore,
  type PreviewEntry,
} from '@/hooks/canvas/useLayerDragPreview';

// One element of the layer, drawn from the drag preview while one changes it and from the document
// otherwise (docs/specs/008-canvas/drag-preview.md): a preview frame re-renders this, not the layer, and
// so does a change of the document that changes this element and leaves the list as it was
// (docs/specs/008-canvas/canvas-performance.md "A release re-renders what moved, too"). `element` is the
// element as the layer last listed it, drawn until the document's entry for it is taken.
export function PreviewedElement({
  store,
  element,
  draw,
}: {
  store: LayerPreviewStore;
  element: Element;
  draw: (element: Element, entry: PreviewEntry | undefined, doc: DocEntry | undefined) => ReactNode;
}) {
  const entry = usePreviewEntry(store, element.id);
  const doc = useDocEntry(store, element.id);
  return draw(entry?.element ?? doc?.element ?? element, entry, doc);
}
