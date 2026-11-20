// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SHEET_BAR_FACES_MAX, SheetBar, sheetTabLabel } from './SheetBar';

// docs/specs/029-sheets/surface.md "Sheet bar"; sheet-store.md "Live for everyone": each tab shows who else is on it.

const tabs = [
  { id: 't1', name: 'Sheet1' },
  { id: 't2', name: 'Costs' },
];
const ann = { id: 'ann', name: 'Ann', color: '#e11d48' };
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' };

describe('SheetBar', () => {
  it('opens a sheet on a click and moves with the arrows', () => {
    const onSelect = vi.fn();
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Costs' }));
    expect(onSelect).toHaveBeenCalledWith('t2');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sheet1' }), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('t2');
  });

  it('shows who is on each sheet, in their colour, and says so', () => {
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} peers={{ t2: [ann, bob] }} />);
    const costs = screen.getByRole('tab', { name: 'Costs, also here: Ann, Bob' });
    const faces = costs.querySelectorAll('[data-sheet-peer]');
    expect([...faces].map((f) => (f as HTMLElement).style.backgroundColor)).toEqual([
      'rgb(225, 29, 72)',
      'rgb(37, 99, 235)',
    ]);
    expect(
      screen.getByRole('tab', { name: 'Sheet1' }).querySelector('[data-sheet-peer]'),
    ).toBeNull();
  });

  it(`shows ${SHEET_BAR_FACES_MAX} faces at most, counting the rest`, () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, color: '#000000' }));
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} peers={{ t1: many }} />);
    const tab = screen.getByRole('tab', { name: /^Sheet1, also here/ });
    expect(tab.querySelectorAll('[data-sheet-peer]')).toHaveLength(SHEET_BAR_FACES_MAX);
    expect(tab.textContent).toContain('+2');
  });

  it('names a tab alone when nobody else is on it', () => {
    expect(sheetTabLabel('Sheet1', [])).toBe('Sheet1');
  });
});
