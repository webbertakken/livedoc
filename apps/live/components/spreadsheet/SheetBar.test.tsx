// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { stubResizeObserver } from '@/components/sheets/sheet-ui-test-utils';
import { SheetBar } from './SheetBar';
import { SHEET_BAR_FACES_MAX, sheetTabLabel } from './SheetBarTab';
import type { SheetBarActions } from './useSheetBarActions';

// docs/specs/029-sheets/surface.md "Sheet bar"; sheet-store.md "Live for everyone": each tab shows who else is on it.

const tabs = [
  { id: 't1', name: 'Sheet1' },
  { id: 't2', name: 'Costs' },
];
const ann = { id: 'ann', name: 'Ann', color: '#e11d48' };
const bob = { id: 'bob', name: 'Bob', color: '#2563eb' };

describe('SheetBar', () => {
  it('keeps room at its end for the selection’s summary', () => {
    const slot = vi.fn<(element: HTMLDivElement | null) => void>();
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={() => {}} summarySlot={slot} />);
    expect((slot.mock.calls[0]![0] as HTMLElement).hasAttribute('data-sheet-summary')).toBe(true);
  });

  it('opens a sheet on a click and moves with the arrows', () => {
    const onSelect = vi.fn();
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Costs' }));
    expect(onSelect).toHaveBeenCalledWith('t2');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sheet1' }), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('t2');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sheet1' }), { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('t2');
    // Any other key is the tab's own.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sheet1' }), { key: 'a' });
    expect(onSelect).toHaveBeenCalledTimes(3);
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

// spreadsheet.md "Sheets in the sheet bar"; surface.md "Sheet bar" (D172, D174, D175).
function bar(over: Partial<SheetBarActions> = {}): SheetBarActions {
  return {
    canChange: true,
    renaming: null,
    startRename: vi.fn(),
    renameOpen: vi.fn(),
    add: vi.fn(),
    duplicate: vi.fn(),
    rename: vi.fn(() => true),
    remove: vi.fn(),
    ...over,
  };
}

// A menu's item: a button, or an aria-disabled span when dimmed.
const menuItem = (name: string) =>
  screen
    .getByText(name, { selector: 'button, [aria-disabled], button *, [aria-disabled] *' })
    .closest('button, [aria-disabled]') as HTMLElement;

const flushFrames = () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });

describe('SheetBar changes', () => {
  beforeAll(stubResizeObserver);

  it('adds a sheet after the last for an Editor, and shows no Add Sheet otherwise', () => {
    const actions = bar();
    const { rerender } = render(
      <SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={actions} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Sheet' }));
    expect(actions.add).toHaveBeenCalledWith('end');
    rerender(
      <SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={bar({ canChange: false })} />,
    );
    expect(screen.queryByRole('button', { name: 'Add Sheet' })).toBeNull();
  });

  it('opens a tab’s menu by its arrow, a right-click and Shift+F10, and runs its items', () => {
    const actions = bar();
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Costs menu' }));
    fireEvent.click(menuItem('Duplicate'));
    expect(actions.duplicate).toHaveBeenCalledWith('t2');
    expect(screen.queryByText('Duplicate')).toBeNull();
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Sheet1' }), { clientX: 5, clientY: 5 });
    fireEvent.click(menuItem('Delete'));
    expect(actions.remove).toHaveBeenCalledWith('t1');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sheet1' }), { key: 'F10', shiftKey: true });
    fireEvent.click(menuItem('Rename'));
    expect(actions.startRename).toHaveBeenCalledWith('t1');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sheet1' }), { key: 'ContextMenu' });
    expect(menuItem('Rename')).toBeTruthy();
  });

  it('dims what is not built, what the role may not use, and Delete on the last sheet', () => {
    const { unmount } = render(
      <SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={bar({ canChange: false })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sheet1 menu' }));
    for (const name of ['Delete', 'Duplicate', 'Rename', 'Copy To', 'Change Colour', 'Move Left'])
      expect(menuItem(name).getAttribute('aria-disabled')).toBe('true');
    unmount();
    render(<SheetBar tabs={tabs.slice(0, 1)} activeId="t1" onSelect={vi.fn()} actions={bar()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sheet1 menu' }));
    expect(menuItem('Delete').getAttribute('aria-disabled')).toBe('true');
    expect(menuItem('Duplicate').getAttribute('aria-disabled')).toBe(null);
  });

  it('opens no menu while the sheets are not reachable', () => {
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sheet1 menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renames on a double-click for an Editor only', () => {
    const actions = bar();
    const { rerender } = render(
      <SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={actions} />,
    );
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Costs' }));
    expect(actions.startRename).toHaveBeenCalledWith('t2');
    const viewer = bar({ canChange: false });
    rerender(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={viewer} />);
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Costs' }));
    expect(viewer.startRename).not.toHaveBeenCalled();
  });

  it('saves a name by Enter and keeps it by Escape, then hands focus back to the tab (D172)', async () => {
    const actions = bar({ renaming: 't2' });
    const { rerender } = render(
      <SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={actions} />,
    );
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Sheet name' });
    await flushFrames();
    expect(document.activeElement).toBe(field);
    expect(field.selectionEnd! - field.selectionStart!).toBe('Costs'.length);
    fireEvent.keyDown(field, { key: 'a' });
    fireEvent.change(field, { target: { value: 'Q3' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    // Leaving after Enter saves nothing twice.
    fireEvent.blur(field);
    expect(actions.rename).toHaveBeenCalledTimes(1);
    expect(actions.rename).toHaveBeenCalledWith('t2', 'Q3');
    expect(actions.startRename).toHaveBeenCalledWith(null);
    rerender(
      <SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={bar({ renaming: null })} />,
    );
    await flushFrames();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Costs' }));
    const kept = bar({ renaming: 't1' });
    rerender(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={kept} />);
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Sheet name' }), { key: 'Escape' });
    expect(kept.rename).not.toHaveBeenCalled();
    expect(kept.startRename).toHaveBeenCalledWith(null);
  });

  it('saves a name when the field is left', () => {
    const actions = bar({ renaming: 't1' });
    render(<SheetBar tabs={tabs} activeId="t1" onSelect={vi.fn()} actions={actions} />);
    const field = screen.getByRole('textbox', { name: 'Sheet name' });
    fireEvent.change(field, { target: { value: 'Data' } });
    fireEvent.blur(field);
    expect(actions.rename).toHaveBeenCalledWith('t1', 'Data');
  });
});
