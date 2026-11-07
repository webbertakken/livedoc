'use client';

// Hover selection that holds while the pointer heads for the pane (docs/specs/013-workspace/new-document-menu.md "The
// menu"): a row the pointer crosses on its way to the pane does not select; it does
// once the pointer rests on it for MENU_AIM_DELAY_MS, or moves any other way.
import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { MENU_AIM_DELAY_MS, isHeadingTowards, type Point } from './menu-aim';

export function useMenuAim<Id>(pane: RefObject<HTMLElement | null>, onSelect: (id: Id) => void) {
  const last = useRef<Point | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onRowPointerMove = useCallback(
    (id: Id, event: PointerEvent) => {
      const current = { x: event.clientX, y: event.clientY };
      const previous = last.current;
      last.current = current;
      cancel();
      const rect = pane.current?.getBoundingClientRect();
      // The pane sits to the list's left: its right edge is the near one.
      const heading =
        previous !== null &&
        rect !== undefined &&
        isHeadingTowards(previous, current, {
          top: { x: rect.right, y: rect.top },
          bottom: { x: rect.right, y: rect.bottom },
        });
      if (!heading) {
        onSelect(id);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        onSelect(id);
      }, MENU_AIM_DELAY_MS);
    },
    [cancel, onSelect, pane],
  );

  return { onRowPointerMove, cancel };
}
