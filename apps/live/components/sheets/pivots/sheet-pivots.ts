'use client';

// A spreadsheet's pivot tables as the grid meets them (docs/specs/029-sheets/pivot-tables.md "Working with one"):
// the Edit button's way into the Pivot Table Editor, and the pivot tables a Delete over a whole output removes (D613).
// Kept free of the editor's code: the grid reads it.
import { createContext, useContext } from 'react';
import type { GridRange, Sheet, Workbook } from '@livedoc/sheets';

// The Pivot Table Editor opened on a pivot table; absent where no one may change them (a Plan Sheet, a Viewer).
export const SheetPivotsContext = createContext<((pivotId: string) => void) | null>(null);

export function useSheetPivotEdit(): ((pivotId: string) => void) | null {
  return useContext(SheetPivotsContext);
}

const inside = (a: GridRange, b: GridRange) =>
  a.r1 >= b.r1 && a.c1 >= b.c1 && a.r2 <= b.r2 && a.c2 <= b.c2;

/** The pivot tables whose whole output (its anchor alone while blocked) one of `ranges` covers. */
export function pivotsCoveredBy(
  wb: Workbook,
  sheet: Sheet,
  ranges: readonly GridRange[],
): string[] {
  const { rows, cols } = sheet.layout;
  const ids: string[] = [];
  for (const x of sheet.layout.objects ?? []) {
    if (x.kind !== 'pivot') continue;
    const r = rows.indexOf(x.at.r);
    const c = cols.indexOf(x.at.c);
    const out = r < 0 || c < 0 ? null : wb.pivotOutputAt(sheet.id, r, c);
    if (out && ranges.some((g) => inside(out.rect, g))) ids.push(x.id);
  }
  return ids;
}
