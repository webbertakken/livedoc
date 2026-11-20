// @vitest-environment jsdom
// docs/specs/034-text-documents/editing-surface.md "The ruler", text-and-paragraphs.md "Non-printing characters": View
// switches, each with its default, remembered in this browser, counted as they flip.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  NON_PRINTING_TOGGLE,
  RULER_TOGGLE,
  useTextDocumentViewToggle,
} from './useTextDocumentViewToggle';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

describe('useTextDocumentViewToggle', () => {
  it('shows the ruler by default, and hides and shows it, remembered in this browser', async () => {
    const { track } = await import('@/lib/telemetry');
    localStorage.removeItem(RULER_TOGGLE.key);
    const { result } = renderHook(() => useTextDocumentViewToggle(RULER_TOGGLE));
    expect(result.current.shown).toBe(true);
    expect(result.current.actions['show-ruler']!.checked).toBe(true);
    act(() => result.current.actions['show-ruler']!.run());
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(RULER_TOGGLE.key)).toBe('hidden');
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentRuler');
    act(() => result.current.actions['show-ruler']!.run());
    expect(result.current.shown).toBe(true);
  });

  it('keeps non-printing characters hidden until shown', () => {
    localStorage.removeItem(NON_PRINTING_TOGGLE.key);
    const { result } = renderHook(() => useTextDocumentViewToggle(NON_PRINTING_TOGGLE));
    expect(result.current.shown).toBe(false);
    act(() => result.current.actions['show-non-printing-characters']!.run());
    expect(result.current.shown).toBe(true);
    expect(localStorage.getItem(NON_PRINTING_TOGGLE.key)).toBe('shown');
  });
});
