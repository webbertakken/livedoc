// A short list of keys this browser remembers (which tabs' empty cards are closed, which tabs' starts are shown):
// kept in localStorage, the newest `max` keys, so a list stays small however many tabs come and go. A key that
// storage refuses (private mode, full storage) is kept for this session only. Readers subscribe to hear of a change.
import { createListeners } from '@/lib/listeners';

export type RememberedKeys = {
  has: (key: string) => boolean;
  add: (key: string) => void;
  remove: (key: string) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createRememberedKeys(storageKey: string, max: number): RememberedKeys {
  const read = (): string[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown;
      return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (keys: string[]): boolean => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(keys));
      return true;
    } catch {
      return false;
    }
  };
  const now = new Set<string>();
  const listeners = createListeners();
  return {
    has: (key) => now.has(key) || read().includes(key),
    add: (key) => {
      if (!write([...read().filter((k) => k !== key), key].slice(-max))) now.add(key);
      listeners.notify();
    },
    remove: (key) => {
      now.delete(key);
      write(read().filter((k) => k !== key));
      listeners.notify();
    },
    subscribe: listeners.subscribe,
  };
}
