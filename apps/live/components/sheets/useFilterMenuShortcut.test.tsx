// @vitest-environment jsdom
// data-tools.md "Filters, filter views and slicers" (D504): Ctrl+Alt+R opens the filter menu of the active cell's
// column when the cell lies in a filter's range, its header row included: a table's own while on, else the sheet's;
// elsewhere nothing.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetTable } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
} from '@/components/sheets/sheet-ui-test-utils';
import { SheetTablesLayer } from './tables/SheetTablesLayer';
import { TableSettingsContext } from './tables/table-settings-context';
import { FilterMenuContext, type FilterMenuOpener } from './useFilterMenuShortcut';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);

// Sales over B2:C4 with its filter on; the sheet's filter over E2:E4.
const CELLS = {
  B2: 'Item',
  C2: 'Amount',
  B3: 'pen',
  C3: '3',
  B4: 'ink',
  C4: '1',
  E2: 'x',
  E3: 'y',
  E4: 'z',
};

async function withFilters() {
  const h = await makeSheet({ cells: CELLS });
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  const t: SheetTable = {
    id: 'tbl001',
    name: 'Sales',
    r1: rows[1]!,
    c1: cols[1]!,
    r2: rows[3]!,
    c2: cols[2]!,
    filter: {},
  };
  act(() => {
    h.store.write(SHEET_ID, {
      kind: 'layout',
      changes: [
        { k: 'table', id: t.id, table: t },
        {
          k: 'filter',
          filter: { r1: rows[1]!, c1: cols[4]!, r2: rows[3]!, c2: cols[4]!, conds: {} },
        },
      ],
    });
  });
  const opener: FilterMenuOpener = { current: null };
  renderSheet(h, () => (
    <TableSettingsContext.Provider value={vi.fn()}>
      <FilterMenuContext.Provider value={opener}>
        <SheetTablesLayer />
      </FilterMenuContext.Provider>
    </TableSettingsContext.Provider>
  ));
  const press = (a1: string) => {
    act(() => h.select(a1));
    act(() => opener.current?.());
  };
  return { h, press, cols };
}

describe('Ctrl+Alt+R', () => {
  it('opens a table’s filter menu for the active cell’s column, its header included', async () => {
    const { press } = await withFilters();
    press('C3');
    expect(screen.getByRole('dialog', { name: 'Sales filter' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    press('B2');
    expect(screen.getByRole('dialog', { name: 'Sales filter' })).toBeTruthy();
  });

  it('opens the sheet’s filter menu for the active cell’s column', async () => {
    const { h, press, cols } = await withFilters();
    press('E4');
    expect(h.ctl().menu).toMatchObject({ kind: 'filter', colId: cols[4] });
  });

  it('opens the sheet’s filter menu on a sheet without tables', async () => {
    const h = await makeSheet({ cells: { A1: 'Fruit', A2: 'pear' } });
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    act(() => {
      h.store.write(SHEET_ID, {
        kind: 'layout',
        changes: [
          {
            k: 'filter',
            filter: { r1: rows[0]!, c1: cols[0]!, r2: rows[1]!, c2: cols[0]!, conds: {} },
          },
        ],
      });
    });
    const opener: FilterMenuOpener = { current: null };
    renderSheet(h, () => (
      <TableSettingsContext.Provider value={vi.fn()}>
        <FilterMenuContext.Provider value={opener}>
          <SheetTablesLayer />
        </FilterMenuContext.Provider>
      </TableSettingsContext.Provider>
    ));
    act(() => h.select('A2'));
    act(() => opener.current?.());
    expect(h.ctl().menu).toMatchObject({ kind: 'filter', colId: cols[0] });
  });

  it('does nothing outside every filter', async () => {
    const { h, press } = await withFilters();
    press('G7');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.ctl().menu).toBeNull();
  });
});
