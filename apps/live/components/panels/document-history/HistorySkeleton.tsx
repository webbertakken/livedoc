'use client';

// History loading (docs/specs/013-workspace/timeline.md §2.10): the rail's own shape, a day
// heading over four entries, so the events arrive without a layout jump.

import { INSET, SKELETON } from './history-styles';

const ENTRY_WIDTHS = [0.7, 0.5, 0.6, 0.4];

export function HistorySkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading history" className={`py-4 ${INSET}`}>
      <span className={`mt-px mb-[17px] block h-2.5 w-20 ${SKELETON}`} />
      {ENTRY_WIDTHS.map((w, i) => (
        <div key={i} className="flex gap-3 pb-5">
          <span className={`size-field shrink-0 rounded-full ${SKELETON}`} />
          <span className="flex flex-1 flex-col gap-2 pt-1">
            <span className={`my-0.5 h-2.5 ${SKELETON}`} style={{ width: `${w * 100}%` }} />
            <span className={`my-px h-2.5 w-1/3 ${SKELETON}`} />
          </span>
        </div>
      ))}
    </div>
  );
}
