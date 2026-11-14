// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { EditorBoxContext, WINDOW_EDITOR_BOX, type EditorBox } from '@/hooks/ui/useEditorBox';
import { canvasWrapperFixture, storeWithOriginAt } from '@/hooks/canvas/canvas-wrapper.fixture';
import { CanvasGuideOverlay } from './CanvasGuideOverlay';

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": the marquee and the guides land under the
// pointer in either pane. In the right pane the editor's box starts 893 px from the window's edge.
const RIGHT_PANE: EditorBox = { left: 893, top: 0, width: 893 };

// A canvas wrapper whose corner sits at (left, top); the view below puts canvas (0, 0) on it, at 2×.
const SIZE = { width: 800, height: 800 };
function wrapperAt(left: number, top: number) {
  return canvasWrapperFixture({ left, top, ...SIZE }).ref;
}

const base: ComponentProps<typeof CanvasGuideOverlay> = {
  alignGuides: [],
  allSnapTargets: [],
  distGuides: [],
  drawHover: null,
  marquee: null,
  tabThemeId: 'brand',
  wrapperRef: wrapperAt(0, 0),
  mainSize: { width: 800, height: 800 },
};

function draw(props: Partial<ComponentProps<typeof CanvasGuideOverlay>>, box = WINDOW_EDITOR_BOX) {
  return render(
    <ViewportStoreProvider store={storeWithOriginAt(2, { left: 0, top: 0, ...SIZE })}>
      <EditorBoxContext.Provider value={box}>
        <CanvasGuideOverlay {...base} {...props} />
      </EditorBoxContext.Provider>
    </ViewportStoreProvider>,
  ).container;
}

const marqueeBox = (c: HTMLElement) => c.querySelector<HTMLElement>('div[aria-hidden]')!;

afterEach(cleanup);

describe('CanvasGuideOverlay marquee', () => {
  it('traces the drag from its start to the pointer when the editor fills the window', () => {
    const c = draw({ marquee: { startX: 300, startY: 200, currentX: 120, currentY: 260 } });

    const box = marqueeBox(c);
    expect(box.style.left).toBe('120px');
    expect(box.style.top).toBe('200px');
    expect(box.style.width).toBe('180px');
    expect(box.style.height).toBe('60px');
  });

  it("traces the drag in the right pane, counted from the pane's corner", () => {
    const c = draw(
      { marquee: { startX: 1000, startY: 450, currentX: 1200, currentY: 600 } },
      RIGHT_PANE,
    );

    const box = marqueeBox(c);
    expect(box.style.left).toBe('107px');
    expect(box.style.top).toBe('450px');
    expect(box.style.width).toBe('200px');
    expect(box.style.height).toBe('150px');
  });
});

describe('CanvasGuideOverlay guides', () => {
  // The canvas origin sits 1,000 px into the window, 107 px into the right pane.
  const wrapperRef = wrapperAt(1000, 40);

  it('draws an alignment guide where the canvas puts it in the right pane', () => {
    const c = draw(
      { wrapperRef, alignGuides: [{ axis: 'x', position: 10, start: 0, end: 50 }] },
      RIGHT_PANE,
    );

    const line = c.querySelector('line')!;
    expect(Number(line.getAttribute('x1'))).toBe(107 + 10 * 2);
    expect(Number(line.getAttribute('y1'))).toBe(40);
    expect(Number(line.getAttribute('y2'))).toBe(40 + 50 * 2);
  });

  it('marks an arrow snap point where the canvas puts it in the right pane', () => {
    const c = draw({ wrapperRef, allSnapTargets: [{ x: 5, y: 5, active: true }] }, RIGHT_PANE);

    const dot = c.querySelector('circle')!;
    expect(Number(dot.getAttribute('cx'))).toBe(107 + 5 * 2);
    expect(Number(dot.getAttribute('cy'))).toBe(40 + 5 * 2);
  });

  it('marks the snapped start of a draw where the canvas puts it in the right pane', () => {
    const c = draw({ wrapperRef, drawHover: { x: 20, y: 30 } }, RIGHT_PANE);

    const dot = c.querySelector('circle')!;
    expect(Number(dot.getAttribute('cx'))).toBe(107 + 20 * 2);
    expect(Number(dot.getAttribute('cy'))).toBe(40 + 30 * 2);
  });

  it('draws an equal-spacing span where the canvas puts it in the right pane', () => {
    const c = draw(
      { wrapperRef, distGuides: [{ axis: 'x', gap: 10, spans: [{ from: 0, to: 10, cross: 5 }] }] },
      RIGHT_PANE,
    );

    const span = c.querySelector('line')!;
    expect(Number(span.getAttribute('x1'))).toBe(107);
    expect(Number(span.getAttribute('x2'))).toBe(107 + 10 * 2);
    expect(Number(span.getAttribute('y1'))).toBe(40 + 5 * 2);
  });

  it('draws a vertical equal-spacing span where the canvas puts it in the right pane', () => {
    const c = draw(
      {
        wrapperRef,
        distGuides: [{ axis: 'y', gap: 10, spans: [{ from: 0, to: 10, cross: 5 }] }],
      },
      RIGHT_PANE,
    );

    const span = c.querySelector('line')!;
    expect(Number(span.getAttribute('x1'))).toBe(107 + 5 * 2);
    expect(Number(span.getAttribute('y1'))).toBe(40);
    expect(Number(span.getAttribute('y2'))).toBe(40 + 10 * 2);
  });

  it('keeps client coordinates when the editor fills the window', () => {
    const c = draw({ wrapperRef, alignGuides: [{ axis: 'y', position: 10, start: 0, end: 50 }] });

    const line = c.querySelector('line')!;
    expect(Number(line.getAttribute('x1'))).toBe(1000);
    expect(Number(line.getAttribute('y1'))).toBe(40 + 10 * 2);
  });
});
