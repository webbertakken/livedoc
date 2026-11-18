'use client';

// How many tiles the Toolbar strip shows, from the strip's REAL sizes
// (docs/specs/007-editor/toolbar-layout.md "Twelve tiles is enough"): the chrome around the tiles (the
// pickers, More, dividers, padding: whatever they measure today, in whatever
// category), one tile's pitch, and the room the centred strip may take (the
// room between the top line's side groups, lib/line-centre; on a phone, the window
// less its gutters and the menu card beside the strip). Nothing is assumed about how wide a picker is, so a
// longer category name or a new control keeps fitting.
//
// The rail of tiles animates its width when the category changes, so the
// chrome is the strip's width LESS the rail's current width: both move
// together, and their difference is steady through the animation. Until the
// first measurement the estimated limit (`fallback`) stands in.
//
// The tiles drawn change the chrome too: dropping one brings in More. `refit` measures again, and the host calls it
// in a layout effect whenever what the strip draws changes, so the count settles in that commit. Left to a resize
// report it settled a frame later, and Chrome counts what a resize callback moves as a layout shift.

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { fitStripTiles } from './toolbar-strip-tiles';
import { editorViewportOf } from '@/lib/editor-viewport';
import { measureTopLine, observeTopLine } from '@/lib/top-line-clearance';

const PHONE_GUTTERS_PX = 24;

export function useStripTileLimit(
  cardRef: RefObject<HTMLElement | null>,
  {
    fallback,
    isMobile,
    scale,
    leadingRef,
  }: {
    fallback: number;
    // The card the strip sits beside on a phone (the menu button and mode
    // switch). When it is there, the strip's room runs from its own left edge
    // to the right gutter.
    leadingRef?: RefObject<HTMLElement | null>;
    isMobile: boolean;
    // The UI scale (docs/specs/007-editor/ui-scale.md). Everything here is
    // measured in screen px, so a scaled strip fits itself; the scale is only
    // a dependency, because a zoom change resizes no observed box.
    scale: number;
  },
): { limit: number; refit: () => void } {
  const [measured, setMeasured] = useState<number | null>(null);
  // The measure of the current subscription, for `refit`; nothing until the strip has mounted.
  const measureRef = useRef<() => void>(() => {});
  const refit = useCallback(() => measureRef.current(), []);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rail = card.querySelector<HTMLElement>('[data-strip-rail]');
      // The narrowest item is a bare tile: one a fixed divider follows is wider by the divider.
      const items = rail ? [...rail.querySelectorAll<HTMLElement>('[data-rail-key]')] : [];
      const tile = items[0];
      if (!rail || !tile) return;
      const tileWidth = Math.min(...items.map((el) => el.getBoundingClientRect().width));
      const cardWidth = card.getBoundingClientRect().width;
      // A strip with no layout (hidden in zen or the welcome flow, or not yet
      // painted) measures zero everywhere; that would collapse the count to
      // the minimum, so keep the last good answer instead.
      if (tileWidth <= 0 || cardWidth <= 0) return;
      const gap = parseFloat(getComputedStyle(tile.parentElement!).columnGap) || 0;
      // The rail's share of the card is its width plus its (negative) side
      // margins, which give its pressed rings room inside the clip.
      const railStyle = getComputedStyle(rail);
      const railShare =
        rail.getBoundingClientRect().width +
        (parseFloat(railStyle.marginLeft) || 0) +
        (parseFloat(railStyle.marginRight) || 0);
      const chrome = cardWidth - railShare;
      const pitch = tileWidth + gap;
      // The room is the editor's: the window, or its pane in a side by side split
      // (docs/specs/007-editor/split-view.md), measured from the pane's own left edge.
      const view = editorViewportOf(card);
      const vw = view.width;
      let available = vw - PHONE_GUTTERS_PX;
      if (isMobile) {
        // Beside the menu card: from where the strip starts to the right gutter.
        if (leadingRef?.current)
          available = vw - PHONE_GUTTERS_PX / 2 - (card.getBoundingClientRect().left - view.left);
      } else {
        // Between the top line's side groups, centred or not (lib/line-centre): tiles drop only once the strip no
        // longer fits between them.
        available = measureTopLine(view, cardWidth).room;
      }
      setMeasured(fitStripTiles({ available, chrome, pitch }));
    };
    measureRef.current = measure;
    measure();
    // A pane resizes without the window (the split's divider): refit as it does. The room is between the top line's
    // side groups, which change width on their own (Start Tour offered, the mode switch's name, an account signing
    // in): refit as they do, or the strip kept a count fitted to the old room.
    const unobserve = observeTopLine(measure, [card, editorViewportOf(card).element], {
      sides: !isMobile,
    });
    return () => {
      unobserve();
      measureRef.current = () => {};
    };
  }, [cardRef, leadingRef, isMobile, scale]);

  return { limit: measured ?? fallback, refit };
}
