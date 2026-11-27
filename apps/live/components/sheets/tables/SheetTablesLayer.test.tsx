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

describe('the tables layer', () => {
  it('draws a chip a table, which puts the active cell in it and opens Table Settings', async () => {
    const h = await harness();
    const t = table(h);
    act(() => {
      h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
    });
    const open = vi.fn();
    renderSheet(h, () => (
      <TableSettingsContext.Provider value={open}>
        <SheetTablesLayer />
      </TableSettingsContext.Provider>
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Sales table settings' }));
    expect(open).toHaveBeenCalledWith('tbl001');
    expect(h.ctl().selection.active).toEqual({ r: 1, c: 1 });
  });

  it('draws nothing without the panel to open, or without tables', async () => {
    const h = await harness();
    renderSheet(h, () => (
      <TableSettingsContext.Provider value={vi.fn()}>
        <SheetTablesLayer />
      </TableSettingsContext.Provider>
    ));
    expect(screen.queryByRole('button', { name: /table settings/ })).toBeNull();
    cleanup();
    const t = table(h, 0, 1);
    act(() => {
      h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
    });
    renderSheet(h, () => <SheetTablesLayer />);
    expect(screen.queryByRole('button', { name: 'Sales table settings' })).toBeNull();
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
