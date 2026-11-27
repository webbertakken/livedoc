// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Editing modes": the mode is kept while the document is open, never stored. A
// surface drawn again (a drawing opened and closed) starts where its person left it; without the document's memory (an
// embed), and for another surface, it starts at the level's mode.
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TEXT_DOCUMENT_MODES } from '@/lib/text-document/text-document-modes';
import { OfficeModeMemoryContext, type OfficeModeMemory } from './office-mode-memory';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
const { useOfficeMode } = await import('./useOfficeMode');

const mounted = (memory: OfficeModeMemory | null, key?: string) =>
  renderHook(() => useOfficeMode('edit', TEXT_DOCUMENT_MODES, 'TextDocumentMode', key), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <OfficeModeMemoryContext.Provider value={memory}>{children}</OfficeModeMemoryContext.Provider>
    ),
  });

describe('useOfficeMode', () => {
  it('keeps the mode chosen for a surface drawn again while its document is open', () => {
    const memory: OfficeModeMemory = new Map();
    const first = mounted(memory, 'tab-1');
    expect(first.result.current.mode).toBe('editing');
    act(() => first.result.current.choice.onChange('suggesting'));
    first.unmount();
    expect(mounted(memory, 'tab-1').result.current.mode).toBe('suggesting');
    expect(mounted(memory, 'tab-2').result.current.mode).toBe('editing');
  });

  it('starts at the level’s mode without the document’s memory', () => {
    const first = mounted(null, 'tab-1');
    act(() => first.result.current.choice.onChange('suggesting'));
    first.unmount();
    expect(mounted(null, 'tab-1').result.current.mode).toBe('editing');
  });
});
