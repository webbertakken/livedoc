// Previous view and Next view (docs/specs/035-pdf-documents/reading-surface.md "The pages"): the places a person
// jumped from and to, as a browser's history. Pure: places in, places out; the view goes to them.
import { PDF_VIEW_HISTORY_MAX } from '@livedoc/pdf-documents';
import type { PdfPlace } from './pdf-page-layout';

export type PdfViewHistory = {
  /** The places before the one in view, the latest last. */
  readonly back: readonly PdfPlace[];
  /** The places after it, the nearest last. */
  readonly forward: readonly PdfPlace[];
};

const same = (a: PdfPlace | undefined, b: PdfPlace): boolean =>
  a !== undefined && a.index === b.index && a.across === b.across && a.down === b.down;

const kept = (places: readonly PdfPlace[], place: PdfPlace, most: number): PdfPlace[] =>
  (same(places.at(-1), place) ? [...places] : [...places, place]).slice(-most);

export const PdfViewHistory = {
  empty: { back: [], forward: [] } as PdfViewHistory,
  /** A jump from `from`, the place in view before it: kept to go back to, and what was ahead dropped. */
  jumped: (
    history: PdfViewHistory,
    from: PdfPlace | null,
    most = PDF_VIEW_HISTORY_MAX,
  ): PdfViewHistory => (from ? { back: kept(history.back, from, most), forward: [] } : history),
  canBack: (history: PdfViewHistory): boolean => history.back.length > 0,
  canForward: (history: PdfViewHistory): boolean => history.forward.length > 0,
  /** The place to go back to from `now`, and the history after; null with nowhere to go. */
  back: (
    history: PdfViewHistory,
    now: PdfPlace,
  ): { to: PdfPlace; history: PdfViewHistory } | null => {
    const to = history.back.at(-1);
    if (!to) return null;
    return { to, history: { back: history.back.slice(0, -1), forward: [...history.forward, now] } };
  },
  /** The place to go forward to from `now`, and the history after; null with nowhere to go. */
  forward: (
    history: PdfViewHistory,
    now: PdfPlace,
  ): { to: PdfPlace; history: PdfViewHistory } | null => {
    const to = history.forward.at(-1);
    if (!to) return null;
    return { to, history: { back: [...history.back, now], forward: history.forward.slice(0, -1) } };
  },
} as const;
