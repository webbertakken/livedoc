'use client';

import { useEffect, useState } from 'react';
import { useFailedKindFamilies } from '@/lib/element-kinds/react';
import { retryFailedKindFamilies } from '@/lib/element-kinds/store';
import { TopCenterBanner, TopCenterRow } from './TopCenter';

// Part of the board could not load (docs/specs/016-platform/web-performance.md "When a family cannot load"): the
// elements of a kind family whose code did not arrive draw nothing, and this says so with a Retry. The connection
// coming back retries by itself.
export function KindFamilyNotice() {
  const failed = useFailedKindFamilies();
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    setRetrying(true);
    void retryFailedKindFamilies().finally(() => setRetrying(false));
  };
  useEffect(() => {
    const onOnline = () => void retryFailedKindFamilies();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  if (failed.length === 0) return null;
  return (
    <TopCenterRow>
      <TopCenterBanner tone="neutral" className="gap-2 px-3 py-1 text-supporting">
        <span role="status" className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          Part of this board couldn’t load.
        </span>
        <button
          type="button"
          onClick={retry}
          disabled={retrying}
          className="cursor-pointer rounded-full px-2 py-0.5 text-supporting underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default disabled:no-underline"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </TopCenterBanner>
    </TopCenterRow>
  );
}
