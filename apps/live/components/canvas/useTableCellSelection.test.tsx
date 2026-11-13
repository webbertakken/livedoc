// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTable } from '@livedoc/document';
import { pointerMenuAnchor } from '@/lib/context-menu-anchor';
import { useTableCellSelection } from './useTableCellSelection';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// The cell selection (docs/specs/008-canvas/canvas-and-palette.md multi-cell selection + the cell menu)
// follows the grid it selects in: it clamps when rows or columns go, closes its menu when editing
// starts or the anchor goes, and clears when the table is deselected.

type Props = {
  rows: number;
  cols: number;
  editing: { r: number; c: number } | null;
  isSelected: boolean;
};
const element = createTable(0, 0);

function setup(initial: Partial<Props> = {}) {
  return renderHook(
    (p: Props) =>
      useTableCellSelection({
        element,
        rows: p.rows,
        cols: p.cols,
        gridRef: { current: null },
        editing: p.editing,
        isSelected: p.isSelected,
        disabled: false,
        onCommitTable: vi.fn(),
      }),
    { initialProps: { rows: 3, cols: 3, editing: null, isSelected: true, ...initial } },
  );
}

// Anchor at (2, 2) with an extra cell at (0, 1) and the menu open.
function selectCorner(result: ReturnType<typeof setup>['result']) {
  act(() => {
    result.current.setSelectedCell({ r: 2, c: 2 });
    result.current.setExtraCells(new Set(['0:1']));
    result.current.setCellMenuPos({ x: 10, y: 20 });
  });
}

describe('useTableCellSelection', () => {
  it('drops an anchor the grid no longer has, and the menu with it', () => {
    const { result, rerender } = setup();
    selectCorner(result);
    rerender({ rows: 2, cols: 3, editing: null, isSelected: true });
    expect(result.current.selectedCell).toBeNull();
    expect(result.current.cellMenuPos).toBeNull();
    // The extra is still inside the smaller grid, so it stays.
    expect([...result.current.extraCells]).toEqual(['0:1']);
  });

  it('drops only the extras past the edge', () => {
    const { result, rerender } = setup();
    act(() => {
      result.current.setSelectedCell({ r: 0, c: 0 });
      result.current.setExtraCells(new Set(['0:1', '0:2']));
    });
    rerender({ rows: 3, cols: 2, editing: null, isSelected: true });
    expect(result.current.selectedCell).toEqual({ r: 0, c: 0 });
    expect([...result.current.extraCells]).toEqual(['0:1']);
  });

  it('closes the menu and collapses the extras when editing starts', () => {
    const { result, rerender } = setup();
    selectCorner(result);
    rerender({ rows: 3, cols: 3, editing: { r: 2, c: 2 }, isSelected: true });
    expect(result.current.cellMenuPos).toBeNull();
    expect(result.current.extraCells.size).toBe(0);
    expect(result.current.selectedCell).toEqual({ r: 2, c: 2 });
  });

  it('closes the menu when the anchor goes', () => {
    const { result } = setup();
    selectCorner(result);
    act(() => result.current.setSelectedCell(null));
    expect(result.current.cellMenuPos).toBeNull();
  });

  it('keeps the menu over an unchanged selection', () => {
    const { result, rerender } = setup();
    selectCorner(result);
    rerender({ rows: 3, cols: 3, editing: null, isSelected: true });
    expect(result.current.cellMenuPos).toEqual({ x: 10, y: 20 });
  });

  it('keeps a menu opened while an edit is already under way', () => {
    // Only a CHANGE of editing or anchor closes it.
    const { result } = setup({ editing: { r: 0, c: 0 } });
    act(() => result.current.setSelectedCell({ r: 1, c: 1 }));
    act(() => result.current.setCellMenuPos({ x: 1, y: 2 }));
    expect(result.current.cellMenuPos).toEqual({ x: 1, y: 2 });
  });

  it('clears everything when the table is deselected', () => {
    const { result, rerender } = setup();
    selectCorner(result);
    rerender({ rows: 3, cols: 3, editing: null, isSelected: false });
    expect(result.current.selectedCell).toBeNull();
    expect(result.current.extraCells.size).toBe(0);
    expect(result.current.cellMenuPos).toBeNull();
  });
});

// docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor": a right-click on a cell opens the cell menu at the
// pointer; the keyboard opens it beside the acting cells.
describe('the cell menu anchor', () => {
  afterEach(() => vi.restoreAllMocks());

  // A 3 x 3 grid drawn at the table's own size, its first column's right edge at x = 100.
  function grid() {
    const node = document.createElement('div');
    node.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: element.width, height: element.height }) as DOMRect;
    return node;
  }

  function setupWithGrid() {
    return renderHook(() =>
      useTableCellSelection({
        element,
        rows: 3,
        cols: 3,
        gridRef: { current: grid() },
        editing: null,
        isSelected: true,
        disabled: false,
        onCommitTable: vi.fn(),
      }),
    );
  }

  it('opens at the pointer on a right-click, selecting the cell', () => {
    const { result } = setupWithGrid();
    document.dispatchEvent(new Event('pointerdown'));
    act(() => result.current.openCellContextMenu({ r: 1, c: 1 }, { clientX: 400, clientY: 300 }));
    expect(result.current.cellMenuPos).toEqual(pointerMenuAnchor({ x: 400, y: 300 }));
    expect(result.current.selectedCell).toEqual({ r: 1, c: 1 });
  });

  it('opens beside the cells from the keyboard', () => {
    // jsdom computes no grid tracks, so the grid reports the ones it was drawn with.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      gridTemplateColumns: '100px 100px 100px',
      gridTemplateRows: '40px 40px 40px',
    } as CSSStyleDeclaration);
    const { result } = setupWithGrid();
    document.dispatchEvent(new Event('keydown'));
    act(() => result.current.openCellContextMenu({ r: 0, c: 0 }, { clientX: 400, clientY: 300 }));
    expect(result.current.cellMenuPos).toEqual({ x: 108, y: 8 });
  });

  it('keeps a multi-selection the right-clicked cell is in', () => {
    const { result } = setupWithGrid();
    act(() => {
      result.current.setSelectedCell({ r: 0, c: 0 });
      result.current.setExtraCells(new Set(['0:1']));
    });
    document.dispatchEvent(new Event('pointerdown'));
    act(() => result.current.openCellContextMenu({ r: 0, c: 1 }, { clientX: 40, clientY: 30 }));
    expect(result.current.selectedCell).toEqual({ r: 0, c: 0 });
    expect([...result.current.extraCells]).toEqual(['0:1']);
  });
});
