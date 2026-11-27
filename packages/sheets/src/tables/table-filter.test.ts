// docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers" (D480, D481): a table's filter is the
// sheet's filter over exactly its header and data rows; any other overlap is refused by Create a Filter, Convert to
// Table and the room's judge; one stored before the rule stays and may still change its conditions.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import { cellKey, type Sheet, type SheetLayout } from '../sheet';
import type { Grid } from '../selection';
import { filterRangeFor, toggleFilter } from '../commands-axis';
import { convertToTable, TABLE_REFUSAL_COPY } from './table-commands';
import type { SheetTable } from './table';
import { filterFollowing, storedFilterClashes, tableFilterBox } from './table-filter';

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

const withTable = () => book(DATA, { tables: { 'Sheet 1': [TABLE] } });
const filterWrite = (r1: string, c1: string, r2: string, c2: string): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'filter', filter: { r1, c1, r2, c2, conds: {} } }],
});

describe('Create a Filter beside a table', () => {
  it('makes the table’s filter when the selection lies inside the table', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    expect(filterRangeFor(sheet.layout, range(1, 1, 1, 1), gridOf(sheet))).toEqual({
      box: range(0, 0, 2, 1),
    });
    const w = toggleFilter(b.wb, sheet.id, range(2, 0, 2, 0), gridOf(sheet));
    expect(w).toEqual(filterWrite('s0r0', 's0c0', 's0r2', 's0c1'));
  });

  it('refuses a range over part of a table, naming the table and its filter', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    // The filled block around B4's neighbour reaches the table: refused.
    expect(filterRangeFor(sheet.layout, range(0, 0, 3, 3), gridOf(sheet))).toEqual({
      refused: "This range overlaps Table1: use the table's filter",
      note: 'Overlaps Table1',
    });
    expect(toggleFilter(b.wb, sheet.id, range(0, 1, 0, 3), gridOf(sheet))).toEqual({
      refused: "This range overlaps Table1: use the table's filter",
    });
    // Away from it, a filter is made as before.
    expect(filterRangeFor(sheet.layout, range(0, 3, 1, 3), gridOf(sheet))).toEqual({
      box: range(0, 3, 1, 3),
    });
  });

  it('leaves out a total row from the table’s filter', () => {
    const b = book(DATA);
    const layout = b.sheets[0]!.layout;
    expect(tableFilterBox(layout, { ...TABLE, total: true })).toEqual(range(0, 0, 1, 1));
    expect(tableFilterBox(layout, { ...TABLE, r1: 'gone' })).toBeNull();
  });
});

describe('Convert to Table beside the sheet’s filter', () => {
  it('refuses a table over part of the filter, and makes one whose filter it then is', () => {
    const b = book(DATA);
    const sheet = b.sheets[0]!;
    const filtered: Sheet = {
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: { r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c3', conds: {} },
      },
    };
    b.wb.updateSheet(filtered);
    const refused = convertToTable(b.wb, sheet.id, range(0, 0, 2, 1), gridOf(filtered));
    expect(refused).toEqual({ ok: false, reason: 'filter' });
    expect(TABLE_REFUSAL_COPY.filter).toBe(
      "This range overlaps the sheet's filter: remove it or filter the table's cells only",
    );
    const exact = convertToTable(b.wb, sheet.id, range(0, 0, 2, 3), gridOf(filtered), () => 0.5);
    expect(exact?.ok).toBe(true);
  });
});

describe('the room’s judge', () => {
  it('refuses a filter over part of a table, and a table over part of the filter', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    expect(validateWrite(sheet, filterWrite('s0r0', 's0c0', 's0r3', 's0c3'))).toEqual({
      ok: false,
      error: 'filter_overlaps_table',
    });
    expect(validateWrite(sheet, filterWrite('s0r0', 's0c0', 's0r2', 's0c1'))).toEqual({ ok: true });
    const plain = book(DATA).sheets[0]!;
    const filtered: Sheet = {
      ...plain,
      layout: {
        ...plain.layout,
        filter: { r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c3', conds: {} },
      },
    };
    const table: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'table', id: TABLE.id, table: TABLE }],
    };
    expect(validateWrite(filtered, table)).toEqual({ ok: false, error: 'filter_overlaps_table' });
  });

  it('lets a filter stored over part of a table stay, change its conditions and its tables change', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
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
    const renamed: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'table', id: TABLE.id, table: { ...TABLE, name: 'Items' } }],
    };
    expect(validateWrite(old, renamed)).toEqual({ ok: true });
  });
});

describe('a table’s filter follows its table', () => {
  it('grows with the table, and undo takes it back', () => {
    const b = withTable();
    const sheet = b.sheets[0]!;
    const own: Sheet = {
      ...sheet,
      layout: {
        ...sheet.layout,
        filter: { r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c1', conds: {} },
      },
    };
    const grow: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'table', id: TABLE.id, table: { ...TABLE, r2: 's0r3' } }],
    };
    expect(validateWrite(own, grow)).toEqual({ ok: true });
    const by = own.updatedBy;
    const applied = applySheetWrite(own, grow, { now: 1, by });
    expect(applied.sheet.layout.filter).toMatchObject({ r2: 's0r3' });
    const undo = inverseSheetWrite(own, applied);
    expect(applySheetWrite(applied.sheet, undo, { now: 2, by }).sheet.layout.filter).toMatchObject({
      r2: 's0r2',
    });
  });

  it('stays where it is for a filter that is not the table’s, or a table gone', () => {
    const layout: SheetLayout = {
      ...book(DATA).sheets[0]!.layout,
      filter: { r1: 's0r0', c1: 's0c3', r2: 's0r1', c2: 's0c3', conds: {} },
    };
    expect(filterFollowing(layout, TABLE, { ...TABLE, r2: 's0r3' })).toBe(layout.filter);
    expect(filterFollowing(layout, TABLE, null)).toBe(layout.filter);
    const none = { ...layout, filter: undefined };
    expect(filterFollowing(none, TABLE, TABLE)).toBeUndefined();
  });
});
