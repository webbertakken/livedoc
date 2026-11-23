// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSheet, renderSheet, type SheetHarness } from '@/components/sheets/sheet-ui-test-utils';
import { resetSummaryPick } from '@/lib/spreadsheet/summary-pick';
import { SheetBarSummary, summaryText } from './SheetBarSummary';
import { SummarySlotContext } from './summary-slot';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/components/sheets/selection-stats', async (load) => {
  const real = await load<typeof import('@/components/sheets/selection-stats')>();
  return { ...real, countSelection: vi.fn(real.countSelection) };
});

let slot: HTMLDivElement;
beforeEach(() => {
  slot = document.createElement('div');
  document.body.appendChild(slot);
});
afterEach(() => {
  slot.remove();
  localStorage.clear();
  resetSummaryPick();
});

function show(h: SheetHarness, at = 'A1', where: HTMLElement | null = slot) {
  return renderSheet(
    h,
    () => (
      <SummarySlotContext.Provider value={where}>
        <SheetBarSummary />
      </SummarySlotContext.Provider>
    ),
    { at },
  );
}
const button = () => within(slot).getByRole('button', { name: /^Selection Summary/ });

// docs/specs/029-sheets/surface.md "Sheet bar", D132.
describe('SheetBarSummary', () => {
  let h: SheetHarness;
  beforeEach(async () => {
    h = await makeSheet({ cells: { A1: '1', A2: '2.5', A3: 'text', B1: 'a', B2: 'b' } });
  });

  it('shows nothing for one cell, and nothing without the sheet bar', () => {
    show(h);
    expect(slot.textContent).toBe('');
    act(() => h.select('A1:A3'));
    expect(button().textContent).toContain('Sum: 3.5');
    const { unmount } = show(h, 'A1', null);
    unmount();
  });

  // grid-and-editing.md "Moving around": Alt+Shift+Q puts focus here; Escape hands it back to the grid.
  it('gives focus back to the grid on Escape, once its menu is closed', () => {
    renderSheet(h, ({ c }) => (
      <SummarySlotContext.Provider value={slot}>
        <div tabIndex={0} data-testid="grid" ref={c.setGridEl} />
        <SheetBarSummary />
      </SummarySlotContext.Provider>
    ));
    act(() => h.select('A1:A3'));
    fireEvent.click(button());
    // Escape while the menu is open is the menu's, on its trigger or an item.
    fireEvent.keyDown(button(), { key: 'Escape' });
    expect(document.activeElement).not.toBe(screen.getByTestId('grid'));
    const open = screen.getAllByRole('menuitemradio')[0]!;
    fireEvent.keyDown(open, { key: 'Escape' });
    expect(document.activeElement).not.toBe(screen.getByTestId('grid'));
    button().focus();
    fireEvent.keyDown(button(), { key: 'Tab' });
    expect(document.activeElement).toBe(button());
    fireEvent.keyDown(button(), { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByTestId('grid'));
  });

  it('lists every kind with its value, the pick ticked, and shows the one picked', () => {
    show(h);
    act(() => h.select('A1:A3'));
    fireEvent.click(button());
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'Sum: 3.5',
      'Average: 1.75',
      'Min: 1',
      'Max: 2.5',
      'Count: 3',
      'Count Numbers: 2',
    ]);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(items[5]!);
    expect(button().textContent).toContain('Count Numbers: 2');
    expect(within(slot).getByRole('status').textContent).toBe('Count Numbers: 2');
  });

  it('shows Count where no number is selected, whatever the pick', () => {
    show(h);
    act(() => h.select('B1:B2'));
    expect(button().textContent).toContain('Count: 2');
  });

  it('says when the selection is too large to count', async () => {
    const { countSelection } = await import('@/components/sheets/selection-stats');
    vi.mocked(countSelection).mockReturnValue('too-many');
    show(h);
    act(() => h.select('A1:B2'));
    expect(within(slot).getByRole('status').textContent).toBe('Too many cells');
  });
});

describe('summaryText', () => {
  const stats = { sum: 1234.5, count: 3, numbers: 2, min: 1, max: 1233.5 };
  it('writes a value in the active cell’s format, a count whole, and no value as a dash', () => {
    expect(summaryText('Sum', stats, { nf: 'number', dp: 2 }, 'en-GB')).toBe('Sum: 1,234.50');
    expect(summaryText('Count', stats, { nf: 'percent' }, 'en-GB')).toBe('Count: 3');
    expect(summaryText('Average', { ...stats, numbers: 0 }, undefined, 'en-GB')).toBe('Average: –');
  });
});
