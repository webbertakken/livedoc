'use client';

import { memo, type ReactNode } from 'react';
import type { Element } from '@livedoc/document';
import {
  useDocEntry,
  usePreviewEntry,
  type DocEntry,
  type LayerPreviewStore,
  type PreviewEntry,
} from '@/hooks/canvas/useLayerDragPreview';

// What a slot hands its list's `draw`: the element to draw, its preview and document entries, and where the list
// puts it (its paint index and its layer's opacity).
export type SlotDraw = {
  element: Element;
  entry: PreviewEntry | undefined;
  doc: DocEntry | undefined;
  layerOpacity: number;
  isoDepth: number;
};

type ElementSlotProps = {
  store: LayerPreviewStore;
  element: Element;
  layerOpacity: number;
  isoDepth: number;
  draw: (slot: SlotDraw) => ReactNode;
};

// One element of the layer, drawn from the drag preview while one changes it and from the document
// otherwise (docs/specs/008-canvas/drag-preview.md): a preview frame re-renders this, not the layer, and
// so does a change of the document that changes this element and leaves the list as it was
// (docs/specs/008-canvas/canvas-performance.md "A release re-renders what moved, too"). `element` is the
// element as the layer last listed it, drawn until the document's entry for it is taken.
export function ElementSlot({ store, element, layerOpacity, isoDepth, draw }: ElementSlotProps) {
  const entry = usePreviewEntry(store, element.id);
  const doc = useDocEntry(store, element.id);
  return draw({
    element: entry?.element ?? doc?.element ?? element,
    entry,
    doc,
    layerOpacity,
    isoDepth,
  });
}

// Memoised on its props, each identity-stable while it draws the same: a list render that adds or removes an
// element walks that element's slot and not the board's ("A new element walks only itself"); a change of what
// every element draws with (a new `draw`) walks them all.
export const PreviewedElement = memo(ElementSlot);
