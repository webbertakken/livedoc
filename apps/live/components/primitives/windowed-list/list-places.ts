// Where a long list was left, so Back lands there again (docs/specs/013-workspace/explorer-structure.md "Back"). A
// place is anchored on the row at the top of the view (D224), so rows added or removed above it in the meantime do not
// move what the reader sees; when that row is gone, the scroll offset stands in.
import { rowAtOffset, type RowGeometry } from './window-range';

/** How many lists' places are kept for the tab's session (D225). */
export const LIST_PLACES_KEPT = 50;

export type ListPlace = { anchorId: string | null; anchorOffset: number; scrollTop: number };
export type PlaceGeometry = RowGeometry & { lanes: number };

/** The place of a view whose top is at `viewTop` in the scroller's content. */
export function placeAt({
  viewTop,
  geometry,
  idOf,
}: {
  viewTop: number;
  geometry: PlaceGeometry;
  idOf: (index: number) => string | undefined;
}): ListPlace {
  if (geometry.rows <= 0 || viewTop < geometry.origin)
    return { anchorId: null, anchorOffset: 0, scrollTop: viewTop };
  const row = rowAtOffset(geometry, viewTop);
  return {
    anchorId: idOf(row * geometry.lanes) ?? null,
    anchorOffset: viewTop - (geometry.origin + row * geometry.stride),
    scrollTop: viewTop,
  };
}

/** The scroll offset that shows a kept place again. */
export function restoreOffset({
  place,
  geometry,
  indexOf,
}: {
  place: ListPlace;
  geometry: PlaceGeometry;
  indexOf: (id: string) => number;
}): number {
  const index = place.anchorId === null ? -1 : indexOf(place.anchorId);
  if (index < 0) return place.scrollTop;
  return (
    geometry.origin + Math.floor(index / geometry.lanes) * geometry.stride + place.anchorOffset
  );
}

/** Where places are kept: `sessionStorage` for the Explorer page, memory for the panel. */
export type PlaceBackend = { read: () => string | null; write: (value: string) => void };

type Saved = { order: string[]; places: Record<string, ListPlace> };

/** Places by list key, the most recent `LIST_PLACES_KEPT`. A backend that fails is logged and memory carries on. */
export function createPlaceStore(backend: PlaceBackend) {
  let saved: Saved | null = null;
  const load = (): Saved => {
    if (saved) return saved;
    saved = { order: [], places: {} };
    try {
      const raw = backend.read();
      if (raw) {
        const parsed = JSON.parse(raw) as Saved;
        if (Array.isArray(parsed.order) && parsed.places && typeof parsed.places === 'object')
          saved = parsed;
      }
    } catch (err) {
      console.warn('[list-place] read-failed', err);
    }
    return saved;
  };
  const persist = (s: Saved) => {
    try {
      backend.write(JSON.stringify(s));
    } catch (err) {
      console.warn('[list-place] write-failed', err);
    }
  };
  return {
    read(key: string): ListPlace | null {
      return load().places[key] ?? null;
    },
    write(key: string, place: ListPlace): void {
      const s = load();
      s.order = [...s.order.filter((k) => k !== key), key];
      s.places[key] = place;
      while (s.order.length > LIST_PLACES_KEPT) delete s.places[s.order.shift()!];
      persist(s);
    },
    forget(key: string): void {
      const s = load();
      if (!(key in s.places)) return;
      s.order = s.order.filter((k) => k !== key);
      delete s.places[key];
      persist(s);
    },
  };
}

export type PlaceStore = ReturnType<typeof createPlaceStore>;

const SESSION_KEY = 'livedoc:list-places';

/** The Explorer page's places: the tab's session, so a reload's Back still lands where it was. */
export const sessionPlaces: PlaceStore = createPlaceStore({
  read: () => (typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SESSION_KEY)),
  write: (value) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_KEY, value);
  },
});

let memory: string | null = null;
/** The panel's places: memory, for as long as the page lives. */
export const memoryPlaces: PlaceStore = createPlaceStore({
  read: () => memory,
  write: (value) => {
    memory = value;
  },
});
