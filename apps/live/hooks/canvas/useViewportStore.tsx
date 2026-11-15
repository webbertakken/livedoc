'use client';

// The editor's viewport store in React (docs/specs/008-canvas/canvas-performance.md "Inside the
// canvas"): a provider per editor, and a subscription that renders a reader only when the slice of
// the view it shows changed.

import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useStoreSlice } from '@/hooks/ui/useStoreSlice';
import type { View, ViewportStore } from '@/lib/viewport-store';

const ViewportStoreContext = createContext<ViewportStore | null>(null);

export function ViewportStoreProvider({
  store,
  children,
}: {
  store: ViewportStore;
  children: ReactNode;
}) {
  return <ViewportStoreContext.Provider value={store}>{children}</ViewportStoreContext.Provider>;
}

export function useViewportStore(): ViewportStore {
  const store = useContext(ViewportStoreContext);
  if (!store) throw new Error('ViewportStoreMissing: [viewport] store missing');
  return store;
}

// The store, or null outside an editor's canvas (a board drawn on a slide, say).
export function useViewportStoreIfAny(): ViewportStore | null {
  return useContext(ViewportStoreContext);
}

const neverChanges = () => () => {};

// The whole view, or null outside an editor's canvas: for a reader that follows every pan and zoom wherever it
// is drawn.
export function useViewportIfAny(): View | null {
  const store = useContext(ViewportStoreContext);
  const view = () => store?.get() ?? null;
  return useSyncExternalStore(store?.subscribe ?? neverChanges, view, view);
}

export function useViewportOf<T>(
  select: (view: View) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): T {
  return useStoreSlice(useViewportStore(), select, equal);
}

const zoomOf = (v: View) => v.zoom;

// The zoom, for the overlays that convert canvas points to the screen: they read it themselves, so the chrome
// around them takes no view.
export function useViewportZoom(): number {
  return useViewportOf(zoomOf);
}
