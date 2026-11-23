// @vitest-environment jsdom
// The keys of rows and columns (docs/specs/029-sheets/grid-and-editing.md "Rows, columns and cells", D157):
// Ctrl+Alt+= and Ctrl+Alt+- act on whole lines or open their menu over cells; Ctrl+Alt+9 and 0 hide, Ctrl+Shift+9
// and 0 show; an Editor's only.
import { act, fireEvent } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { selectCols, selectRows } from '@livedoc/sheets';
import { installGridDom, mountGrid } from './sheet-grid-test-utils';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let restore: () => void;
beforeAll(() => {
  restore = installGridDom();
});
afterAll(() => restore());

type Mounted = Awaited<ReturnType<typeof mountGrid>>;
const ctrlAlt = (h: Mounted, code: string) =>
  fireEvent.keyDown(h.grid, { key: '?', code, ctrlKey: true, altKey: true });
const ctrlShift = (h: Mounted, code: string) =>
  fireEvent.keyDown(h.grid, { key: '?', code, ctrlKey: true, shiftKey: true });
const layout = (h: Mounted) => h.store.sheet(h.sheetId)!.layout;

describe('Ctrl+Alt+= and Ctrl+Alt+-', () => {
  it('insert rows above and delete whole rows at once', async () => {
    const h = await mountGrid({ cells: { A3: 'x' } });
    act(() => h.c().setSelection(selectRows(1, 2, h.c().grid)));
    ctrlAlt(h, 'Equal');
    expect(layout(h).rows).toHaveLength(32);
    ctrlAlt(h, 'Minus');
    expect(layout(h).rows).toHaveLength(30);
    expect(h.c().menu).toBeNull();
  });

  it('insert columns left and delete whole columns at once', async () => {
    const h = await mountGrid();
    act(() => h.c().setSelection(selectCols(2, 2, h.c().grid)));
    ctrlAlt(h, 'Equal');
    expect(layout(h).cols).toHaveLength(11);
    ctrlAlt(h, 'Minus');
    expect(layout(h).cols).toHaveLength(10);
  });

  it('open their menu at the active cell over cells', async () => {
    const h = await mountGrid();
    ctrlAlt(h, 'Equal');
    expect(h.c().menu).toMatchObject({ kind: 'lines', op: 'insert' });
    act(() => h.c().setMenu(null));
    ctrlAlt(h, 'Minus');
    expect(h.c().menu).toMatchObject({ kind: 'lines', op: 'delete' });
    expect(layout(h).rows).toHaveLength(30);
  });
});

describe('Ctrl+Alt+9 and 0, Ctrl+Shift+9 and 0', () => {
  it('hide the selection’s rows or columns, and show the hidden ones within it', async () => {
    const h = await mountGrid();
    act(() => h.actions().goTo({ r1: 2, c1: 1, r2: 3, c2: 2 }));
    ctrlAlt(h, 'Digit9');
    expect(layout(h).hiddenRows).toEqual(layout(h).rows.slice(2, 4));
    ctrlAlt(h, 'Digit0');
    expect(layout(h).hiddenCols).toEqual(layout(h).cols.slice(1, 3));
    act(() => h.actions().goTo({ r1: 1, c1: 0, r2: 4, c2: 3 }));
    ctrlShift(h, 'Digit9');
    expect(layout(h).hiddenRows ?? []).toEqual([]);
    ctrlShift(h, 'Digit0');
    expect(layout(h).hiddenCols ?? []).toEqual([]);
  });
});

describe('who may', () => {
  it('leaves the shape alone for a Participant and a Viewer', async () => {
    for (const role of [{ canShape: false }, { canEdit: false }]) {
      const h = await mountGrid(role);
      act(() => h.c().setSelection(selectRows(1, 1, h.c().grid)));
      ctrlAlt(h, 'Equal');
      ctrlAlt(h, 'Digit9');
      act(() => h.actions().goTo({ r1: 1, c1: 1, r2: 1, c2: 1 }));
      ctrlAlt(h, 'Minus');
      expect(layout(h).rows).toHaveLength(30);
      expect(layout(h).hiddenRows ?? []).toEqual([]);
      expect(h.c().menu).toBeNull();
      expect(h.writes).toEqual([]);
      h.unmount();
    }
  });
});
