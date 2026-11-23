// @vitest-environment jsdom
// The grid's workbook keys (docs/specs/029-sheets/grid-and-editing.md "Moving around").
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  SheetStepContext,
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
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SheetStepContext.Provider value={step}>
        <SummarySlotContext.Provider value={slot}>{children}</SummarySlotContext.Provider>
      </SheetStepContext.Provider>
    );
    const { result } = renderHook(() => useSpreadsheetSurfaceKeys(), { wrapper });
    result.current.stepSheet(-1);
    expect(step).toHaveBeenCalledWith(-1);
    result.current.focusSummary();
    expect(document.activeElement).toBe(slot.querySelector('button'));
    slot.remove();
  });

  it('does nothing without a surface or a summary', () => {
    const { result } = renderHook(() => useSpreadsheetSurfaceKeys());
    expect(() => {
      result.current.stepSheet(1);
      result.current.focusSummary();
    }).not.toThrow();
  });
});
