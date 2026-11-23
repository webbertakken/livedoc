// @vitest-environment jsdom
// Smart Fill in the grid (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D148 to D151): a typed text
// offers the column's pattern in grey with a card; Ctrl+Enter or Accept fills, Escape, Dismiss, another key, a press
// or another edit lets it go.
import { act, fireEvent, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installGridDom, mountGrid } from './sheet-grid-test-utils';
import { acceptSmartFill, offerSmartFill } from './sheet-smart-fill';
import type { SheetController } from './sheet-controller';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

let restore: () => void;
beforeAll(() => {
  restore = installGridDom();
});
afterAll(() => restore());

const NAMES = {
  A1: 'Ada',
  B1: 'Lovelace',
  C1: 'Ada Lovelace',
  A2: 'Alan',
  B2: 'Turing',
  A3: 'Grace',
  B3: 'Hopper',
};

type Mounted = Awaited<ReturnType<typeof mountGrid>>;
const typeAt = (h: Mounted, r: number, c: number, draft: string) => {
  act(() => h.c().setEditing({ r, c, draft, origin: 'type' }));
  act(() => void h.actions().commitEdit('down'));
};
const value = (h: Mounted, r: number, c: number) => h.c().workbook.value(h.sheetId, r, c);
const previews = (h: Mounted) =>
  [...h.container.querySelectorAll('[data-smart-fill-preview]')].map((el) => el.textContent);
const card = (h: Mounted) => within(h.container).queryByRole('dialog', { name: 'Smart Fill' });

async function offered(cells: Record<string, string> = NAMES, c = 2) {
  const h = await mountGrid({ cells });
  typeAt(h, 1, c, 'Alan Turing');
  return h;
}

describe('the offer', () => {
  it('shows the texts in grey with a card, and Ctrl+Enter fills them in one go', async () => {
    const h = await offered();
    expect(previews(h)).toEqual(['Grace Hopper']);
    expect(within(card(h)!).getByText('Fill 1 cell with the pattern')).toBeTruthy();
    expect(h.announced.at(-1)).toBe('Smart Fill: Ctrl+Enter fills 1 cell');
    // Ctrl pressed on its way to Ctrl+Enter leaves the offer standing.
    fireEvent.keyDown(h.grid, { key: 'Control', ctrlKey: true });
    fireEvent.keyDown(h.grid, { key: 'Enter', ctrlKey: true });
    expect(value(h, 2, 2)).toBe('Grace Hopper');
    expect(card(h)).toBeNull();
    expect(h.announced.at(-1)).toBe('Smart Fill filled 1 cell');
    // Nothing stands now: Ctrl+Enter does nothing.
    const said = h.announced.length;
    fireEvent.keyDown(h.grid, { key: 'Enter', ctrlKey: true });
    expect(h.announced).toHaveLength(said);
  });

  it('Accept and Dismiss on the card', async () => {
    const h = await offered({ ...NAMES, A4: 'Charles', B4: 'Babbage' });
    expect(within(card(h)!).getByText('Fill 2 cells with the pattern')).toBeTruthy();
    fireEvent.pointerDown(within(card(h)!).getByRole('button', { name: /Accept/ }));
    fireEvent.click(within(card(h)!).getByRole('button', { name: /Accept/ }));
    expect([value(h, 2, 2), value(h, 3, 2)]).toEqual(['Grace Hopper', 'Charles Babbage']);
    const d = await offered();
    fireEvent.click(within(card(d)!).getByRole('button', { name: 'Dismiss' }));
    expect(card(d)).toBeNull();
    expect(value(d, 2, 2)).toBeNull();
  });

  it('ends at Escape, another key, a press on the cells or another edit', async () => {
    const esc = await offered();
    fireEvent.keyDown(esc.grid, { key: 'Escape' });
    expect(card(esc)).toBeNull();
    expect(document.activeElement).toBe(esc.grid);
    const key = await offered();
    fireEvent.keyDown(key.grid, { key: 'ArrowDown' });
    expect(card(key)).toBeNull();
    const press = await offered();
    fireEvent.pointerDown(press.viewport, { button: 0, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 200 });
    expect(card(press)).toBeNull();
    const edit = await offered();
    typeAt(edit, 5, 5, '=1');
    expect(card(edit)).toBeNull();
  });

  it('shows a Mac its keys, and does nothing on Ctrl+Enter for a viewer', async () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const h = await offered();
    expect(within(card(h)!).getByRole('button', { name: /Accept/ }).textContent).toContain('⌘↵');
    platform.mockRestore();
    const viewer = await mountGrid({ cells: NAMES, canEdit: false });
    act(() => viewer.c().setSmartFill({ at: { r: 1, c: 2 }, cells: [{ r: 2, text: 'x' }] }));
    fireEvent.keyDown(viewer.grid, { key: 'Enter', ctrlKey: true });
    expect(value(viewer, 2, 2)).toBeNull();
  });

  it('offers nothing without a pattern, and sits left of a cell near the right edge', async () => {
    const h = await mountGrid({ cells: { A1: 'x' } });
    typeAt(h, 0, 1, 'y');
    expect(card(h)).toBeNull();
    const far = await mountGrid({
      cells: { G1: 'ada', H1: 'ADA', G2: 'alan', G3: 'grace' },
    });
    typeAt(far, 1, 7, 'ALAN');
    const box = card(far)!;
    expect(parseFloat(box.style.left)).toBeLessThan(700);
    // Rows out of view draw no preview.
    act(() => far.c().setSmartFill({ at: { r: 1, c: 7 }, cells: [{ r: 900, text: 'far' }] }));
    expect(previews(far)).toEqual([]);
  });
});

describe('offerSmartFill and acceptSmartFill', () => {
  const grid = (over: Partial<SheetController>) =>
    ({
      canEdit: true,
      smartFill: null,
      setSmartFill: vi.fn(),
      write: vi.fn(() => false),
      announce: vi.fn(),
      ...over,
    }) as unknown as SheetController;

  it('offers nothing to someone who may not write, and accepts nothing when none stands', () => {
    const viewer = grid({ canEdit: false });
    offerSmartFill(viewer, { r: 0, c: 0 });
    expect(viewer.setSmartFill).toHaveBeenCalledWith(null);
    expect(acceptSmartFill(grid({}))).toBe(false);
  });

  it('says nothing when the write is refused', async () => {
    const h = await mountGrid({ cells: { A1: 'a', B1: 'A', A2: 'b' } });
    const c = grid({
      workbook: h.c().workbook,
      sheet: h.c().sheet,
      smartFill: { at: { r: 0, c: 1 }, cells: [{ r: 1, text: 'B' }] },
    });
    expect(acceptSmartFill(c)).toBe(true);
    expect(c.announce).not.toHaveBeenCalled();
    const none = grid({
      workbook: h.c().workbook,
      sheet: h.c().sheet,
      smartFill: { at: { r: 0, c: 1 }, cells: [{ r: 0, text: 'taken' }] },
    });
    expect(acceptSmartFill(none)).toBe(true);
    expect(none.write).not.toHaveBeenCalled();
  });
});
