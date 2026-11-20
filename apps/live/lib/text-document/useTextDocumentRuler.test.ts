// @vitest-environment jsdom
// docs/specs/034-text-documents/editing-surface.md "The ruler": View > Show ruler, on by default, remembered here.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SHOW_RULER, TEXT_DOCUMENT_RULER_KEY, useTextDocumentRuler } from './useTextDocumentRuler';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

describe('useTextDocumentRuler', () => {
  it('shows the ruler by default, and hides and shows it, remembered in this browser', async () => {
    const { track } = await import('@/lib/telemetry');
    localStorage.removeItem(TEXT_DOCUMENT_RULER_KEY);
    const { result } = renderHook(() => useTextDocumentRuler());
    expect(result.current.shown).toBe(true);
    expect(result.current.actions[SHOW_RULER]!.checked).toBe(true);
    act(() => result.current.actions[SHOW_RULER]!.run());
    expect(result.current.shown).toBe(false);
    expect(localStorage.getItem(TEXT_DOCUMENT_RULER_KEY)).toBe('hidden');
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentRuler');
    act(() => result.current.actions[SHOW_RULER]!.run());
    expect(result.current.shown).toBe(true);
  });
});
