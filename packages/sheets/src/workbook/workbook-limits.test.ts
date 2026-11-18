import { describe, expect, it } from 'vitest';
import {
  WORKBOOK_COLS_MAX,
  WORKBOOK_GRID_CELLS_MAX,
  WORKBOOK_SHEETS_MAX,
  gridCells,
  workbookGridRefusal,
} from './workbook-limits';

// docs/specs/029-sheets/spreadsheet.md "Limits": 20 million cells counted as Google counts them (the grid, filled or
// not), 18,278 columns, 200 sheets.
const grid = (rows: number, cols: number) => ({
  rows: { length: rows } as unknown as string[],
  cols: { length: cols } as unknown as string[],
});

describe('a workbook’s grid', () => {
  it('counts rows times columns over every sheet', () => {
    expect(gridCells([grid(1_000, 26), grid(10, 10)])).toBe(26_100);
  });

  it('takes a workbook at the limit, and refuses one cell past it', () => {
    expect(workbookGridRefusal([grid(WORKBOOK_GRID_CELLS_MAX / 26, 26)])).toBeNull();
    expect(workbookGridRefusal([grid(WORKBOOK_GRID_CELLS_MAX / 20, 20), grid(1, 1)])).toBe(
      'workbook_full',
    );
  });

  it('refuses a sheet wider than column ZZZ', () => {
    expect(workbookGridRefusal([grid(1, WORKBOOK_COLS_MAX)])).toBeNull();
    expect(workbookGridRefusal([grid(1, WORKBOOK_COLS_MAX + 1)])).toBe('sheet_too_large');
  });

  it('refuses a sheet past the 200th', () => {
    expect(
      workbookGridRefusal(Array.from({ length: WORKBOOK_SHEETS_MAX + 1 }, () => grid(1, 1))),
    ).toBe('sheets_full');
  });
});
