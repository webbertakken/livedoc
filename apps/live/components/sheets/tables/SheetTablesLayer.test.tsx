// @vitest-environment jsdom
// data-tools.md "Tables": each table's chip opens Table Settings with the active cell in it; Convert to Table makes a
// table, or says why it cannot; Delete Table and Select Table act on it.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetTable } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
  type SheetParts,
} from '@/components/sheets/sheet-ui-test-utils';
import { SheetTablesLayer } from './SheetTablesLayer';
import { TableSettingsContext } from './table-settings-context';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);

const CELLS = { B2: 'Item', C2: 'Amount', B3: 'pen', C3: '1' };

async function harness(): Promise<SheetHarness> {
  return makeSheet({ cells: CELLS });
}

function table(h: SheetHarness, r1 = 1, r2 = 2): SheetTable {
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  return { id: 'tbl001', name: 'Sales', r1: rows[r1]!, c1: cols[1]!, r2: rows[r2]!, c2: cols[2]! };
}

// A menu's item: a button, or an aria-disabled span when dimmed.
const menuItem = (name: string) =>
  screen
    .getByText(name, { selector: 'button, [aria-disabled], button *, [aria-disabled] *' })
    .closest('button, [aria-disabled]') as HTMLElement;
const menuLabels = () =>
  ['Table Settings', 'Rename', 'Select Table', 'Filter', 'Convert to Range', 'Delete Table'].filter(
    (n) => screen.queryByText(n),
  );

function chips(h: SheetHarness, opts: { canShape?: boolean; filter?: SheetTable['filter'] } = {}) {
  const t = { ...table(h), ...(opts.filter ? { filter: opts.filter } : {}) };
  act(() => {
    h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
  });
  const open = vi.fn();
  renderSheet(
    h,
    () => (
      <TableSettingsContext.Provider value={open}>
        <SheetTablesLayer />
      </TableSettingsContext.Provider>
    ),
    { canShape: opts.canShape ?? true },
  );
  const chip = screen.getByRole('button', { name: 'Sales table menu' });
  expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
  fireEvent.click(chip);
  return { open, chip };
}

describe('the table chip and its menu', () => {
  it("opens Google's table menu; Table Settings puts the active cell in the table and opens the panel", async () => {
    const h = await harness();
    const { open, chip } = chips(h);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(menuLabels()).toEqual([
      'Table Settings',
      'Rename',
      'Select Table',
      'Filter',
      'Convert to Range',
      'Delete Table',
    ]);
    fireEvent.click(menuItem('Table Settings'));
    expect(open).toHaveBeenCalledWith('tbl001');
    expect(h.ctl().selection.active).toEqual({ r: 1, c: 1 });
    expect(menuLabels()).toEqual([]);
  });

  it('renames in place on the chip, refusing a name taken in a toast, Escape leaving it', async () => {
    const h = await harness();
    chips(h);
    fireEvent.click(menuItem('Rename'));
    const field = screen.getByRole('textbox', { name: 'Rename Sales' });
    fireEvent.change(field, { target: { value: 'Sales' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Rename Sales' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sales table menu' }));
    fireEvent.click(menuItem('Rename'));
    const again = screen.getByRole('textbox', { name: 'Rename Sales' });
    fireEvent.change(again, { target: { value: '1x' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(h.toast).toHaveBeenCalledWith(expect.stringMatching(/start with a letter/));
    expect(h.store.sheet(SHEET_ID)!.layout.tables![0]!.name).toBe('Sales');
    fireEvent.click(screen.getByRole('button', { name: 'Sales table menu' }));
    fireEvent.click(menuItem('Rename'));
    const last = screen.getByRole('textbox', { name: 'Rename Sales' });
    fireEvent.change(last, { target: { value: 'Q3 sales' } });
    fireEvent.blur(last);
    expect(h.store.sheet(SHEET_ID)!.layout.tables![0]!.name).toBe('Q3 sales');
  });

  it('selects the table, converts it to a range, and deletes it', async () => {
    const h = await harness();
    chips(h);
    fireEvent.click(menuItem('Select Table'));
    expect(h.ctl().selection.ranges[0]).toEqual({ r1: 1, c1: 1, r2: 2, c2: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Sales table menu' }));
    act(() => {
      fireEvent.click(menuItem('Convert to Range'));
    });
    expect(h.store.sheet(SHEET_ID)!.layout.tables).toBeUndefined();
    const g = await harness();
    chips(g);
    act(() => {
      fireEvent.click(menuItem('Delete Table'));
    });
    expect(g.store.sheet(SHEET_ID)!.layout.tables).toBeUndefined();
    expect(g.store.sheet(SHEET_ID)!.cells.size).toBe(0);
  });

  it("dims what changes the table for anyone but an Editor, as the panel's rules", async () => {
    const h = await harness();
    chips(h, { canShape: false });
    for (const name of ['Rename', 'Filter', 'Convert to Range', 'Delete Table'])
      expect(menuItem(name).getAttribute('aria-disabled')).toBe('true');
    expect(menuItem('Select Table').getAttribute('aria-disabled')).toBeNull();
  });

  // data-tools.md "A table's filter" (D481, D482): the menu's Filter turns it on and off, ticked while on; while on,
  // each header button is its column's filter button, its menu setting that column alone, Column Menu its way back.
  it('turns the table’s own filter on and off, ticked while on', async () => {
    const h = await harness();
    chips(h);
    expect(screen.getByRole('button', { name: 'Item column menu' })).toBeTruthy();
    fireEvent.click(menuItem('Filter'));
    const t = () => h.store.sheet(SHEET_ID)!.layout.tables![0]!;
    expect(t().filter).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: 'Sales table menu' }));
    expect(menuItem('Filter').textContent).toContain('✓');
    expect(menuItem('Filter').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(menuItem('Filter'));
    expect(t().filter).toBeUndefined();
  });

  it('filters a column from its header button, and opens the column menu from there', async () => {
    const h = await harness();
    chips(h, { filter: {} });
    const button = screen.getByRole('button', { name: 'Amount filter' });
    expect(button.hasAttribute('data-filtered')).toBe(false);
    fireEvent.click(button);
    expect(screen.getByText('Filter by Values')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /1/ }));
    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    const { cols } = h.store.sheet(SHEET_ID)!.layout;
    expect(h.store.sheet(SHEET_ID)!.layout.tables![0]!.filter).toEqual({
      [cols[2]!]: { values: [] },
    });
    const filtered = screen.getByRole('button', { name: 'Amount filter' });
    expect(filtered.hasAttribute('data-filtered')).toBe(true);
    fireEvent.click(filtered);
    fireEvent.click(menuItem('Column Menu'));
    expect(screen.getByText('Edit Column Type')).toBeTruthy();
  });

  it('draws nothing without the panel to open, or without tables', async () => {
    const h = await harness();
    renderSheet(h, () => (
      <TableSettingsContext.Provider value={vi.fn()}>
        <SheetTablesLayer />
      </TableSettingsContext.Provider>
    ));
    expect(screen.queryByRole('button', { name: /table menu/ })).toBeNull();
    cleanup();
    const t = table(h, 0, 1);
    act(() => {
      h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
    });
    renderSheet(h, () => <SheetTablesLayer />);
    expect(screen.queryByRole('button', { name: /table menu/ })).toBeNull();
  });
});

// Each action in its own act, so the parts read the sheet as it then is.
function run<T>(fn: () => T): T {
  let out!: T;
  act(() => {
    out = fn();
  });
  return out;
}

describe('the table actions', () => {
  let parts: SheetParts;
  const capture = (p: SheetParts) => {
    parts = p;
    return null;
  };

  it('converts the data around the active cell, and refuses over another table with its words', async () => {
    const h = await harness();
    renderSheet(h, capture, { at: 'C3' });
    const made = run(() => parts.actions.convertToTable());
    expect(made).toMatchObject({ name: 'Table1' });
    expect(parts.actions.activeTable()?.id).toBe(made!.id);
    expect(run(() => parts.actions.convertToTable())).toBeNull();
    expect(h.toast).toHaveBeenCalledWith("Tables can't overlap");
  });

  it('converts nothing on a one-row sheet, selects a table, deletes it, converts it to a range', async () => {
    const h = await makeSheet({ rows: 1, cells: { A1: 'x' } });
    renderSheet(h, capture, { at: 'A1' });
    expect(run(() => parts.actions.convertToTable())).toBeNull();
    const g = await harness();
    renderSheet(g, capture, { at: 'A1' });
    const t = table(g);
    act(() => {
      g.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
    });
    run(() => parts.actions.selectTable('tbl001'));
    expect(g.ctl().selection.ranges[0]).toEqual({ r1: 1, c1: 1, r2: 2, c2: 2 });
    run(() => parts.actions.selectTable('nope01'));
    expect(run(() => parts.actions.deleteTable('nope01'))).toBe(false);
    expect(run(() => parts.actions.convertToRange('nope01'))).toBe(false);
    expect(run(() => parts.actions.setTotalRow('nope01', true))).toBe(false);
    expect(run(() => parts.actions.convertToRange('tbl001'))).toBe(true);
    expect(g.store.sheet(SHEET_ID)!.layout.tables).toBeUndefined();
  });

  it('refuses a total row with no room below, in a toast', async () => {
    const h = await makeSheet({ cells: { ...CELLS, C4: 'busy' } });
    renderSheet(h, capture, { at: 'B2' });
    const t = table(h);
    act(() => {
      h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
    });
    expect(run(() => parts.actions.setTotalRow('tbl001', true))).toBe(false);
    expect(h.toast).toHaveBeenCalledWith('Make room below the table for its total row');
  });

  it("moves a table's banding with its range and its footer with its total row", async () => {
    const h = await harness();
    renderSheet(h, capture, { at: 'C3' });
    const made = run(() => parts.actions.convertToTable())!;
    const { rows } = h.store.sheet(SHEET_ID)!.layout;
    run(() => parts.actions.setTable({ ...made, r2: rows[4]! }));
    const band = () => h.store.sheet(SHEET_ID)!.layout.bands![0]!;
    expect(band().r2).toBe(rows[4]);
    run(() => parts.actions.setTable({ ...made, r2: rows[4]!, total: true }));
    expect(band().footer).toBe(true);
    run(() => parts.actions.setTable({ ...made, r2: rows[4]! }));
    expect(band().footer).toBeUndefined();
  });
});
