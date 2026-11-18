'use client';

// The insets keeping a maximised or tab-filling Plan element in the content frame the editor's chrome over the canvas
// leaves
// (lib/canvas-layer-insets.ts). Measured on mount, and again (once per frame at most) when the chrome says it changed:
// the canvas or a piece of chrome resizes (ResizeObserver), a piece of chrome moves or shows and hides (its own style
// or class attributes), a chrome transition ends, the window resizes, or chrome comes or goes (the canvas's children
// change: the set is looked up again and re-observed only when it differs). Typing, pressing and dragging on the board
// itself measure nothing.
import { useEffect, useState } from 'react';
import {
  BOTTOM_LINE_SELECTOR,
  PANEL_SELECTOR,
  TOP_LINE_SELECTOR,
  measureCanvasChrome,
  sameInsets,
  type LayerInsets,
} from '@/lib/canvas-layer-insets';

const NO_INSETS: LayerInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// The top line's groups, the strip (its card changes height on a phone's wrap), the panels, and the bottom line with
// its groups, however wrapped (a group growing or the line wrapping moves the frame's foot).
const OBSERVED = `${TOP_LINE_SELECTOR}, ${PANEL_SELECTOR}, [data-toolbar-palette], [data-toolbar-palette] > *, ${BOTTOM_LINE_SELECTOR}, ${BOTTOM_LINE_SELECTOR} > *, ${BOTTOM_LINE_SELECTOR} [data-region]`;

// A child-list change that adds or removes a piece of chrome (or something holding one).
export function touchesChrome(
  record: Pick<MutationRecord, 'addedNodes' | 'removedNodes'>,
): boolean {
  const hit = (n: Node) =>
    n instanceof Element && (n.matches(OBSERVED) || n.querySelector(OBSERVED) !== null);
  return [...record.addedNodes].some(hit) || [...record.removedNodes].some(hit);
}

// The element's insets: the content frame the chrome leaves.
export function useCanvasLayerInsets(canvas: HTMLElement | null): LayerInsets {
  const [insets, setInsets] = useState<LayerInsets>(NO_INSETS);
  useEffect(() => {
    if (!canvas || canvas === document.body) return;
    let frame = 0;
    let rescan = true;
    let chrome: HTMLElement[] = [];
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    const moved =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => schedule());
    const tree =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            // Only a piece of chrome coming or going matters; the canvas's own churn (cards, drags) is skipped
            // without measuring anything.
            if (!records.some(touchesChrome)) return;
            rescan = true;
            schedule();
          });
    tree?.observe(canvas, { childList: true, subtree: true });
    const measure = () => {
      frame = 0;
      if (rescan) {
        rescan = false;
        const found = [...document.querySelectorAll<HTMLElement>(OBSERVED)];
        const same = found.length === chrome.length && found.every((el, i) => el === chrome[i]);
        if (!same) {
          chrome = found;
          ro?.disconnect();
          moved?.disconnect();
          ro?.observe(canvas);
          for (const el of chrome) {
            ro?.observe(el);
            moved?.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
          }
        }
      }
      const next = measureCanvasChrome(canvas);
      setInsets((prev) => (sameInsets(prev, next) ? prev : next));
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    // A chrome transition (a panel collapsing) ends where it ends: measure then. Not the board's own transitions.
    const onTransitionEnd = (e: TransitionEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest(OBSERVED)) schedule();
    };
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('transitionend', onTransitionEnd, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      moved?.disconnect();
      tree?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('transitionend', onTransitionEnd, true);
    };
  }, [canvas]);
  return insets;
}
