import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIST_PLACES_KEPT,
  createPlaceStore,
  placeAt,
  restoreOffset,
  type PlaceBackend,
} from './list-places';

const geometry = { rows: 1000, stride: 50, origin: 200, lanes: 1 };
const ids = Array.from({ length: 1000 }, (_, i) => `doc-${i}`);

describe('placeAt', () => {
  it('anchors on the row at the top of the view and how far into it the view starts', () => {
    expect(placeAt({ viewTop: 30020, geometry, idOf: (i) => ids[i] })).toEqual({
      anchorId: 'doc-596',
      anchorOffset: 20,
      scrollTop: 30020,
    });
  });

  it('keeps only the offset while the view is above the list', () => {
    expect(placeAt({ viewTop: 120, geometry, idOf: (i) => ids[i] })).toEqual({
      anchorId: null,
      anchorOffset: 0,
      scrollTop: 120,
    });
  });

  it('anchors a grid on the first entry of the row', () => {
    expect(
      placeAt({ viewTop: 30020, geometry: { ...geometry, lanes: 4 }, idOf: (i) => `doc-${i}` })
        .anchorId,
    ).toBe('doc-2384');
  });
});

describe('restoreOffset', () => {
  const place = { anchorId: 'doc-596', anchorOffset: 20, scrollTop: 30020 };

  it('puts the anchor row back at the top, at its offset', () => {
    expect(restoreOffset({ place, geometry, indexOf: (id) => ids.indexOf(id) })).toBe(30020);
  });

  it('follows the anchor when rows came or went above it', () => {
    expect(restoreOffset({ place, geometry, indexOf: () => 500 })).toBe(200 + 500 * 50 + 20);
  });

  it('falls back to the scroll offset when the anchor is gone', () => {
    expect(restoreOffset({ place, geometry, indexOf: () => -1 })).toBe(30020);
  });
});

describe('createPlaceStore', () => {
  let saved: Record<string, string>;
  const backend: PlaceBackend = {
    read: () => saved.places ?? null,
    write: (value) => {
      saved.places = value;
    },
  };
  beforeEach(() => {
    saved = {};
  });

  it('keeps a place per list and forgets one on request', () => {
    const store = createPlaceStore(backend);
    store.write('/explorer/folder?id=a', { anchorId: 'x', anchorOffset: 3, scrollTop: 900 });
    expect(createPlaceStore(backend).read('/explorer/folder?id=a')).toEqual({
      anchorId: 'x',
      anchorOffset: 3,
      scrollTop: 900,
    });
    store.forget('/explorer/folder?id=a');
    expect(store.read('/explorer/folder?id=a')).toBeNull();
  });

  it('keeps the most recent lists only', () => {
    const store = createPlaceStore(backend);
    for (let i = 0; i <= LIST_PLACES_KEPT; i += 1)
      store.write(`list-${i}`, { anchorId: null, anchorOffset: 0, scrollTop: i });
    expect(store.read('list-0')).toBeNull();
    expect(store.read(`list-${LIST_PLACES_KEPT}`)?.scrollTop).toBe(LIST_PLACES_KEPT);
  });

  it('reads nothing from a broken or missing backend, and says so', () => {
    saved.places = '{not json';
    expect(createPlaceStore(backend).read('a')).toBeNull();
    const failing: PlaceBackend = {
      read: () => {
        throw new Error('blocked');
      },
      write: () => {
        throw new Error('blocked');
      },
    };
    const store = createPlaceStore(failing);
    expect(() => store.write('a', { anchorId: null, anchorOffset: 0, scrollTop: 1 })).not.toThrow();
    expect(store.read('a')).toEqual({ anchorId: null, anchorOffset: 0, scrollTop: 1 });
  });
});
