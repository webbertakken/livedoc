import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  readSurfaceView,
  scrollSurfaceTo,
  SURFACE_VIEW_SETTLE_FRAMES,
  SURFACE_VIEW_WRITE_MS,
  writeSurfaceView,
  type SurfaceSelection,
} from '@/lib/surface-view';

// A surface's view across tab switches (docs/specs/006-document/kinds-outside-the-canvas.md "Switching tabs"): once
// the surface is ready its remembered scroll and selection come back; as it scrolls, or as the surface says its
// selection moved (`noteViewChanged`), the view is written at most every SURFACE_VIEW_WRITE_MS, and once more as it
// unmounts. Nothing is written before it is ready, so a surface still loading never overwrites the view it will restore.
export function useSurfaceView({
  documentId,
  tabId,
  ready,
  scroller,
  readSelection,
  restoreSelection,
}: {
  documentId: string;
  tabId: string;
  ready: boolean;
  scroller: RefObject<HTMLElement | null>;
  readSelection: () => SurfaceSelection | null;
  restoreSelection: (selection: SurfaceSelection) => void;
}): { noteViewChanged: () => void } {
  const latest = useRef({ readSelection, restoreSelection });
  useLayoutEffect(() => {
    latest.current = { readSelection, restoreSelection };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(false);

  // Where the scroller was, kept as it scrolls: by the time an unmount's cleanup runs the element has left the page,
  // and a detached element reads as scrolled to its top.
  const scrolled = useRef({ top: 0, left: 0 });

  const write = useCallback(() => {
    if (!live.current) return;
    writeSurfaceView(documentId, tabId, {
      scrollTop: scrolled.current.top,
      scrollLeft: scrolled.current.left,
      selection: latest.current.readSelection(),
    });
  }, [documentId, tabId]);

  const noteViewChanged = useCallback(() => {
    if (!live.current || timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      write();
    }, SURFACE_VIEW_WRITE_MS);
  }, [write]);

  // A layout effect: the view comes back before the first paint, and its cleanup runs while a removed surface's
  // element is still on the page, so its last scroll is read even when no scroll event has reported it yet.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!ready || !element) return;
    const view = readSurfaceView(documentId, tabId);
    // The writing may still be growing as it first lays out (its last lines, a font arriving): a scroll the page
    // cannot reach yet is put again on the next frames, until it is reached or SURFACE_VIEW_SETTLE_FRAMES pass.
    let frame = 0;
    let settle: number | null = null;
    const reach = () => {
      if (!view) return;
      scrollSurfaceTo(element, view);
      const short = element.scrollTop < view.scrollTop || element.scrollLeft < view.scrollLeft;
      settle = short && ++frame < SURFACE_VIEW_SETTLE_FRAMES ? requestAnimationFrame(reach) : null;
    };
    // The person moving the page themselves ends it.
    const stopSettling = () => {
      if (settle !== null) cancelAnimationFrame(settle);
      settle = null;
    };
    const handOver = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const type of handOver) element.addEventListener(type, stopSettling, { passive: true });
    if (view) {
      reach();
      if (view.selection) latest.current.restoreSelection(view.selection);
    }
    scrolled.current = { top: element.scrollTop, left: element.scrollLeft };
    live.current = true;
    const onScroll = () => {
      scrolled.current = { top: element.scrollTop, left: element.scrollLeft };
      noteViewChanged();
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      stopSettling();
      for (const type of handOver) element.removeEventListener(type, stopSettling);
      element.removeEventListener('scroll', onScroll);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      if (element.isConnected)
        scrolled.current = { top: element.scrollTop, left: element.scrollLeft };
      write();
      live.current = false;
    };
  }, [ready, documentId, tabId, scroller, noteViewChanged, write]);

  return { noteViewChanged };
}
