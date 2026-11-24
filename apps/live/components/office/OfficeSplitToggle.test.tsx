// @vitest-environment jsdom
// docs/specs/004-interface-design/office-shell.md "Toolbar": a split toggle and its choice grid.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { OfficeChoice } from './OfficeChoiceMenu';
import { OfficeSplitToggle } from './OfficeSplitToggle';

const ICON = [{ type: 'path', d: 'M0 0h1' }] as never;
const CELLS = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  id,
  label: `Style ${id}`,
  lines: [
    { level: 0, marker: '1.' },
    { level: 1, marker: '', box: 'ticked' as const, word: { text: 'Done', struck: true } },
    { level: 2, marker: '', box: 'open' as const },
  ],
}));

function setup({ inert = false, grid = true, onBarKey = () => {} } = {}) {
  const toggle = vi.fn();
  const pick = vi.fn();
  const choice: OfficeChoice = {
    read: () => 'b',
    entries: [],
    actions: Object.fromEntries(CELLS.map((c) => [c.id, { run: () => void pick(c.id) }])),
    ...(grid ? { grid: { columns: 3, cells: CELLS } } : {}),
  };
  render(
    // The bar's own arrow keys sit above the grid in React's tree, through the popup's portal.
    <div onKeyDown={onBarKey}>
      <OfficeSplitToggle
        id="numbered-list"
        label="Numbered list"
        icon={ICON}
        action={{ run: toggle }}
        pressed
        inert={inert}
        shortcut={{ shown: '⌘⇧7', aria: 'Meta+Shift+7' }}
        choice={choice}
        tabIndex={0}
        className=""
        chevronClassName=""
      />
    </div>,
  );
  return {
    toggle,
    pick,
    button: screen.getByRole('button', { name: 'Numbered list' }),
    chevron: () => screen.queryByRole('button', { name: 'Numbered list styles' }),
  };
}

const focused = () => document.activeElement?.getAttribute('aria-label');

describe('OfficeSplitToggle', () => {
  it('toggles from its button, pressed as the binding says', () => {
    const { button, toggle } = setup();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Meta+Shift+7');
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('opens its grid from the chevron, on the cell in force, and runs the cell taken', () => {
    const { chevron, pick } = setup();
    fireEvent.click(chevron()!);
    const grid = screen.getByRole('menu', { name: 'Numbered list styles' });
    const cells = screen.getAllByRole('menuitemradio');
    expect(cells.map((c) => c.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(grid.querySelector('[data-box="ticked"]')!.textContent).toBe('✓');
    expect(grid.querySelector('.line-through')!.textContent).toBe('Done');
    expect(focused()).toBe('Style b');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Style d' }));
    expect(pick).toHaveBeenCalledWith('d');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('moves by cell and by row with the arrows, and opens from Down on the toggle', () => {
    const { button } = setup();
    fireEvent.keyDown(button, { key: 'ArrowUp' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(focused()).toBe('Style b');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(focused()).toBe('Style e');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(focused()).toBe('Style a');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(focused()).toBe('Style e');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(focused()).toBe('Style b');
    // With a modifier, or from no cell, the grid leaves the key to the menu.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight', ctrlKey: true });
    expect(focused()).toBe('Style b');
    fireEvent.keyDown(menu, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps the arrows it moves by from the bar around it', () => {
    const onBarKey = vi.fn();
    const { chevron } = setup({ onBarKey });
    fireEvent.click(chevron()!);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(onBarKey).not.toHaveBeenCalled();
  });

  it('closes its grid from the chevron pressed again', () => {
    const { chevron } = setup();
    fireEvent.click(chevron()!);
    expect(chevron()!.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chevron()!);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does nothing while inert, and draws no chevron without a grid', () => {
    const inert = setup({ inert: true });
    fireEvent.click(inert.button);
    fireEvent.click(inert.chevron()!);
    expect(inert.toggle).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    document.body.innerHTML = '';
    const bare = setup({ grid: false });
    expect(bare.chevron()).toBeNull();
    fireEvent.keyDown(bare.button, { key: 'ArrowDown' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

// office-shell.md "Toolbar": a grid of tools shows each as its glyph and its name, not a preview of lines.
describe('a split toggle’s grid of tools', () => {
  it('draws a cell with a glyph as the glyph over its name', () => {
    const choice: OfficeChoice = {
      read: () => 'underline',
      entries: [],
      actions: { underline: { run: () => {} } },
      grid: { columns: 1, cells: [{ id: 'underline', label: 'Underline', icon: ICON }] },
    };
    render(
      <OfficeSplitToggle
        id="text-marks"
        label="Underline"
        icon={ICON}
        action={{ run: () => {} }}
        pressed={false}
        inert={false}
        shortcut={null}
        choice={choice}
        tabIndex={0}
        className=""
        chevronClassName=""
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Underline styles' }));
    const cell = screen.getByRole('menuitemradio', { name: 'Underline' });
    expect(cell.querySelector('svg')).not.toBeNull();
    expect(cell.textContent).toBe('Underline');
  });
});
