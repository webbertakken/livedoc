// @vitest-environment jsdom
// data-tools.md "Tables": Table Settings on the table holding the active cell — its name, range, column types, total
// row, Select Table, Convert to Range and Delete Table, each one write; read-only for anyone but an Editor.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readTypedInput, renderFormula, TABLE_NAME_TAKEN, type SheetTable } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { OpenPanels } from '@/lib/office/office-panels';
import type { OfficePanelsState } from '@/lib/office/useOfficePanels';
import { SpreadsheetRightPanel } from './SpreadsheetRightPanel';
import { NO_TABLE, TABLE_RANGE_UNREAD } from './SpreadsheetTableSettingsBody';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);

const panels = (): OfficePanelsState => ({
  open: { ...OpenPanels.none, right: 'table-settings' },
  actions: {},
  close: vi.fn(),
  reveal: vi.fn(),
  focusNonce: 0,
  width: 360,
  setWidth: vi.fn(),
  saveWidth: vi.fn(),
});

const CELLS = {
  A1: 'Item',
  B1: 'Amount',
  A2: 'pen',
  B2: '1',
  A3: 'ink',
  B3: '2',
};

async function withTable(h?: SheetHarness) {
  const harness = h ?? (await makeSheet({ cells: CELLS }));
  const { rows, cols } = harness.store.sheet(SHEET_ID)!.layout;
  const table: SheetTable = {
    id: 'tbl001',
    name: 'Sales',
    r1: rows[0]!,
    c1: cols[0]!,
    r2: rows[2]!,
    c2: cols[1]!,
  };
  harness.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: table.id, table }] });
  // A formula reading it, typed once it is there.
  const read = readTypedInput(
    '=SUM(Sales[Amount])',
    'en-GB',
    harness.store.workbook('t1').ctxFor(SHEET_ID),
  );
  if (read.kind !== 'value') throw new Error('unread');
  harness.store.write(SHEET_ID, {
    kind: 'cells',
    cells: [{ r: rows[0]!, c: cols[3]!, i: read.input }],
  });
  return { h: harness, table };
}

function show(h: SheetHarness, opts: { canShape?: boolean; at?: string } = {}) {
  const p = panels();
  renderSheet(h, ({ actions }) => <SpreadsheetRightPanel panels={p} actions={actions} />, {
    canShape: opts.canShape ?? true,
    at: opts.at ?? 'A2',
  });
  return p;
}

const field = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
const commit = (name: string, value: string) => {
  fireEvent.change(field(name), { target: { value } });
  fireEvent.keyDown(field(name), { key: 'Enter' });
};
const tableOf = (h: SheetHarness) => h.store.sheet(SHEET_ID)!.layout.tables?.[0];

describe('the Table Settings panel', () => {
  it('says so outside a table', async () => {
    const h = await makeSheet({ cells: CELLS });
    show(h, { at: 'E5' });
    expect(screen.getByText(NO_TABLE)).toBeTruthy();
  });

  it('renames the table, refusing a name taken, and formulas follow', async () => {
    const { h } = await withTable();
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    h.store.write(SHEET_ID, {
      kind: 'layout',
      changes: [
        {
          k: 'name',
          name: 'Rates',
          range: { r1: rows[6]!, c1: cols[0]!, r2: rows[6]!, c2: cols[0]! },
        },
      ],
    });
    show(h);
    commit('Table Name', 'rates');
    expect(screen.getByRole('alert').textContent).toBe(TABLE_NAME_TAKEN);
    expect(tableOf(h)?.name).toBe('Sales');
    commit('Table Name', 'Q3 sales');
    expect(tableOf(h)?.name).toBe('Q3 sales');
    const formula = h.store.sheet(SHEET_ID)!.cells.get(`${rows[0]}:${cols[3]}`)!.input as {
      f: never;
    };
    expect(renderFormula(formula.f, h.store.workbook('t1').ctxFor(SHEET_ID))).toBe(
      '=SUM(Q3_sales[Amount])',
    );
  });

  it("changes the range, refusing one it cannot read, and sets a column's type", async () => {
    const { h } = await withTable();
    show(h);
    commit('Range', 'A1');
    expect(screen.getByRole('alert').textContent).toBe(TABLE_RANGE_UNREAD);
    commit('Range', 'A1:B5');
    expect(tableOf(h)?.r2).toBe(h.store.sheet(SHEET_ID)!.layout.rows[4]);
    fireEvent.change(screen.getByLabelText('Amount type'), { target: { value: 'currency' } });
    expect(tableOf(h)?.types).toEqual({ [tableOf(h)!.c2]: 'currency' });
    fireEvent.change(screen.getByLabelText('Amount type'), { target: { value: 'none' } });
    expect(tableOf(h)?.types).toBeUndefined();
  });

  it('turns the total row on and off, selects the table, converts it to a range', async () => {
    const { h } = await withTable();
    const p = show(h);
    fireEvent.click(screen.getByRole('switch', { name: 'Total Row' }));
    expect(tableOf(h)?.total).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Total Row' }));
    expect(tableOf(h)?.total).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Select Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Table Formatting' }));
    expect(p.reveal).toHaveBeenCalledWith(expect.objectContaining({ id: 'alternating-colours' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Convert to Range' }));
    });
    expect(tableOf(h)).toBeUndefined();
    expect(p.close).toHaveBeenCalled();
  });

  it('deletes the table with its cells', async () => {
    const { h } = await withTable();
    show(h);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Table' }));
    expect(tableOf(h)).toBeUndefined();
    expect(h.store.sheet(SHEET_ID)!.cells.size).toBe(1);
    expect(screen.queryByText('Sales')).toBeNull();
  });

  it('is read-only for anyone but an Editor', async () => {
    const { h } = await withTable();
    show(h, { canShape: false });
    expect(field('Table Name').readOnly).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>('Amount type').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Delete Table' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select Table' })).toBeTruthy();
  });
});
