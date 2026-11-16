import { useSyncExternalStore } from 'react';
import { startShown, subscribeStartShown } from './start-shown';

// Whether a tab's start is shown, kept current as it opens or closes.
export function useStartShown(key: string): boolean {
  return useSyncExternalStore(
    subscribeStartShown,
    () => startShown(key),
    () => false,
  );
}
