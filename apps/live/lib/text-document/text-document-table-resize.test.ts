// docs/specs/034-text-documents/tables.md "Working in a table", Resize: a border under the pointer, the columns' widths
// after dragging a border between two (the table keeps its width) or the table's right one, and a row's height.
import { describe, expect, it } from 'vitest';
import {
  MIN_ROW_HEIGHT_PT,
  borderAt,
  resizedColumns,
  resizedRow,
} from './text-document-table-resize';

const cell = { left: 100, right: 200, top: 50, bottom: 80 };

describe('borderAt', () => {
  it('finds the right border within 4 px either side', () => {
    expect(borderAt(cell, 197, 60)).toBe('right');
    expect(borderAt(cell, 204, 60)).toBe('right');
  });

  it('finds the bottom border, the right one winning at the corner', () => {
    expect(borderAt(cell, 150, 78)).toBe('bottom');
    expect(borderAt(cell, 199, 79)).toBe('right');
  });

  it('finds none inside the cell, on its left or top, or past its ends', () => {
    expect(borderAt(cell, 150, 60)).toBeNull();
    expect(borderAt(cell, 101, 60)).toBeNull();
    expect(borderAt(cell, 150, 51)).toBeNull();
    expect(borderAt(cell, 199, 120)).toBeNull();
  });
});

describe('resizedColumns', () => {
  it('moves width between the two columns of an inner border, the table keeping its width', () => {
    expect(resizedColumns([100, 100, 100], 0, 30)).toEqual([130, 70, 100]);
    expect(resizedColumns([100, 100, 100], 1, -20)).toEqual([100, 80, 120]);
  });

  it('keeps each column at least 0.1 in', () => {
    expect(resizedColumns([100, 100], 0, 500)).toEqual([192.8, 7.2]);
    expect(resizedColumns([100, 100], 0, -500)).toEqual([7.2, 192.8]);
  });

  it('widens or narrows the last column, and the table with it, at its right border', () => {
    expect(resizedColumns([100, 100], 1, 40)).toEqual([100, 140]);
    expect(resizedColumns([100, 100], 1, -500)).toEqual([100, 7.2]);
  });

  it('rounds to a hundredth of a point', () => {
    expect(resizedColumns([100, 100], 0, 10.123)).toEqual([110.12, 89.88]);
  });
});

describe('resizedRow', () => {
  it('sets the height as dragged, to a quarter point, at least 6 pt', () => {
    expect(resizedRow(30, 12.1)).toBe(42);
    expect(resizedRow(30, -100)).toBe(MIN_ROW_HEIGHT_PT);
  });
});
