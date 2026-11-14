// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { EditorBoxContext, toEditorBox, useEditorBox, WINDOW_EDITOR_BOX } from './useEditorBox';

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": a gesture overlay placed from
// client coordinates takes the editor box's offset off first, so it lands under the pointer in either pane.
describe('toEditorBox', () => {
  it('leaves a point where it is when the editor fills the window', () => {
    expect(toEditorBox({ x: 300, y: 120 }, WINDOW_EDITOR_BOX)).toEqual({ x: 300, y: 120 });
  });

  it("counts a point from the right pane's corner", () => {
    const box = { left: 893, top: 0, width: 893 };

    expect(toEditorBox({ x: 1000, y: 450 }, box)).toEqual({ x: 107, y: 450 });
  });

  it('takes a box offset from the top too', () => {
    expect(toEditorBox({ x: 10, y: 50 }, { left: 0, top: 20, width: 400 })).toEqual({
      x: 10,
      y: 30,
    });
  });
});

describe('useEditorBox', () => {
  it('reads the window outside a split', () => {
    const { result } = renderHook(() => useEditorBox());

    expect(result.current).toBe(WINDOW_EDITOR_BOX);
  });

  it('reads the pane the split provides', () => {
    const box = { left: 893, top: 0, width: 893 };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EditorBoxContext.Provider value={box}>{children}</EditorBoxContext.Provider>
    );

    const { result } = renderHook(() => useEditorBox(), { wrapper });

    expect(result.current).toBe(box);
  });
});
