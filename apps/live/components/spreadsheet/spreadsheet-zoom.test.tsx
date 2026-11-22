// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { track } from '@/lib/telemetry';
import {
  SpreadsheetZoomProvider,
  useSpreadsheetZoom,
  useSpreadsheetZoomScale,
} from './spreadsheet-zoom';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// docs/specs/029-sheets/surface.md "Grid", D133.
describe('useSpreadsheetZoom', () => {
  it('opens at 100% with the seven levels and no Fit', () => {
    const { result } = renderHook(() => useSpreadsheetZoom());
    expect(result.current.zoom.value).toBe(100);
    expect(result.current.zoom.presets).toEqual([50, 75, 90, 100, 125, 150, 200]);
    expect(result.current.scale).toBe(1);
  });

  it('sets a level once, with one event, and ignores Fit and the level in force', () => {
    vi.mocked(track).mockClear();
    const { result } = renderHook(() => useSpreadsheetZoom());
    act(() => result.current.zoom.onChange(150));
    expect(result.current.scale).toBe(1.5);
    act(() => result.current.zoom.onChange(150));
    act(() => result.current.zoom.onChange('fit'));
    expect(result.current.zoom.value).toBe(150);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'SpreadsheetZoom');
  });
});

describe('useSpreadsheetZoomScale', () => {
  function Scale() {
    return <span>{useSpreadsheetZoomScale()}</span>;
  }

  it('reads 1 outside a spreadsheet and the provided scale inside one', () => {
    const { unmount } = render(<Scale />);
    expect(screen.getByText('1')).toBeTruthy();
    unmount();
    render(
      <SpreadsheetZoomProvider value={0.75}>
        <Scale />
      </SpreadsheetZoomProvider>,
    );
    expect(screen.getByText('0.75')).toBeTruthy();
  });
});
