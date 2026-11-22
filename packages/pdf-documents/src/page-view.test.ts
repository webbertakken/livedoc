import { describe, expect, it } from 'vitest';
import type { PageMatrix } from './engine-contract';
import { PageView } from './page-view';

// An upright US Letter page: y flips about its height.
const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 792];
// The same page turned a quarter clockwise.
const TURNED: PageMatrix = [0, 1, 1, 0, 0, 0];

describe('PageView', () => {
  it('puts the page bottom left at the view bottom left on an upright page', () => {
    expect(PageView.toView(UPRIGHT, { x: 72, y: 700 })).toEqual({ x: 72, y: 92 });
  });

  it('comes back to the same point, on an upright and a turned page', () => {
    for (const matrix of [UPRIGHT, TURNED]) {
      const view = PageView.toView(matrix, { x: 100, y: 250 });
      expect(PageView.toPage(matrix, view)).toEqual({ x: 100, y: 250 });
    }
  });

  it('has no page point for a matrix that cannot be inverted', () => {
    expect(PageView.toPage([0, 0, 0, 0, 0, 0], { x: 1, y: 1 })).toBeNull();
    expect(PageView.toPage([Number.NaN, 0, 0, 1, 0, 0], { x: 1, y: 1 })).toBeNull();
  });

  it('gives a quad its four corners in view space, in order', () => {
    expect(PageView.quadToView(UPRIGHT, [72, 716, 300, 716, 72, 700, 300, 700])).toEqual([
      { x: 72, y: 76 },
      { x: 300, y: 76 },
      { x: 72, y: 92 },
      { x: 300, y: 92 },
    ]);
  });
});
