// @vitest-environment jsdom
// Grouping a pivot table's items from the grid (docs/specs/029-sheets/pivot-tables.md "Grouping in the grid", D621):
// the bindings an item cell offers an Editor, each rewriting the pivot table, and the Pivot Group Rule dialog.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetPivot, SheetPivotGroup } from '@livedoc/sheets';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { usePivotGrouping } from './usePivotGrouping';
import { useSpreadsheetPivots } from './useSpreadsheetPivots';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

beforeAll(stubResizeObserver);
afterEach(cleanup);

const DATA = {
  A1: 'Region',
  B1: 'Units',
  C1: 'Day',
  A2: 'East',
  B2: '5',
  C2: '15/01/2025',
  A3: 'West',
  B3: '3',
  C3: '20/03/2025',
};
const pivotOf = (h: SheetHarness) =>
  (h.store.sheet(SHEET_ID)!.layout.objects ?? []).find((x): x is SheetPivot => x.kind === 'pivot')!;

// The pivot table at E1 over A1:C3, its rows the column at `row` of the source, summing Units.
async function setup(row: number, opts: { canShape?: boolean } = {}) {
  const h = await makeSheet({ rows: 12, cols: 10, cells: DATA });
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[4]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[2]! },
    rows: [{ col: cols[row]! }],
    values: [{ col: cols[1]!, summary: 'SUM' }],
  };
  let actions: Record<string, OfficeAction> = {};
  renderSheet(
    h,
    ({ c }) => {
      const p = useSpreadsheetPivots(c, null, () => {});
      const g = usePivotGrouping(c, p.change);
      actions = g.actions;
      return <>{g.dialog}</>;
    },
    opts,
  );
  act(() => {
    h.store.write(SHEET_ID, {
      kind: 'layout',
      changes: [{ k: 'object', id: pivot.id, object: pivot }],
    });
  });
  return {
    h,
    cols,
    ids: () => Object.keys(actions).sort(),
    run: (id: string) => act(() => actions[id]!.run()),
  };
}

const groupOf = (h: SheetHarness): SheetPivotGroup => pivotOf(h).rows![0]!;

describe('grouping a pivot table from its cells', () => {
  it('gathers selected items into Group 1, and ungroups it', async () => {
    const { h, ids, run } = await setup(0);
    act(() => h.select('E2'));
    expect(ids()).toEqual([]);
    act(() => h.select('E2:E3'));
    expect(ids()).toEqual(['pivot-group']);
    run('pivot-group');
    expect(groupOf(h).grouping).toEqual({
      k: 'custom',
      groups: [{ name: 'Group 1', items: ['East', 'West'] }],
    });
    expect(h.value('E2')).toBe('Group 1');
    act(() => h.select('E2'));
    expect(ids()).toEqual(['pivot-ungroup']);
    run('pivot-ungroup');
    expect(groupOf(h)).not.toHaveProperty('grouping');
  });

  it('groups dates by a rule picked from the submenu', async () => {
    const { h, ids, run } = await setup(2);
    act(() => h.select('E2'));
    expect(ids()).toContain('pivot-date-group-month');
    expect(ids()).toHaveLength(15);
    run('pivot-date-group-month');
    expect(groupOf(h).grouping).toEqual({ k: 'date', rule: 'month' });
    expect(h.value('E2')).toBe('Jan');
  });

  it('groups numbers by the rule the dialog reads, refusing what does not read', async () => {
    const { h, ids, run } = await setup(1);
    act(() => h.select('E2'));
    expect(ids()).toEqual(['pivot-group-rule']);
    run('pivot-group-rule');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Minimum Value' }).value).toBe(
      '3',
    );
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Maximum Value' }).value).toBe(
      '5',
    );
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a number above 0');
    fireEvent.change(screen.getByRole('textbox', { name: 'Interval Size' }), {
      target: { value: '2' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(groupOf(h).grouping).toEqual({ k: 'interval', size: 2, start: 3, end: 5 });
  });

  it('leaves the pivot table as it is when it went while the dialog was open, or on Cancel', async () => {
    const { h, run } = await setup(1);
    act(() => h.select('E2'));
    run('pivot-group-rule');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    run('pivot-group-rule');
    act(() => {
      h.ctl().write(
        { kind: 'layout', changes: [{ k: 'object', id: 'pivot01', object: null }] },
        'PivotTable',
      );
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Interval Size' }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.store.sheet(SHEET_ID)!.layout.objects ?? []).toEqual([]);
  });

  it('offers a Participant nothing', async () => {
    const { h, ids } = await setup(0, { canShape: false });
    act(() => h.select('E2:E3'));
    expect(ids()).toEqual([]);
  });
});
