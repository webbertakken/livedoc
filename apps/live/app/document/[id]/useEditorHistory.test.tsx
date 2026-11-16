// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Tab } from '@livedoc/document';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import type { Selection } from '@/lib/selection-store';
import { describe, expect, it, vi } from 'vitest';
import { createSelectionStore } from '@/lib/selection-store';
import { useEditorHistory } from './useEditorHistory';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/announcer', () => ({ announce: vi.fn() }));

// A locked tab pauses undo and redo on every route (docs/specs/008-canvas/canvas-and-palette.md
// "A locked tab pauses undo and redo"): the flags the toolbar and the command palette read, and
// the handlers the keyboard shortcuts call.
function setup(tabLocked: boolean) {
  const undoHistory = vi.fn();
  const redoHistory = vi.fn();
  const { result } = renderHook(() =>
    useEditorHistory({
      activeId: 't1',
      tabs: [],
      editsBlocked: tabLocked,
      canUndo: true,
      canRedo: true,
      tabLocked,
      tickTabs: vi.fn(),
      undoHistory,
      redoHistory,
      pushAside: vi.fn(),
      selection: createSelectionStore(),
      set: { setEditingId: vi.fn(), setFormatSourceId: vi.fn() },
    }),
  );
  return { result, undoHistory, redoHistory };
}

describe('useEditorHistory on a locked tab', () => {
  it('reports undo and redo unavailable and ignores both', () => {
    const { result, undoHistory, redoHistory } = setup(true);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    result.current.undo();
    result.current.redo();
    expect(undoHistory).not.toHaveBeenCalled();
    expect(redoHistory).not.toHaveBeenCalled();
  });

  it('undoes and redoes as usual once the tab is unlocked', () => {
    const { result, undoHistory, redoHistory } = setup(false);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
    result.current.undo();
    result.current.redo();
    expect(undoHistory).toHaveBeenCalledTimes(1);
    expect(redoHistory).toHaveBeenCalledTimes(1);
  });
});

// docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo": undo and redo bring back the selection each step kept, and
// a person's own deselect is a step of its own that leaves the redo side alone.
describe('useEditorHistory and the selection', () => {
  const tabWith = (...ids: string[]) =>
    ({ id: 't1', name: 'T', elements: ids.map((id) => ({ id })) }) as unknown as Tab;
  const one = (id: string): Selection => ({ selectedId: id, multiSelectedIds: new Set() });
  const many = (...ids: string[]): Selection => ({
    selectedId: null,
    multiSelectedIds: new Set(ids),
  });

  function withSelection(opts: {
    tabs?: Tab[];
    undo?: () => Selection | null | undefined;
    redo?: () => Selection | null | undefined;
  }) {
    const selection = createSelectionStore();
    const steps: ItemUndoStep[] = [];
    const view = renderHook(
      ({ tabs, activeId }: { tabs: Tab[]; activeId: string }) =>
        useEditorHistory({
          activeId,
          tabs,
          editsBlocked: false,
          canUndo: true,
          canRedo: true,
          tabLocked: false,
          tickTabs: vi.fn(),
          undoHistory: opts.undo ?? (() => undefined),
          redoHistory: opts.redo ?? (() => undefined),
          pushAside: (step) => steps.push(step),
          selection,
          set: { setEditingId: vi.fn(), setFormatSourceId: vi.fn() },
        }),
      {
        initialProps: { tabs: opts.tabs ?? [tabWith('a', 'b')], activeId: 't1' },
      },
    );
    return { selection, steps, view };
  }

  it('brings back the selection an undone step kept, once its tabs are in, less what it took away', () => {
    const t = withSelection({ undo: () => many('a', 'gone') });

    act(() => t.view.result.current.undo());
    t.view.rerender({ tabs: [tabWith('a', 'b')], activeId: 't1' });

    expect(t.selection.get()).toEqual(one('a'));
  });

  it('clears the selection when a redone step kept none', () => {
    const t = withSelection({ redo: () => null });
    act(() => t.selection.setSelection(one('b')));

    act(() => t.view.result.current.redo());
    t.view.rerender({ tabs: [tabWith('a', 'b')], activeId: 't1' });

    expect(t.selection.get().selectedId).toBeNull();
  });

  it('leaves the selection to a step beside the canvas', () => {
    const t = withSelection({ undo: () => undefined });
    act(() => t.selection.setSelection(one('b')));

    act(() => t.view.result.current.undo());
    t.view.rerender({ tabs: [tabWith('a')], activeId: 't1' });

    expect(t.selection.get()).toEqual(one('b'));
  });

  it('makes a deselect a step that undo takes back and redo makes again', () => {
    const t = withSelection({});
    act(() => t.selection.setSelection(many('a', 'b')));

    act(() => t.view.result.current.deselect());
    expect(t.selection.get().multiSelectedIds.size).toBe(0);
    expect(t.steps).toHaveLength(1);

    act(() => expect(t.steps[0]!.undo()).toBe(true));
    expect(t.selection.get()).toEqual(many('a', 'b'));
    act(() => expect(t.steps[0]!.redo()).toBe(true));
    expect(t.selection.get().multiSelectedIds.size).toBe(0);
  });

  it('makes no step when nothing was selected', () => {
    const t = withSelection({});
    act(() => t.view.result.current.deselect());
    expect(t.steps).toHaveLength(0);
  });

  it('passes over a deselect whose elements are gone, or that redo has nothing to clear for', () => {
    const t = withSelection({});
    act(() => t.selection.setSelection(one('a')));
    act(() => t.view.result.current.deselect());

    expect(t.steps[0]!.redo()).toBe(false);
    t.view.rerender({ tabs: [tabWith('b')], activeId: 't1' });
    expect(t.steps[0]!.undo()).toBe(false);
  });

  it('holds the selection until the restored tabs are in', () => {
    const t = withSelection({ undo: () => one('a') });
    act(() => t.selection.setSelection(one('b')));

    act(() => t.view.result.current.undo());

    expect(t.selection.get()).toEqual(one('b'));
  });

  it('passes over a deselect made on another tab', () => {
    const t = withSelection({});
    act(() => t.selection.setSelection(one('a')));
    act(() => t.view.result.current.deselect());
    t.view.rerender({ tabs: [tabWith('a')], activeId: 't2' });

    expect(t.steps[0]!.undo()).toBe(false);
  });

  it('passes over a deselect when its selection is already back', () => {
    const t = withSelection({});
    act(() => t.selection.setSelection(one('a')));
    act(() => t.view.result.current.deselect());
    act(() => t.selection.setSelection(one('a')));

    expect(t.steps[0]!.undo()).toBe(false);
  });
});
