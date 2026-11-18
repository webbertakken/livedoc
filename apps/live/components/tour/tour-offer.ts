'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createListeners } from '@/lib/listeners';

// The tours on offer on this page (docs/specs/007-editor/editor-tour.md "Where it appears"): each tour host publishes
// its tour here while the person could take it (in its mode, its kind selected, its tool in hand), and the bottom bar's
// Start Tour button (TourOfferButton) offers the most relevant one. Nothing here starts a tour: only the button does.
// A module store, like the modal guard: one editor per page.

/** How specific a tour's moment is: the most specific on offer wins the button. */
export const TOUR_OFFER_RANK = {
  // A mode's or a tab's own tour (Structured, Sketch, Plan, Forms, Pages, ...).
  mode: 1,
  // The Workshop control's tour, ahead of the mode's while the control is on: the kit is what was just brought in.
  session: 2,
  // A tool in hand (Avatar mode), or a surface on the tab (a dashboard).
  tool: 3,
  // The selected element's own tour (an element tour).
  element: 4,
} as const;

// Words the button keeps small in a tour's name.
const SMALL_WORDS = new Set(['and', 'or', 'of', 'in', 'a', 'an', 'the']);

/** A tour's name from its card's eyebrow, in title case: "Hub and spoke tour" → "Hub and Spoke". */
export function tourNameOf(eyebrow: string): string {
  return eyebrow
    .replace(/\s+tour$/i, '')
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export type TourOffer = {
  /** The host's own key: one offer per host. */
  id: string;
  /** The tour's name as the button says it: "Sketch" reads "Start Sketch Tour". */
  name: string;
  rank: number;
  /** Starts the tour (a press on the button). */
  start: () => void;
  /** The first time this offer is on the button in a page load: the host's own literal telemetry. */
  onShown?: () => void;
};

const offers = new Map<string, TourOffer & { order: number }>();
let order = 0;
let top: TourOffer | null = null;
const listeners = createListeners();

// The most specific offer; between equals, the latest published.
function pick(): TourOffer | null {
  let best: (TourOffer & { order: number }) | null = null;
  for (const offer of offers.values()) {
    if (!best || offer.rank > best.rank || (offer.rank === best.rank && offer.order > best.order))
      best = offer;
  }
  return best;
}

/** Publishes `id`'s offer, or takes it back (null). */
export function publishTourOffer(id: string, offer: TourOffer | null): void {
  if (offer) offers.set(id, { ...offer, order: ++order });
  else if (!offers.delete(id)) return;
  const next = pick();
  if (next === top) return;
  top = next;
  listeners.notify();
}

/** The offer on the button now, or null for none. */
export function tourOffer(): TourOffer | null {
  return top;
}

export function useTourOffer(): TourOffer | null {
  return useSyncExternalStore(listeners.subscribe, tourOffer, () => null);
}

/**
 * Offers a host's tour on the bottom bar's button while `offer` is non-null, and takes it back when null or on unmount.
 * Republished only when its name or rank changes; `start` and `onShown` are read when called, so a host may pass fresh
 * closures every render. Published in a layout effect, before the frame is drawn: an offer that is on as the editor
 * opens is on the button in the first frame, so the actions group, and the palette strip measured against it
 * (docs/specs/007-editor/toolbar-layout.md "Motion"), never change a frame later.
 */
export function useOfferTour(
  id: string,
  offer: { name: string; rank: number; start: () => void; onShown?: () => void } | null,
): void {
  const latest = useRef(offer);
  useLayoutEffect(() => {
    latest.current = offer;
  });
  const name = offer?.name ?? null;
  const rank = offer?.rank ?? 0;
  useLayoutEffect(() => {
    if (name === null) {
      publishTourOffer(id, null);
      return;
    }
    publishTourOffer(id, {
      id,
      name,
      rank,
      start: () => latest.current?.start(),
      onShown: () => latest.current?.onShown?.(),
    });
  }, [id, name, rank]);
  useLayoutEffect(() => () => publishTourOffer(id, null), [id]);
}

/** Every offer withdrawn, for tests. */
export function resetTourOffersForTests(): void {
  offers.clear();
  top = null;
  order = 0;
  listeners.notify();
}
