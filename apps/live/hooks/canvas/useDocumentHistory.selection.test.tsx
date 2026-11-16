// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Tab } from '@livedoc/document';
import type { Selection } from '@/lib/selection-store';
import { useDocumentHistory } from './useDocumentHistory';

// docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo": the hook reads the selection as each step is made and
// undone, and its undo and redo hand back the selection to bring back.
const tab = (...ids: string[]): Tab => ({
  id: 't',
  name: 't',
  elements: ids.map((id) => ({ id, type: 'text', x: 0, y: 0, width: 1, height: 1 })),
});
const one = (id: string): Selection => ({ selectedId: id, multiSelectedIds: new Set() });

describe('useDocumentHistory and the selection', () => {
  it('hands undo the selection a step was made with, and redo the one undo left', () => {
    let now = one('a');
    const read = { current: () => now };
    const { result } = renderHook(() => useDocumentHistory([tab('a')], read));

    act(() => result.current.commit(() => [tab('a', 'b')]));
    now = one('b');
    let undone: Selection | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toEqual(one('a'));

    let redone: Selection | null = null;
    act(() => {
      redone = result.current.redo();
    });
    expect(redone).toEqual(one('b'));
  });

  it('keeps the selection a drag began with', () => {
    const read = { current: () => one('a') };
    const { result } = renderHook(() => useDocumentHistory([tab('a')], read));

    act(() => result.current.markCheckpoint());
    act(() => result.current.tick(() => [tab('a', 'b')]));
    let undone: Selection | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toEqual(one('a'));
  });

  it('hands back none without a selection to read', () => {
    const { result } = renderHook(() => useDocumentHistory([tab('a')]));

    act(() => result.current.commit(() => [tab('a', 'b')]));
    let undone: Selection | null = one('x');
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBeNull();
  });
});
