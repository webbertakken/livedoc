import { describe, expect, it } from 'vitest';
import { countSelection, SELECTION_CELLS_MAX, type SelectionSource } from './selection-stats';

const grid: unknown[][] = [
  [1, 'a', null],
  [2, '', undefined],
  [3, 4, true],
];
const source = (over: Partial<SelectionSource> = {}): SelectionSource => ({
  ranges: [{ r1: 0, c1: 0, r2: 2, c2: 2 }],
  extent: { rows: 3, cols: 3 },
  value: (r, c) => grid[r]?.[c],
  hiddenRow: () => false,
  ...over,
});

// docs/specs/029-sheets/surface.md "Sheet bar"; sheet.md "Selection".
describe('countSelection', () => {
  it('sums the numbers and counts what the cells hold, empty ones left out', () => {
    expect(countSelection(source())).toEqual({ sum: 10, count: 6, numbers: 4, min: 1, max: 4 });
  });

  it('leaves out the rows a filter hides, and cells past the sheet’s extent', () => {
    expect(countSelection(source({ hiddenRow: (r) => r === 2 }))).toEqual({
      sum: 3,
      count: 3,
      numbers: 2,
      min: 1,
      max: 2,
    });
    expect(countSelection(source({ ranges: [{ r1: 0, c1: 0, r2: 99, c2: 0 }] }))).toMatchObject({
      numbers: 3,
    });
  });

  it('gives up past the most cells it counts', () => {
    const wide = { rows: SELECTION_CELLS_MAX, cols: 2 };
    expect(
      countSelection(
        source({
          ranges: [{ r1: 0, c1: 0, r2: SELECTION_CELLS_MAX - 1, c2: 1 }],
          extent: wide,
          value: () => 1,
        }),
      ),
    ).toBe('too-many');
  });
});
