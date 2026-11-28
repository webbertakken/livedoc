// docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers" (D480, D481): every table has a filter of
// its own over its header and data rows; the sheet's filter never overlaps a table, refused by Create a Filter,
// Convert to Table and the room's judge; one stored before the rule stays and may still change its conditions. A row
// is hidden when any filter hides it.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import { cellKey, type FilterCondition, type Sheet } from '../sheet';
import type { Grid } from '../selection';
import {
  filterRangeFor,
  filterShownFor,
  setTableFilterCondition,
  toggleFilter,
} from '../commands-axis';
import { filteredOutRows } from '../filter';
import { convertToTable, TABLE_REFUSAL_COPY } from './table-commands';
import type { SheetTable } from './table';
import { storedFilterClashes, tableDrawnFilter, tableFilterBox } from './table-filter';

const DATA = { A1: 'Item', B1: 'N', A2: 'pen', B2: '1', A3: 'ink', B3: '2', D1: 'x', D2: 'y' };
// Table1 over A1:B3.
const TABLE: SheetTable = {
  id: 'tbl001',
  name: 'Table1',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r2',
  c2: 's0c1',
};
const range = (r1: number, c1: number, r2: number, c2: number) => ({ r1, c1, r2, c2 });

function gridOf(sheet: Sheet): Grid {
  return {
    rows: sheet.layout.rows.length,
    cols: sheet.layout.cols.length,
    hiddenRow: () => false,
    hiddenCol: () => false,
    filled: (r, c) => sheet.cells.has(cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!)),
    mergeAt: () => null,
  };
}

const withTable = (table: SheetTable = TABLE) => book(DATA, { tables: { 'Sheet 1': [table] } });
const filterWrite = (r1: string, c1: string, r2: string, c2: string): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'filter', filter: { r1, c1, r2, c2, conds: {} } }],
});
const tableWrite = (table: SheetTable): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'table', id: table.id, table }],
});
const apply = (sheet: Sheet, w: SheetWrite) =>
  applySheetWrite(sheet, w, { now: 1, by: sheet.updatedBy });

describe('Create a Filter inside a table', () => {
  it('turns the table’s own filter on, and off again', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    expect(filterRangeFor(sheet.layout, range(1, 1, 1, 1), gridOf(sheet))).toEqual({
      table: TABLE,
    });
    expect(filterShownFor(sheet.layout, range(1, 1, 1, 1))).toBe(false);
    const on = toggleFilter(b.wb, sheet.id, range(2, 0, 2, 0), gridOf(sheet));
    expect(on).toEqual(tableWrite({ ...TABLE, filter: {} }));
    const filtered = apply(sheet, on as SheetWrite).sheet;
    expect(filterShownFor(filtered.layout, range(1, 1, 1, 1))).toBe(true);
    // The sheet's filter is another's: outside the table it reads as off.
    expect(filterShownFor(filtered.layout, range(0, 3, 0, 3))).toBe(false);
    b.wb.updateSheet(filtered);
    expect(toggleFilter(b.wb, sheet.id, range(1, 0, 1, 0), gridOf(filtered))).toEqual(
      tableWrite(TABLE),
    );
  });

  it('leaves the sheet’s filter elsewhere as it is', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    const elsewhere: Sheet = {
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: { r1: 's0r0', c1: 's0c3', r2: 's0r1', c2: 's0c3', conds: {} },
      },
    };
    b.wb.updateSheet(elsewhere);
    expect(toggleFilter(b.wb, sheet.id, range(1, 0, 1, 0), gridOf(elsewhere))).toEqual(
      tableWrite({ ...TABLE, filter: {} }),
    );
    expect(toggleFilter(b.wb, sheet.id, range(0, 3, 0, 3), gridOf(elsewhere))).toEqual({
      kind: 'layout',
      changes: [{ k: 'filter', filter: null }],
    });
  });

  it('refuses a range over part of a table, naming the table and its filter', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    expect(filterRangeFor(sheet.layout, range(0, 0, 3, 3), gridOf(sheet))).toEqual({
      refused: "This range overlaps Table1: use the table's filter",
      note: 'Overlaps Table1',
    });
    expect(toggleFilter(b.wb, sheet.id, range(0, 1, 0, 3), gridOf(sheet))).toEqual({
      refused: "This range overlaps Table1: use the table's filter",
    });
    expect(filterRangeFor(sheet.layout, range(0, 3, 1, 3), gridOf(sheet))).toEqual({
      box: range(0, 3, 1, 3),
    });
  });

  it('leaves out a total row from the table’s filter', () => {
    const layout = book(DATA).sheets[0]!.layout;
    expect(tableFilterBox(layout, { ...TABLE, total: true })).toEqual(range(0, 0, 1, 1));
    expect(tableFilterBox(layout, { ...TABLE, r1: 'gone' })).toBeNull();
    expect(
      tableDrawnFilter(layout, { ...TABLE, total: true, filter: { s0c1: { op: 'empty' } } }),
    ).toEqual({ r1: 's0r0', c1: 's0c0', r2: 's0r1', c2: 's0c1', conds: { s0c1: { op: 'empty' } } });
    expect(tableDrawnFilter(layout, TABLE)).toBeNull();
  });
});

describe('Convert to Table beside the sheet’s filter', () => {
  const filteredBook = (conds: Record<string, FilterCondition> = {}) => {
    const b = book(DATA);
    const sheet = b.sheets[0]!;
    const filtered: Sheet = {
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: { r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c3', conds },
      },
    };
    b.wb.updateSheet(filtered);
    return { b, filtered };
  };

  it('turns a new table’s filter on', () => {
    const b = book(DATA);
    const made = convertToTable(b.wb, b.sheets[0]!.id, range(0, 0, 2, 1), gridOf(b.sheets[0]!));
    expect(made?.ok && made.table.filter).toEqual({});
  });

  it('refuses a table over part of the filter', () => {
    const { b, filtered } = filteredBook();
    expect(convertToTable(b.wb, filtered.id, range(0, 0, 2, 1), gridOf(filtered))).toEqual({
      ok: false,
      reason: 'filter',
    });
    expect(TABLE_REFUSAL_COPY.filter).toBe(
      "This range overlaps the sheet's filter: remove it or filter the table's cells only",
    );
  });

  it('moves a filter over exactly the new table into it, in one write the judge takes', () => {
    const conds = { s0c3: { values: ['x'] } };
    const { b, filtered } = filteredBook(conds);
    const made = convertToTable(b.wb, filtered.id, range(0, 0, 2, 3), gridOf(filtered), () => 0.5);
    if (!made?.ok) throw new Error('refused');
    expect(made.table.filter).toEqual(conds);
    expect(made.write.kind === 'layout' && made.write.changes[0]).toEqual({
      k: 'filter',
      filter: null,
    });
    expect(validateWrite(filtered, made.write)).toEqual({ ok: true });
    const after = apply(filtered, made.write).sheet.layout;
    expect(after.filter).toBeUndefined();
    expect(after.tables?.[0]?.filter).toEqual(conds);
  });
});

describe('the room’s judge', () => {
  it('refuses the sheet’s filter over any of a table’s cells, and a table over the filter', () => {
    const sheet = withTable().sheets[0]!;
    expect(validateWrite(sheet, filterWrite('s0r0', 's0c0', 's0r3', 's0c3'))).toEqual({
      ok: false,
      error: 'filter_overlaps_table',
    });
    expect(validateWrite(sheet, filterWrite('s0r0', 's0c0', 's0r2', 's0c1'))).toEqual({
      ok: false,
      error: 'filter_overlaps_table',
    });
    const plain = book(DATA).sheets[0]!;
    const filtered: Sheet = {
      ...plain,
      layout: {
        ...plain.layout,
        filter: { r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c1', conds: {} },
      },
    };
    expect(validateWrite(filtered, tableWrite(TABLE))).toEqual({
      ok: false,
      error: 'filter_overlaps_table',
    });
  });

  it('takes a table’s filter only over its own columns, as a condition is checked', () => {
    const sheet = withTable().sheets[0]!;
    expect(
      validateWrite(sheet, tableWrite({ ...TABLE, filter: { s0c1: { op: 'empty' } } })),
    ).toEqual({
      ok: true,
    });
    expect(
      validateWrite(sheet, tableWrite({ ...TABLE, filter: { s0c3: { op: 'empty' } } })),
    ).toEqual({
      ok: false,
      error: 'write_invalid',
    });
    const bad = { ...TABLE, filter: { s0c1: { op: 'nope' } } } as unknown as SheetTable;
    expect(validateWrite(sheet, tableWrite(bad))).toEqual({ ok: false, error: 'write_invalid' });
  });

  it('lets a filter stored over part of a table stay, change its conditions and its tables change', () => {
    const sheet = withTable().sheets[0]!;
    const old: Sheet = {
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: { r1: 's0r0', c1: 's0c0', r2: 's0r3', c2: 's0c3', conds: {} },
      },
    };
    expect(storedFilterClashes(old.layout, old.layout.filter).map((t) => t.id)).toEqual([TABLE.id]);
    const cond: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'filterCond', col: 's0c0', cond: { op: 'empty' } }],
    };
    expect(validateWrite(old, cond)).toEqual({ ok: true });
    expect(validateWrite(old, filterWrite('s0r0', 's0c0', 's0r4', 's0c3'))).toEqual({ ok: true });
    expect(validateWrite(old, tableWrite({ ...TABLE, name: 'Items' }))).toEqual({ ok: true });
  });
});

describe('a table’s column condition', () => {
  const on = { ...TABLE, filter: {} };

  it('is set alone, undone alone, and kept from a column outside the table', () => {
    const sheet = withTable(on).sheets[0]!;
    const w = setTableFilterCondition(TABLE.id, 's0c1', { values: ['1'] });
    expect(validateWrite(sheet, w)).toEqual({ ok: true });
    const applied = apply(sheet, w);
    expect(applied.sheet.layout.tables?.[0]?.filter).toEqual({ s0c1: { values: ['1'] } });
    const undo = inverseSheetWrite(sheet, applied);
    expect(apply(applied.sheet, undo).sheet.layout.tables?.[0]?.filter).toEqual({});
    const cleared = apply(applied.sheet, setTableFilterCondition(TABLE.id, 's0c1', null));
    expect(cleared.sheet.layout.tables?.[0]?.filter).toEqual({});
    for (const bad of [
      setTableFilterCondition(TABLE.id, 's0c3', { op: 'empty' }),
      setTableFilterCondition('tblzzz', 's0c1', { op: 'empty' }),
      setTableFilterCondition(TABLE.id, 's0c1', { op: 'nope' } as unknown as FilterCondition),
    ])
      expect(validateWrite(sheet, bad)).toEqual({ ok: false, error: 'filter_invalid' });
  });

  it('changes nothing on a table whose filter is off', () => {
    const sheet = withTable().sheets[0]!;
    const w = setTableFilterCondition(TABLE.id, 's0c1', { op: 'empty' });
    expect(validateWrite(sheet, w)).toEqual({ ok: false, error: 'filter_invalid' });
    expect(apply(sheet, w).sheet.layout.tables?.[0]).toEqual(TABLE);
  });

  it('goes with its column, the table’s rows following by ids', () => {
    const sheet = withTable({ ...TABLE, c2: 's0c2', filter: { s0c1: { op: 'empty' } } }).sheets[0]!;
    const w: SheetWrite = { kind: 'layout', changes: [{ k: 'deleteCols', ids: ['s0c1'] }] };
    expect(apply(sheet, w).sheet.layout.tables?.[0]?.filter).toEqual({});
  });
});

describe('rows several filters hide', () => {
  // Two tables (A1:B3, D1:E3) and the sheet's filter (G1:G3), each hiding one row.
  const CELLS = {
    A1: 'a',
    B1: 'b',
    A2: '1',
    A3: '2',
    D1: 'd',
    E1: 'e',
    D2: '1',
    D3: '2',
    G1: 'g',
    G2: '1',
    G3: '2',
  };
  const left: SheetTable = { ...TABLE, filter: { s0c0: { values: ['2'] } } };
  const right: SheetTable = {
    id: 'tbl002',
    name: 'Table2',
    r1: 's0r0',
    c1: 's0c3',
    r2: 's0r2',
    c2: 's0c4',
    filter: { s0c3: { values: ['1'] } },
  };

  it('hides a row when any filter hides it, and shows it when none does', () => {
    const b = book(CELLS, { tables: { 'Sheet 1': [left, right] } });
    const sheet = b.sheets[0]!;
    expect([...filteredOutRows(b.wb, sheet.id)].sort()).toEqual(['s0r1', 's0r2']);
    b.wb.updateSheet({
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: {
          r1: 's0r0',
          c1: 's0c6',
          r2: 's0r2',
          c2: 's0c6',
          conds: { s0c6: { values: ['1'] } },
        },
      },
    });
    expect([...filteredOutRows(b.wb, sheet.id)].sort()).toEqual(['s0r1', 's0r2']);
    // Clearing the right table's condition shows only the row no other filter hides.
    b.wb.updateSheet({
      ...sheet,
      layout: {
        ...sheet.layout,
        tables: [left, { ...right, filter: {} }],
        filter: {
          r1: 's0r0',
          c1: 's0c6',
          r2: 's0r2',
          c2: 's0c6',
          conds: { s0c6: { values: ['2'] } },
        },
      },
    });
    expect([...filteredOutRows(b.wb, sheet.id)].sort()).toEqual(['s0r1']);
  });

  it('draws an open view alone in their place', () => {
    const b = book(CELLS, { tables: { 'Sheet 1': [left, right] } });
    const sheet = b.sheets[0]!;
    const view = {
      r1: 's0r0',
      c1: 's0c6',
      r2: 's0r2',
      c2: 's0c6',
      conds: { s0c6: { values: ['1'] } },
    };
    expect([...filteredOutRows(b.wb, sheet.id, view)]).toEqual(['s0r2']);
  });

  it('leaves out of SUBTOTAL the rows a table’s filter hides', () => {
    const b = book({ ...CELLS, J1: '=SUBTOTAL(109, A2:A3)' }, { tables: { 'Sheet 1': [left] } });
    expect(b.wb.value(b.sheets[0]!.id, 0, 9)).toBe(2);
  });
});
