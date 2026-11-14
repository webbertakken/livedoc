'use client';

import { useMemo, useSyncExternalStore } from 'react';

// Reactive CSS media query. Re-renders the caller whenever the query starts or
// stops matching, so a surface can mount/unmount on resize or follow an OS
// setting the user changes mid-session.
//
// useSyncExternalStore rather than useState + useEffect on purpose: the match
// is external state React doesn't own, and reading it in an effect means the
// first paint renders the wrong branch and then immediately corrects itself.
// It also keeps us clear of react-hooks/set-state-in-effect.
//
// The server snapshot is always false, so SSR and the first client render agree
// and the markup hydrates without a mismatch. Callers should therefore phrase
// the query so that `false` is the safe default for static HTML.

// matchMedia is optional-chained throughout: jsdom and very old browsers can
// leave it undefined, and a missing matchMedia should read as "no match"
// rather than throw during render.
//
// One watched query per string, shared by every caller: reading a match asks the browser to bring style
// and layout up to date, and a canvas whose every element read one forced a layout of the whole board in
// the middle of a press. The match is read once and kept; the browser's change event updates it, then
// tells the callers.
type WatchedQuery = {
  // The matchMedia it was read through: one replaced (a test's stub) is read again.
  source: unknown;
  matches: boolean;
  listeners: Set<() => void>;
};

const watched = new Map<string, WatchedQuery>();

function watch(query: string): WatchedQuery {
  const source = typeof window === 'undefined' ? undefined : window.matchMedia;
  const known = watched.get(query);
  if (known && known.source === source) return known;
  const mql = source ? (window.matchMedia(query) ?? null) : null;
  // Callers already listening move over to the new source.
  const entry: WatchedQuery = {
    source,
    matches: mql?.matches ?? false,
    listeners: known?.listeners ?? new Set(),
  };
  mql?.addEventListener('change', () => {
    entry.matches = mql.matches;
    for (const cb of entry.listeners) cb();
  });
  watched.set(query, entry);
  return entry;
}

export function useMediaQuery(query: string): boolean {
  // Memoised on `query` so the subscription survives re-renders. Fresh function
  // identities here would make useSyncExternalStore tear down and re-add the
  // listener on every single render.
  const [subscribe, getSnapshot] = useMemo(
    () =>
      [
        (cb: () => void) => {
          const { listeners } = watch(query);
          listeners.add(cb);
          return () => {
            listeners.delete(cb);
          };
        },
        () => watch(query).matches,
      ] as const,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// Shared query strings, so callers don't retype (and mistype) them.
export const PREFERS_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
