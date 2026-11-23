// @vitest-environment jsdom
// The grid's workbook keys (docs/specs/029-sheets/grid-and-editing.md "Moving around").
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  SheetStepContext,
  SurfaceRedoContext,
  tabAfter,
  useSheetStep,
  useSpreadsheetSurfaceKeys,
} from './spreadsheet-surface-keys';
import { SummarySlotContext } from './summary-slot';

const tabs = [
  { id: 'a', name: 'Sheet1' },
  { id: 'b', name: 'Sheet2' },
  { id: 'c', name: 'Sheet3' },
];

describe('tabAfter', () => {
  it('is the tab a step away, none past either end or from an unknown tab', () => {
    expect(tabAfter(tabs, 'b', 1)?.id).toBe('c');
    expect(tabAfter(tabs, 'b', -1)?.id).toBe('a');
    expect(tabAfter(tabs, 'c', 1)).toBeNull();
    expect(tabAfter(tabs, 'a', -1)).toBeNull();
    expect(tabAfter(tabs, 'z', 1)).toBeNull();
  });
});

describe('useSheetStep', () => {
  it('opens the tab a step away, and nothing past the end', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSheetStep(tabs, 'b', onSelect));
    result.current(1);
    result.current(-1);
    expect(onSelect.mock.calls).toEqual([['c'], ['a']]);
    const { result: last } = renderHook(() => useSheetStep(tabs, 'c', onSelect));
    last.current(1);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe('useSpreadsheetSurfaceKeys', () => {
  it('steps through the surface and focuses the summary in its slot', () => {
    const step = vi.fn();
    const slot = document.createElement('div');
    slot.innerHTML = '<button aria-haspopup="menu">Sum: 3</button>';
    document.body.appendChild(slot);
    const redo = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SheetStepContext.Provider value={step}>
        <SurfaceRedoContext.Provider value={redo}>
          <SummarySlotContext.Provider value={slot}>{children}</SummarySlotContext.Provider>
        </SurfaceRedoContext.Provider>
      </SheetStepContext.Provider>
    );
    const { result } = renderHook(() => useSpreadsheetSurfaceKeys(), { wrapper });
    result.current.stepSheet(-1);
    expect(step).toHaveBeenCalledWith(-1);
    // F4 outside an edit: the person's timeline redoes (grid-and-editing.md "Formulas").
    result.current.redo();
    expect(redo).toHaveBeenCalledTimes(1);
    result.current.focusSummary();
    expect(document.activeElement).toBe(slot.querySelector('button'));
    // D137: out of the grid, to the toolbar's tab stop.
    const toolbar = document.createElement('div');
    toolbar.dataset.region = 'toolbar';
    toolbar.innerHTML = '<button tabindex="0">Undo</button>';
    document.body.appendChild(toolbar);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    result.current.leaveGrid();
    expect(document.activeElement).toBe(toolbar.querySelector('button'));
    vi.restoreAllMocks();
    toolbar.remove();
    slot.remove();
  });

  it('does nothing without a surface or a summary', () => {
    const { result } = renderHook(() => useSpreadsheetSurfaceKeys());
    expect(() => {
      result.current.stepSheet(1);
      result.current.focusSummary();
      result.current.leaveGrid();
      result.current.redo();
    }).not.toThrow();
  });
});
