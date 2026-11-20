// @vitest-environment jsdom
// docs/specs/006-document/kinds-outside-the-canvas.md "Switching tabs": a surface's view is remembered per document and
// tab in this browser, the most recent SURFACE_VIEW_MAX_ENTRIES kept, a view that no longer parses forgotten.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SURFACE_VIEW_MAX_ENTRIES,
  SURFACE_VIEWS_KEY,
  readSurfaceView,
  writeSurfaceView,
  type SurfaceView,
} from './surface-view';

const view = (scrollTop: number, selection: SurfaceView['selection'] = null): SurfaceView => ({
  scrollTop,
  scrollLeft: 0,
  selection,
});

beforeEach(() => localStorage.clear());

describe('the surface view memory', () => {
  it('gives back the view written for a document’s tab, and none for another', () => {
    writeSurfaceView('d1', 't1', view(420, { anchor: 3, head: 9 }));
    expect(readSurfaceView('d1', 't1')).toEqual(view(420, { anchor: 3, head: 9 }));
    expect(readSurfaceView('d1', 't2')).toBeNull();
    expect(readSurfaceView('d2', 't1')).toBeNull();
  });

  it('keeps the latest view of a tab', () => {
    writeSurfaceView('d1', 't1', view(10));
    writeSurfaceView('d1', 't1', view(20));
    expect(readSurfaceView('d1', 't1')).toEqual(view(20));
  });

  it('forgets the oldest past its cap, never one written again since', () => {
    writeSurfaceView('d', 'first', view(1));
    for (let i = 0; i < SURFACE_VIEW_MAX_ENTRIES - 1; i++) writeSurfaceView('d', `t${i}`, view(i));
    writeSurfaceView('d', 'first', view(2));
    writeSurfaceView('d', 'one more', view(3));
    expect(readSurfaceView('d', 'first')).toEqual(view(2));
    expect(readSurfaceView('d', 't0')).toBeNull();
    expect(readSurfaceView('d', 'one more')).toEqual(view(3));
  });

  it('forgets a view that no longer parses, never applying it', () => {
    localStorage.setItem(
      SURFACE_VIEWS_KEY,
      JSON.stringify([
        ['d1\u0000t1', { scrollTop: 'far', scrollLeft: 0, selection: null }],
        ['d1\u0000t2', { scrollTop: 5, scrollLeft: 0, selection: { anchor: -1, head: 2 } }],
        ['d1\u0000t3', view(7)],
      ]),
    );
    expect(readSurfaceView('d1', 't1')).toBeNull();
    expect(readSurfaceView('d1', 't2')).toBeNull();
    expect(readSurfaceView('d1', 't3')).toEqual(view(7));
    expect(JSON.parse(localStorage.getItem(SURFACE_VIEWS_KEY)!)).toHaveLength(1);
  });

  it('starts again from a store that is not a list', () => {
    localStorage.setItem(SURFACE_VIEWS_KEY, '{"oops":true}');
    expect(readSurfaceView('d1', 't1')).toBeNull();
    writeSurfaceView('d1', 't1', view(1));
    expect(readSurfaceView('d1', 't1')).toEqual(view(1));
  });
});
