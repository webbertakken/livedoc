// A table's column menu (docs/specs/029-sheets/data-tools.md "Tables" "Column menu"): Sort A to Z and Z to A over the
// data rows alone, Insert 1 Column Left and Right (joining the table at its edges, D450), and a Dropdown's own
// options.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import type { Sheet } from '../sheet';
import { columnTypeWrite, tableColumnOptions } from './table-commands';
import { tableColumnInsertWrite, tableSortWrite } from './table-column-commands';
import type { SheetTable } from './table';

const T: SheetTable = {
  id: 'tbl001',
  name: 'Sales',
  r1: 's0r0',
  c1: 's0c1',
  r2: 's0r4',
  c2: 's0c2',
};
const DATA = {
  A3: 'outside',
  B1: 'Item',
  C1: 'Amount',
  B2: 'pen',
  C2: '3',
  B3: 'ink',
  C3: '1',
  B4: 'cap',
  C4: '2',
  B5: 'Total',
  C5: '=SUBTOTAL(109, C2:C4)',
};
const apply = (sheet: Sheet, w: SheetWrite) => {
  expect(validateWrite(sheet, w)).toMatchObject({ ok: true });
  return applySheetWrite(sheet, w, { now: 1, by: sheet.updatedBy }).sheet;
};
const room = { rows: 100, cols: 100 };
const rand = () => 0.5;

describe('tableSortWrite', () => {
  it('sorts the data rows by the column, the header and total row staying put', () => {
    const b = book(DATA, { tables: { 'Sheet 1': [{ ...T, total: true }] } });
    const sheet = b.sheets[0]!;
    const w = tableSortWrite(b.wb, sheet.id, 'tbl001', 's0c2', true);
    expect(w && 'refused' in w).toBe(false);
    b.wb.updateSheet(apply(sheet, w as SheetWrite));
    const col = (c: number) => [0, 1, 2, 3, 4].map((r) => b.wb.value(sheet.id, r, c));
    expect(col(1)).toEqual(['Item', 'ink', 'cap', 'pen', 'Total']);
    expect(col(2)).toEqual(['Amount', 1, 2, 3, 6]);
    expect(b.wb.value(sheet.id, 2, 0)).toBe('outside');
  });

  it('sorts Z to A, every data row taking part when there is no total row', () => {
    const b = book({ ...DATA, B5: 'bag', C5: '9' }, { tables: { 'Sheet 1': [T] } });
    const sheet = b.sheets[0]!;
    b.wb.updateSheet(
      apply(sheet, tableSortWrite(b.wb, sheet.id, 'tbl001', 's0c2', false) as SheetWrite),
    );
    expect([1, 2, 3, 4].map((r) => b.wb.value(sheet.id, r, 1))).toEqual([
      'bag',
      'pen',
      'cap',
      'ink',
    ]);
    // Already in order: nothing to write.
    expect(tableSortWrite(b.wb, sheet.id, 'tbl001', 's0c2', false)).toBeNull();
  });

  it('makes nothing of a column outside the table or an unknown table', () => {
    const b = book(DATA, { tables: { 'Sheet 1': [T] } });
    const id = b.sheets[0]!.id;
    expect(tableSortWrite(b.wb, id, 'tbl001', 's0c0', true)).toBeNull();
    expect(tableSortWrite(b.wb, id, 'nope01', 's0c1', true)).toBeNull();
  });
});

describe('tableColumnInsertWrite', () => {
  const inserted = (side: 'before' | 'after', colId: string) => {
    const b = book(DATA, { tables: { 'Sheet 1': [T] } });
    const sheet = b.sheets[0]!;
    const w = tableColumnInsertWrite(sheet, 'tbl001', colId, side, room, rand)!;
    const after = apply(sheet, w);
    const t = after.layout.tables![0]!;
    const at = (id: string) => after.layout.cols.indexOf(id);
    return { first: at(t.c1), last: at(t.c2), cols: after.layout.cols.length };
  };

  it('joins the table beside its first column (left) and its last (right)', () => {
    expect(inserted('before', 's0c1')).toMatchObject({ first: 1, last: 3 });
    expect(inserted('after', 's0c2')).toMatchObject({ first: 1, last: 3 });
  });

  it('widens the banding with the table', () => {
    const b = book(DATA, { tables: { 'Sheet 1': [{ ...T, band: 'bnd001' }] } });
    const banded = applySheetWrite(
      b.sheets[0]!,
      {
        kind: 'layout',
        changes: [
          {
            k: 'band',
            id: 'bnd001',
            band: {
              id: 'bnd001',
              r1: T.r1,
              c1: T.c1,
              r2: T.r2,
              c2: T.c2,
              head: '#111111',
              band1: '#222222',
              band2: '#333333',
              foot: '#444444',
            },
          },
        ],
      },
      { now: 1, by: b.sheets[0]!.updatedBy },
    ).sheet;
    const after = apply(
      banded,
      tableColumnInsertWrite(banded, 'tbl001', 's0c2', 'after', room, rand)!,
    );
    expect(after.layout.bands![0]!.c2).toBe(after.layout.tables![0]!.c2);
    expect(after.layout.cols.indexOf(after.layout.bands![0]!.c2)).toBe(3);
  });

  it('inserts inside the table without moving its edges', () => {
    expect(inserted('after', 's0c1')).toMatchObject({ first: 1, last: 3 });
    expect(inserted('before', 's0c2')).toMatchObject({ first: 1, last: 3 });
  });

  it('makes nothing of a column outside the table, or with no room left', () => {
    const b = book(DATA, { tables: { 'Sheet 1': [T] } });
    const sheet = b.sheets[0]!;
    expect(tableColumnInsertWrite(sheet, 'tbl001', 's0c0', 'after', room, rand)).toBeNull();
    expect(
      tableColumnInsertWrite(sheet, 'tbl001', 's0c1', 'after', { rows: 0, cols: 0 }, rand),
    ).toBeNull();
  });
});

describe("a Dropdown's own options", () => {
  it('takes the options given over the column values', () => {
    const b = book(DATA, { tables: { 'Sheet 1': [T] } });
    const w = columnTypeWrite(b.wb, b.sheets[0]!.id, 'tbl001', 's0c1', 'dropdown', [
      { v: 'pen', c: '#fde68a' },
      { v: 'nib' },
    ])!;
    const table = (w as { changes: { table: SheetTable }[] }).changes[0]!.table;
    expect(table.opts).toEqual({ s0c1: [{ v: 'pen', c: '#fde68a' }, { v: 'nib' }] });
  });

  it("opens on the column's own options, else its values, nothing outside the table", () => {
    const b = book(DATA, { tables: { 'Sheet 1': [{ ...T, total: true }] } });
    const id = b.sheets[0]!.id;
    expect(tableColumnOptions(b.wb, id, 'tbl001', 's0c1')).toEqual([
      { v: 'pen' },
      { v: 'ink' },
      { v: 'cap' },
    ]);
    const own = [{ v: 'nib', c: '#fde68a' }];
    const typed = { ...T, types: { s0c1: 'dropdown' as const }, opts: { s0c1: own } };
    const b2 = book(DATA, { tables: { 'Sheet 1': [typed] } });
    expect(tableColumnOptions(b2.wb, b2.sheets[0]!.id, 'tbl001', 's0c1')).toEqual(own);
    expect(tableColumnOptions(b.wb, id, 'tbl001', 's0c0')).toEqual([]);
  });
});
