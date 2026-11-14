// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorBoxContext, WINDOW_EDITOR_BOX, type EditorBox } from '@/hooks/ui/useEditorBox';
import { registerDashboardPlacer } from '@/hooks/plan/dashboard-drop';
import { setPaletteDragPreview } from '@/lib/palette-drag-preview';
import { PaletteDragGhost } from './PaletteDragGhost';

// docs/specs/010-palette/palette-drag-ghost.md: the footprint follows the pointer over the canvas. In a split
// (docs/specs/007-editor/split-view.md "How the editor fits in its pane") it counts from the editor pane's corner.
function dragOverCanvasAt(clientX: number, clientY: number) {
  const main = document.createElement('main');
  document.body.append(main);
  const over = new Event('dragover', { bubbles: true }) as DragEvent;
  Object.assign(over, { clientX, clientY });
  act(() => {
    main.dispatchEvent(over);
  });
}

function ghostIn(box: EditorBox) {
  const { container } = render(
    <EditorBoxContext.Provider value={box}>
      <PaletteDragGhost zoom={2} />
    </EditorBoxContext.Provider>,
  );
  return () => container.querySelector<HTMLElement>('div[aria-hidden]');
}

afterEach(() => {
  act(() => setPaletteDragPreview(null));
  cleanup();
  document.body.replaceChildren();
});

describe('PaletteDragGhost', () => {
  it('centres the footprint on the pointer when the editor fills the window', () => {
    act(() => setPaletteDragPreview({ kind: 'square', width: 100, height: 60 }));
    const ghost = ghostIn(WINDOW_EDITOR_BOX);

    dragOverCanvasAt(400, 300);

    expect(ghost()!.style.left).toBe('400px');
    expect(ghost()!.style.top).toBe('300px');
    expect(ghost()!.style.width).toBe('200px');
  });

  it("centres the footprint on the pointer in the right pane, counted from the pane's corner", () => {
    act(() => setPaletteDragPreview({ kind: 'square', width: 100, height: 60 }));
    const ghost = ghostIn({ left: 893, top: 0, width: 893 });

    dragOverCanvasAt(1000, 300);

    expect(ghost()!.style.left).toBe('107px');
    expect(ghost()!.style.top).toBe('300px');
  });

  it('draws nothing while the pointer is off the canvas', () => {
    act(() => setPaletteDragPreview({ kind: 'square', width: 100, height: 60 }));
    const ghost = ghostIn(WINDOW_EDITOR_BOX);

    const over = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.assign(over, { clientX: 10, clientY: 10 });
    act(() => {
      document.body.dispatchEvent(over);
    });

    expect(ghost()).toBeNull();
  });

  it('draws no footprint for a Plan card, which opens a gap instead', () => {
    act(() => setPaletteDragPreview({ kind: 'plan-card', width: 100, height: 60 }));
    const ghost = ghostIn(WINDOW_EDITOR_BOX);

    dragOverCanvasAt(400, 300);

    expect(ghost()).toBeNull();
  });

  it('draws no footprint over an open Dashboard, whose slot lights up instead', () => {
    const unregister = registerDashboardPlacer(() => {});
    act(() => setPaletteDragPreview({ kind: 'square', width: 100, height: 60 }));
    const ghost = ghostIn(WINDOW_EDITOR_BOX);

    dragOverCanvasAt(400, 300);

    expect(ghost()).toBeNull();
    unregister();
  });
});
