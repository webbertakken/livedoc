// Whether the Explorer page was reached by Back or Forward (docs/specs/013-workspace/explorer-structure.md "Back"):
// only then does a long list go back to where it was left. A popstate (the app's own history) or a page loaded by
// a traversal (`back_forward`) marks the address it landed on; the list there takes the mark once.
import { debugLog } from '@/lib/debug-log';

let traversedTo: string | null = null;
let watching = false;

const here = () => `${window.location.pathname}${window.location.search}`;

/** Starts watching; called as the Explorer's lists load, before any Back can reach them. */
export function watchHistoryTraversal(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('popstate', () => {
    traversedTo = here();
  });
  const entry = performance.getEntriesByType?.('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  if (entry?.type === 'back_forward') traversedTo = here();
}

/** Whether `address` (path and query) was just reached by Back or Forward; true once. */
export function takeHistoryTraversal(address: string): boolean {
  const hit = traversedTo === address;
  if (hit) traversedTo = null;
  debugLog(`[list-place] traversal address=${address} hit=${hit}`);
  return hit;
}

/** For tests: forget the mark. */
export function resetHistoryTraversal(): void {
  traversedTo = null;
}
