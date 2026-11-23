'use client';

// Which of a list's items lie within a margin of a scroller's view (docs/specs/035-pdf-documents/reading-surface.md
// "The pages", "Thumbnails"): pages and thumbnails are drawn near view and let go far from it. Each item is watched by
// its index; the scroller is read as the hook mounts.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// An item is drawn once it is within one view of view, and keeps its picture until it is three away
// (reading-surface.md "The pages": memory is bounded). Safe ranges: 50% to 200%, and 200% to 600%.
export const NEAR_MARGIN = '100% 0px';
export const HELD_MARGIN = '300% 0px';

export type Within = {
  /** The indices of the items within the margin now. */
  within: ReadonlySet<number>;
  /** Hands an item's element to the watch, or (null) takes it away. */
  watch: (index: number, element: HTMLElement | null) => void;
};

/** `margin`: the observer's root margin (`100% 0px` is a view's height above and below). */
export function useWithin(scroller: RefObject<HTMLElement | null>, margin: string): Within {
  const [within, setWithin] = useState<ReadonlySet<number>>(new Set());
  const observer = useRef<IntersectionObserver | null>(null);
  const elements = useRef(new Map<number, HTMLElement>());
  const indices = useRef(new Map<Element, number>());
  useEffect(() => {
    const made = new IntersectionObserver(
      (entries) =>
        setWithin((before) => {
          const next = new Set(before);
          for (const entry of entries) {
            const index = indices.current.get(entry.target);
            if (index === undefined) continue;
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next;
        }),
      { root: scroller.current, rootMargin: margin },
    );
    observer.current = made;
    for (const element of elements.current.values()) made.observe(element);
    return () => made.disconnect();
  }, [scroller, margin]);
  const watch = useCallback((index: number, element: HTMLElement | null) => {
    const before = elements.current.get(index);
    if (before === element) return;
    if (before) {
      observer.current?.unobserve(before);
      indices.current.delete(before);
    }
    if (element) {
      elements.current.set(index, element);
      indices.current.set(element, index);
      observer.current?.observe(element);
    } else elements.current.delete(index);
  }, []);
  return { within, watch };
}
