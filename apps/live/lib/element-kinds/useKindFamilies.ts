import { useEffect } from 'react';
import { prefetchWhenIdle } from '@/lib/idle-prefetch';
import { browserNavigationDeps, recoverInBrowser } from '@/lib/stale-build-navigation';
import { KIND_FAMILY_PREFETCH, setKindFamilyFailureHandler } from './store';

// The editor's side of the kind families (docs/specs/016-platform/blueprints/element-kinds-on-demand.md
// "Transitions" 6 and 7): a needed family that fails to load goes to the stale-build safety net, which reloads into
// a newer build when one is live; and once the opened document has rendered, every family is fetched while the page
// is idle, so a paste, a template or a peer's element later finds its family in.
export function useKindFamilies(loadingDocument: boolean): void {
  useEffect(() => {
    setKindFamilyFailureHandler((error) => void recoverInBrowser(error, browserNavigationDeps()));
  }, []);
  useEffect(
    () => (loadingDocument ? undefined : prefetchWhenIdle(KIND_FAMILY_PREFETCH)),
    [loadingDocument],
  );
}
