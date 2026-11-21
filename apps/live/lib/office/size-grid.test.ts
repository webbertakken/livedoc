// docs/specs/004-interface-design/office-shell.md "Menus as data", size grid: it starts 5 x 5 and grows to one past the
// size pointed at, up to its most; the arrows change the size, passing to the menu at the edges; it reads columns x rows.
import { describe, expect, it } from 'vitest';
import { gridSizeLabel, gridSizeName, shownGrid, SIZE_GRID_START, stepGrid } from './size-grid';

const most = { columns: 20, rows: 20 };

describe('shownGrid', () => {
  it('starts at 5 x 5 and grows one past the size pointed at, never past its most', () => {
    expect(SIZE_GRID_START).toBe(5);
    expect(shownGrid({ columns: 1, rows: 1 }, most)).toEqual({ columns: 5, rows: 5 });
    expect(shownGrid({ columns: 7, rows: 3 }, most)).toEqual({ columns: 8, rows: 5 });
    expect(shownGrid({ columns: 20, rows: 19 }, most)).toEqual({ columns: 20, rows: 20 });
    expect(shownGrid({ columns: 2, rows: 2 }, { columns: 3, rows: 3 })).toEqual({
      columns: 3,
      rows: 3,
    });
  });
});

describe('stepGrid', () => {
  it('changes the columns with Left and Right and the rows with Up and Down', () => {
    const size = { columns: 3, rows: 2 };
    expect(stepGrid(size, 'ArrowRight', most)).toEqual({ columns: 4, rows: 2 });
    expect(stepGrid(size, 'ArrowLeft', most)).toEqual({ columns: 2, rows: 2 });
    expect(stepGrid(size, 'ArrowDown', most)).toEqual({ columns: 3, rows: 3 });
    expect(stepGrid(size, 'ArrowUp', most)).toEqual({ columns: 3, rows: 1 });
  });

  it('passes a key to the menu where the size cannot change', () => {
    const one = { columns: 1, rows: 1 };
    expect(stepGrid(one, 'ArrowUp', most)).toBeNull();
    expect(stepGrid(one, 'ArrowLeft', most)).toBeNull();
    const full = { columns: 20, rows: 20 };
    expect(stepGrid(full, 'ArrowDown', most)).toBeNull();
    expect(stepGrid(full, 'ArrowRight', most)).toBeNull();
    expect(stepGrid(one, 'Enter', most)).toBeNull();
  });
});

describe('the size read', () => {
  it('reads columns x rows, and names it in words', () => {
    expect(gridSizeLabel({ columns: 3, rows: 2 })).toBe('3 x 2');
    expect(gridSizeName('Table', { columns: 3, rows: 2 })).toBe('Table, 3 columns by 2 rows');
    expect(gridSizeName('Table', { columns: 1, rows: 1 })).toBe('Table, 1 column by 1 row');
  });
});
