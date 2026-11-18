'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { editorViewportOf } from '@/lib/editor-viewport';
import { measureTopLine, observeTopLine } from '@/lib/top-line-clearance';

// Where the Palette strip sits on the top line (docs/specs/007-editor/toolbar-layout.md "When a line runs out of
// room", lib/line-centre): centred while it fits centred, else off centre between the brand and actions groups
// (`shift`: how far its centre moves from the editor's centre, screen px), and crowded (a row of its own under the
// line) only once even its fewest tiles do not fit between them. Tiles drop first (useStripTileLimit), so the width
// measured here is the strip as drawn. Measured from the real sizes, as useBarLabels and useStripTileLimit are.
//
// `drawn` names what the strip draws (its tiles, More, the bar's names): a change is measured in the same commit, so
// the placement follows tiles dropping at once rather than a frame later, when a resize would report it.

export type StripPlacement = { crowded: boolean; shift: number };
const CENTRED: StripPlacement = { crowded: false, shift: 0 };

export function useStripPlacement(
  cardRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  drawn: string,
): StripPlacement {
  const [placement, setPlacement] = useState<StripPlacement>(CENTRED);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!enabled || !card || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = card.getBoundingClientRect().width;
      if (width <= 0) return;
      const view = editorViewportOf(card);
      const at = measureTopLine(view, width);
      // Off centre, the strip's left edge lands on a whole pixel, so its glyphs stay crisp and optically centred
      // whatever its (fractional) width. Centred it takes no shift.
      const shift = at.fits && !at.centred ? Math.round(at.left) + width / 2 - view.width / 2 : 0;
      const crowded = !at.fits;
      setPlacement((prev) =>
        prev.crowded === crowded && prev.shift === shift ? prev : { crowded, shift },
      );
    };
    measure();
    return observeTopLine(measure, [card]);
  }, [cardRef, enabled, drawn]);
  return enabled ? placement : CENTRED;
}
