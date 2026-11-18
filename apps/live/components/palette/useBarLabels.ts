'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { editorViewportOf } from '@/lib/editor-viewport';
import { measureTopLine, observeTopLine } from '@/lib/top-line-clearance';

// Whether the category bar names its categories (docs/specs/007-editor/toolbar-layout.md "The category bar"), from
// the strip's REAL sizes, as useStripTileLimit fits tiles: the strip may take the room between the top line's side
// groups (lib/line-centre). The strip is drawn
// named first and its width kept; while that width fits, the names show, and once it does not, glyphs alone do,
// until the window grows back past the width it needs. Measured before paint, so no frame shows the overflow.

export function useBarLabels(
  cardRef: RefObject<HTMLElement | null>,
  {
    enabled,
    categoriesKey,
    scale,
  }: {
    // Off on a phone, and where the strip is not a category bar.
    enabled: boolean;
    // The bar's category names: a change (another mode) measures the named width afresh.
    categoriesKey: string;
    scale: number;
  },
): boolean {
  const [labels, setLabels] = useState(true);
  // The strip's width with names, in screen px, for the categories it was measured with.
  const named = useRef<{ key: string; width: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!enabled || !card || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = card.getBoundingClientRect().width;
      if (width <= 0) return;
      if (labels) named.current = { key: categoriesKey, width };
      // Another set of categories: show the names once to measure them.
      if (named.current?.key !== categoriesKey) {
        named.current = null;
        if (!labels) setLabels(true);
        return;
      }
      const view = editorViewportOf(card);
      // Between the top line's side groups, centred or not (lib/line-centre).
      const fits = measureTopLine(view, named.current.width).fits;
      if (fits !== labels) setLabels(fits);
    };
    measure();
    return observeTopLine(measure, [card]);
  }, [cardRef, enabled, categoriesKey, labels, scale]);

  return enabled && labels;
}
