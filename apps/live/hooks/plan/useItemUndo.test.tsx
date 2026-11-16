// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Selection } from '@/lib/selection-store';
import { useItemUndo } from './useItemUndo';

// One undo timeline for canvas steps and the steps beside them (docs/specs/026-plan/items.md "Undo";
// docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo").
const kept: Selection = { selectedId: 'a', multiSelectedIds: new Set() };

function setup(at = { depth: 1, branch: 1, futureLength: 0 }, can = true) {
  const history = {
    ...at,
    canUndo: can,
    canRedo: can,
    undo: vi.fn(() => kept),
    redo: vi.fn(() => null),
    clearRedo: vi.fn(),
  };
  return { history, view: renderHook(() => useItemUndo(history)) };
}

describe('useItemUndo', () => {
  it('passes up the selection a canvas step kept', () => {
    const { view } = setup();
    let restored: Selection | null | undefined;
    act(() => {
      restored = view.result.current.undo();
    });
    expect(restored).toBe(kept);
  });

  it('takes a step pushed aside first, leaving the redo side alone', () => {
    const { history, view } = setup();
    const aside = { undo: vi.fn(), redo: vi.fn() };
    act(() => view.result.current.pushAside(aside));

    expect(history.clearRedo).not.toHaveBeenCalled();
    let restored: Selection | null | undefined;
    act(() => {
      restored = view.result.current.undo();
    });
    expect(aside.undo).toHaveBeenCalledTimes(1);
    expect(history.undo).not.toHaveBeenCalled();
    expect(restored).toBeUndefined();

    act(() => {
      view.result.current.redo();
    });
    expect(aside.redo).toHaveBeenCalledTimes(1);
  });

  it('passes over a step with nothing left to take back, to the step before it', () => {
    const { history, view } = setup();
    const stale = { undo: vi.fn(() => false), redo: vi.fn() };
    act(() => view.result.current.pushAside(stale));

    act(() => {
      view.result.current.undo();
    });

    expect(stale.undo).toHaveBeenCalledTimes(1);
    expect(history.undo).toHaveBeenCalledTimes(1);
  });

  it('passes over a redo with nothing left to bring back', () => {
    const { history, view } = setup();
    const stale = { undo: vi.fn(), redo: vi.fn(() => false) };
    act(() => view.result.current.pushAside(stale));
    act(() => {
      view.result.current.undo();
    });

    act(() => {
      view.result.current.redo();
    });

    expect(stale.redo).toHaveBeenCalledTimes(1);
    expect(history.redo).toHaveBeenCalledTimes(1);
  });

  it('clears the redo side for an item change', () => {
    const { history, view } = setup();
    act(() => view.result.current.push({ undo: vi.fn(), redo: vi.fn() }));
    expect(history.clearRedo).toHaveBeenCalledTimes(1);
  });

  it('does nothing with no step on either side, and offers a step pushed aside', () => {
    const { history, view } = setup(undefined, false);
    expect(view.result.current.canUndo).toBe(false);
    act(() => {
      expect(view.result.current.undo()).toBeUndefined();
      expect(view.result.current.redo()).toBeUndefined();
    });
    expect(history.undo).not.toHaveBeenCalled();

    act(() => view.result.current.pushAside({ undo: vi.fn(), redo: vi.fn() }));
    expect(view.result.current.canUndo).toBe(true);
    act(() => {
      view.result.current.undo();
    });
    expect(view.result.current.canRedo).toBe(true);
  });
});
