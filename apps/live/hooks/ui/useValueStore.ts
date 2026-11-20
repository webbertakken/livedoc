'use client';

import { useSyncExternalStore } from 'react';

// A value that changes often but is shown by few components: kept outside React state, so a change re-renders only
// the components that read it (docs/specs/008-canvas/canvas-performance.md "A press renders what shows it").
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

const subscribeToNothing = () => () => {};
const readNothing = () => null;

/** The store's value, re-rendering when it changes; null without a store. */
export function useValueStoreSnapshot<T>(store: ValueStore<T> | null): T | null {
  const subscribe = store ? store.subscribe : subscribeToNothing;
  const read = store ? store.get : readNothing;
  return useSyncExternalStore<T | null>(subscribe, read, read);
}
