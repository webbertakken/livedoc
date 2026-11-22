// Whether the function help card shows while a formula is typed (docs/specs/029-sheets/surface.md "Formula bar",
// D131): F1 hides it and shows it again, kept for the person in their browser, as Google's collapsed card stays so.
import { useSyncExternalStore } from 'react';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';

const HIDDEN_KEY = 'livedoc:sheet-function-help';
const HIDDEN = 'hidden';

let hidden: boolean | null = null;
const listeners = createListeners();

export function functionHelpHidden(): boolean {
  hidden ??= readLocalStorageSafe(HIDDEN_KEY) === HIDDEN;
  return hidden;
}

export function toggleFunctionHelp(): void {
  hidden = !functionHelpHidden();
  // A blocked write keeps the choice for this page only.
  writeLocalStorageSafe(HIDDEN_KEY, hidden ? HIDDEN : 'shown');
  listeners.notify();
}

export function useFunctionHelpHidden(): boolean {
  return useSyncExternalStore(listeners.subscribe, functionHelpHidden, () => false);
}

// For tests: forget the choice read so far.
export function resetFunctionHelp(): void {
  hidden = null;
}
