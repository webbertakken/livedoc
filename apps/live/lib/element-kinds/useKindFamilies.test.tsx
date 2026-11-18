// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const prefetchWhenIdle = vi.fn((_loaders: unknown): (() => void) => () => {});
const recoverInBrowser = vi.fn((..._args: unknown[]): void => {});
const setKindFamilyFailureHandler = vi.fn((_handler: unknown): void => {});
vi.mock('@/lib/idle-prefetch', () => ({
  prefetchWhenIdle: (loaders: unknown) => prefetchWhenIdle(loaders),
}));
vi.mock('@/lib/stale-build-navigation', () => ({
  browserNavigationDeps: () => 'deps',
  recoverInBrowser: (...args: unknown[]) => recoverInBrowser(...args),
}));
vi.mock('./store', () => ({
  KIND_FAMILY_PREFETCH: ['every family'],
  setKindFamilyFailureHandler: (h: unknown) => setKindFamilyFailureHandler(h),
}));

const { useKindFamilies } = await import('./useKindFamilies');

afterEach(() => vi.clearAllMocks());

describe('useKindFamilies', () => {
  it('hands a needed family’s failure to the stale-build safety net', () => {
    renderHook(() => useKindFamilies(true));
    const handler = setKindFamilyFailureHandler.mock.calls[0]![0] as (e: unknown) => void;
    const error = new Error('Loading chunk 3 failed.');
    handler(error);
    expect(recoverInBrowser).toHaveBeenCalledWith(error, 'deps');
  });

  it('prefetches every family once the document has rendered, not before', () => {
    const { rerender } = renderHook(({ loading }) => useKindFamilies(loading), {
      initialProps: { loading: true },
    });
    expect(prefetchWhenIdle).not.toHaveBeenCalled();
    rerender({ loading: false });
    expect(prefetchWhenIdle).toHaveBeenCalledWith(['every family']);
  });
});
