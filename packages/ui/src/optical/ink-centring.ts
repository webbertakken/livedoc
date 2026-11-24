'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

// Ink centring (docs/specs/004-interface-design/optical-alignment.md "The rules"): initials and symbols in a shape
// are centred by their ink, not their advance. A face's side bearings differ from letter to letter ("L" leaves room
// on its right, "W" almost none), so a pair centred by advance sits off by half their difference. The bearings are
// read from the face the browser draws, through a canvas text measure, so the shift holds whichever face the
// system stack lands on.

export type InkMetrics = {
  /** The text's advance width, px. */
  readonly advance: number;
  /** Where its ink starts and ends, px from the start of the advance. */
  readonly inkLeft: number;
  readonly inkRight: number;
};

/** How far to move the text, in px (positive to the right), so its ink centre meets its advance centre. */
export function inkCentreShift({ advance, inkLeft, inkRight }: InkMetrics): number {
  return advance / 2 - (inkLeft + inkRight) / 2;
}

/** Initials and symbols are centred by ink; numerals by their advance, as the typeface draws them. */
export function isInkCentred(text: string): boolean {
  return text.trim() !== '' && !/\d/.test(text);
}

let measuring: CanvasRenderingContext2D | null | undefined;

// One canvas for every disc; null where the browser has none to measure with.
function measureContext(): CanvasRenderingContext2D | null {
  if (measuring === undefined) measuring = document.createElement('canvas').getContext('2d');
  return measuring;
}

/** The ink metrics of `text` in the font `el` is drawn in, or null where they cannot be read. */
function measureInk(el: HTMLElement, text: string): InkMetrics | null {
  const ctx = measureContext();
  if (!ctx) return null;
  const style = getComputedStyle(el);
  ctx.font =
    style.font ||
    `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`.trim();
  const m = ctx.measureText(text);
  // With the text drawn from its start, actualBoundingBoxLeft is how far the ink reaches left of it.
  return {
    advance: m.width,
    inkLeft: -m.actualBoundingBoxLeft,
    inkRight: m.actualBoundingBoxRight,
  };
}

/**
 * The CSS `translate` that centres `text`, drawn in `ref`, by its ink: measured once laid out and again whenever a
 * web font finishes loading, since a swapped face has its own bearings. Empty for numerals and before measuring.
 */
export function useInkCentring(ref: RefObject<HTMLElement | null>, text: string): string {
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !isInkCentred(text)) {
      setShift(0);
      return;
    }
    const measure = () => {
      const ink = measureInk(el, text);
      // Whole hundredths of a px: steady across re-measures, and finer than any screen draws.
      setShift(ink ? Math.round(inkCentreShift(ink) * 100) / 100 : 0);
    };
    measure();
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', measure);
    return () => fonts?.removeEventListener?.('loadingdone', measure);
  }, [ref, text]);
  return shift === 0 ? '' : `${shift}px`;
}

/** Forgets the shared canvas, for a test that swaps what the browser can measure with. */
export function resetInkCentringForTests(): void {
  measuring = undefined;
}
