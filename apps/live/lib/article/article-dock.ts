// Where the page toolbar docks (docs/specs/007-editor/article-pages.md "The page toolbar"): while
// the palette's kind is Article, the Toolbar strip holds a slot for it (ToolbarPalette), and the
// toolbar renders its controls there instead of over the page.
import { useSyncExternalStore } from 'react';

let dock: HTMLElement | null = null;
// Whether the page toolbar has docked its controls there: until it has, the slot holds their place
// (ArticleDockReserve), so the strip is drawn at its final width from the first frame.
let filled = false;
const listeners = new Set<() => void>();

/** The strip's slot mounting (an element) or unmounting (null). */
export function setArticleDock(el: HTMLElement | null): void {
  if (el === dock) return;
  dock = el;
  for (const l of listeners) l();
}

/** The page toolbar's controls docking in the slot (true), or leaving it (false). */
export function setArticleDockFilled(next: boolean): void {
  if (next === filled) return;
  filled = next;
  for (const l of listeners) l();
}

export function useArticleDockFilled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => filled,
    () => false,
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useArticleDock(): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => dock,
    () => null,
  );
}
