// docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers" (D504): Filter by Cell Value keeps the rows
// showing the active cell's value in its column, on the filter over the cell (the open view's, a table's, the
// sheet's, made first when there is none); Ctrl+Alt+R opens the filter menu of the filter over the active cell.
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { cellKey, type Sheet } from './sheet';
import type { Grid } from './selection';
import type { SheetTable } from './tables/table';
import type { DrawnFilter } from './filter';
import { FILTER_CELL_OUTSIDE, filterAtCell, filterByCellValue } from './filter-at-cell';

const DATA = {
  A1: 'Item',
  B1: 'N',
  A2: 'pen',
  B2: '1',
  A3: 'ink',
  B3: '2',
  D1: 'x',
  D2: 'y',
  D3: 'z',
};
// Table1 over A1:B3.
const TABLE: SheetTable = {
  id: 'tbl001',
  name: 'Table1',
  r1: 's0r0',
  c1: 's0c0',
  r2: 's0r2',
  c2: 's0c1',
};
const cell = (r: number, c: number) => ({ r, c });
const one = (r: number, c: number) => ({ r1: r, c1: c, r2: r, c2: c });

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

const withLayout = (extra: Partial<Sheet['layout']>, tables: SheetTable[] = []) => {
  const b = tables.length ? book(DATA, { tables: { 'Sheet 1': tables } }) : book(DATA);
  const sheet = b.sheets[0]!;
  const next: Sheet = { ...sheet, layout: { ...sheet.layout, ...extra } };
  b.wb.updateSheet(next);
  return { wb: b.wb, sheet: next, grid: gridOf(next) };
};

const byValue = (
  s: ReturnType<typeof withLayout>,
  r: number,
  c: number,
  view: DrawnFilter | null = null,
) => filterByCellValue(s.wb, s.sheet.id, one(r, c), cell(r, c), s.grid, view);

// The sheet's filter over D1:D3.
const SHEET_FILTER = { r1: 's0r0', c1: 's0c3', r2: 's0r2', c2: 's0c3', conds: {} };

describe('Filter by Cell Value', () => {
  it('makes the sheet’s filter over Create a Filter’s range, the column keeping the cell’s value', () => {
    const s = withLayout({});
    expect(byValue(s, 1, 3)).toEqual({
      write: {
        kind: 'layout',
        changes: [{ k: 'filter', filter: { ...SHEET_FILTER, conds: { s0c3: { values: ['y'] } } } }],
      },
    });
  });

  it('sets the column’s condition alone on the sheet’s filter, dropping its condition and colour', () => {
    const s = withLayout({
      filter: {
        ...SHEET_FILTER,
        conds: { s0c3: { op: 'notEmpty', colour: { key: 'bg', is: '#ff0000' } } },
      },
    });
    expect(byValue(s, 2, 3)).toEqual({
      write: {
        kind: 'layout',
        changes: [{ k: 'filterCond', col: 's0c3', cond: { values: ['z'] } }],
      },
    });
  });

  it('filters by the value as shown, a number by its format', () => {
    const s = withLayout({});
    expect(byValue(s, 1, 0)).toEqual({
      write: {
        kind: 'layout',
        changes: [
          {
            k: 'filter',
            filter: {
              r1: 's0r0',
              c1: 's0c0',
              r2: 's0r2',
              c2: 's0c1',
              conds: { s0c0: { values: ['pen'] } },
            },
          },
        ],
      },
    });
    const n = byValue(s, 2, 1);
    expect(n && 'write' in n && n.write.kind === 'layout' && n.write.changes[0]).toMatchObject({
      filter: { conds: { s0c1: { values: ['2'] } } },
    });
  });

  it('turns the filter on alone from its header row', () => {
    const s = withLayout({});
    expect(byValue(s, 0, 3)).toEqual({
      write: { kind: 'layout', changes: [{ k: 'filter', filter: SHEET_FILTER }] },
    });
    expect(byValue(withLayout({ filter: SHEET_FILTER }), 0, 3)).toBeNull();
  });

  it('refuses a cell outside the sheet’s filter, changing nothing', () => {
    const s = withLayout({ filter: SHEET_FILTER });
    expect(byValue(s, 1, 2)).toEqual({ refused: FILTER_CELL_OUTSIDE });
    expect(FILTER_CELL_OUTSIDE).toBe('This cell is outside the filter');
  });

  it('refuses a range over part of a table, as Create a Filter', () => {
    const s = withLayout({}, [TABLE]);
    expect(
      filterByCellValue(s.wb, s.sheet.id, { r1: 0, c1: 1, r2: 2, c2: 3 }, cell(1, 3), s.grid, null),
    ).toEqual({ refused: "This range overlaps Table1: use the table's filter" });
  });

  it('turns a table’s own filter on with the column’s condition, in one write', () => {
    const s = withLayout({}, [TABLE]);
    expect(byValue(s, 2, 0)).toEqual({
      write: {
        kind: 'layout',
        changes: [
          { k: 'table', id: 'tbl001', table: { ...TABLE, filter: { s0c0: { values: ['ink'] } } } },
        ],
      },
    });
    expect(byValue(s, 0, 0)).toEqual({
      write: {
        kind: 'layout',
        changes: [{ k: 'table', id: 'tbl001', table: { ...TABLE, filter: {} } }],
      },
    });
  });

  it('sets the column’s condition on a table’s filter already on, the sheet’s filter elsewhere untouched', () => {
    const s = withLayout({ filter: SHEET_FILTER }, [
      { ...TABLE, filter: { s0c1: { op: 'empty' } } },
    ]);
    expect(byValue(s, 1, 0)).toEqual({
      write: {
        kind: 'layout',
        changes: [{ k: 'tfilterCond', id: 'tbl001', col: 's0c0', cond: { values: ['pen'] } }],
      },
    });
    expect(byValue(s, 0, 1)).toBeNull();
  });

  it('turns a table’s filter on from its total row, filtering nothing', () => {
    const s = withLayout({}, [{ ...TABLE, total: true as const }]);
    expect(byValue(s, 2, 0)).toEqual({
      write: {
        kind: 'layout',
        changes: [{ k: 'table', id: 'tbl001', table: { ...TABLE, total: true, filter: {} } }],
      },
    });
  });

  it('sets the open view’s condition, never the sheet’s nor a table’s', () => {
    const s = withLayout({ filter: SHEET_FILTER }, [{ ...TABLE, filter: {} }]);
    const view: DrawnFilter = { r1: 's0r0', c1: 's0c0', r2: 's0r2', c2: 's0c3', conds: {} };
    expect(byValue(s, 2, 3, view)).toEqual({ view: { colId: 's0c3', cond: { values: ['z'] } } });
    expect(byValue(s, 1, 0, view)).toEqual({ view: { colId: 's0c0', cond: { values: ['pen'] } } });
    expect(byValue(s, 0, 0, view)).toBeNull();
    expect(byValue(s, 1, 4, view)).toEqual({ refused: FILTER_CELL_OUTSIDE });
  });
});

describe('the filter over a cell (Ctrl+Alt+R)', () => {
  it('names the sheet’s filter over the cell, its header row included', () => {
    const { sheet } = withLayout({ filter: SHEET_FILTER });
    expect(filterAtCell(sheet.layout, cell(0, 3), null)).toEqual({ kind: 'sheet', colId: 's0c3' });
    expect(filterAtCell(sheet.layout, cell(2, 3), null)).toEqual({ kind: 'sheet', colId: 's0c3' });
    expect(filterAtCell(sheet.layout, cell(3, 3), null)).toBeNull();
    expect(filterAtCell(sheet.layout, cell(1, 2), null)).toBeNull();
  });

  it('names a table’s filter while on, its total row apart', () => {
    const on: SheetTable = { ...TABLE, total: true, filter: {} };
    const { sheet } = withLayout({}, [on]);
    expect(filterAtCell(sheet.layout, cell(1, 1), null)).toEqual({
      kind: 'table',
      tableId: 'tbl001',
      colId: 's0c1',
    });
    expect(filterAtCell(sheet.layout, cell(2, 1), null)).toBeNull();
    const off = withLayout({}, [TABLE]);
    expect(filterAtCell(off.sheet.layout, cell(1, 1), null)).toBeNull();
  });

  it('names the open view alone, a paused table filter never', () => {
    const { sheet } = withLayout({ filter: SHEET_FILTER }, [{ ...TABLE, filter: {} }]);
    const view: DrawnFilter = { r1: 's0r1', c1: 's0c3', r2: 's0r2', c2: 's0c3', conds: {} };
    expect(filterAtCell(sheet.layout, cell(1, 3), view)).toEqual({ kind: 'view', colId: 's0c3' });
    expect(filterAtCell(sheet.layout, cell(0, 3), view)).toBeNull();
    expect(filterAtCell(sheet.layout, cell(1, 0), view)).toBeNull();
  });
});
