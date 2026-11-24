// @vitest-environment jsdom
// docs/specs/029-sheets/surface.md "Layout": Full Screen, the person's own, off as the spreadsheet opens (D188).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import { useSpreadsheetFullScreen } from './spreadsheet-full-screen';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

describe('useSpreadsheetFullScreen', () => {
  it('starts off, enters once, and exits only while on, counting each turn', () => {
    const { result } = renderHook(() => useSpreadsheetFullScreen());
    expect(result.current.on).toBe(false);
    let left = true;
    act(() => {
      left = result.current.exit();
    });
    expect(left).toBe(false);
    act(() => result.current.enter());
    expect(result.current.on).toBe(true);
    act(() => result.current.enter());
    expect(track).toHaveBeenCalledTimes(1);
    act(() => {
      left = result.current.exit();
    });
    expect(left).toBe(true);
    expect(result.current.on).toBe(false);
    expect(track).toHaveBeenLastCalledWith('UI', 'Toggled', 'SpreadsheetFullScreen');
    expect(track).toHaveBeenCalledTimes(2);
  });
});
