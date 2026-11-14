import { vi } from 'vitest';
import type { CanvasBox } from '@/hooks/canvas/useCanvasClientOrigin';
import { createViewportStore, type View, type ViewportStore } from '@/lib/viewport-store';

// For the unit tests of what converts between the screen and the canvas (useCanvasClientOrigin): jsdom lays
// nothing out, so a canvas wrapper is given the box a browser would, filling a <main> at `box`.

export const CANVAS_BOX: CanvasBox = { left: 0, top: 0, width: 1000, height: 1000 };

export function canvasWrapperFixture(box: CanvasBox = CANVAS_BOX) {
  const main = document.createElement('main');
  const measure = vi.fn(
    () => ({ left: box.left, top: box.top, width: box.width, height: box.height }) as DOMRect,
  );
  main.getBoundingClientRect = measure;
  const wrapper = document.createElement('div');
  Object.defineProperties(wrapper, {
    offsetParent: { get: () => main },
    offsetLeft: { get: () => 0 },
    offsetTop: { get: () => 0 },
    offsetWidth: { get: () => box.width },
    offsetHeight: { get: () => box.height },
  });
  return { ref: { current: wrapper }, measure };
}

// The view at `zoom` that puts canvas (0, 0) on the box's corner, or on `at`.
export function viewWithOriginAt(
  zoom: number,
  box: CanvasBox = CANVAS_BOX,
  at: { left: number; top: number } = box,
): View {
  return {
    zoom,
    offset: {
      x: (at.left - box.left - (box.width / 2) * (1 - zoom)) / zoom,
      y: (at.top - box.top - (box.height / 2) * (1 - zoom)) / zoom,
    },
  };
}

// A viewport store holding that view.
export function storeWithOriginAt(zoom: number, box: CanvasBox = CANVAS_BOX): ViewportStore {
  const store = createViewportStore(zoom);
  store.setView(viewWithOriginAt(zoom, box));
  return store;
}
