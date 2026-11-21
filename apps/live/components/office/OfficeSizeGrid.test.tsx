// @vitest-environment jsdom
// docs/specs/004-interface-design/office-shell.md "Menus as data", size grid: one menu item of cells; hovering sizes it,
// a press inserts that size, the arrows size it from 1 x 1 and pass to the menu at its edges, its name says the size.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { OfficeEntry } from '@/lib/office/office-catalogue';
import { OfficeMenuPanel } from './OfficeMenuPanel';

const ENTRIES: OfficeEntry[] = [
  {
    kind: 'item',
    id: 'table-grid',
    label: 'Table',
    level: 'edit',
    status: 'built',
    sizeGrid: { columns: 20, rows: 20 },
  },
  { kind: 'item', id: 'table-templates', label: 'Table templates', level: 'edit', status: 'built' },
];

function setup(runSized = vi.fn(), bound = true) {
  const onDone = vi.fn();
  render(
    <OfficeMenuPanel
      entries={ENTRIES}
      actions={{
        ...(bound ? { 'table-grid': { run: vi.fn(), runSized } } : {}),
        'table-templates': { run: vi.fn() },
      }}
      shortcutOf={() => null}
      trigger={null}
      initialFocus="first"
      placement="popup"
      label="Table"
      onClose={vi.fn()}
      onDone={onDone}
    />,
  );
  return { runSized, onDone, grid: screen.getByRole('menuitem', { name: /^Table,/ }) };
}

const cellAt = (grid: HTMLElement, column: number, row: number) =>
  grid.querySelector<HTMLElement>(`[data-size-cell="${column}x${row}"]`)!;

describe('OfficeSizeGrid', () => {
  it('starts at 1 x 1 in a grid of 5 x 5 cells, its name saying the size', () => {
    const { grid } = setup();
    expect(grid.getAttribute('aria-label')).toBe('Table, 1 column by 1 row');
    expect(grid.querySelectorAll('[data-size-cell]')).toHaveLength(25);
    expect(grid.textContent).toContain('1 x 1');
  });

  it('sizes to the cell hovered, growing one past it, and inserts that size on a press', () => {
    const { grid, runSized, onDone } = setup();
    // The fifth column grows the grid a sixth.
    fireEvent.pointerEnter(cellAt(grid, 5, 2));
    fireEvent.pointerEnter(cellAt(grid, 6, 2));
    expect(grid.getAttribute('aria-label')).toBe('Table, 6 columns by 2 rows');
    expect(grid.querySelectorAll('[data-size-cell]')).toHaveLength(7 * 5);
    expect(grid.querySelectorAll('[data-size-cell][data-filled]')).toHaveLength(12);
    expect(grid.textContent).toContain('6 x 2');
    fireEvent.click(cellAt(grid, 6, 2));
    expect(onDone).toHaveBeenCalled();
    expect(runSized).toHaveBeenCalledWith({ columns: 6, rows: 2 });
  });

  it('sizes with the arrows and inserts with Enter, passing Up at one row to the menu', () => {
    const { grid, runSized } = setup();
    grid.focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(grid.getAttribute('aria-label')).toBe('Table, 3 columns by 2 rows');
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(grid.getAttribute('aria-label')).toBe('Table, 3 columns by 1 row');
    // At one row Up is the menu's: focus wraps to its last item.
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Table templates' }));
    grid.focus();
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(runSized).toHaveBeenCalledWith({ columns: 3, rows: 1 });
  });

  it('is dimmed and inert with nothing bound', () => {
    const { grid, runSized } = setup(vi.fn(), false);
    expect(grid.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(cellAt(grid, 2, 2));
    expect(runSized).not.toHaveBeenCalled();
  });
});
