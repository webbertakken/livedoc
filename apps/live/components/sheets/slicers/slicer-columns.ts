// A slicer's columns as the Slicer panel's Column offers them and as its heading names them (docs/specs/029-sheets/
// data-tools.md "Slicers"): the range's header names, as Advanced Range Sorting offers them (`Column B` for a blank).
import { posRangeOf, type SheetSlicer } from '@livedoc/sheets';
import { sortRangeColumns } from '@/lib/spreadsheet/sort-range';
import type { SheetController } from '../sheet-controller';
import { cellSpokenValue } from '../sheet-cell-speech';

export type SlicerColumn = { id: string; label: string };

export function slicerColumns(
  c: Pick<SheetController, 'sheet' | 'workbook' | 'locale'>,
  slicer: Pick<SheetSlicer, 'range'>,
): SlicerColumn[] {
  const p = slicer.range ? posRangeOf(c.sheet.layout, slicer.range) : null;
  if (!p) return [];
  return sortRangeColumns(p, true, (col) =>
    cellSpokenValue(c.sheet, c.workbook, c.locale, p.r1, col),
  ).map((x) => ({ id: c.sheet.layout.cols[x.col]!, label: x.label }));
}
