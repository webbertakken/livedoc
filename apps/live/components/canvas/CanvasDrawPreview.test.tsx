// @vitest-environment jsdom
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createViewportStore } from '@/lib/viewport-store';
import { ViewportStoreProvider } from '@/hooks/canvas/useViewportStore';
import { describe, expect, it } from 'vitest';
import type { PendingDraw } from '@/lib/draw-mode';
import { DEFAULT_MIRROR, layOutPages, newLogoPage } from '@livedoc/document';
import { EditorBoxContext, type EditorBox } from '@/hooks/ui/useEditorBox';
import { CanvasDrawPreview } from './CanvasDrawPreview';
import { draftMirrorMaps, toScreen } from './MirrorReflection';

// docs/specs/023-draw-mode/draw-mode.md "Pens": what you see while drawing is what lands.
const wrapper = document.createElement('div');
// The overlay reads the view from the viewport store, at 2x here.
const render = (ui: ReactElement) =>
  rtlRender(<ViewportStoreProvider store={createViewportStore(2)}>{ui}</ViewportStoreProvider>);
const base = {
  drawDrag: null,
  penPoints: null,
  polygonVertices: [],
  polygonCursor: null,
  stamp: null,
  wrapperRef: { current: wrapper },
  mainSize: { width: 1000, height: 1000 },
  whiteboardInk: '#1c1917',
};
const pen: PendingDraw = {
  type: 'freehand',
  variant: 'whiteboard',
  colour: null,
  width: 1.5,
  recognise: false,
};

describe('CanvasDrawPreview on a whiteboard', () => {
  it('leaves the whiteboard pen\u2019s stroke to the canvas layer: nothing in the overlay', () => {
    const { container } = render(
      <CanvasDrawPreview
        {...base}
        penPoints={[
          { x: 0, y: 0 },
          { x: 20, y: 10 },
        ]}
        pendingDraw={pen}
      />,
    );
    expect(container.querySelector('path')).toBeNull();
  });

  it('leaves a line or an arrow to the canvas layer: nothing in the overlay', () => {
    // docs/specs/023-draw-mode/draw-mode.md "Shapes": the arrow renderer draws the one that lands
    // (DrawnArrowPreview); no stand-in line here, on any tab.
    for (const board of [true, undefined] as const) {
      const { container, unmount } = render(
        <CanvasDrawPreview
          {...base}
          drawDrag={{ startX: 0, startY: 0, currentX: 50, currentY: 50 }}
          pendingDraw={{ type: 'arrow', ends: 'to', ...(board ? { board } : {}) }}
        />,
      );
      expect(container.querySelector('svg, line, path')).toBeNull();
      unmount();
    }
  });

  it('previews a rectangle with a solid outline in the ink and no fill', () => {
    const { container } = render(
      <CanvasDrawPreview
        {...base}
        drawDrag={{ startX: 0, startY: 0, currentX: 50, currentY: 50 }}
        pendingDraw={{ type: 'shape', kind: 'square', board: true }}
      />,
    );
    const box = container.querySelector('[data-pen-preview]') as HTMLElement;
    expect(box.style.borderStyle).toBe('solid');
    expect(box.style.borderColor).toBe('rgb(28, 25, 23)');
    expect(box.style.backgroundColor).toBe('');
  });
});

describe('CanvasDrawPreview rectangle corners', () => {
  it('rounds a pen rectangle as the committed one is, at the zoom', () => {
    const { container } = render(
      <CanvasDrawPreview
        {...base}
        drawDrag={{ startX: 0, startY: 0, currentX: 50, currentY: 50 }}
        pendingDraw={{ type: 'shape', kind: 'square', board: true }}
      />,
    );
    const box = container.querySelector('[data-pen-preview]') as HTMLElement;
    expect(box.style.borderRadius).toBe('16px');
  });
});

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": in the right pane the editor's box starts
// 893 px from the window's edge, so a preview counts from the pane's corner and lands under the pointer.
describe('CanvasDrawPreview in the right pane of a split', () => {
  const RIGHT_PANE: EditorBox = { left: 893, top: 0, width: 893 };
  const paneWrapper = document.createElement('div');
  paneWrapper.getBoundingClientRect = () =>
    ({ left: 1000, top: 40, width: 800, height: 800 }) as DOMRect;
  const inPane = (ui: ReactElement) =>
    render(<EditorBoxContext.Provider value={RIGHT_PANE}>{ui}</EditorBoxContext.Provider>);

  it('draws the draw-to-size box where the canvas puts it', () => {
    const { container } = inPane(
      <CanvasDrawPreview
        {...base}
        wrapperRef={{ current: paneWrapper }}
        drawDrag={{ startX: 10, startY: 20, currentX: 60, currentY: 70 }}
        pendingDraw={{ type: 'shape', kind: 'square', board: true }}
      />,
    );

    const box = container.querySelector('[data-pen-preview]') as HTMLElement;
    const placed = box.closest<HTMLElement>('.fixed')!;
    expect(placed.style.left).toBe(`${107 + 10 * 2}px`);
    expect(placed.style.top).toBe(`${40 + 20 * 2}px`);
  });

  it('draws the pencil stroke where the canvas puts it', () => {
    const { container } = inPane(
      <CanvasDrawPreview
        {...base}
        wrapperRef={{ current: paneWrapper }}
        penPoints={[
          { x: 0, y: 0 },
          { x: 20, y: 10 },
        ]}
        pendingDraw={{ type: 'freehand' }}
      />,
    );

    expect(container.querySelector('path')!.getAttribute('d')).toBe(
      `M ${107} ${40} L ${107 + 20 * 2} ${40 + 10 * 2}`,
    );
  });

  it("draws the polygon's placed segments and its rubber band where the canvas puts them", () => {
    const { container } = inPane(
      <CanvasDrawPreview
        {...base}
        wrapperRef={{ current: paneWrapper }}
        polygonVertices={[
          { x: 0, y: 0 },
          { x: 30, y: 0 },
        ]}
        polygonCursor={{ x: 30, y: 30 }}
        pendingDraw={{ type: 'polygon' }}
      />,
    );

    expect(container.querySelector('path')!.getAttribute('d')).toBe(
      `M 107 40 L ${107 + 60} 40 L ${107 + 60} ${40 + 60}`,
    );
  });

  it("places a mirrored page's twins from the pane's corner", () => {
    const [laid] = layOutPages([newLogoPage('logo')]);
    const page = laid!;
    const mirrored = [{ ...page, mirror: { ...DEFAULT_MIRROR, axis: 'vertical' as const } }];
    const { container } = inPane(
      <CanvasDrawPreview
        {...base}
        wrapperRef={{ current: paneWrapper }}
        drawDrag={{
          startX: page.rect.x + 10,
          startY: page.rect.y + 10,
          currentX: page.rect.x + 40,
          currentY: page.rect.y + 40,
        }}
        pendingDraw={{ type: 'shape', kind: 'square', board: true }}
        mirrorPages={mirrored}
      />,
    );

    // The reflection turns about the page's axis where the pane shows it: the canvas origin 107 px into the pane.
    const [map] = draftMirrorMaps(mirrored, {
      x: page.rect.x + 10,
      y: page.rect.y + 10,
      width: 30,
      height: 30,
    });
    const m = toScreen(map!, { left: 107, top: 40 }, 2);
    const twin = container.querySelector<HTMLElement>('[data-mirror-draft]')!;
    expect(twin.style.transform).toBe(`matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`);
  });
});
