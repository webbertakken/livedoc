// @vitest-environment jsdom
// The grid's cells for a screen reader and Read Row, Read Column (docs/specs/029-sheets/grid-and-editing.md
// "Accessibility"; surface.md D135).
import { act, fireEvent, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installGridDom, mountGrid } from './sheet-grid-test-utils';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let restore: () => void;
beforeAll(() => {
  restore = installGridDom();
});
afterAll(() => restore());

type Mounted = Awaited<ReturnType<typeof mountGrid>>;
const mirror = (h: Mounted) => h.grid.querySelector('.sr-only') as HTMLElement;
const rowIndexes = (h: Mounted) =>
  within(mirror(h))
    .getAllByRole('row')
    .map((r) => Number(r.getAttribute('aria-rowindex')));
const select = (h: Mounted, r: number, c: number): void => {
  act(() =>
    h.c().setSelection({
      ranges: [{ r1: r, c1: c, r2: r, c2: c }],
      active: { r, c },
      anchor: { r, c },
    }),
  );
};
const scrollTo = (h: Mounted, top: number) => {
  Object.defineProperty(h.grid, 'scrollTop', { configurable: true, value: top });
  Object.defineProperty(h.grid, 'scrollLeft', { configurable: true, value: 0 });
  fireEvent.scroll(h.grid);
};

describe('the mirror', () => {
  it('holds the cells in view as rows of cells, each with its address and value as drawn', async () => {
    const h = await mountGrid({
      cells: { A1: 'Total', B2: '0.12' },
      formats: { B2: { nf: 'percent' } },
    });
    const rows = within(mirror(h)).getAllByRole('row');
    expect(rows[0]!.getAttribute('aria-rowindex')).toBe('1');
    expect(within(rows[0]!).getByRole('rowheader').textContent).toBe('1');
    const b2 = within(rows[1]!).getAllByRole('gridcell')[1]!;
    expect(b2.getAttribute('aria-colindex')).toBe('2');
    expect(b2.textContent).toBe('B2 12.00%');
    // The active cell is what the grid's aria-activedescendant names.
    const a1 = h.grid.ownerDocument.getElementById(h.grid.getAttribute('aria-activedescendant')!)!;
    expect(a1.textContent).toBe('A1 Total');
    expect(a1.getAttribute('aria-selected')).toBe('true');
  });

  it('names a picture and a sparkline by what they are, as their values are empty text', async () => {
    const h = await mountGrid({
      cells: {
        A1: '=IMAGE("https://a.example/a.png")',
        B1: '=SPARKLINE({1,2,3})',
      },
    });
    const cells = within(within(mirror(h)).getAllByRole('row')[0]!).getAllByRole('gridcell');
    expect(cells[0]!.textContent).toBe('A1 Image from a.example');
    expect(cells[1]!.textContent).toBe('B1 Line sparkline of 3 values');
  });

  it('puts the frozen rows first and keeps the active cell when it is scrolled away', async () => {
    const h = await mountGrid({ rows: 300, layout: { frozenRows: 2 } });
    select(h, 1, 0);
    scrollTo(h, 200 * 24);
    expect(rowIndexes(h).slice(0, 3)).toEqual([1, 2, 199]);
    select(h, 5, 3);
    expect(rowIndexes(h)).toContain(6);
    expect(
      h.grid.ownerDocument.getElementById(h.grid.getAttribute('aria-activedescendant')!),
    ).not.toBeNull();
  });

  it('leaves out hidden lines and mirrors a merge once', async () => {
    const h = await mountGrid({
      layout: {
        hiddenRows: ['row1'],
        merges: [{ r1: 'row2', c1: 'col0', r2: 'row2', c2: 'col1' }],
      },
    });
    expect(rowIndexes(h)).not.toContain(2);
    const row3 = within(mirror(h))
      .getAllByRole('row')
      .find((r) => r.getAttribute('aria-rowindex') === '3')!;
    expect(
      within(row3)
        .getAllByRole('gridcell')
        .map((c) => c.getAttribute('aria-colindex'))
        .slice(0, 2),
    ).toEqual(['1', '3']);
  });
});

describe('Read Row and Read Column', () => {
  it('says the line up to the active cell, again on a second press', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    const h = await mountGrid({ cells: { A1: 'Name', B1: 'Price', B3: '12' } });
    select(h, 2, 1);
    const read = (code: string) =>
      fireEvent.keyDown(h.grid, { key: 'R', code, ctrlKey: true, altKey: true, shiftKey: true });
    read('KeyR');
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    read('KeyC');
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    read('KeyC');
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    vi.useRealTimers();
    expect(h.announced).toEqual([
      '',
      'Row 3: A3 blank, B3 12',
      '',
      'Column B: B1 Price, B2 blank, B3 12',
      '',
      'Column B: B1 Price, B2 blank, B3 12',
    ]);
  });

  it('leaves out hidden lines and the cells a merge covers', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    const h = await mountGrid({
      cells: { A3: 'Merged', D3: 'Here' },
      layout: {
        hiddenCols: ['col2'],
        merges: [{ r1: 'row2', c1: 'col0', r2: 'row2', c2: 'col1' }],
      },
    });
    select(h, 2, 3);
    fireEvent.keyDown(h.grid, {
      key: 'R',
      code: 'KeyR',
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    vi.useRealTimers();
    expect(h.announced.at(-1)).toBe('Row 3: A3 Merged, D3 Here');
  });
});
