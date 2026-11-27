// @vitest-environment jsdom
// data-tools.md "Tables" "Column menu": each header cell's ▾ button (and Ctrl+Alt+\ on a cell of the table) opens its
// column's menu: Edit Column Type (a Dropdown's options in the rule's form), Sort A to Z and Z to A over the data rows,
// Insert 1 Column Left and Right (joining the table at its edges, D450), Delete Sheet Column; an Editor's alone.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetTable } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { SheetTablesLayer } from './SheetTablesLayer';
import {
  TableColumnMenuContext,
  TableSettingsContext,
  type TableColumnMenuOpener,
} from './table-settings-context';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);

const CELLS = {
  B2: 'Item',
  C2: 'Amount',
  B3: 'pen',
  C3: '3',
  B4: 'ink',
  C4: '1',
  B5: 'cap',
  C5: '2',
};

const menuItem = (name: string) =>
  screen
    .getByText(name, { selector: 'button, [aria-disabled], button *, [aria-disabled] *' })
    .closest('button, [aria-disabled]') as HTMLElement;
const MAIN = [
  'Edit Column Type',
  'Sort A to Z',
  'Sort Z to A',
  'Insert 1 Column Left',
  'Insert 1 Column Right',
  'Delete Sheet Column',
];

async function withTable(opts: { canShape?: boolean } = {}) {
  const h = await makeSheet({ cells: CELLS });
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  const t: SheetTable = {
    id: 'tbl001',
    name: 'Sales',
    r1: rows[1]!,
    c1: cols[1]!,
    r2: rows[4]!,
    c2: cols[2]!,
  };
  act(() => {
    h.store.write(SHEET_ID, { kind: 'layout', changes: [{ k: 'table', id: t.id, table: t }] });
  });
  const opener: TableColumnMenuOpener = { current: null };
  renderSheet(
    h,
    () => (
      <TableSettingsContext.Provider value={vi.fn()}>
        <TableColumnMenuContext.Provider value={opener}>
          <SheetTablesLayer />
        </TableColumnMenuContext.Provider>
      </TableSettingsContext.Provider>
    ),
    { canShape: opts.canShape ?? true },
  );
  const table = () => h.store.sheet(SHEET_ID)!.layout.tables?.[0];
  const open = (column: string) =>
    fireEvent.click(screen.getByRole('button', { name: `${column} column menu` }));
  const pick = (name: string) =>
    act(() => {
      fireEvent.click(menuItem(name));
    });
  return { h, opener, table, open, pick };
}

const shown = () => MAIN.filter((n) => screen.queryByText(n));
const column = (h: SheetHarness, letter: string) => [3, 4, 5].map((r) => h.value(`${letter}${r}`));

describe('the table column menu', () => {
  it("opens under each header cell's button, named by its column, Google's items in order", async () => {
    const { open } = await withTable();
    expect(screen.getByRole('button', { name: 'Item column menu' })).toBeTruthy();
    open('Amount');
    expect(screen.getByRole('dialog', { name: 'Amount column menu' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Amount column menu' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(shown()).toEqual(MAIN);
  });

  it('sorts the data rows by the column, A to Z and Z to A, the header staying', async () => {
    const { h, open, pick } = await withTable();
    open('Amount');
    pick('Sort A to Z');
    expect(column(h, 'B')).toEqual(['ink', 'cap', 'pen']);
    expect(h.value('B2')).toBe('Item');
    expect(h.announce).toHaveBeenCalledWith('Sorted A to Z');
    open('Item');
    pick('Sort Z to A');
    expect(column(h, 'B')).toEqual(['pen', 'ink', 'cap']);
    expect(shown()).toEqual([]);
  });

  it('inserts a column beside the first and last, joining the table, and deletes one', async () => {
    const { h, open, pick, table } = await withTable();
    const at = (id: string | undefined) => h.store.sheet(SHEET_ID)!.layout.cols.indexOf(id!);
    open('Item');
    pick('Insert 1 Column Left');
    expect([at(table()?.c1), at(table()?.c2)]).toEqual([1, 3]);
    open('Amount');
    pick('Insert 1 Column Right');
    expect([at(table()?.c1), at(table()?.c2)]).toEqual([1, 4]);
    open('Amount');
    pick('Delete Sheet Column');
    expect([at(table()?.c1), at(table()?.c2)]).toEqual([1, 3]);
    expect(h.value('C2')).toBe('Item');
  });

  it("sets a type from the list, the column's own ticked, and goes back", async () => {
    const { open, pick, table } = await withTable();
    open('Amount');
    pick('Edit Column Type');
    expect(screen.getByRole('group', { name: 'Column types' })).toBeTruthy();
    pick('Back');
    expect(shown()).toEqual(MAIN);
    pick('Edit Column Type');
    pick('Number');
    expect(table()?.types).toEqual({ [table()!.c2]: 'number' });
    open('Amount');
    pick('Edit Column Type');
    expect(menuItem('Number').textContent).toContain('✓');
    pick('None');
    expect(table()?.types).toBeUndefined();
  });

  it("edits a Dropdown's options in the rule's form, refusing none, Cancel going back", async () => {
    const { open, pick, table } = await withTable();
    open('Item');
    pick('Edit Column Type');
    pick('Dropdown');
    const options = screen.getAllByRole<HTMLInputElement>('textbox', { name: /^Option \d/ });
    expect(options.map((o) => o.value)).toEqual(['pen', 'ink', 'cap']);
    fireEvent.change(options[1]!, { target: { value: 'nib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove cap' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(table()?.types).toEqual({ [table()!.c1]: 'dropdown' });
    expect(table()?.opts).toEqual({ [table()!.c1]: [{ v: 'pen' }, { v: 'nib' }] });
    open('Item');
    pick('Edit Column Type');
    pick('Dropdown');
    for (const name of ['Remove pen', 'Remove nib'])
      fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('alert').textContent).toBe('Add at least one option');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('group', { name: 'Column types' })).toBeTruthy();
    expect(table()?.opts).toEqual({ [table()!.c1]: [{ v: 'pen' }, { v: 'nib' }] });
  });

  it('dims every item for anyone but an Editor', async () => {
    const { open } = await withTable({ canShape: false });
    open('Amount');
    for (const name of MAIN) expect(menuItem(name).getAttribute('aria-disabled')).toBe('true');
  });

  it("opens the active cell's column's menu by the shortcut's opener, nothing outside a table", async () => {
    const { h, opener } = await withTable();
    act(() => h.select('C4'));
    act(() => opener.current?.());
    expect(screen.getByRole('dialog', { name: 'Amount column menu' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => h.select('E7'));
    act(() => opener.current?.());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
