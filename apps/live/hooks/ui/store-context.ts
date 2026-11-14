'use client';

// A context whose value reaches its readers through a store (docs/specs/008-canvas/canvas-performance.md "A change
// above the board walks no board"). A plain context's provider, on every new value, has React walk the whole tree
// beneath it for the components that read it; above the canvas that tree is the board, a thousand elements deep,
// and the walk ran on every editor render. Here the context holds one store for the provider's lifetime, so its
// value never changes and React walks nothing: the store tells its readers instead.
//
// The provider puts each new value in the store as it renders, before its children do, so a reader rendering in
// the same pass reads the value its props came with; after the commit it tells the readers that did not render,
// which render then, before paint. Readers render whenever the value changes, as a context's do.

import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createListeners } from '@/lib/listeners';

type ValueStore<T> = {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
  // Takes the value the provider is rendering with.
  stage: (value: T) => void;
  // Tells the readers, once the value has committed, when it changed since they were last told.
  publish: () => void;
};

function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  let published = initial;
  const listeners = createListeners();
  return {
    get: () => value,
    subscribe: listeners.subscribe,
    stage: (next) => {
      value = next;
    },
    publish: () => {
      if (Object.is(published, value)) return;
      published = value;
      listeners.notify();
    },
  };
}

const noSubscription = () => () => {};

export function createStoreContext<T>(fallback: T) {
  const StoreContext = createContext<ValueStore<T> | null>(null);
  const readFallback = () => fallback;

  function Provider({ value, children }: { value: T; children?: ReactNode }) {
    const [store] = useState(() => createValueStore(value));
    store.stage(value);
    useLayoutEffect(() => store.publish());
    return createElement(StoreContext.Provider, { value: store }, children);
  }

  // The value, or the fallback outside a provider.
  function useValue(): T {
    const store = useContext(StoreContext);
    return useSyncExternalStore(
      store?.subscribe ?? noSubscription,
      store?.get ?? readFallback,
      store?.get ?? readFallback,
    );
  }

  return { Provider, useValue };
}
