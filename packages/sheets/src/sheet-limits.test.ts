import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_CELLS_MAX,
  INPUT_MAX,
  SHEET_BYTES_MAX,
  SHEET_CELLS_MAX,
  SHEET_COLS_MAX,
  SHEET_ROWS_MAX,
  SHEET_SIZED_AXES_MAX,
} from './limits';
import { SheetLimits } from './sheet-limits';
import {
  WORKBOOK_COLS_MAX,
  WORKBOOK_GRID_CELLS_MAX,
  WORKBOOK_INPUT_MAX,
  WORKBOOK_ROWS_MAX,
  WORKBOOK_SIZED_AXES_MAX,
  WORKBOOK_STORED_BYTES_MAX,
} from './workbook/workbook-limits';

// docs/specs/029-sheets/spreadsheet.md "Limits": a spreadsheet's sheets take the workbook's limits, a Plan Sheet keeps
// its own (sheet-store.md "Limits") until it retires.
describe('SheetLimits', () => {
  it("keeps a Plan Sheet's limits", () => {
    expect(SheetLimits.plan).toMatchObject({
      rows: SHEET_ROWS_MAX,
      cols: SHEET_COLS_MAX,
      cells: SHEET_CELLS_MAX,
      bytes: SHEET_BYTES_MAX,
      sizedAxes: SHEET_SIZED_AXES_MAX,
      input: INPUT_MAX,
      documentCells: DOCUMENT_CELLS_MAX,
    });
  });

  it("gives a spreadsheet's sheets the workbook's", () => {
    expect(SheetLimits.spreadsheet).toMatchObject({
      rows: WORKBOOK_ROWS_MAX,
      cols: WORKBOOK_COLS_MAX,
      cells: WORKBOOK_GRID_CELLS_MAX,
      bytes: WORKBOOK_STORED_BYTES_MAX,
      sizedAxes: WORKBOOK_SIZED_AXES_MAX,
      input: WORKBOOK_INPUT_MAX,
      documentCells: WORKBOOK_GRID_CELLS_MAX,
      documentBytes: WORKBOOK_STORED_BYTES_MAX,
      workbookRows: WORKBOOK_ROWS_MAX,
      gridCells: WORKBOOK_GRID_CELLS_MAX,
    });
    expect(WORKBOOK_ROWS_MAX).toBe(1_000_000);
  });

  it('picks the limits of a kind', () => {
    expect(SheetLimits.of(true)).toBe(SheetLimits.spreadsheet);
    expect(SheetLimits.of(false)).toBe(SheetLimits.plan);
  });

  describe('room', () => {
    it("leaves a Plan Sheet its own grid's room", () => {
      expect(SheetLimits.room(SheetLimits.plan, { rows: 9_000, cols: 150 })).toEqual({
        rows: 1_000,
        cols: 50,
      });
    });

    it("bounds a spreadsheet's sheet by the rows of every sheet", () => {
      const room = SheetLimits.room(
        SheetLimits.spreadsheet,
        { rows: 1_000, cols: 1 },
        { rows: 999_000, gridCells: 999_000 },
      );
      expect(room.rows).toBe(1_000);
    });

    it("bounds a spreadsheet's sheet by the grid cells of every sheet", () => {
      // 19,990,000 grid cells held: 10,000 left, so 100 rows of 100 columns, or 10 columns of 1,000 rows.
      const room = SheetLimits.room(
        SheetLimits.spreadsheet,
        { rows: 1_000, cols: 100 },
        { rows: 2_000, gridCells: WORKBOOK_GRID_CELLS_MAX - 10_000 },
      );
      expect(room).toEqual({ rows: 100, cols: 10 });
    });

    it('never answers less than none', () => {
      const room = SheetLimits.room(
        SheetLimits.spreadsheet,
        { rows: 10, cols: 10 },
        { rows: WORKBOOK_ROWS_MAX + 5, gridCells: WORKBOOK_GRID_CELLS_MAX + 5 },
      );
      expect(room).toEqual({ rows: 0, cols: 0 });
    });

    it("counts the sheet alone when the workbook's sizes are not given", () => {
      expect(SheetLimits.room(SheetLimits.spreadsheet, { rows: 1_000, cols: 1 })).toEqual({
        rows: WORKBOOK_ROWS_MAX - 1_000,
        cols: WORKBOOK_COLS_MAX - 1,
      });
      // At 26 columns the grid's cells bind first: 19,974,000 left, 768,230 rows of 26.
      expect(SheetLimits.room(SheetLimits.spreadsheet, { rows: 1_000, cols: 26 }).rows).toBe(
        768_230,
      );
    });
  });

  describe('workbookRefusal', () => {
    it('refuses a workbook past its rows over every sheet', () => {
      const grids = [
        { rows: WORKBOOK_ROWS_MAX - 10, cols: 1 },
        { rows: 11, cols: 1 },
      ];
      expect(SheetLimits.workbookRefusal(SheetLimits.spreadsheet, grids)).toBe('workbook_full');
      expect(
        SheetLimits.workbookRefusal(SheetLimits.spreadsheet, [{ rows: 10, cols: 1 }, grids[0]!]),
      ).toBeNull();
    });

    it('refuses a workbook past its grid cells', () => {
      expect(
        SheetLimits.workbookRefusal(SheetLimits.spreadsheet, [
          { rows: 800_000, cols: 26 },
          { rows: 1_000, cols: 18 },
        ]),
      ).toBe('workbook_full');
    });

    it('refuses a sheet past its columns, and a workbook past its sheets', () => {
      expect(
        SheetLimits.workbookRefusal(SheetLimits.spreadsheet, [
          { rows: 1, cols: WORKBOOK_COLS_MAX + 1 },
        ]),
      ).toBe('sheet_too_large');
      expect(
        SheetLimits.workbookRefusal(
          SheetLimits.spreadsheet,
          Array.from({ length: 201 }, () => ({ rows: 1, cols: 1 })),
        ),
      ).toBe('sheets_full');
    });

    it('takes a workbook at the grid cells limit, refusing one cell past it', () => {
      const at = [{ rows: WORKBOOK_GRID_CELLS_MAX / 25, cols: 25 }];
      expect(SheetLimits.workbookRefusal(SheetLimits.spreadsheet, at)).toBeNull();
      expect(
        SheetLimits.workbookRefusal(SheetLimits.spreadsheet, [...at, { rows: 1, cols: 1 }]),
      ).toBe('workbook_full');
    });

    it('asks nothing of a Plan document', () => {
      expect(
        SheetLimits.workbookRefusal(SheetLimits.plan, [
          { rows: 10_000, cols: 200 },
          { rows: 10_000, cols: 200 },
        ]),
      ).toBeNull();
    });
  });
});
