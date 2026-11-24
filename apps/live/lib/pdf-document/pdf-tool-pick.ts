// The tool a split toolbar control holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the last of
// its tools a person took, kept in their browser for every PDF under the control's own key; its first tool until they
// take another. A stored value that is none of its tools reads as the first.
import { useSyncExternalStore } from 'react';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';

export type ToolPick<T extends string> = {
  /** Whether a tool is one the control holds. */
  readonly holds: (tool: string) => tool is T;
  readonly read: () => T;
  readonly set: (tool: T) => void;
  readonly use: () => T;
  /** For tests: forget the pick read so far. */
  readonly reset: () => void;
};

/** A control's pick of `tools`, the first of them by default, kept under `key`. */
export function createToolPick<T extends string>(
  key: string,
  tools: readonly [T, ...T[]],
): ToolPick<T> {
  const first = tools[0];
  const listeners = createListeners();
  let pick: T | null = null;
  const holds = (tool: string): tool is T => (tools as readonly string[]).includes(tool);
  const read = (): T => {
    if (pick === null) {
      const raw = readLocalStorageSafe(key) ?? '';
      pick = holds(raw) ? raw : first;
    }
    return pick;
  };
  return {
    holds,
    read,
    set: (tool) => {
      if (tool === read()) return;
      pick = tool;
      // A blocked write keeps the pick for this page only.
      writeLocalStorageSafe(key, tool);
      listeners.notify();
    },
    use: () => useSyncExternalStore(listeners.subscribe, read, () => first),
    reset: () => {
      pick = null;
    },
  };
}
