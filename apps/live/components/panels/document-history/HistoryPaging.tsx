'use client';

// Under History's rail (docs/specs/013-workspace/timeline.md §2.10): Show older events while the
// read has a cursor, saying how many are shown; Try again after a later page failed, keeping what
// is shown; and, at the end of a history longer than one page, that this is where it begins.

import { HISTORY_BUTTON, INSET, MUTED } from './history-styles';

export function HistoryPaging({
  shown,
  hasMore,
  loadingMore,
  failed,
  longerThanAPage,
  onLoadMore,
}: {
  shown: number;
  hasMore: boolean;
  loadingMore: boolean;
  failed: boolean;
  longerThanAPage: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) {
    return longerThanAPage ? (
      <p className={`pt-2 pb-6 text-center text-supporting ${INSET} ${MUTED}`}>
        The beginning of its history
      </p>
    ) : null;
  }
  return (
    <div className={`flex flex-col items-center gap-2 pt-2 pb-6 ${INSET}`}>
      {failed ? (
        <p role="alert" className="text-supporting text-red-700 dark:text-red-300">
          Couldn’t load older events.
        </p>
      ) : null}
      <button
        type="button"
        disabled={loadingMore}
        aria-busy={loadingMore || undefined}
        onClick={onLoadMore}
        className={HISTORY_BUTTON}
      >
        {loadingMore ? 'Loading…' : failed ? 'Try again' : 'Show older events'}
      </button>
      <p className={`text-supporting ${MUTED}`} aria-live="polite">
        {shown} shown
      </p>
    </div>
  );
}
