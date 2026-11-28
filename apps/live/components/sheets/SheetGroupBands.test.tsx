// @vitest-environment jsdom
// data-tools.md "Group by view" (D496-D499): Create Group by View from a table's cell, dimmed outside one; each group's
// header band with its opener, value and count; collapsing and expanding a group, or all, for its opener alone; the
// Range read-only; Convert to Range taking the view with the table.
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GROUP_VIEW_NEEDS_TABLE, tableAt } from '@livedoc/sheets';
import { makeSheet, renderSheet, stubResizeObserver, type SheetParts } from './sheet-ui-test-utils';
import { SheetFilterViewBar } from './SheetFilterViewBar';
import { SheetGroupBands } from './SheetGroupBands';
import { useFilterViewActions } from './useFilterViewActions';
import { filterViewMenuActions } from './filter-view-menu';
import { forgetOpenFilterViews } from './useFilterViews';
import { useSheetActions } from './useSheetActions';

beforeAll(stubResizeObserver);
afterEach(forgetOpenFilterViews);

// Table1 over A1:B6: two apples, two pears, a blank; row 7 outside it.
const CELLS = {
  A1: 'Fruit',
  B1: 'Count',
  A2: 'pear',
  B2: '3',
  A3: 'Apple',
  B3: '8',
  A4: '',
  B4: '1',
  A5: 'apple',
  B5: '2',
  A6: 'Pear',
  B6: '5',
  A8: 'outside',
};

function Host({ c }: SheetParts) {
  const actions = useFilterViewActions(c);
  const sheetActions = useSheetActions();
  const { active } = c.selection;
  const menu = filterViewMenuActions({
    layout: c.sheet.layout,
    open: c.filterViews.open,
    canShape: c.canShape,
    inTable: !!tableAt(c.sheet.layout, active.r, active.c),
    run: () => actions,
  });
  const group = menu['create-group-by-view']!;
  return (
    <>
      <SheetFilterViewBar actions={actions} />
      <SheetGroupBands />
      <button type="button" disabled={group.disabled} onClick={group.run}>
        {`create-group-by-view${group.note ? ` (${group.note})` : ''}`}
      </button>
      <button
        type="button"
        onClick={() => sheetActions.convertToRange(c.sheet.layout.tables![0]!.id)}
      >
        convert to range
      </button>
      <output data-testid="hidden">
        {c.sheet.layout.rows
          .map((_, r) => (c.geometry.hiddenRow(r) ? String(r + 1) : null))
          .filter(Boolean)
          .join(',')}
      </output>
    </>
  );
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

async function withTable() {
  const h = await makeSheet({ cells: CELLS, rows: 10 });
  renderSheet(h, (p) => <Host {...p} />, { at: 'A8' });
  // The grid measured, so the bands in view are drawn.
  act(() => h.ctl().setView({ width: 800, height: 600 }));
  const c = h.ctl();
  const { rows, cols } = c.sheet.layout;
  act(() => {
    c.write(
      {
        kind: 'layout',
        changes: [
          {
            k: 'table',
            id: 'tbl001',
            table: {
              id: 'tbl001',
              name: 'Table1',
              r1: rows[0]!,
              c1: cols[0]!,
              r2: rows[5]!,
              c2: cols[1]!,
            },
          },
        ],
      },
      'Table',
    );
  });
  return h;
}

describe('group by views', () => {
  it('is dimmed with its note while the active cell is in no table', async () => {
    await withTable();
    expect(
      screen.getByRole('button', { name: `create-group-by-view (${GROUP_VIEW_NEEDS_TABLE})` }),
    ).toHaveProperty('disabled', true);
  });

  it('groups the table by the active column, A to Z with blanks last, each band its value and count', async () => {
    const h = await withTable();
    act(() => h.select('A3'));
    click('create-group-by-view');
    const views = h.ctl().sheet.layout.filterViews!;
    expect(views.map((v) => [v.title, v.group?.c])).toEqual([
      ['Group 1', h.ctl().sheet.layout.cols[0]],
    ]);
    expect(screen.getByRole('textbox', { name: 'Range' })).toHaveProperty('readOnly', true);
    const openers = screen.getAllByRole('button', { name: /^Collapse .*, \d+ rows?$/ });
    expect(openers.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Collapse Apple, 2 rows',
      'Collapse pear, 2 rows',
      'Collapse (Blank), 1 row',
    ]);
    expect(openers.every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
  });

  it('collapses and expands a group, and all, without writing', async () => {
    const h = await withTable();
    act(() => h.select('B2'));
    click('create-group-by-view');
    const writes = h.writes.length;
    click('Collapse 3, 1 row');
    expect(screen.getByTestId('hidden').textContent).toBe('2');
    expect(screen.getByRole('button', { name: 'Expand 3, 1 row' })).toHaveProperty(
      'ariaExpanded',
      'false',
    );
    click('Collapse All');
    expect(screen.getByTestId('hidden').textContent).toBe('2,3,4,5,6');
    expect(screen.getByRole('button', { name: 'Collapse All' })).toHaveProperty('disabled', true);
    click('Expand All');
    expect(screen.getByTestId('hidden').textContent).toBe('');
    expect(h.writes.length).toBe(writes);
  });

  it('takes the table group by views away with Convert to Range, one step', async () => {
    const h = await withTable();
    act(() => h.select('A2'));
    click('create-group-by-view');
    click('convert to range');
    expect(h.ctl().sheet.layout.filterViews).toBeUndefined();
    expect(screen.queryByRole('toolbar', { name: 'Filter view' })).toBeNull();
  });
});
