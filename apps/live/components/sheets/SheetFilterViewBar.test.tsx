// @vitest-environment jsdom
// data-tools.md "Filters, filter views and slicers" (D469-D474): Create Filter View, Change View, the view bar's
// Name, Range, Duplicate, Delete and Close, a view drawn in the sheet filter's place, temporary views for anyone who
// may not save one, and a view deleted by someone else closing.
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { filterViewOf, tableAt, type SheetFilterView } from '@livedoc/sheets';
import { makeSheet, renderSheet, stubResizeObserver, type SheetParts } from './sheet-ui-test-utils';
import { SheetFilterViewBar } from './SheetFilterViewBar';
import { useFilterViewActions } from './useFilterViewActions';
import { filterViewMenuActions, changeViewTitles } from './filter-view-menu';
import { FILTER_VIEW_DELETED, forgetOpenFilterViews } from './useFilterViews';

beforeAll(stubResizeObserver);
afterEach(forgetOpenFilterViews);

const CELLS = {
  A1: 'Fruit',
  B1: 'Count',
  A2: 'apple',
  B2: '3',
  A3: 'pear',
  B3: '8',
  A4: 'fig',
  B4: '1',
};

function Host({ c }: SheetParts) {
  const actions = useFilterViewActions(c);
  const { active } = c.selection;
  const menu = filterViewMenuActions({
    layout: c.sheet.layout,
    open: c.filterViews.open,
    canShape: c.canShape,
    inTable: !!tableAt(c.sheet.layout, active.r, active.c),
    run: () => actions,
  });
  return (
    <>
      <SheetFilterViewBar actions={actions} />
      {Object.entries(menu).map(([id, a]) => (
        <button key={id} type="button" disabled={a?.disabled} onClick={() => a?.run()}>
          {`${id}${a?.checked ? ' (open)' : ''}`}
        </button>
      ))}
      <output data-testid="titles">
        {(changeViewTitles(c.sheet.layout, c.filterViews.open) ?? ['hidden']).join('|')}
      </output>
      <output data-testid="hidden">{[...c.geometry.rows].length ? hiddenRows(c) : ''}</output>
      <button
        type="button"
        onClick={() => c.filterViews.setCondition(c.sheet.layout.cols[1]!, { op: 'gt', a: '2' })}
      >
        keep over 2
      </button>
    </>
  );
}

function hiddenRows(c: SheetParts['c']): string {
  return c.sheet.layout.rows
    .map((_, r) => (c.geometry.hiddenRow(r) ? String(r + 1) : null))
    .filter(Boolean)
    .join(',');
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const views = (h: Awaited<ReturnType<typeof makeSheet>>) => h.ctl().sheet.layout.filterViews ?? [];

describe('filter views', () => {
  it('makes, filters, renames, re-ranges, duplicates and deletes an Editor view', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'A2' });
    expect(screen.getByTestId('titles').textContent).toBe('hidden');
    click('create-filter-view');
    expect(views(h).map((v) => v.title)).toEqual(['Filter 1']);
    expect(screen.getByRole('toolbar', { name: 'Filter view' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Range' })).toHaveProperty('value', 'A1:B4');
    expect(screen.getByRole('button', { name: /^filter-view-0 \(open\)$/ })).toBeTruthy();

    click('keep over 2');
    expect(screen.getByTestId('hidden').textContent).toBe('4');
    expect(Object.keys(views(h)[0]!.conds)).toHaveLength(1);

    const name = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Name the filter view');
    fireEvent.change(name, { target: { value: 'Big counts' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(views(h)[0]!.title).toBe('Big counts');

    const range = screen.getByRole('textbox', { name: 'Range' });
    fireEvent.change(range, { target: { value: 'nope' } });
    fireEvent.blur(range);
    expect(screen.getByRole('alert').textContent).toBe('Type a range like A1:D20');
    fireEvent.change(range, { target: { value: 'A1:A3' } });
    fireEvent.blur(range);
    // Column B left the range, so its condition went with it.
    expect(views(h)[0]!.conds).toEqual({});
    expect(screen.getByTestId('hidden').textContent).toBe('');

    click('Duplicate');
    expect(views(h).map((v) => v.title)).toEqual(['Big counts', 'Copy of Big counts']);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'Copy of Big counts',
    );
    click('Delete');
    expect(views(h).map((v) => v.title)).toEqual(['Big counts']);
    expect(screen.queryByRole('toolbar', { name: 'Filter view' })).toBeNull();
    expect(h.toast).not.toHaveBeenCalledWith(FILTER_VIEW_DELETED);
  });

  it("draws the open view in the filter's place and the filter again on close", async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'A2' });
    const c = h.ctl();
    act(() => {
      c.write(
        {
          kind: 'layout',
          changes: [
            {
              k: 'filter',
              filter: {
                r1: c.sheet.layout.rows[0]!,
                c1: c.sheet.layout.cols[0]!,
                r2: c.sheet.layout.rows[3]!,
                c2: c.sheet.layout.cols[1]!,
                conds: { [c.sheet.layout.cols[0]!]: { values: ['apple'] } },
              },
            },
          ],
        },
        'Filter',
      );
    });
    expect(screen.getByTestId('hidden').textContent).toBe('3,4');
    click('save-as-filter-view');
    expect(views(h)[0]!.conds).toEqual(h.ctl().sheet.layout.filter!.conds);
    click('keep over 2');
    // The view's own conditions alone: apple kept by values, fig left out by the condition.
    expect(screen.getByTestId('hidden').textContent).toBe('3,4');
    click('close-filter-view');
    expect(screen.getByTestId('hidden').textContent).toBe('3,4');
    expect(h.ctl().sheet.layout.filter!.conds[h.ctl().sheet.layout.cols[1]!]).toBeUndefined();
    click('filter-view-0');
    expect(screen.getByRole('toolbar', { name: 'Filter view' })).toBeTruthy();
  });

  it("keeps a Viewer's view their own, never written, with no Delete", async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'A2', canEdit: false, canShape: false });
    expect(screen.queryByRole('button', { name: 'save-as-filter-view' })).toBeNull();
    click('create-filter-view');
    expect(views(h)).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'Temporary Filter 1',
    );
    expect(screen.getByText('Only you see this view')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    click('keep over 2');
    expect(screen.getByTestId('hidden').textContent).toBe('4');
    expect(h.writes).toEqual([]);
    fireEvent.keyDown(screen.getByRole('toolbar', { name: 'Filter view' }), { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: 'Filter view' })).toBeNull();
    expect(screen.getByTestId('hidden').textContent).toBe('');
  });

  it('turns a saved view a Participant changes into their temporary copy', async () => {
    const h = await makeSheet({ cells: CELLS });
    const view: SheetFilterView = {
      id: 'fvaa',
      title: 'Shared',
      r1: '',
      c1: '',
      r2: '',
      c2: '',
      conds: {},
    };
    const editor = renderSheet(h, (p) => <Host {...p} />, { at: 'A2' });
    const l = h.ctl().sheet.layout;
    act(() => {
      h.ctl().write(
        {
          kind: 'layout',
          changes: [
            {
              k: 'fview',
              id: 'fvaa',
              view: { ...view, r1: l.rows[0]!, c1: l.cols[0]!, r2: l.rows[3]!, c2: l.cols[1]! },
            },
          ],
        },
        'Filter',
      );
    });
    editor.unmount();
    renderSheet(h, (p) => <Host {...p} />, { at: 'A2', canShape: false });
    click('filter-view-0');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty('readOnly', true);
    click('keep over 2');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'Temporary Filter 1',
    );
    expect(filterViewOf(h.ctl().sheet.layout, 'fvaa')!.conds).toEqual({});
  });

  it('puts a field back on Escape, and makes no view over an empty block', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'A2' });
    click('create-filter-view');
    const name = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Draft' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(name).toHaveProperty('value', 'Filter 1');
    expect(screen.getByRole('toolbar', { name: 'Filter view' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('toolbar', { name: 'Filter view' }), { key: 'Escape' });
    act(() => h.select('E8'));
    click('create-filter-view');
    // A lone empty cell is a block of its own, so a view is made over it.
    expect(views(h).map((v) => v.title)).toEqual(['Filter 1', 'Filter 2']);
  });

  it('closes a view someone else deleted, saying so', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'A2' });
    click('create-filter-view');
    const id = views(h)[0]!.id;
    act(() => {
      h.ctl().write({ kind: 'layout', changes: [{ k: 'fview', id, view: null }] }, 'Filter');
    });
    expect(screen.queryByRole('toolbar', { name: 'Filter view' })).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(FILTER_VIEW_DELETED);
  });
});

// data-tools.md "The drawn order" (D491-D495): a view's sort draws its rows in an order of its own, for its opener;
// cells never move, moves go to the row drawn next and typing lands on the stored row drawn there.
describe('a filter view sorted', () => {
  function SortHost(p: SheetParts) {
    return (
      <>
        <Host {...p} />
        <button type="button" onClick={() => p.c.filterViews.sort(p.c.sheet.layout.cols[1]!, true)}>
          sort by count
        </button>
        <button type="button" onClick={() => p.actions.move('down')}>
          down
        </button>
        <output data-testid="order">
          {[0, 1, 2, 3].map((d) => p.c.geometry.storedAt(d) + 1).join(',')}
        </output>
        <output data-testid="active">{`${p.c.selection.active.r},${p.c.selection.active.c}`}</output>
      </>
    );
  }

  it('draws the rows by the view sort, kept with the view, the cells unmoved', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <SortHost {...p} />, { at: 'A1' });
    click('create-filter-view');
    click('sort by count');
    expect(screen.getByTestId('order').textContent).toBe('1,4,2,3');
    expect(views(h)[0]!.sort).toEqual([{ c: h.ctl().sheet.layout.cols[1]! }]);
    expect(h.ctl().workbook.value(h.ctl().sheet.id, 1, 0)).toBe('apple');
    // Down from the header goes to fig, drawn next (row 4).
    click('down');
    expect(screen.getByTestId('active').textContent).toBe('3,0');
    click('down');
    expect(screen.getByTestId('active').textContent).toBe('1,0');
    click('close-filter-view');
    expect(screen.getByTestId('order').textContent).toBe('1,2,3,4');
  });

  it('refuses to sort over a merge across its rows', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <SortHost {...p} />, { at: 'A2' });
    click('create-filter-view');
    const l = h.ctl().sheet.layout;
    const range = { r1: l.rows[1]!, c1: l.cols[3]!, r2: l.rows[2]!, c2: l.cols[3]! };
    act(() => {
      h.ctl().write({ kind: 'layout', changes: [{ k: 'merge', range }] }, 'Merge');
    });
    click('sort by count');
    expect(h.toast).toHaveBeenCalledWith('Unmerge the cells that span rows before sorting.');
    expect(views(h)[0]!.sort).toBeUndefined();
    expect(screen.getByTestId('order').textContent).toBe('1,2,3,4');
  });

  it('keeps the sort of a Participant their own', async () => {
    const h = await makeSheet({ cells: CELLS });
    const editor = renderSheet(h, (p) => <SortHost {...p} />, { at: 'A2' });
    click('create-filter-view');
    click('close-filter-view');
    editor.unmount();
    renderSheet(h, (p) => <SortHost {...p} />, { at: 'A2', canShape: false });
    click('filter-view-0');
    click('sort by count');
    expect(screen.getByTestId('order').textContent).toBe('1,4,2,3');
    expect(views(h)[0]!.sort).toBeUndefined();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'Temporary Filter 1',
    );
  });
});
