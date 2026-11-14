import { describe, expect, it } from 'vitest';
import { arrowMaskRegion, pathDBounds } from './path-bounds';

// docs/specs/008-canvas/canvas-performance.md "A break stays local".

describe('pathDBounds', () => {
  it('bounds a path of absolute coordinate pairs, its control points included', () => {
    expect(pathDBounds('M 10 20 L 110 -5')).toEqual({ x: 10, y: -5, width: 100, height: 25 });
    expect(pathDBounds('M0 0 Q 50 -80 100 0')).toEqual({ x: 0, y: -80, width: 100, height: 80 });
    expect(pathDBounds('M 0 0 C 1e1 2.5 -3 4 5 6 Z')).toEqual({
      x: -3,
      y: 0,
      width: 13,
      height: 6,
    });
  });

  it('answers null for what it cannot bound safely', () => {
    expect(pathDBounds('')).toBeNull();
    expect(pathDBounds('M 0 0 A 5 5 0 0 1 10 10')).toBeNull();
    expect(pathDBounds('M 0 0 h 10')).toBeNull();
    expect(pathDBounds('M 0 0 L 5')).toBeNull();
  });
});

describe('arrowMaskRegion', () => {
  it('reaches the margin past every path it masks', () => {
    expect(arrowMaskRegion(['M 0 0 L 100 0', 'M 0 10 L 50 20'], 30)).toEqual({
      x: -30,
      y: -30,
      width: 160,
      height: 80,
    });
  });

  it('answers null when any path cannot be bounded, or there is none', () => {
    expect(arrowMaskRegion(['M 0 0 L 1 1', 'M 0 0 A 1 1 0 0 1 2 2'], 10)).toBeNull();
    expect(arrowMaskRegion([], 10)).toBeNull();
  });
});
