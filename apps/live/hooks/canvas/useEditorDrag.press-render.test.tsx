// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasGestureNow, resetCanvasGesturesForTests } from '@/lib/canvas-gesture';
import { useValueStoreSnapshot } from '@/hooks/ui/useValueStore';
import { createShape, type Element, type Tab } from '@livedoc/document';
import { useEditorDrag } from './useEditorDrag';
import type { EditorDragDeps } from './useEditorDrag.types';

// docs/specs/008-canvas/canvas-performance.md "A press renders what shows it": the drag in hand lives in a store,
// so pressing an element and letting go re-render the editor that owns the drag for none of it; what shows the
// drag (the modifier hint, a reshaped arrow's frame) reads the store.

function harness() {
  const a = createShape('square', 0, 0);
  const elements: Element[] = [a];
  const deps = {
    activeTab: { id: 't', name: 'Tab', kind: 'diagram', elements } as Tab,
    zoomRef: { current: 1 },
    setSelectedId: vi.fn(),
    readSelection: () => ({ selectedId: null, multiSelectedIds: new Set<string>() }),
    setMultiSelectedIds: vi.fn(),
    editingId: null,
    isReadOnly: false,
    layerInertIds: new Set<string>(),
    formatSourceId: null,
    applyFormatFromSource: vi.fn(),
    formatToolActive: false,
    setFormatSourceId: vi.fn(),
    connectSourceId: null,
    connectArrowTo: vi.fn(),
    tick: vi.fn(),
    commit: vi.fn(),
    markCheckpoint: () => 1,
    cancelToCheckpoint: vi.fn(),
    autoRebindArrowsRef: { current: false },
    alignmentGuidesRef: { current: false },
    isPinchingRef: { current: false },
    insertGate: { esBoard: false, readOnly: false, tabLocked: false, createBlocked: false },
  } as unknown as EditorDragDeps;
  let renders = 0;
  const view = renderHook(() => {
    renders += 1;
    return useEditorDrag(deps);
  });
  const reader = renderHook(() => useValueStoreSnapshot(view.result.current.dragStore));
  const press = () =>
    act(() => {
      view.result.current.beginDrag(a.id, 'move', {
        clientX: 0,
        clientY: 0,
        button: 0,
        stopPropagation: () => {},
        preventDefault: () => {},
      } as unknown as Parameters<typeof view.result.current.beginDrag>[2]);
    });
  const pointer = (type: 'pointermove' | 'pointerup', x: number) =>
    act(() => {
      window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 0 }));
    });
  return {
    press,
    move: (x: number) => pointer('pointermove', x),
    release: (x: number) => pointer('pointerup', x),
    renders: () => renders,
    shown: () => reader.result.current,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetCanvasGesturesForTests();
});

describe('a press on an element', () => {
  it('re-renders the editor that owns the drag for neither the press nor the release', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now());
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const h = harness();
    const before = h.renders();
    h.press();
    expect(h.shown()).toMatchObject({ kind: 'boxed', mode: 'move' });
    h.move(20);
    expect(canvasGestureNow()).toBe('move');
    h.release(20);
    expect(h.shown()).toBeNull();
    expect(canvasGestureNow()).toBe('idle');
    expect(h.renders()).toBe(before);
  });
});
