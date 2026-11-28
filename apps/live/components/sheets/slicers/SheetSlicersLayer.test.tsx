// @vitest-environment jsdom
// data-tools.md "Slicers" (D475, D476, D483-D486): Data › Add a Slicer over the filled range, on the active column,
// with the Slicer panel; a slicer's filter is its presser's alone until an Editor sets it as the default; Reset to
// Default drops one's own; an Editor moves, resizes and deletes it, anyone else only filters.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { sheetSlicers, type SheetSlicer } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  type SheetParts,
} from '../sheet-ui-test-utils';
import { useSpreadsheetSlicers } from '@/components/spreadsheet/slicers/useSpreadsheetSlicers';
import { SpreadsheetSlicerBody } from '@/components/spreadsheet/slicers/SpreadsheetSlicerBody';
import { SheetSlicersContext } from './slicers-context';
import { SheetSlicersLayer } from './SheetSlicersLayer';

beforeAll(stubResizeObserver);

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

const reveal = vi.fn();

function Host({ c, actions }: SheetParts) {
  const s = useSpreadsheetSlicers(c, reveal);
  return (
    <SheetSlicersContext.Provider value={s.writes}>
      <button type="button" onClick={s.addSlicer}>
        add
      </button>
      <SheetSlicersLayer actions={actions} />
      <output data-testid="hidden">{hiddenRows(c)}</output>
      {s.editing ? (
        <SpreadsheetSlicerBody
          slicerId={s.editing}
          onChange={(next, what) => s.writes?.change(next, what) ?? false}
        />
      ) : null}
    </SheetSlicersContext.Provider>
  );
}

function hiddenRows(c: SheetParts['c']): string {
  return c.sheet.layout.rows
    .map((_, r) => (c.geometry.hiddenRow(r) ? String(r + 1) : null))
    .filter(Boolean)
    .join(',');
}

const slicers = (h: Awaited<ReturnType<typeof makeSheet>>): SheetSlicer[] =>
  sheetSlicers(h.ctl().sheet.layout);

// Presses the slicer's filter button, ticks off `drop` among Filter by Values, and presses OK.
function filterOut(drop: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Count: / }));
  const menu = screen.getByRole('dialog', { name: 'Count slicer filter' });
  fireEvent.click(within(menu).getByRole('checkbox', { name: new RegExp(drop) }));
  fireEvent.click(within(menu).getByRole('button', { name: 'OK' }));
}

describe('slicers', () => {
  it('adds one over the filled range on the active column, with the panel open', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'B3' });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    const [s] = slicers(h);
    expect(s).toMatchObject({
      kind: 'slicer',
      width: 200,
      height: 40,
      col: h.ctl().sheet.layout.cols[1],
    });
    expect(reveal).toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Count slicer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Count: All' })).toBeTruthy();
    expect(screen.getByLabelText('Data Range')).toHaveProperty('value', 'A1:B4');
  });

  it('filters for its presser alone, until set as the default, and resets', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'B2' });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    h.writes.length = 0;
    filterOut('8');
    expect(screen.getByTestId('hidden').textContent).toBe('3');
    expect(screen.getByRole('button', { name: 'Count: 2 of 3' })).toBeTruthy();
    // Nothing sent: it is theirs alone.
    expect(h.writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Slicer options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Current Filters as Default' }));
    expect(slicers(h)[0]!.filter).toEqual({ values: ['1', '3'] });
    expect(h.ctl().ownSlicers).toEqual({});
    expect(screen.getByTestId('hidden').textContent).toBe('3');
    // Their own again, then Reset to Default.
    filterOut('3');
    expect(screen.getByTestId('hidden').textContent).toBe('2,3');
    fireEvent.click(screen.getByRole('button', { name: 'Slicer options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Default' }));
    expect(screen.getByTestId('hidden').textContent).toBe('3');
  });

  it('lets a Viewer filter for themselves, never move or edit it', async () => {
    const h = await makeSheet({ cells: CELLS });
    const view = renderSheet(h, (p) => <Host {...p} />, { at: 'B2' });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    view.unmount();
    renderSheet(h, (p) => <Host {...p} />, { at: 'B2', canEdit: false, canShape: false });
    const frame = screen.getByRole('group', { name: 'Count slicer' });
    expect(frame.tabIndex).toBe(-1);
    filterOut('8');
    expect(screen.getByTestId('hidden').textContent).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Slicer options' }));
    expect(screen.queryByRole('button', { name: 'Edit Slicer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Slicer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset to Default' })).toBeTruthy();
  });

  it('moves, resizes and deletes by keys, each one write', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'B2' });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    const frame = screen.getByRole('group', { name: 'Count slicer' });
    const before = slicers(h)[0]!;
    act(() => frame.focus());
    fireEvent.keyDown(frame, { key: 'ArrowDown', shiftKey: true });
    expect(slicers(h)[0]!.at.dy).toBe(before.at.dy + 10);
    fireEvent.keyDown(frame, { key: 'ArrowRight', altKey: true });
    expect(slicers(h)[0]!.width).toBe(201);
    fireEvent.keyDown(frame, { key: 'ArrowUp', altKey: true, shiftKey: true });
    expect(slicers(h)[0]!.height).toBe(30);
    fireEvent.keyDown(frame, { key: 'ArrowUp', altKey: true });
    expect(slicers(h)[0]!.height).toBe(30);
    fireEvent.keyDown(frame, { key: 'Delete' });
    expect(slicers(h)).toEqual([]);
  });

  it('changes its column, title and range from the panel', async () => {
    const h = await makeSheet({ cells: CELLS });
    renderSheet(h, (p) => <Host {...p} />, { at: 'B2' });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    fireEvent.change(screen.getByLabelText('Column'), {
      target: { value: h.ctl().sheet.layout.cols[0] },
    });
    expect(screen.getByRole('button', { name: 'Fruit: All' })).toBeTruthy();
    const title = screen.getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Kinds' } });
    fireEvent.blur(title);
    expect(slicers(h)[0]!.title).toBe('Kinds');
    const range = screen.getByLabelText('Data Range');
    fireEvent.change(range, { target: { value: 'nope' } });
    fireEvent.keyDown(range, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Type a range like A1:D20');
    fireEvent.change(range, { target: { value: 'B1:B4' } });
    fireEvent.keyDown(range, { key: 'Enter' });
    expect(slicers(h)[0]!.col).toBe(h.ctl().sheet.layout.cols[1]);
    fireEvent.click(screen.getByRole('switch', { name: 'Apply to Pivot Tables' }));
    expect(slicers(h)[0]!.pivots).toBe(false);
  });
});
