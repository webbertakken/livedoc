import { useEffect } from 'react';
import { prefetchOnceQuiet } from '@/lib/idle-prefetch';
import { browserNavigationDeps, recoverInBrowser } from '@/lib/stale-build-navigation';
import { KIND_FAMILY_PREFETCH, setKindFamilyFailureHandler } from './store';

// The editor's side of the kind families (docs/specs/016-platform/web-performance.md
// "Once the board has settled", "When a family cannot load"): a needed family that fails to load goes to the stale-build safety net, which reloads into
// a newer build when one is live; and once the opened document has rendered and the page has gone quiet, every family
// is fetched while the page is idle, so a paste, a template or a peer's element later finds its family in.
export function useKindFamilies(loadingDocument: boolean): void {
  useEffect(() => {
    setKindFamilyFailureHandler((error) => void recoverInBrowser(error, browserNavigationDeps()));
  }, []);
  useEffect(
    () => (loadingDocument ? undefined : prefetchOnceQuiet(KIND_FAMILY_PREFETCH)),
    [loadingDocument],
  );
}
