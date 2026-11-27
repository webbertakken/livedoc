// What a Sheet's tables do (docs/specs/029-sheets/data-tools.md "Tables"): Convert to Table over the selection, a
// table's settings written whole, Select Table and Delete Table, and the column menu's sort, insert and delete; each
// through the controller's write, one undo step, an Editor's. Spread into useSheetActions.
import {
  columnTypeWrite,
  convertToRangeWrites,
  convertToTable,
  deleteAxis,
  layoutIndex,
  posRangeOf,
  tableAt,
  tableColumnInsertWrite,
  tableSortWrite,
  TABLE_REFUSAL_COPY,
  totalRowWrite,
  type CellChange,
  type DropdownOption,
  type GridRange,
  type LayoutChange,
  type SheetTable,
  type TableColumnType,
} from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import type { SheetController } from '../sheet-controller';

function primary(c: SheetController): GridRange {
  const ranges = c.selectionNow().ranges;
  return ranges[ranges.length - 1]!;
}

export function sheetTableActions(c: SheetController) {
  const layout = () => c.sheet.layout;
  return {
    // The table holding the active cell, or null.
    activeTable(): SheetTable | null {
      const { active } = c.selectionNow();
      return tableAt(layout(), active.r, active.c);
    },
    // Convert to Table (Format menu, Insert › Table, the menus, Ctrl+Alt+T): the table made, or null, its refusal
    // said in a toast.
    convertToTable(): SheetTable | null {
      const made = convertToTable(c.workbook, c.sheet.id, primary(c), c.grid);
      if (!made) return null;
      if (!made.ok) {
        debugLog('[sheet] table refused', { reason: made.reason });
        c.toast(TABLE_REFUSAL_COPY[made.reason]);
        return null;
      }
      return c.write(made.write, 'Table') ? made.table : null;
    },
    // A table's settings written whole; its banding follows a range changed in the same write (D442).
    setTable(table: SheetTable): boolean {
      const changes: LayoutChange[] = [{ k: 'table', id: table.id, table }];
      const band = table.band ? layout().bands?.find((b) => b.id === table.band) : undefined;
      if (
        band &&
        (band.r1 !== table.r1 ||
          band.c1 !== table.c1 ||
          band.r2 !== table.r2 ||
          band.c2 !== table.c2)
      )
        changes.push({
          k: 'band',
          id: band.id,
          band: {
            ...band,
            r1: table.r1,
            c1: table.c1,
            r2: table.r2,
            c2: table.c2,
            ...(table.total ? { footer: true } : {}),
          },
        });
      else if (band && !!band.footer !== !!table.total) {
        const { footer: _f, ...rest } = band;
        changes.push({
          k: 'band',
          id: band.id,
          band: table.total ? { ...rest, footer: true } : rest,
        });
      }
      return c.write({ kind: 'layout', changes }, 'Table');
    },
    // Table Settings' Total Row: its refusal said in a toast.
    setTotalRow(id: string, on: boolean): boolean {
      const made = totalRowWrite(c.workbook, c.sheet.id, id, on);
      if (!made) return false;
      if (!made.ok) {
        debugLog('[sheet] table refused', { reason: 'total' });
        c.toast(made.reason);
        return false;
      }
      return c.write(made.write, 'Table');
    },
    // A column's type (Table Settings, the column menu): with its cells' format; a Dropdown's options those given,
    // else its values.
    setColumnType(
      id: string,
      colId: string,
      type: TableColumnType | null,
      options?: readonly DropdownOption[],
    ): boolean {
      const write = columnTypeWrite(c.workbook, c.sheet.id, id, colId, type, options);
      return !!write && c.write(write, 'Table');
    },
    // The column menu's Sort A to Z / Z to A: the table's data rows by the column; a merge's refusal toasted.
    sortTableColumn(id: string, colId: string, ascending: boolean): void {
      const w = tableSortWrite(c.workbook, c.sheet.id, id, colId, ascending);
      if (w && 'refused' in w) return c.toast(w.refused);
      if (w && c.write(w, 'Sort')) c.announce(ascending ? 'Sorted A to Z' : 'Sorted Z to A');
    },
    // The column menu's Insert 1 Column Left / Right: joining the table beside its edge columns (D450).
    insertTableColumn(id: string, colId: string, side: 'before' | 'after'): void {
      const room = c.workbook.room(c.sheet.id);
      const w = tableColumnInsertWrite(c.sheet, id, colId, side, room);
      if (w && c.write(w, 'Columns')) c.announce('1 column inserted');
    },
    // The column menu's Delete Sheet Column: the whole sheet column, the table shrinking with it.
    deleteTableColumn(colId: string): void {
      const at = layoutIndex(layout()).colPos.get(colId);
      const w = at === undefined ? null : deleteAxis(c.sheet, 'c', at, at);
      if (w && c.write(w, 'Columns')) c.announce('1 column deleted');
    },
    // Select Table: its cells selected, the header row's first cell active.
    selectTable(id: string): void {
      const t = layout().tables?.find((x) => x.id === id);
      const p = t && posRangeOf(layout(), t);
      if (!p) return;
      c.setSelection({ ranges: [p], active: { r: p.r1, c: p.c1 }, anchor: { r: p.r1, c: p.c1 } });
    },
    // Convert to Range: the table goes, its cells and banding stay, formulas reading it read plain ranges (one step).
    convertToRange(id: string): boolean {
      const writes = convertToRangeWrites(c.workbook, c.sheet.id, id);
      return !!writes && c.writeAll(writes, 'Table');
    },
    // Delete Table: the table, its banding and its cells go, one undo step.
    deleteTable(id: string): boolean {
      const t = layout().tables?.find((x) => x.id === id);
      const p = t && posRangeOf(layout(), t);
      if (!t || !p) return false;
      const cells: CellChange[] = [];
      for (let r = p.r1; r <= p.r2; r++)
        for (let col = p.c1; col <= p.c2; col++)
          cells.push({ r: layout().rows[r]!, c: layout().cols[col]!, i: null, f: null });
      const changes: LayoutChange[] = [
        { k: 'table', id: t.id, table: null },
        ...(t.band ? [{ k: 'band' as const, id: t.band, band: null }] : []),
      ];
      return c.write({ kind: 'layout', changes, cells }, 'Table');
    },
  };
}
