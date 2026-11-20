'use client';

import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

// A value handed down through a store rather than as a context value (docs/specs/008-canvas/canvas-performance.md
// "The contexts around the element layer hold still"). A context whose value changes makes React check every
// component under it for readers, the canvas's element views included; a context carrying this store keeps one
// value for its lifetime, and only the components that read the value re-render when it changes. The value is
// published once the render that made it has committed, so a reader never sees one that was not; a reader the render
// passed by re-renders in the same task, before the frame paints.
export type ValueStore<T> = {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
  publish: (value: T) => void;
};

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** A store holding `value`, the same store for the component's lifetime, published after each commit. */
export function useValueStore<T>(value: T): ValueStore<T> {
  const [store] = useState(() => createValueStore(value));
  useLayoutEffect(() => store.publish(value), [store, value]);
  return store;
}

const subscribeToNothing = () => () => {};
const readNothing = () => null;

/** The store's value, re-rendering when it changes; null without a store. */
export function useValueStoreSnapshot<T>(store: ValueStore<T> | null): T | null {
  const subscribe = store ? store.subscribe : subscribeToNothing;
  const read = store ? store.get : readNothing;
  return useSyncExternalStore<T | null>(subscribe, read, read);
}
