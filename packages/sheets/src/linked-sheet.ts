// One sheet of a spreadsheet as another document reads it (docs/specs/029-sheets/plan-links.md "Reading a sheet from
// another document", D505): its values where its formulas were, its formats, its rows and columns by id, the rows it
// hides and its one-cell names; nothing else of the sheet. A dashboard's figures read it with their own engine, by the
// same ids, so a figure follows its cell as rows and columns move in the source.
import { compileFormula } from './formula/stored';
import { isError } from './formula/values';
import type { Workbook } from './engine/workbook';
import { layoutIndex } from './layout';
import { cellKey, type CellInput, type SheetLayout } from './sheet';
import type { SheetCellJson, SheetJson } from './sheet-json';

/** The rows a link carries: as many as a figure reads (sheet-metrics METRIC_ROWS_MAX). Safe range 500 to 10,000. */
export const LINK_ROWS_MAX = 2000;
/** The columns a link carries: the Plan Sheet's own column cap. Safe range 26 to 1,000. */
export const LINK_COLS_MAX = 200;

// A value as an input that the reader's engine works out to the same value: an error as the formula of its code.
function inputOf(wb: Workbook, sheetId: string, r: number, c: number): CellInput | undefined {
  const v = wb.value(sheetId, r, c);
  if (v === null || v === '') return undefined;
  if (typeof v === 'number') return { n: v };
  if (typeof v === 'string') return { s: v };
  if (typeof v === 'boolean') return { b: v };
  if (isError(v)) {
    const made = compileFormula(`=${v.e}`, wb.ctxFor(sheetId));
    return made.ok ? { f: made.formula } : undefined;
  }
  // A cell's value is never an array: a spill is read cell by cell.
  return undefined;
}

/** The sheet as a link reads it, or null when the workbook holds no such sheet. */
export function linkedSheet(wb: Workbook, sheetId: string): SheetJson | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const extent = wb.shownExtent(sheetId);
  const rows = sheet.layout.rows.slice(0, LINK_ROWS_MAX);
  const cols = sheet.layout.cols.slice(0, LINK_COLS_MAX);
  const kept = { rows: new Set(rows), cols: new Set(cols) };
  const ix = layoutIndex(sheet.layout);
  const hiddenRows = rows.filter((id) => ix.hiddenRows.has(id));
  const names = (sheet.layout.names ?? []).filter(
    (n) => n.r1 === n.r2 && n.c1 === n.c2 && kept.rows.has(n.r1) && kept.cols.has(n.c1),
  );
  const layout: SheetLayout = {
    rows,
    cols,
    ...(hiddenRows.length ? { hiddenRows } : {}),
    ...(names.length ? { names } : {}),
  };
  const cells: SheetCellJson[] = [];
  const add = (r: number, c: number, input: CellInput | undefined) => {
    const format = wb.shownFormat(
      sheetId,
      r,
      c,
      sheet.cells.get(cellKey(rows[r]!, cols[c]!))?.format,
    );
    if (input || format)
      cells.push({
        r: rows[r]!,
        c: cols[c]!,
        ...(input ? { i: input } : {}),
        ...(format ? { f: format } : {}),
      });
  };
  // Every position that may show a value, then the formats stored past them (an empty ruled total row).
  const height = Math.min(extent.rows, rows.length);
  const width = Math.min(extent.cols, cols.length);
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) add(r, c, inputOf(wb, sheetId, r, c));
  for (const [key, cell] of sheet.cells) {
    if (!cell.format) continue;
    const i = key.indexOf(':');
    const r = ix.rowPos.get(key.slice(0, i));
    const c = ix.colPos.get(key.slice(i + 1));
    if (r === undefined || c === undefined || r >= rows.length || c >= cols.length) continue;
    if (r < height && c < width) continue;
    add(r, c, undefined);
  }
  return {
    id: sheet.id,
    tabId: sheet.tabId,
    title: sheet.title,
    layout,
    cells,
    rev: 0,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    updatedBy: { id: '', name: '', color: '#000000' },
  };
}
