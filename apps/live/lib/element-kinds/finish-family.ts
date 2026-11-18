import { debugLog } from '@/lib/debug-log';
import { finishFamilyOf } from './kind-family-of';
import { isKindFamilyLoaded, loadKindFamily } from './store';

// A finish picked (a tab's, a look's, an element's own) applies once the family it draws through is in
// (docs/specs/016-platform/web-performance.md "From the palette"), so a board never blinks out while its hand-drawn
// drawing loads. A finish whose family cannot load is not applied: the notice says part of the board could not load.
export function withFinishFamily(finish: unknown, apply: () => void): void {
  const family = finishFamilyOf(finish);
  if (!family || isKindFamilyLoaded(family)) {
    apply();
    return;
  }
  debugLog(`[element-kinds] finish waits family=${family}`);
  void loadKindFamily(family, 'palette').then((ok) => {
    if (ok) apply();
  });
}

// Pointing at a finish (a preview) fetches its family, so the pick that follows applies at once.
export function prefetchFinishFamily(finish: unknown): void {
  const family = finishFamilyOf(finish);
  if (family) void loadKindFamily(family, 'palette');
}
