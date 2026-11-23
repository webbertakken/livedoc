// Where a drag on the cells lands (sheet.md "Fill"; grid-and-editing.md "Fill and move", D145).
import { describe, expect, it } from 'vitest';
import type { GridRange, Selection } from '@livedoc/sheets';
import { geometryOf } from './sheet-geometry';
import { BORDER_GRAB_PX, borderGrabAt, fillTargetFor } from './sheet-drag-targets';

const box = (r1: number, c1: number, r2 = r1, c2 = c1): GridRange => ({ r1, c1, r2, c2 });
const sel = (...ranges: GridRange[]): Selection => ({
  ranges,
  active: { r: ranges[0]!.r1, c: ranges[0]!.c1 },
  anchor: { r: ranges[0]!.r1, c: ranges[0]!.c1 },
});

describe('fillTargetFor', () => {
  const s = box(2, 2, 3, 3);
  it('grows the source the way the pointer went furthest', () => {
    expect(fillTargetFor(s, { r: 6, c: 4 })).toEqual(box(2, 2, 6, 3));
    expect(fillTargetFor(s, { r: 0, c: 2 })).toEqual(box(0, 2, 3, 3));
    expect(fillTargetFor(s, { r: 3, c: 7 })).toEqual(box(2, 2, 3, 7));
    expect(fillTargetFor(s, { r: 2, c: 0 })).toEqual(box(2, 0, 3, 3));
  });
  it('cuts back inside the source, and stays put on its far corner', () => {
    expect(fillTargetFor(s, { r: 2, c: 3 })).toEqual(box(2, 2, 2, 3));
    expect(fillTargetFor(box(2, 2, 2, 3), { r: 2, c: 2 })).toEqual(box(2, 2, 2, 2));
    expect(fillTargetFor(s, { r: 3, c: 3 })).toEqual(s);
  });
});

describe('borderGrabAt', () => {
  const layout = {
    rows: Array.from({ length: 10 }, (_, i) => `r${i}`),
    cols: Array.from({ length: 5 }, (_, i) => `c${i}`),
    colWidth: 100,
    rowHeight: 24,
  };
  const g = geometryOf(layout);
  const grid = { rows: 10, cols: 5 };
  const scroll = { top: 0, left: 0 };
  const one = sel(box(1, 1, 2, 2));
  // B2:C3 spans x 100..300, y 24..72.
  it('grabs within reach of any edge of the one range', () => {
    expect(borderGrabAt(g, one, grid, scroll, 100, 50)).toEqual(box(1, 1, 2, 2));
    expect(borderGrabAt(g, one, grid, scroll, 300 + BORDER_GRAB_PX, 50)).toEqual(box(1, 1, 2, 2));
    expect(borderGrabAt(g, one, grid, scroll, 200, 24 - BORDER_GRAB_PX)).toEqual(box(1, 1, 2, 2));
    expect(borderGrabAt(g, one, grid, scroll, 200, 72)).toEqual(box(1, 1, 2, 2));
  });
  it('misses the middle, beyond reach, the headers, and several or whole-line ranges', () => {
    expect(borderGrabAt(g, one, grid, scroll, 200, 50)).toBeNull();
    expect(borderGrabAt(g, one, grid, scroll, 100 - BORDER_GRAB_PX - 1, 50)).toBeNull();
    expect(borderGrabAt(g, one, grid, scroll, 200, 72 + BORDER_GRAB_PX + 1)).toBeNull();
    expect(borderGrabAt(g, sel(box(0, 0)), grid, scroll, -1, 10)).toBeNull();
    expect(borderGrabAt(g, sel(box(0, 0)), grid, scroll, 10, -1)).toBeNull();
    expect(borderGrabAt(g, sel(box(0, 0), box(4, 4)), grid, scroll, 0, 10)).toBeNull();
    expect(borderGrabAt(g, sel(box(0, 1, 9, 1)), grid, scroll, 100, 50)).toBeNull();
    expect(borderGrabAt(g, sel(box(1, 0, 1, 4)), grid, scroll, 200, 24)).toBeNull();
  });
});
