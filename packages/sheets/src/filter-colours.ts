// Filter by Colour (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"): the colour a cell is
// drawn in, as Google filters by it: a met format rule's over the cell's own, theme colours in the workbook's theme,
// alternating colours never (they shade by position, so a filter would move them).
import { layoutIndex, posRangeOf } from './layout';
import { displayValue } from './number-format';
import { formatRuleStyle } from './rules/format-rules';
import { resolveColour } from './themes/spreadsheet-theme';
import { cellKey } from './sheet';
import type { Workbook } from './engine/workbook';

export type FilterColourKey = 'bg' | 'fc';

/** The colour a cell (by position) is drawn in, for `key`; null for none or off the sheet. */
export type CellColourOf = (r: number, c: number, key: FilterColourKey) => string | null;

export function drawnColour(
  wb: Workbook,
  sheetId: string,
  r: number,
  c: number,
  key: FilterColourKey,
): string | null {
  const sheet = wb.sheet(sheetId);
  const rowId = sheet?.layout.rows[r];
  const colId = sheet?.layout.cols[c];
  if (!sheet || !rowId || !colId) return null;
  const format = sheet.cells.get(cellKey(rowId, colId))?.format;
  const value = wb.value(sheetId, r, c);
  const met = formatRuleStyle(
    wb,
    sheetId,
    r,
    c,
    value,
    displayValue(value, format, wb.locale).text,
  );
  return resolveColour(met?.[key] ?? format?.[key], wb.theme) ?? null;
}

/** A sheet's cells' drawn colours, for its filter's test. */
export const colourOfSheet =
  (wb: Workbook, sheetId: string): CellColourOf =>
  (r, c, key) =>
    drawnColour(wb, sheetId, r, c, key);

/** The colours a filter column's cells under its header are drawn in, once each, in the order seen. */
export function columnColours(
  wb: Workbook,
  sheetId: string,
  colId: string,
  key: FilterColourKey,
): string[] {
  const sheet = wb.sheet(sheetId);
  const filter = sheet?.layout.filter;
  if (!sheet || !filter) return [];
  const box = posRangeOf(sheet.layout, filter);
  const c = layoutIndex(sheet.layout).colPos.get(colId);
  if (!box || c === undefined) return [];
  const seen = new Set<string>();
  for (let r = box.r1 + 1; r <= box.r2; r++) {
    const colour = drawnColour(wb, sheetId, r, c, key);
    if (colour) seen.add(colour);
  }
  return [...seen];
}
