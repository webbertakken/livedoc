import type { RefObject } from 'react';
import { openedFromKeyboard } from '@livedoc/ui';
import { useRightClickRelease } from '@/hooks/canvas/useRightClickRelease';
import { useLongPress } from '@/hooks/ui/useLongPress';
import { elementMenuAnchor, rightClickMenuAnchor } from '@/lib/context-menu-anchor';

type OpenPoint = { clientX: number; clientY: number };

// How an arrow's context menu opens (docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor"), as a boxed
// element's does: a pointer right-click on the line or its label opens it at the pointer; the keyboard and a touch
// long-press open it beside the arrow, at the top-right corner of its on-screen bounding box (the wide hit band's
// rect, so zoom / pan are baked in), falling back to the pointer when the hit band can't be measured.
export function useArrowMenuGestures(
  arrowId: string,
  hitBandRef: RefObject<SVGPathElement | null>,
  onContextSelect: (id: string, screenX: number, screenY: number) => void,
) {
  const hitBandRect = () => hitBandRef.current?.getBoundingClientRect() ?? null;

  const openFromContextMenu = (e: OpenPoint) => {
    const { x, y } = rightClickMenuAnchor({
      pointer: { x: e.clientX, y: e.clientY },
      element: hitBandRect(),
      fromKeyboard: openedFromKeyboard(),
    });
    onContextSelect(arrowId, x, y);
  };

  // Right-click opens on release, like every other element (docs/specs/008-canvas/canvas-and-palette.md).
  const rightClick = useRightClickRelease(openFromContextMenu);

  // Touch long-press opens the arrow's context menu (touch has no right-click); a press that moves becomes a
  // select / drag instead.
  const longPress = useLongPress((x, y) => {
    const rect = hitBandRect();
    const anchor = rect ? elementMenuAnchor(rect) : { x, y };
    onContextSelect(arrowId, anchor.x, anchor.y);
  });

  return { rightClick, longPress, onLabelContextMenu: openFromContextMenu };
}
