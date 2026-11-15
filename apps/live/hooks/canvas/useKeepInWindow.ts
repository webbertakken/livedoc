'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useViewportIfAny } from '@/hooks/canvas/useViewportStore';
import { clampToViewport } from '@/lib/clamp-to-viewport';

// Keeps a box drawn on the board at screen size inside the window: what is said under a note (a hotspot's answer,
// a suggested change's caption) is moved back in when its note stands at an edge, and lets go once it fits.
//
// It looks once after every render of whoever draws the box, and whenever the board is panned or zoomed, the
// window or the box changes size: any of them moves the box on the page. The move is written straight onto the
// box, never kept as state, so a look never asks for another. That matters on the board: a box there is measured
// through the board's scale, and two looks at the same box come back a fraction of a pixel apart.

/** A move closer than this to the one the box already has is that move, screen px (safe range: above the
 *  measuring noise, about 0.001, and under what the eye can tell, 1). */
const SAME_PLACE_PX = 0.5;

type Move = { x: number; y: number };
const UNMOVED: Move = { x: 0, y: 0 };

// Looks at the box once and moves it; answers the move it then has, screen px.
function keptInWindow(node: HTMLElement, moved: Move, unit: number): Move {
  const write = (move: Move) => {
    node.style.transform =
      move.x === 0 && move.y === 0 ? '' : `translate(${move.x * unit}px, ${move.y * unit}px)`;
  };
  // The move it has, in this unit, before it is measured with it.
  write(moved);
  const rect = node.getBoundingClientRect();
  // Nothing to measure before it is laid out.
  if (rect.width === 0) return moved;
  const next = clampToViewport(rect, moved);
  if (Math.abs(next.x - moved.x) < SAME_PLACE_PX && Math.abs(next.y - moved.y) < SAME_PLACE_PX) {
    return moved;
  }
  write(next);
  return next;
}

/**
 * @param box  the box to keep inside the window
 * @param unit how many of the box's own px one screen px is: 1 for a box already drawn at screen size, `1 / zoom`
 *             for one drawn in canvas units
 */
export function useKeepInWindow(box: RefObject<HTMLElement | null>, unit = 1): void {
  // How far the box is moved, screen px, and the unit it was last drawn in.
  const moved = useRef<Move>(UNMOVED);
  const drawnIn = useRef(unit);
  // A pan or a zoom moves the box on the page without rendering whoever draws it: follow the view.
  useViewportIfAny();

  useLayoutEffect(() => {
    drawnIn.current = unit;
    const node = box.current;
    if (node) moved.current = keptInWindow(node, moved.current, unit);
  });

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const again = () => {
      moved.current = keptInWindow(node, moved.current, drawnIn.current);
    };
    window.addEventListener('resize', again);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again);
    observer?.observe(node);
    return () => {
      window.removeEventListener('resize', again);
      observer?.disconnect();
    };
  }, [box]);
}
