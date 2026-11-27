// A pivot table value's details (docs/specs/029-sheets/pivot-tables.md "Details", D616): the source rows it
// summarises, carried onto a sheet of their own as values with their cells' formats, nothing linking them back.
import type { Workbook } from '../engine/workbook';
import type { SheetFromFile } from '../files/workbook-file';
import { isError, scalarOf, type Scalar } from '../formula/values';
import type { Rand } from '../ids';
import { cellKey, type CellInput } from '../sheet';
import { WORKBOOK_COLS_NEW, WORKBOOK_ROWS_NEW, workbookSheetLayout } from '../workbook-record';

/** The rows a value summarises: its source's sheet, the rows by position (the header first) and its columns. */
export type PivotDetails = {
  pivotId: string;
  sheetId: string;
  rows: readonly number[];
  c1: number;
  c2: number;
};

/** The details sheet's name, numbered with no gap (`Details1`), as Google Sheets names it. */
export const PIVOT_DETAILS_BASE = 'Details';

function inputOf(v: Scalar): CellInput | null {
  if (v === null) return null;
  if (typeof v === 'number') return { n: v };
  if (typeof v === 'boolean') return { b: v };
  return { s: isError(v) ? v.e : v };
}

/** The details as a new sheet `made.id` titled `made.title`, at least a new sheet's size. */
export function pivotDetailsSheet(
  wb: Workbook,
  details: PivotDetails,
  made: { id: string; title: string; rand?: Rand },
): SheetFromFile {
  const width = details.c2 - details.c1 + 1;
  const layout = workbookSheetLayout(
    made.rand,
    Math.max(WORKBOOK_ROWS_NEW, details.rows.length),
    Math.max(WORKBOOK_COLS_NEW, width),
  );
  const source = wb.sheet(details.sheetId);
  const cells: SheetFromFile['cells'] = [];
  if (source)
    details.rows.forEach((r, i) => {
      const rowId = source.layout.rows[r];
      for (let c = details.c1; c <= details.c2; c++) {
        const colId = source.layout.cols[c];
        if (rowId === undefined || colId === undefined) continue;
        const input = inputOf(scalarOf(wb.value(source.id, r, c)));
        const format = source.cells.get(cellKey(rowId, colId))?.format;
        if (!input && !format) continue;
        cells.push({
          r: layout.rows[i]!,
          c: layout.cols[c - details.c1]!,
          ...(input ? { i: input } : {}),
          ...(format ? { f: format } : {}),
        });
      }
    });
  return { id: made.id, title: made.title, layout, cells };
}
