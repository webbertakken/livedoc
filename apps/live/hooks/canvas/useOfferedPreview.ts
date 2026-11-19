'use client';

import { useEffect, useMemo } from 'react';
import type { Element, ElementId, Layer } from '@livedoc/document';
import type { OfferedPreview } from '@/lib/change-preview';
import { requireKindFamily } from '@/lib/element-kinds/store';
import { clearOfferedPreview, setOfferedPreview } from '@/lib/drag-preview';

// The suggested change a person is pointing at, drawn over an untouched board
// (docs/specs/021-event-storming/suggested-changes.md "A preview never writes"): worked out from the board as it
// stands, and laid into the drag preview's offered channel, so every drawer that follows a drag (the element views,
// the arrows, the context outlines and names) draws it, while nothing is written, sent or in hand. Answers the
// preview, for the canvas to draw what no element is: a split's further parts and a removal's strike. Working it out
// is the Event Storming family's (lib/change-preview.ts): a key is only ever previewed where its suggestions are
// drawn, once the family is in.

const NO_INERT: ReadonlySet<ElementId> = new Set();

export function useOfferedPreview({
  tabId,
  elements,
  previewKey,
  inertIds = NO_INERT,
  layers,
}: {
  tabId: string;
  elements: Element[];
  // The person's previewed key; null where suggestions are not shown.
  previewKey: string | null;
  inertIds?: ReadonlySet<ElementId>;
  // The tab's layers: a lane plan and Arrange and Reorder leave a note on a locked layer where it is.
  layers?: Layer[];
}): OfferedPreview | null {
  const offered = useMemo(
    () =>
      previewKey
        ? requireKindFamily('event-storming').offeredPreview(elements, previewKey, inertIds, layers)
        : null,
    [elements, previewKey, inertIds, layers],
  );
  useEffect(() => {
    if (!offered) return;
    setOfferedPreview(tabId, offered.elements, elements);
    return clearOfferedPreview;
  }, [tabId, offered, elements]);
  return offered;
}
