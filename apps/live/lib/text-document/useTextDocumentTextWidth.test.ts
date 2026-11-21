// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Pageless": View > Text width, a person's own, Medium until chosen,
// dimmed while the document has pages, counted before it is kept.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { writeLocalStorageValue } from '@/hooks/ui/useLocalStorageValue';
import {
  TEXT_WIDTH_ITEMS,
  TEXT_WIDTH_KEY,
  useTextDocumentTextWidth,
} from './useTextDocumentTextWidth';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

describe('useTextDocumentTextWidth', () => {
  it('is Medium until chosen, and keeps a chosen width in this browser', async () => {
    const { track } = await import('@/lib/telemetry');
    localStorage.removeItem(TEXT_WIDTH_KEY);
    const { result } = renderHook(() => useTextDocumentTextWidth(true));
    expect(result.current.width).toBe('medium');
    expect(result.current.actions[TEXT_WIDTH_ITEMS.medium]!.checked).toBe(true);
    act(() => result.current.actions[TEXT_WIDTH_ITEMS.wide]!.run());
    expect(result.current.width).toBe('wide');
    expect(localStorage.getItem(TEXT_WIDTH_KEY)).toBe('wide');
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'TextDocumentTextWidthWide');
  });

  it('dims the widths while the document has pages, and reads a stray value as Medium', () => {
    writeLocalStorageValue(TEXT_WIDTH_KEY, 'enormous');
    const { result } = renderHook(() => useTextDocumentTextWidth(false));
    expect(result.current.width).toBe('medium');
    expect(result.current.actions[TEXT_WIDTH_ITEMS.full]!.disabled).toBe(true);
  });
});
