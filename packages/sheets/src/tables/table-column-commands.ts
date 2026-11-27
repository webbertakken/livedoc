// A table's column menu (docs/specs/029-sheets/data-tools.md "Tables" "Column menu"): Sort A to Z and Z to A over the
// data rows alone (the header and total rows stay put), and Insert 1 Column Left and Right, a sheet column that joins
// the table beside its first or last column (D450). Delete Column is the sheet's own `deleteAxis`.
import type { Workbook } from '../engine/workbook';
import { insertAxis, sortRange } from '../commands-axis';
import type { MergeRefusal } from '../merge-guards';
import { layoutIndex, posRangeOf } from '../layout';
import type { GridSize } from '../sheet-limits';
import type { Rand } from '../ids';
import type { Sheet } from '../sheet';
import type { SheetWrite } from '../store';
import type { LayoutChange } from '../store-layout';
import type { SheetTable } from './table';

// The table and the column's place, when the column is one of its.
function columnOf(sheet: Sheet | undefined, tableId: string, colId: string) {
  const table = sheet?.layout.tables?.find((t) => t.id === tableId);
  const p = table && sheet && posRangeOf(sheet.layout, table);
  const c = sheet && layoutIndex(sheet.layout).colPos.get(colId);
  if (!table || !p || c === undefined || c < p.c1 || c > p.c2) return null;
  return { table, p, c };
}

/** Sort A to Z (or Z to A) by a table's column: its data rows only, one write. */
export function tableSortWrite(
  wb: Workbook,
  sheetId: string,
  tableId: string,
  colId: string,
  ascending: boolean,
): SheetWrite | MergeRefusal | null {
  const at = columnOf(wb.sheet(sheetId), tableId, colId);
  if (!at) return null;
  const { table, p, c } = at;
  const data = { r1: p.r1 + 1, c1: p.c1, r2: table.total ? p.r2 - 1 : p.r2, c2: p.c2 };
  return sortRange(wb, sheetId, data, [{ col: c, ascending }], false);
}

/** Insert 1 Column Left (`before`) or Right (`after`) of a table's column: one write, the table widened at its edge. */
export function tableColumnInsertWrite(
  sheet: Sheet,
  tableId: string,
  colId: string,
  side: 'before' | 'after',
  room: GridSize,
  rand?: Rand,
): SheetWrite | null {
  const at = columnOf(sheet, tableId, colId);
  if (!at) return null;
  const write = insertAxis(sheet, 'c', at.c, 1, side, room, rand);
  if (!write || write.kind !== 'layout') return null;
  const insert = write.changes[0];
  if (insert?.k !== 'insertCols') return null;
  const id = insert.ids[0]!;
  const { table, p, c } = at;
  const edge: Partial<SheetTable> | null =
    side === 'before' && c === p.c1
      ? { c1: id }
      : side === 'after' && c === p.c2
        ? { c2: id }
        : null;
  if (!edge) return write;
  const band = table.band ? sheet.layout.bands?.find((b) => b.id === table.band) : undefined;
  const changes: LayoutChange[] = [
    ...write.changes,
    { k: 'table', id: table.id, table: { ...table, ...edge } },
    // Its banding widens with it (D442).
    ...(band ? [{ k: 'band' as const, id: band.id, band: { ...band, ...edge } }] : []),
  ];
  return { ...write, changes };
}
