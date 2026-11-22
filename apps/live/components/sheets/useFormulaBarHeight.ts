'use client';

// The formula bar's height (docs/specs/029-sheets/surface.md "Formula bar", D130): up to three lines by its input,
// then scrolling; a drag on its foot, or Up and Down on it, holds a height in lines from one to as many as a third of
// the grid holds, kept for the page (every sheet's bar alike); a double-click gives the height back to the input.
import { useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import { createListeners } from '@/lib/listeners';

/** One line of the bar's input (12 px text, its leading). */
export const FORMULA_BAR_LINE_PX = 18;
/** The lines the bar grows to by its input alone. */
export const FORMULA_BAR_AUTO_LINES_MAX = 3;

let held: number | null = null;
const listeners = createListeners();
const heldNow = () => held;

function hold(lines: number | null) {
  if (lines === held) return;
  held = lines;
  listeners.notify();
}

/** The most lines the bar may hold: a third of the grid's height, at least one. */
export function formulaBarLinesMax(gridHeight: number): number {
  return Math.max(1, Math.floor(gridHeight / 3 / FORMULA_BAR_LINE_PX));
}

/** The lines the bar shows: the height held, within its most, else its input's up to three. */
export function formulaBarLines(input: string, kept: number | null, max: number): number {
  if (kept !== null) return Math.min(kept, max);
  return Math.min(FORMULA_BAR_AUTO_LINES_MAX, input.split('\n').length);
}

export function useFormulaBarHeight(input: string, gridHeight: number) {
  const kept = useSyncExternalStore(listeners.subscribe, heldNow, heldNow);
  const max = formulaBarLinesMax(gridHeight);
  const lines = formulaBarLines(input, kept, max);
  const clamp = (n: number) => Math.min(max, Math.max(1, n));
  return {
    lines,
    max,
    handle: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        const from = e.clientY;
        const start = lines;
        const target = e.currentTarget;
        target.setPointerCapture?.(e.pointerId);
        const move = (m: globalThis.PointerEvent) =>
          hold(clamp(start + Math.round((m.clientY - from) / FORMULA_BAR_LINE_PX)));
        const up = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        e.stopPropagation();
        hold(clamp(lines + (e.key === 'ArrowDown' ? 1 : -1)));
      },
      onDoubleClick: () => hold(null),
    },
  };
}

// For tests: give the height back to the input.
export function resetFormulaBarHeight(): void {
  held = null;
}
