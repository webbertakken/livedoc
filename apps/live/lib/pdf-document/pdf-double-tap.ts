// A finger's double tap on the pages (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): two taps of
// one finger, each lifted within PDF_DOUBLE_TAP_MS of touching and moved less than PDF_DOUBLE_TAP_PX, the second
// touching within PDF_DOUBLE_TAP_MS of the first lifting and PDF_DOUBLE_TAP_PX of it. A second finger, or a scroll the
// browser takes (a cancel), ends it. Pure: the page feeds it its touch pointers and acts on what it answers.
import { PDF_DOUBLE_TAP_MS, PDF_DOUBLE_TAP_PX } from '@livedoc/pdf-documents';

/** A touch pointer's moment: which finger, where in client pixels, and when in milliseconds. */
export type PdfTouchPoint = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly time: number;
};

export type PdfDoubleTap = {
  /** The fingers down now, as each touched. */
  readonly downs: readonly PdfTouchPoint[];
  /** More than one finger was down since the last time none was: no tap. */
  readonly spoiled: boolean;
  /** The tap before, where it touched and when it lifted, while a second may follow it. */
  readonly last: PdfTouchPoint | null;
};

const apart = (a: PdfTouchPoint, b: PdfTouchPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

export const PdfDoubleTap = {
  initial: (): PdfDoubleTap => ({ downs: [], spoiled: false, last: null }),

  /** A finger touched. */
  down: (state: PdfDoubleTap, point: PdfTouchPoint): PdfDoubleTap => ({
    downs: [...state.downs, point],
    spoiled: state.downs.length > 0,
    last: state.last,
  }),

  /** A finger lifted: the state after, and where the double tap touched when this was its second tap. */
  up: (
    state: PdfDoubleTap,
    point: PdfTouchPoint,
  ): { state: PdfDoubleTap; tapped: PdfTouchPoint | null } => {
    const down = state.downs.find((each) => each.id === point.id);
    const downs = state.downs.filter((each) => each.id !== point.id);
    const tap =
      down &&
      !state.spoiled &&
      point.time - down.time <= PDF_DOUBLE_TAP_MS &&
      apart(down, point) < PDF_DOUBLE_TAP_PX
        ? down
        : null;
    const last = state.last;
    const second =
      tap &&
      last &&
      tap.time - last.time <= PDF_DOUBLE_TAP_MS &&
      apart(last, tap) < PDF_DOUBLE_TAP_PX;
    return {
      state: {
        downs,
        spoiled: downs.length > 0 && state.spoiled,
        last: tap && !second ? { ...tap, time: point.time } : null,
      },
      tapped: second ? tap : null,
    };
  },

  /** A finger the browser took (a scroll): no tap, and none before it to follow. */
  cancel: (state: PdfDoubleTap, id: number): PdfDoubleTap => {
    const downs = state.downs.filter((each) => each.id !== id);
    return { downs, spoiled: downs.length > 0, last: null };
  },
} as const;
