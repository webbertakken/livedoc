// @vitest-environment jsdom
// Groups on the grid (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"): Alt+Shift and the arrows
// (D160, D161), the outline bar and its controls (D162, D165), and a Participant's and a Viewer's own folds (D163).
import { act, fireEvent, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { outlineOf, selectCols, selectRows, type SheetLayout } from '@livedoc/sheets';
import { installGridDom, mountGrid, type MountOptions } from './sheet-grid-test-utils';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let restore: () => void;
beforeAll(() => {
  restore = installGridDom();
});
afterAll(() => restore());

type Mounted = Awaited<ReturnType<typeof mountGrid>>;
const altShift = (h: Mounted, key: string) =>
  fireEvent.keyDown(h.grid, { key, altKey: true, shiftKey: true });
const stored = (h: Mounted) => h.store.sheet(h.sheetId)!.layout;
const groups = (layout: SheetLayout, axis: 'r' | 'c' = 'r') =>
  outlineOf(layout, axis).groups.map(
    (g) => `${g.depth}:${g.from}-${g.to}${g.collapsed ? '+' : ''}`,
  );
const rows23: MountOptions = { layout: { rowDepth: { row2: 1, row3: 1 } } };
const control = (h: Mounted, name: string) => within(h.grid).getByRole('button', { name });

describe('Alt+Shift+→ and ←', () => {
  it('group and ungroup whole rows or columns at once', async () => {
    const h = await mountGrid();
    act(() => h.c().setSelection(selectRows(1, 2, h.c().grid)));
    altShift(h, 'ArrowRight');
    expect(groups(stored(h))).toEqual(['1:1-2']);
    altShift(h, 'ArrowLeft');
    expect(groups(stored(h))).toEqual([]);
    act(() => h.c().setSelection(selectCols(3, 3, h.c().grid)));
    altShift(h, 'ArrowRight');
    expect(groups(stored(h), 'c')).toEqual(['1:3-3']);
  });

  it('open the rows and the columns at the active cell over cells', async () => {
    const h = await mountGrid();
    altShift(h, 'ArrowRight');
    expect(h.c().menu).toMatchObject({ kind: 'group', op: 'group' });
    altShift(h, 'ArrowLeft');
    expect(h.c().menu).toMatchObject({ kind: 'group', op: 'ungroup' });
  });

  it('refuse a line already 7 deep, saying why', async () => {
    const h = await mountGrid({ layout: { rowDepth: { row1: 7 } } });
    act(() => h.c().setSelection(selectRows(1, 1, h.c().grid)));
    altShift(h, 'ArrowRight');
    expect(h.toasts).toEqual(['Groups nest at most 7 deep']);
    expect(h.writes).toEqual([]);
  });
});

describe('Alt+Shift+↑ and ↓ (D161)', () => {
  it('collapse the group holding the active cell for everyone, and expand it', async () => {
    const h = await mountGrid(rows23);
    act(() => h.actions().goTo({ r1: 2, c1: 0, r2: 2, c2: 0 }));
    altShift(h, 'ArrowUp');
    expect(groups(stored(h))).toEqual(['1:2-3+']);
    expect(h.c().geometry.hiddenRow(3)).toBe(true);
    altShift(h, 'ArrowDown');
    expect(groups(stored(h))).toEqual(['1:2-3']);
    // Nothing to fold: no change.
    act(() => h.actions().goTo({ r1: 9, c1: 0, r2: 9, c2: 0 }));
    altShift(h, 'ArrowUp');
    altShift(h, 'ArrowDown');
    expect(groups(stored(h))).toEqual(['1:2-3']);
  });

  it('fold the columns first while whole columns are selected', async () => {
    const h = await mountGrid({ layout: { rowDepth: { row0: 1 }, colDepth: { col1: 1 } } });
    act(() => h.c().setSelection(selectCols(1, 1, h.c().grid)));
    altShift(h, 'ArrowUp');
    expect([groups(stored(h)), groups(stored(h), 'c')]).toEqual([['1:0-0'], ['1:1-1+']]);
  });
});

describe('folds for oneself (D163)', () => {
  it('a Participant and a Viewer collapse and expand for themselves, never written, never grouping', async () => {
    for (const role of [{ canShape: false }, { canEdit: false }]) {
      const h = await mountGrid({ ...rows23, ...role });
      act(() => h.actions().goTo({ r1: 2, c1: 0, r2: 2, c2: 0 }));
      altShift(h, 'ArrowUp');
      expect(groups(h.c().viewLayout)).toEqual(['1:2-3+']);
      expect(h.c().geometry.hiddenRow(2)).toBe(true);
      expect(groups(stored(h))).toEqual(['1:2-3']);
      altShift(h, 'ArrowDown');
      expect(groups(h.c().viewLayout)).toEqual(['1:2-3']);
      act(() => h.c().setSelection(selectRows(5, 5, h.c().grid)));
      altShift(h, 'ArrowRight');
      expect(h.c().menu).toBeNull();
      act(() => h.actions().foldAll('r', true));
      expect(groups(h.c().viewLayout)).toEqual(['1:2-3+']);
      expect(h.writes).toEqual([]);
    }
  });
});

describe('the outline bar (D162)', () => {
  it('draws a control a group, which collapses and expands it', async () => {
    const h = await mountGrid(rows23);
    const band = h.grid.querySelector<HTMLElement>('[data-outline-band="r"]')!;
    expect(band.style.width).toBe('16px');
    const collapse = control(h, 'Collapse rows 3 - 4');
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    // On the line before the group, in the first lane.
    expect([collapse.style.top, collapse.style.left]).toEqual(['30.5px', '2.5px']);
    fireEvent.click(collapse);
    expect(groups(stored(h))).toEqual(['1:2-3+']);
    const expand = control(h, 'Expand rows 3 - 4');
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expand);
    expect(groups(stored(h))).toEqual(['1:2-3']);
  });

  it('draws column groups above the letters, and only a picture while the grid takes no input', async () => {
    const h = await mountGrid({ layout: { colDepth: { col1: 1 } } });
    expect(control(h, 'Collapse column B')).toBeTruthy();
    const still = await mountGrid({ layout: { colDepth: { col1: 1 } }, interactive: false });
    expect(within(still.grid).queryByRole('button', { name: /Collapse/ })).toBeNull();
    expect(still.grid.querySelector('[data-outline-band="c"]')!.textContent).toBe('−');
  });

  it('selects nothing from a band, and opens its menu on a right-click', async () => {
    const h = await mountGrid(rows23);
    const before = h.c().selection;
    fireEvent.pointerDown(h.viewport, { button: 0, clientX: 5, clientY: 100 });
    expect(h.c().selection).toBe(before);
    fireEvent.contextMenu(h.viewport, { clientX: 5, clientY: 100 });
    expect(h.c().menu).toMatchObject({ kind: 'outline', axis: 'r' });
  });

  it('draws a group of every line without a control, and keeps a control’s press from the grid', async () => {
    const every = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`row${i}`, 1]));
    const all = await mountGrid({ layout: { rowDepth: every } });
    expect(within(all.grid).queryByRole('button', { name: /rows 1 - 30/ })).toBeNull();
    const h = await mountGrid(rows23);
    const before = h.c().selection;
    fireEvent.pointerDown(control(h, 'Collapse rows 3 - 4'), { button: 0 });
    expect(h.c().selection).toBe(before);
  });

  it('draws nothing without groups', async () => {
    const h = await mountGrid();
    expect(h.grid.querySelector('[data-outline-band]')).toBeNull();
  });
});
