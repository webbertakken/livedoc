// @vitest-environment jsdom
// The Pivot Table Editor (docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor"): the Range, Suggested, and Rows,
// Columns, Values and Filters, each with Add and its entries' options; each change writes the pivot table whole.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetPivot } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { PIVOT_RANGE_WHY } from '@/lib/spreadsheet/pivot-create';
import { PIVOT_GONE, PivotEditorBody } from './PivotEditorBody';

beforeAll(stubResizeObserver);
afterEach(cleanup);

const pivotOf = (h: SheetHarness) =>
  h.store.sheet(SHEET_ID)!.layout.objects?.[0] as SheetPivot | undefined;

async function open(fields: Partial<SheetPivot> = {}) {
  const h = await makeSheet({
    rows: 12,
    cols: 8,
    cells: {
      A1: 'Region',
      B1: 'Units',
      C1: 'Rep',
      A2: 'East',
      B2: '5',
      C2: 'Ann',
      A3: 'West',
      B3: '3',
      C3: 'Bo',
      A4: 'East',
      B4: '2',
    },
  });
  const onClose = vi.fn();
  const write = (next: SheetPivot | null) =>
    h.ctl().write(
      { kind: 'layout', changes: [{ k: 'object', id: 'pivot1', object: next }] },
      'PivotTable',
    );
  renderSheet(h, () => (
    <PivotEditorBody pivotId="pivot1" onChange={(next) => write(next)} onClose={onClose} />
  ));
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  act(() => {
    write({
      id: 'pivot1',
      kind: 'pivot',
      at: { r: rows[0]!, c: cols[5]! },
      source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[2]! },
      ...fields,
    });
  });
  return { h, onClose, write, cols, rows };
}

const add = (section: string, column: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Add ${section}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: column }));
};

describe('the Pivot Table Editor', () => {
  it('says so when the pivot table is gone', async () => {
    const { write } = await open();
    act(() => void write(null));
    expect(screen.getByText(PIVOT_GONE)).toBeTruthy();
  });

  it('adds rows, columns, values and filters from the source’s columns, the output landing', async () => {
    const { h, cols } = await open();
    add('Rows', 'Region');
    // Rows and Columns list only the columns in neither.
    fireEvent.click(screen.getByRole('button', { name: 'Add Columns' }));
    expect(screen.queryByRole('menuitem', { name: 'Region' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rep' }));
    add('Values', 'Units');
    add('Values', 'Rep');
    add('Filters', 'Region');
    expect(pivotOf(h)).toMatchObject({
      rows: [{ col: cols[0] }],
      columns: [{ col: cols[2] }],
      values: [
        { col: cols[1], summary: 'SUM' },
        { col: cols[2], summary: 'COUNTA' },
      ],
      filters: [{ col: cols[0], cond: {} }],
    });
    expect(h.ctl().workbook.value(SHEET_ID, 0, 5)).not.toBeNull();
  });

  it('sets a group’s order, sort, totals and repeated labels, and removes it', async () => {
    const { h, cols } = await open();
    add('Rows', 'Region');
    add('Values', 'Units');
    const entry = screen.getByRole('group', { name: 'Region' });
    fireEvent.change(within(entry).getByRole('combobox', { name: 'Region Order' }), {
      target: { value: 'desc' },
    });
    fireEvent.change(within(entry).getByRole('combobox', { name: 'Region Sort By' }), {
      target: { value: '0' },
    });
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'Show Totals' }));
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'Repeat Row Labels' }));
    expect(pivotOf(h)!.rows).toEqual([
      { col: cols[0], desc: true, sortBy: { value: 0 }, totals: false, repeat: true },
    ]);
    fireEvent.change(within(entry).getByRole('combobox', { name: 'Region Order' }), {
      target: { value: 'asc' },
    });
    fireEvent.change(within(entry).getByRole('combobox', { name: 'Region Sort By' }), {
      target: { value: '' },
    });
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'Show Totals' }));
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'Repeat Row Labels' }));
    expect(pivotOf(h)!.rows).toEqual([{ col: cols[0] }]);
    fireEvent.click(within(entry).getByRole('button', { name: 'Remove Region' }));
    expect(pivotOf(h)).not.toHaveProperty('rows');
  });

  it('sets a value’s summary and Show As, and values as rows', async () => {
    const { h, cols } = await open();
    add('Values', 'Units');
    const entry = screen.getByRole('group', { name: 'SUM of Units' });
    fireEvent.change(within(entry).getByRole('combobox', { name: 'SUM of Units Summarise By' }), {
      target: { value: 'MAX' },
    });
    const maxEntry = screen.getByRole('group', { name: 'MAX of Units' });
    fireEvent.change(within(maxEntry).getByRole('combobox', { name: 'MAX of Units Show As' }), {
      target: { value: 'total' },
    });
    expect(pivotOf(h)!.values).toEqual([{ col: cols[1], summary: 'MAX', showAs: 'total' }]);
    fireEvent.change(within(maxEntry).getByRole('combobox', { name: 'MAX of Units Show As' }), {
      target: { value: '' },
    });
    expect(pivotOf(h)!.values).toEqual([{ col: cols[1], summary: 'MAX' }]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Values As' }), {
      target: { value: 'rows' },
    });
    expect(pivotOf(h)!.valuesAsRows).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Values As' }), {
      target: { value: 'columns' },
    });
    expect(pivotOf(h)).not.toHaveProperty('valuesAsRows');
  });

  it('names a calculated field and offers Custom', async () => {
    await open({ values: [{ formula: '=Units*2', summary: 'SUM', name: 'Double' }] });
    const entry = screen.getByRole('group', { name: 'Double' });
    expect(within(entry).getByRole('option', { name: 'CUSTOM' })).toBeTruthy();
  });

  it('filters by the items ticked, all of them again, or none', async () => {
    const { h, cols } = await open();
    add('Filters', 'Region');
    const entry = screen.getByRole('group', { name: 'Region' });
    expect(within(entry).getByText('Showing all items')).toBeTruthy();
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'West' }));
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[0], cond: { values: ['East'] } }]);
    expect(within(entry).getByText('Showing 1 item')).toBeTruthy();
    fireEvent.click(within(entry).getByRole('checkbox', { name: 'West' }));
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[0], cond: {} }]);
    fireEvent.click(within(entry).getByRole('button', { name: 'Clear' }));
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[0], cond: { values: [] } }]);
    fireEvent.click(within(entry).getByRole('button', { name: 'Select All' }));
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[0], cond: {} }]);
  });

  it('shows a filter by condition or formula by its status alone', async () => {
    const { cols } = await open();
    cleanup();
    const again = await open({
      filters: [
        { col: cols[1]!, cond: { op: 'gt', a: '1' } },
        { col: cols[0]!, formula: '=Units>1' },
      ],
    });
    expect(again).toBeTruthy();
    expect(screen.getByText('Showing items by condition')).toBeTruthy();
    expect(screen.getByText('Showing items by formula')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select All' })).toBeNull();
  });

  it('picks a suggestion, replacing the fields', async () => {
    const { h, cols } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'SUM of Units for each Region' }));
    expect(pivotOf(h)).toMatchObject({
      rows: [{ col: cols[0] }],
      values: [{ col: cols[1], summary: 'SUM' }],
    });
  });

  it('reads a new range when left, keeping fields of its columns, and refuses one that does not read', async () => {
    const { h, cols, rows } = await open();
    add('Rows', 'Rep');
    add('Values', 'Units');
    const range = screen.getByRole<HTMLInputElement>('textbox', { name: 'Range' });
    expect(range.value).toBe("'Sheet 1'!A1:C4");
    fireEvent.change(range, { target: { value: 'nonsense' } });
    fireEvent.blur(range);
    expect(screen.getByRole('alert').textContent).toBe(PIVOT_RANGE_WHY);
    fireEvent.change(range, { target: { value: 'A1:B4' } });
    fireEvent.keyDown(range, { key: 'Enter' });
    expect(pivotOf(h)!.source).toEqual({ r1: rows[0], c1: cols[0], r2: rows[3], c2: cols[1] });
    expect(pivotOf(h)).not.toHaveProperty('rows');
    expect(pivotOf(h)!.values).toEqual([{ col: cols[1], summary: 'SUM' }]);
  });

  it('closes on Done', async () => {
    const { onClose } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
