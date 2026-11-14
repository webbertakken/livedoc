import { useEffectEvent, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { useViewportOf } from '@/hooks/canvas/useViewportStore';
import { useEditorBox } from '@/hooks/ui/useEditorBox';
import type { View } from '@/lib/viewport-store';

export type ClientOrigin = { left: number; top: number };

// Where the canvas wrapper's box sits on screen before the view transforms it: <main>'s, which it fills.
export type CanvasBox = { left: number; top: number; width: number; height: number };

// Where canvas (0, 0) sits on screen under a view. The wrapper is scaled about its centre and then panned by
// `offset` canvas px (Canvas.tsx: `scale(zoom) translate(offset)`, origin-center), so its corner lands at
// `centre + zoom · (offset - centre)`. Overlays drawn in fixed client coordinates convert canvas points with it
// (`left + x * zoom`). The isometric tilt is not part of it: a tilted plane has no single origin.
export function canvasClientOrigin(
  box: CanvasBox,
  view: Pick<View, 'zoom' | 'offset'>,
): ClientOrigin {
  const { zoom, offset } = view;
  return {
    left: box.left + (box.width / 2) * (1 - zoom) + zoom * offset.x,
    top: box.top + (box.height / 2) * (1 - zoom) + zoom * offset.y,
  };
}

const sameBox = (a: CanvasBox | null, b: CanvasBox | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height);

// The wrapper's untransformed box, measured in a layout effect (never during render,
// docs/specs/003-system-architecture/react-state-and-effects.md) when it mounts and when the canvas changes size,
// never as the view moves: the view is a transform, and the box is what it transforms
// (docs/specs/008-canvas/canvas-performance.md "Converting between the screen and the canvas reads no layout").
export function useCanvasBox(
  wrapperRef: RefObject<HTMLElement | null>,
  canvasSize: { width: number; height: number },
): CanvasBox | null {
  const [box, setBox] = useState<CanvasBox | null>(null);
  const measure = useEffectEvent(() => {
    const el = wrapperRef.current;
    const parent = el?.offsetParent ?? null;
    const at = parent?.getBoundingClientRect();
    const next =
      el && parent && at
        ? {
            left: at.left + parent.clientLeft + el.offsetLeft,
            top: at.top + parent.clientTop + el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight,
          }
        : null;
    setBox((prev) => (sameBox(prev, next) ? prev : next));
  });
  useLayoutEffect(() => {
    measure();
  }, [canvasSize.width, canvasSize.height]);
  return box;
}

const viewOf = (v: View) => v;
const sameView = (a: View, b: View) =>
  a.zoom === b.zoom && a.offset.x === b.offset.x && a.offset.y === b.offset.y;

// Where canvas (0, 0) sits on screen, for an overlay that draws in client coordinates while `active`; null
// otherwise. It follows the view from the viewport store, so a pan or a zoom moves it and reads no layout.
export function useCanvasClientOrigin(
  wrapperRef: RefObject<HTMLElement | null>,
  active: boolean,
  canvasSize: { width: number; height: number },
): ClientOrigin | null {
  const box = useCanvasBox(wrapperRef, canvasSize);
  const view = useViewportOf(viewOf, sameView);
  return useMemo(() => (active && box ? canvasClientOrigin(box, view) : null), [active, box, view]);
}

// Where canvas (0, 0) sits in the editor's box: the coordinates a `fixed` overlay inside it is placed in. The box is
// the window, or the editor's pane in a split, whose corner such an overlay counts from
// (docs/specs/007-editor/split-view.md "How the editor fits in its pane"). Pointer maths keeps the client origin above.
export function useCanvasOverlayOrigin(
  wrapperRef: RefObject<HTMLElement | null>,
  active: boolean,
  canvasSize: { width: number; height: number },
): ClientOrigin | null {
  const client = useCanvasClientOrigin(wrapperRef, active, canvasSize);
  const box = useEditorBox();
  return useMemo(
    () => (client ? { left: client.left - box.left, top: client.top - box.top } : null),
    [client, box],
  );
}
