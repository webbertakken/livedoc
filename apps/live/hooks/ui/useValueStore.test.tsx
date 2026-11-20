// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createValueStore, useValueStore, useValueStoreSnapshot } from './useValueStore';

// docs/specs/008-canvas/canvas-performance.md "The contexts around the element layer hold still".
describe('createValueStore', () => {
  it('tells its listeners of a new value and not of the same one', () => {
    const store = createValueStore(1);
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    store.publish(1);
    store.publish(2);
    expect(store.get()).toBe(2);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    store.publish(3);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe('useValueStore', () => {
  it('keeps one store and publishes each committed value', () => {
    const { result, rerender } = renderHook(({ value }) => useValueStore(value), {
      initialProps: { value: 'a' },
    });
    const store = result.current;
    expect(store.get()).toBe('a');
    rerender({ value: 'b' });
    expect(result.current).toBe(store);
    expect(store.get()).toBe('b');
  });
});

describe('useValueStoreSnapshot', () => {
  it('reads the value, re-rendering when it changes, and null without a store', () => {
    const store = createValueStore('a');
    const { result } = renderHook(() => useValueStoreSnapshot(store));
    expect(result.current).toBe('a');
    act(() => store.publish('b'));
    expect(result.current).toBe('b');
    expect(renderHook(() => useValueStoreSnapshot(null)).result.current).toBeNull();
  });
});
