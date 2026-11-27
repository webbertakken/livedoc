// @vitest-environment jsdom
// The Pivot Table Editor (docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor"): the Range, Suggested, and Rows,
// Columns, Values and Filters, each with Add and its entries' options; each change writes the pivot table whole.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { PIVOT_FORMULA_WHY } from './PivotEntries';
import { PivotAddMenu } from './PivotAddMenu';

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
    h
      .ctl()
      .write(
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

  it('filters by a condition beside the ticked items, written as its fields are left', async () => {
    const { h, cols } = await open();
    add('Filters', 'Units');
    const entry = screen.getByRole('group', { name: 'Units' });
    fireEvent.click(within(entry).getByRole('checkbox', { name: '2' }));
    const condition = within(entry).getByRole('combobox', { name: 'Condition' });
    fireEvent.change(condition, { target: { value: 'gt' } });
    // No date periods here: a pivot table's output reads no day as today.
    fireEvent.change(condition, { target: { value: 'dateOn' } });
    expect(within(entry).queryByRole('combobox', { name: 'Date' })).toBeNull();
    fireEvent.change(condition, { target: { value: 'gt' } });
    const value = within(entry).getByRole('textbox', { name: 'Value' });
    fireEvent.change(value, { target: { value: '3' } });
    fireEvent.keyDown(value, { key: 'a' });
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[1], cond: { values: ['3', '5'] } }]);
    fireEvent.blur(value);
    expect(pivotOf(h)!.filters).toEqual([
      { col: cols[1], cond: { values: ['3', '5'], op: 'gt', a: '3' } },
    ]);
    expect(within(entry).getByText('Showing items by condition')).toBeTruthy();
    // Moving between its own fields writes nothing more; Select All keeps the condition.
    fireEvent.blur(condition, { relatedTarget: value });
    fireEvent.click(within(entry).getByRole('button', { name: 'Select All' }));
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[1], cond: { op: 'gt', a: '3' } }]);
    // A condition taking no value is written as it is picked.
    fireEvent.change(condition, { target: { value: 'notEmpty' } });
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[1], cond: { op: 'notEmpty' } }]);
    fireEvent.change(condition, { target: { value: '' } });
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[1], cond: {} }]);
  });

  it('keeps a blank item as the empty text it shows', async () => {
    const { h, cols } = await open();
    add('Filters', 'Rep');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Rep' })).getByRole('checkbox', {
        name: '(Blanks)',
      }),
    );
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[2], cond: { values: ['Ann', 'Bo'] } }]);
  });

  it('filters by a custom formula over column names in the items’ place, an empty one unwritten', async () => {
    const { h, cols } = await open();
    add('Filters', 'Region');
    const entry = screen.getByRole('group', { name: 'Region' });
    fireEvent.change(within(entry).getByRole('combobox', { name: 'Condition' }), {
      target: { value: 'formula' },
    });
    const formula = within(entry).getByRole('textbox', { name: 'Formula' });
    expect(formula.getAttribute('placeholder')).toBe('=Units>8');
    fireEvent.keyDown(formula, { key: 'Enter' });
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[0], cond: {} }]);
    fireEvent.change(formula, { target: { value: 'Units>2' } });
    fireEvent.keyDown(formula, { key: 'Enter' });
    expect(pivotOf(h)!.filters).toEqual([{ col: cols[0], formula: '=Units>2' }]);
    expect(within(entry).getByText('Showing items by formula')).toBeTruthy();
    expect(within(entry).queryByRole('button', { name: 'Select All' })).toBeNull();
  });

  it('adds a calculated field, its formula read when left, refusing one without =', async () => {
    const { h } = await open();
    add('Values', 'Units');
    add('Values', 'Calculated Field');
    expect(pivotOf(h)!.values![1]).toEqual({
      formula: '=0',
      summary: 'SUM',
      name: 'Calculated Field 1',
    });
    const entry = screen.getByRole('group', { name: 'Calculated Field 1' });
    const formula = within(entry).getByRole('textbox', { name: 'Calculated Field 1 Formula' });
    fireEvent.change(formula, { target: { value: 'Units*2' } });
    fireEvent.blur(formula);
    expect(within(entry).getByRole('alert').textContent).toBe(PIVOT_FORMULA_WHY);
    expect(pivotOf(h)!.values![1]).toMatchObject({ formula: '=0' });
    fireEvent.change(formula, { target: { value: " ='Units'*2 " } });
    fireEvent.keyDown(formula, { key: 'a' });
    expect(pivotOf(h)!.values![1]).toMatchObject({ formula: '=0' });
    expect(within(entry).queryByRole('alert')).toBeNull();
    fireEvent.keyDown(formula, { key: 'Enter' });
    expect(pivotOf(h)!.values![1]).toMatchObject({ formula: "='Units'*2" });
    // Unchanged, nothing is written.
    const before = h.writes.length;
    fireEvent.blur(formula);
    expect(h.writes.length).toBe(before);
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

describe('a section’s Add', () => {
  it('stays open with no columns while it offers Calculated Field', () => {
    const onPick = vi.fn();
    render(
      <PivotAddMenu
        section="Values"
        columns={[]}
        onPick={() => {}}
        extra={{ label: 'Calculated Field', onPick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Values' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Calculated Field' }));
    expect(onPick).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    cleanup();
    render(<PivotAddMenu section="Rows" columns={[]} onPick={() => {}} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add Rows' }).disabled).toBe(true);
  });
});
