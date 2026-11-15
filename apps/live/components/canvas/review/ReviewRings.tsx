'use client';

import { useLayoutEffect, useMemo } from 'react';
import { isBoxed, type Element } from '@livedoc/document';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { applyOverlay, useDragPreview } from '@/lib/drag-preview';
import { useReviewView } from '@/lib/review-view';

// What the Review panel points out on the board (docs/specs/021-event-storming/board-review.md "Check", "Story",
// board-language.md "The Language tab"): a ring round each note a row, a term or the story's step names, at screen
// size whatever the zoom. A chosen term also dims the rest of the board: the document wears `data-review-dim` and
// the ringed notes' own nodes `data-review-lit` (app/canvas-motion.css), so no element renders for it. Decoration:
// the panel says in words what the rings show.

/** How far a ring stands off its note, and how thick it is, screen px. */
const RING_OFFSET_PX = 6;
const RING_WIDTH_PX = 2;

const DIM = 'data-review-dim';
const LIT = 'data-review-lit';

export function ReviewRings({ tabId, elements }: { tabId: string; elements: Element[] }) {
  const zoom = useCanvasZoom();
  const { ringed, dim } = useReviewView(tabId);
  const overlay = useDragPreview(tabId, elements);
  const boxes = useMemo(() => {
    if (ringed.length === 0) return [];
    const wanted = new Set(ringed);
    const drawn = overlay ? applyOverlay(elements, overlay) : elements;
    return drawn.filter(isBoxed).filter((el) => wanted.has(el.id));
  }, [ringed, elements, overlay]);
  useLayoutEffect(() => {
    if (!dim || boxes.length === 0) return;
    const root = document.documentElement;
    const lit = boxes.flatMap((box) => [
      ...document.querySelectorAll(`[data-element-id="${CSS.escape(box.id)}"]`),
    ]);
    root.setAttribute(DIM, '');
    for (const node of lit) node.setAttribute(LIT, '');
    return () => {
      root.removeAttribute(DIM);
      for (const node of lit) node.removeAttribute(LIT);
    };
  }, [dim, boxes]);
  const px = 1 / zoom;
  return boxes.map((box) => (
    <div
      key={box.id}
      aria-hidden
      data-review-ring={box.id}
      className="pointer-events-none absolute border-brand-600 shadow-brand-500/20 in-[[data-dark-canvas]]:border-brand-300 in-[[data-dark-canvas]]:shadow-brand-300/20"
      style={{
        left: box.x - RING_OFFSET_PX * px,
        top: box.y - RING_OFFSET_PX * px,
        width: box.width + 2 * RING_OFFSET_PX * px,
        height: box.height + 2 * RING_OFFSET_PX * px,
        borderStyle: 'solid',
        borderWidth: RING_WIDTH_PX * px,
        borderRadius: 9 * px,
        boxShadow: `0 0 0 ${4 * px}px var(--tw-shadow-color)`,
      }}
    />
  ));
}
