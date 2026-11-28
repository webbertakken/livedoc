// @vitest-environment jsdom
// Making and working with a pivot table (docs/specs/029-sheets/pivot-tables.md "Making one", "Working with one"):
// Create Pivot Table places one at a cell of this sheet, on a new sheet or on another sheet once it opens, with the
// editor open on it; typing into the output is refused; Delete over the whole output removes it; Edit reopens it.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetPivot } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import { SheetPivotsContext } from '@/components/sheets/pivots/sheet-pivots';
import { SheetPivotsLayer } from '@/components/sheets/pivots/SheetPivotsLayer';
import { PIVOT_LOCATION_WHY } from '@/lib/spreadsheet/pivot-create';
import { CreatePivotTableDialog } from './CreatePivotTableDialog';
import { useSpreadsheetPivots } from './useSpreadsheetPivots';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

beforeAll(stubResizeObserver);
beforeEach(() => vi.mocked(track).mockClear());
afterEach(cleanup);

const DATA = { A1: 'Region', B1: 'Units', A2: 'East', B2: '5', A3: 'West', B3: '3' };
const pivotsOf = (h: SheetHarness, sheetId = SHEET_ID) =>
  (h.store.sheet(sheetId)?.layout.objects ?? []).filter((x): x is SheetPivot => x.kind === 'pivot');

async function setup(opts: { otherTitles?: string[]; canShape?: boolean } = {}) {
  const { canShape, ...made } = opts;
  const h = await makeSheet({ rows: 10, cols: 8, cells: DATA, ...made });
  const bar = {
    add: vi.fn(() => ({ tabId: 'tabNew', sheetId: 'sheetNew' })),
    show: vi.fn(),
  };
  const onEdit = vi.fn();
  let clear: (what: 'inputs' | 'formats' | 'all') => void = () => {};
  let showDetails: (r: number, c: number) => boolean = () => false;
  renderSheet(
    h,
    ({ c, actions }) => {
      clear = actions.clear;
      const p = useSpreadsheetPivots(c, bar, onEdit);
      showDetails = p.showDetails;
      return (
        <SheetPivotsContext.Provider value={onEdit}>
          <button type="button" onClick={p.openCreate}>
            open
          </button>
          {p.dialog}
          <SheetPivotsLayer />
        </SheetPivotsContext.Provider>
      );
    },
    canShape === undefined ? {} : { canShape },
  );
  return {
    h,
    bar,
    onEdit,
    clear: (what: 'inputs' | 'formats' | 'all') => clear(what),
    showDetails: (r: number, c: number) => showDetails(r, c),
  };
}

const dialog = () => screen.getByRole('dialog', { name: 'Create Pivot Table' });

describe('Create Pivot Table', () => {
  it('opens on the data round the active cell, and places a pivot table at a cell of this sheet', async () => {
    const { h, onEdit } = await setup();
    act(() => h.select('A2'));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Data Range' }).value).toBe(
      "'Sheet 1'!A1:B3",
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Existing Sheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert').textContent).toBe(PIVOT_LOCATION_WHY);
    fireEvent.change(screen.getByRole('textbox', { name: 'Location' }), {
      target: { value: 'D1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const [pivot] = pivotsOf(h);
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    expect(pivot).toMatchObject({
      kind: 'pivot',
      at: { r: rows[0], c: cols[3] },
      source: { r1: rows[0], c1: cols[0], r2: rows[2], c2: cols[1] },
    });
    expect(onEdit).toHaveBeenCalledWith(pivot!.id);
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Added', 'PivotTable');
  });

  it('adds Pivot Table 1 after the open sheet and places the pivot table once it opens', async () => {
    const { h, bar } = await setup();
    act(() => h.select('A2'));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(bar.add).toHaveBeenCalledWith('afterOpen', { name: 'Pivot Table 1' });
    expect(pivotsOf(h)).toEqual([]);
  });

  it('sends a pivot table to another sheet and opens it there', async () => {
    const { h, bar } = await setup({ otherTitles: ['Report'] });
    act(() => h.select('A2'));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Existing Sheet' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Location' }), {
      target: { value: 'Report!A1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(bar.show).toHaveBeenCalledWith(h.store.sheet('other0000')!.tabId);
    expect(pivotsOf(h)).toEqual([]);
  });

  it('cancels, giving the keys back', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a pivot table in the grid', () => {
  async function placed() {
    const s = await setup();
    act(() => s.h.select('A2'));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Existing Sheet' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Location' }), {
      target: { value: 'D1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const [pivot] = pivotsOf(s.h);
    const { cols } = s.h.store.sheet(SHEET_ID)!.layout;
    act(() => {
      s.h.ctl().write(
        {
          kind: 'layout',
          changes: [
            {
              k: 'object',
              id: pivot!.id,
              object: {
                ...pivot!,
                rows: [{ col: cols[0]! }],
                values: [{ col: cols[1]!, summary: 'SUM' }],
              },
            },
          ],
        },
        'PivotTable',
      );
    });
    return { ...s, pivot: pivot! };
  }

  it('refuses a value typed into its output', async () => {
    const { h } = await placed();
    expect(h.value('E2')).toBe(5);
    let ok = true;
    act(() => {
      const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
      ok = h
        .ctl()
        .write({ kind: 'cells', cells: [{ r: rows[1]!, c: cols[4]!, i: { n: 9 } }] }, 'Cell');
    });
    expect(ok).toBe(false);
    expect(h.toast).toHaveBeenCalledWith("You can't edit a pivot table's cells");
    expect(h.value('E2')).toBe(5);
  });

  it('is removed by Delete over its whole output, and kept by one over part of it or by Clear Formatting', async () => {
    const { h, clear } = await placed();
    act(() => h.select('D1:E3'));
    act(() => clear('formats'));
    expect(pivotsOf(h)).toHaveLength(1);
    act(() => h.select('D1:E2'));
    act(() => clear('inputs'));
    expect(pivotsOf(h)).toHaveLength(1);
    act(() => h.select('D1:F5'));
    act(() => clear('inputs'));
    expect(pivotsOf(h)).toEqual([]);
    expect(h.value('E2')).toBeNull();
  });

  it('shows Edit while a cell of its output is active, opening the editor', async () => {
    const { h, onEdit, pivot } = await placed();
    act(() => h.select('A2'));
    expect(screen.queryByRole('button', { name: 'Edit pivot table' })).toBeNull();
    onEdit.mockClear();
    act(() => h.select('E3'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit pivot table' }));
    expect(onEdit).toHaveBeenCalledWith(pivot.id);
  });

  // pivot-tables.md "Details" (D616): the output at D1 reads Region / SUM of Units, East 5, West 3, Grand Total 8.
  it('adds Details1 after the open sheet, holding the header and the rows the value summarises', async () => {
    const { h, bar, showDetails } = await placed();
    expect(h.value('E2')).toBe(5);
    let shown = false;
    act(() => {
      shown = showDetails(1, 4);
    });
    expect(shown).toBe(true);
    const [place, opts] = bar.add.mock.calls[0]! as unknown as [
      string,
      { name: string; seed: { cells: { i?: unknown }[] } },
    ];
    expect(place).toBe('afterOpen');
    expect(opts.name).toBe('Details1');
    expect(opts.seed.cells.map((x) => x.i)).toEqual([
      { s: 'Region' },
      { s: 'Units' },
      { s: 'East' },
      { n: 5 },
    ]);
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Added', 'PivotDetails');
  });

  it("shows a Participant's or a Viewer's details in a read-only dialog, adding no sheet", async () => {
    const { h, bar, showDetails } = await setup({ canShape: false });
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    const pivot: SheetPivot = {
      id: 'pivot01',
      kind: 'pivot',
      at: { r: rows[0]!, c: cols[3]! },
      source: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[1]! },
      rows: [{ col: cols[0]! }],
      values: [{ col: cols[1]!, summary: 'SUM' }],
    };
    act(() => {
      h.store.write(SHEET_ID, {
        kind: 'layout',
        changes: [{ k: 'object', id: pivot.id, object: pivot }],
      });
    });
    vi.mocked(track).mockClear();
    let shown = false;
    act(() => {
      shown = showDetails(3, 4);
    });
    expect(shown).toBe(true);
    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect(
      within(dialog)
        .getAllByRole('columnheader')
        .map((x) => x.textContent),
    ).toEqual(['Region', 'Units']);
    expect(
      within(dialog)
        .getAllByRole('cell')
        .map((x) => x.textContent),
    ).toEqual(['East', '5', 'West', '3']);
    expect(bar.add).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Details' })).toBeNull();
  });

  it('shows none for a header or a cell outside the output', async () => {
    const { bar, showDetails } = await placed();
    expect(showDetails(0, 3)).toBe(false);
    expect(showDetails(7, 7)).toBe(false);
    expect(bar.add).not.toHaveBeenCalled();
  });
});

describe('the Create Pivot Table dialog alone', () => {
  it('says why the range does not read, and creates once it does', () => {
    const onCreate = vi.fn();
    const plan = {
      ok: true as const,
      sourceSheetId: 's',
      source: { r1: 'a', c1: 'b', r2: 'c', c2: 'd' },
      to: { kind: 'new' as const },
    };
    const read = vi.fn((range: string) =>
      range === 'ok' ? plan : { ok: false as const, field: 'range' as const, why: 'Nope' },
    );
    render(<CreatePivotTableDialog start="" read={read} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert').textContent).toBe('Nope');
    expect(screen.getByRole('textbox', { name: 'Data Range' }).getAttribute('aria-invalid')).toBe(
      'true',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Data Range' }), {
      target: { value: 'ok' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith(plan);
    expect(dialog()).toBeTruthy();
  });
});
