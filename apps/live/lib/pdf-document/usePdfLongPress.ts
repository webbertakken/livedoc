'use client';

// A finger held still on a page (docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet"): one finger down
// for PDF_LONG_PRESS_MS, moving less than PDF_DOUBLE_TAP_PX. A second finger, a lift or a scroll the browser takes
// ends it. The browser's own menu for a held finger is not shown on the page: the selection's bar stands for it.
import { useEffect, useRef } from 'react';
import { PDF_DOUBLE_TAP_PX, PDF_LONG_PRESS_MS } from '@livedoc/pdf-documents';

type Held = { id: number; x: number; y: number };

/** Listens on `element` while `enabled`; `onLongPress` is told where the finger touched, in client pixels. */
export function usePdfLongPress(
  element: HTMLElement | null,
  enabled: boolean,
  onLongPress: (client: { x: number; y: number }) => void,
): void {
  const latest = useRef(onLongPress);
  useEffect(() => {
    latest.current = onLongPress;
  });

  useEffect(() => {
    if (!element || !enabled) return;
    const fingers = new Set<number>();
    let held: Held | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(timer);
      held = null;
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      fingers.add(event.pointerId);
      end();
      if (fingers.size > 1) return;
      const now: Held = { id: event.pointerId, x: event.clientX, y: event.clientY };
      held = now;
      timer = setTimeout(() => {
        held = null;
        latest.current({ x: now.x, y: now.y });
      }, PDF_LONG_PRESS_MS);
    };
    const onMove = (event: PointerEvent) => {
      if (held?.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - held.x, event.clientY - held.y) >= PDF_DOUBLE_TAP_PX) end();
    };
    const onLift = (event: PointerEvent) => {
      fingers.delete(event.pointerId);
      if (held?.id === event.pointerId) end();
    };
    // A held finger asks the browser for its menu: on the pages the selection's bar stands for it.
    const onMenu = (event: MouseEvent) => {
      if (fingers.size === 0) return;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onLift);
    element.addEventListener('pointercancel', onLift);
    element.addEventListener('contextmenu', onMenu);
    return () => {
      end();
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onLift);
      element.removeEventListener('pointercancel', onLift);
      element.removeEventListener('contextmenu', onMenu);
    };
  }, [element, enabled]);
}
