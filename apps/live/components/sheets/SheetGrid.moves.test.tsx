// @vitest-environment jsdom
// The grid's moves (docs/specs/029-sheets/grid-and-editing.md "Moving around", "Selection"; surface.md D136): Shift
// grows Home, End and the pages, Alt pages sideways, Ctrl+Backspace brings the active cell back, Ctrl+Shift+Space
// selects the sheet, and the workbook's keys reach the surface: the next and previous sheet, the summary, the toolbar.
import { act, fireEvent } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gridScrolls, installGridDom, mountGrid } from './sheet-grid-test-utils';
import type { SheetSurfaceKeys } from './useSheetGridKeys';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let restore: () => void;
beforeAll(() => {
  restore = installGridDom();
});
afterAll(() => restore());
beforeEach(() => {
  gridScrolls.length = 0;
});

type Mounted = Awaited<ReturnType<typeof mountGrid>>;
const key = (h: Mounted, init: Parameters<typeof fireEvent.keyDown>[1]) =>
  fireEvent.keyDown(h.grid, init);
const sel = (h: Mounted) => h.c().selection;
const select = (h: Mounted, r: number, c: number): void => {
  act(() =>
    h.c().setSelection({
      ranges: [{ r1: r, c1: c, r2: r, c2: c }],
      active: { r, c },
      anchor: { r, c },
    }),
  );
};
const surface = (): SheetSurfaceKeys & {
  steps: number[];
  summaries: number;
  lists: number;
  leaves: number;
  redos: number;
  fullScreen: boolean;
} => {
  const out = {
    steps: [] as number[],
    summaries: 0,
    lists: 0,
    leaves: 0,
    redos: 0,
    redo: () => void (out.redos += 1),
    stepSheet: (step: -1 | 1) => void out.steps.push(step),
    focusSummary: () => void (out.summaries += 1),
    leaveGrid: () => void (out.leaves += 1),
    renameSheet: () => undefined,
    listSheets: () => void (out.lists += 1),
    fullScreen: false,
    escape: () => {
      const was = out.fullScreen;
      out.fullScreen = false;
      return was;
    },
  };
  return out;
};

describe('Shift with Home, End and the pages', () => {
  it('grows the selection from its anchor to where the move lands', async () => {
    const h = await mountGrid({ cells: { A1: '1', C5: '2' } });
    select(h, 1, 1);
    key(h, { key: 'End', ctrlKey: true, shiftKey: true });
    expect(sel(h).ranges).toEqual([{ r1: 1, c1: 1, r2: 4, c2: 2 }]);
    expect(sel(h).active).toEqual({ r: 1, c: 1 });
    // Home goes on from the far corner's row.
    key(h, { key: 'Home', shiftKey: true });
    expect(sel(h).ranges).toEqual([{ r1: 1, c1: 0, r2: 4, c2: 1 }]);
    select(h, 0, 0);
    key(h, { key: 'PageDown', shiftKey: true });
    expect(sel(h).ranges).toEqual([{ r1: 0, c1: 0, r2: 15, c2: 0 }]);
  });
});

describe('Alt with Page Up and Page Down', () => {
  it('moves a screen of columns sideways', async () => {
    const h = await mountGrid({ cols: 30 });
    key(h, { key: 'PageDown', altKey: true });
    // (800 view - 46 row numbers) / 100 px columns.
    expect(sel(h).active).toEqual({ r: 0, c: 7 });
    key(h, { key: 'PageUp', altKey: true, shiftKey: true });
    expect(sel(h).ranges).toEqual([{ r1: 0, c1: 0, r2: 0, c2: 7 }]);
  });
});

describe('Ctrl+Backspace', () => {
  it('scrolls the active cell back into view, the selection kept', async () => {
    const h = await mountGrid({ rows: 300 });
    select(h, 200, 0);
    gridScrolls.length = 0;
    Object.defineProperty(h.grid, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.scroll(h.grid);
    key(h, { key: 'Backspace', ctrlKey: true });
    expect(gridScrolls.length).toBe(1);
    expect(sel(h).active).toEqual({ r: 200, c: 0 });
    expect(h.called('clear')).toEqual([]);
  });
});

describe('Ctrl+Shift+Space', () => {
  it('selects the whole sheet', async () => {
    const h = await mountGrid({ rows: 5, cols: 4 });
    key(h, { key: ' ', ctrlKey: true, shiftKey: true });
    expect(sel(h).ranges).toEqual([{ r1: 0, c1: 0, r2: 4, c2: 3 }]);
  });
});

describe('the workbook keys', () => {
  it('step to the previous and next sheet, and focus the summary', async () => {
    const keys = surface();
    const h = await mountGrid({ surfaceKeys: keys });
    key(h, { key: 'ArrowUp', altKey: true });
    key(h, { key: 'PageDown', ctrlKey: true, shiftKey: true });
    key(h, { key: 'PageUp', metaKey: true, shiftKey: true });
    // D136: a cell without a dropdown, Alt+Down opens the next sheet.
    key(h, { key: 'ArrowDown', altKey: true });
    expect(keys.steps).toEqual([-1, 1, -1, 1]);
    key(h, { key: 'Q', code: 'KeyQ', altKey: true, shiftKey: true });
    expect(keys.summaries).toBe(1);
    // surface.md "Sheet bar": Alt+Shift+K opens All Sheets.
    key(h, { key: 'K', code: 'KeyK', altKey: true, shiftKey: true });
    expect(keys.lists).toBe(1);
    // D137: Ctrl+Alt+Shift+M leaves the grid for the toolbar.
    key(h, { key: 'M', code: 'KeyM', ctrlKey: true, altKey: true, shiftKey: true });
    expect(keys.leaves).toBe(1);
  });

  // surface.md "Layout": Escape ends Full Screen once nothing else takes it, and only then.
  it('ends Full Screen on Escape after a copy’s marquee', async () => {
    const keys = surface();
    keys.fullScreen = true;
    const h = await mountGrid({ surfaceKeys: keys });
    act(() => h.c().setMarquee({ range: { r1: 0, c1: 0, r2: 0, c2: 0 }, cut: false }));
    key(h, { key: 'Escape' });
    expect(h.c().marquee).toBeNull();
    expect(keys.fullScreen).toBe(true);
    key(h, { key: 'Escape' });
    expect(keys.fullScreen).toBe(false);
  });

  // grid-and-editing.md "Formulas": F4 outside an edit redoes, for whoever may write cells.
  it('redo on F4, and not for a Viewer', async () => {
    const keys = surface();
    const h = await mountGrid({ surfaceKeys: keys });
    key(h, { key: 'F4' });
    expect(keys.redos).toBe(1);
    const viewer = surface();
    const v = await mountGrid({ surfaceKeys: viewer, canEdit: false });
    key(v, { key: 'F4' });
    expect(viewer.redos).toBe(0);
  });

  it('open a dropdown before a sheet, and do nothing in a Plan Sheet', async () => {
    const keys = surface();
    const h = await mountGrid({
      surfaceKeys: keys,
      layout: {
        rules: [
          {
            id: 'rule01',
            r1: 'row0',
            c1: 'col0',
            r2: 'row0',
            c2: 'col0',
            is: 'list',
            opts: [{ v: 'Yes' }],
          },
        ],
      },
    });
    key(h, { key: 'ArrowDown', altKey: true });
    expect(keys.steps).toEqual([]);
    const plain = await mountGrid();
    key(plain, { key: 'ArrowUp', altKey: true });
    key(plain, { key: 'Q', code: 'KeyQ', altKey: true, shiftKey: true });
    key(plain, { key: 'M', code: 'KeyM', ctrlKey: true, altKey: true, shiftKey: true });
    expect(plain.c().selection.active).toEqual({ r: 0, c: 0 });
  });
});
