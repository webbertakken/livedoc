import { describe, expect, it } from 'vitest';
import { axisOffsets } from '@livedoc/sheets';
import { FREEZE_SHARE, freezeLimit, nearestBoundary } from './sheet-freeze';
import type { Geometry } from './sheet-geometry';

// Prefix sums of `n` lines of `size` px.
const offsets = (n: number, size: number) =>
  axisOffsets(
    Array.from({ length: n }, (_, i) => `l${i}`),
    () => size,
    new Set(),
  );
const geometry = (rows: number, cols: number): Geometry =>
  ({
    rows: offsets(rows, 21),
    cols: offsets(cols, 100),
    headW: 46,
    headH: 24,
  }) as Geometry;

// docs/specs/029-sheets/grid-and-editing.md "The grid"; sheet.md "Freeze", D16.
describe('freezeLimit', () => {
  it('leaves a third of the grid to scroll', () => {
    const g = geometry(1_000, 26);
    const view = { width: 1_246, height: 654 };
    // (654 - 24) × ⅔ = 420 px: 20 rows of 21; (1,246 - 46) × ⅔ = 800 px: 8 columns of 100.
    expect(FREEZE_SHARE).toBeCloseTo(2 / 3);
    expect(freezeLimit(g, view, 'r')).toBe(20);
    expect(freezeLimit(g, view, 'c')).toBe(8);
  });

  it('keeps the fixed limits and a line to scroll on a tall grid or a small sheet', () => {
    const tall = { width: 40_000, height: 40_000 };
    expect(freezeLimit(geometry(1_000, 100), tall, 'r')).toBe(100);
    expect(freezeLimit(geometry(1_000, 100), tall, 'c')).toBe(26);
    expect(freezeLimit(geometry(3, 2), tall, 'r')).toBe(2);
    expect(freezeLimit(geometry(1, 1), tall, 'c')).toBe(0);
  });

  it('holds only the fixed limits before the grid has a size, and none past a grid all header', () => {
    expect(freezeLimit(geometry(1_000, 26), { width: 0, height: 0 }, 'r')).toBe(100);
    expect(freezeLimit(geometry(1_000, 26), { width: 30, height: 20 }, 'c')).toBe(0);
  });
});

describe('nearestBoundary', () => {
  const offs = Float64Array.from([0, 10, 10, 20, 30]);

  it('finds the boundary nearest a point, the earlier on a tie', () => {
    expect(nearestBoundary(offs, -5)).toBe(0);
    expect(nearestBoundary(offs, 4)).toBe(0);
    expect(nearestBoundary(offs, 5)).toBe(0);
    expect(nearestBoundary(offs, 26)).toBe(4);
    expect(nearestBoundary(offs, 99)).toBe(4);
  });

  it('takes the first of a hidden line’s equal boundaries', () => {
    expect(nearestBoundary(offs, 9)).toBe(1);
    expect(nearestBoundary(offs, 12)).toBe(1);
    expect(nearestBoundary(offs, 16)).toBe(3);
  });

  it('searches a million rows', () => {
    expect(nearestBoundary(offsets(1_000_000, 21), 21 * 765_432 + 9)).toBe(765_432);
  });
});
