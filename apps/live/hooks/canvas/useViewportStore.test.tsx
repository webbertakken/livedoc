// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createViewportStore } from '@/lib/viewport-store';
import {
  ViewportStoreProvider,
  useViewportOf,
  useViewportStore,
  useViewportZoom,
} from './useViewportStore';

// docs/specs/008-canvas/canvas-performance.md.

describe('useViewportOf', () => {
  it('re-renders a reader only when its slice of the view changes', () => {
    const store = createViewportStore(1);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ViewportStoreProvider store={store}>{children}</ViewportStoreProvider>
    );
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useViewportOf((v) => v.zoom);
      },
      { wrapper },
    );
    const before = renders;
    act(() => store.setOffset({ x: 4, y: 4 }));
    expect(renders).toBe(before);
    act(() => store.setZoom(3));
    expect(result.current).toBe(3);
  });
});

describe('useViewportStore', () => {
  it('throws outside a provider, never a silent default view', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useViewportStore())).toThrow('ViewportStoreMissing');
  });
});

describe('useViewportZoom', () => {
  it('is the zoom, and renders its reader only when the zoom changes', () => {
    const store = createViewportStore(2);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ViewportStoreProvider store={store}>{children}</ViewportStoreProvider>
    );
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useViewportZoom();
      },
      { wrapper },
    );
    expect(result.current).toBe(2);
    const before = renders;
    act(() => store.setOffset({ x: 3, y: 4 }));
    expect(renders).toBe(before);
    act(() => store.setZoom(3));
    expect(result.current).toBe(3);
  });
});
